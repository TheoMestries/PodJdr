const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { pool } = require('./db');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(
  session({
    secret: 'change-me',
    resave: false,
    saveUninitialized: false,
  })
);

const diceLog = [];

const envHiddenAccessUsersRaw = (process.env.HIDDEN_MESSAGE_USERS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const envHiddenAccessPnjsRaw = (process.env.HIDDEN_MESSAGE_PNJS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const envHiddenAccessUsers = envHiddenAccessUsersRaw.map((name) =>
  name.toLowerCase()
);

const envHiddenAccessPnjs = envHiddenAccessPnjsRaw.map((name) =>
  name.toLowerCase()
);

const hiddenAccessUsers = new Set(envHiddenAccessUsers);

const hiddenAccessPnjs = new Set(envHiddenAccessPnjs);

const allowAdminShadowAccess = process.env.HIDDEN_MESSAGE_ALLOW_ADMINS !== '0';

const shadowMessages = [];
let shadowMessageId = 1;

async function ensureShadowAccessTables() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS shadow_access_users (
        user_id INT PRIMARY KEY,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS shadow_access_pnjs (
        pnj_id INT PRIMARY KEY,
        FOREIGN KEY (pnj_id) REFERENCES pnjs(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    console.error('Erreur lors de la vérification des tables shadow access', err);
  }
}

async function ensureShadowCodeTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS shadow_codes (
        code CHAR(4) PRIMARY KEY,
        entity_type ENUM('user', 'pnj') NOT NULL,
        entity_id INT NOT NULL,
        UNIQUE KEY unique_shadow_entity (entity_type, entity_id)
      )
    `);
  } catch (err) {
    console.error('Erreur lors de la vérification de la table des codes shadow', err);
  }
}

async function loadShadowAccessFromDb() {
  try {
    hiddenAccessUsers.clear();
    envHiddenAccessUsers.forEach((name) => hiddenAccessUsers.add(name));

    hiddenAccessPnjs.clear();
    envHiddenAccessPnjs.forEach((name) => hiddenAccessPnjs.add(name));

    const [userRows] = await pool.execute(
      `SELECT u.username
       FROM shadow_access_users sau
       JOIN users u ON u.id = sau.user_id`
    );
    userRows.forEach((row) => {
      if (row.username) {
        hiddenAccessUsers.add(row.username.toLowerCase());
      }
    });

    const [pnjRows] = await pool.execute(
      `SELECT p.name
       FROM shadow_access_pnjs sap
       JOIN pnjs p ON p.id = sap.pnj_id`
    );
    pnjRows.forEach((row) => {
      if (row.name) {
        hiddenAccessPnjs.add(row.name.toLowerCase());
      }
    });
  } catch (err) {
    console.error('Erreur lors du chargement des accès shadow depuis la base', err);
  }
}

async function initializeShadowInfrastructure() {
  try {
    await ensureShadowAccessTables();
    await ensureShadowCodeTable();
    await loadShadowAccessFromDb();
    await refreshShadowCodeCache();
    await ensureShadowCodesForType('user');
    await ensureShadowCodesForType('pnj');
  } catch (err) {
    console.error("Erreur lors de l'initialisation des accès shadow", err);
  }
}

initializeShadowInfrastructure();

async function ensureAnnouncementTables() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS announcements (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        message TEXT NOT NULL,
        signature VARCHAR(255) NULL DEFAULT NULL,
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_announcements_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  } catch (err) {
    console.error("Erreur lors de la vérification de la table des annonces", err);
  }

  try {
    await pool.execute(`
      ALTER TABLE announcements
      ADD COLUMN signature VARCHAR(255) NULL DEFAULT NULL
    `);
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error("Erreur lors de l'ajout de la colonne signature aux annonces", err);
    }
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS announcement_recipients (
        announcement_id BIGINT NOT NULL,
        user_id INT NOT NULL,
        is_read TINYINT NOT NULL DEFAULT 0,
        read_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (announcement_id, user_id),
        CONSTRAINT fk_announcement_recipients_announcement FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
        CONSTRAINT fk_announcement_recipients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    console.error("Erreur lors de la vérification de la table des destinataires d'annonces", err);
  }
}

async function initializeAnnouncementInfrastructure() {
  try {
    await ensureAnnouncementTables();
  } catch (err) {
    console.error("Erreur lors de l'initialisation des annonces", err);
  }
}

initializeAnnouncementInfrastructure();

const shadowCodeCache = {
  user: new Map(),
  pnj: new Map(),
};
const shadowCodeReverseCache = new Map();
const SHADOW_CODE_SPACE = 10000;

function normalizeShadowType(type) {
  return type === 'pnj' ? 'pnj' : 'user';
}

function setShadowCodeInCache(type, id, code) {
  const normalizedType = normalizeShadowType(type);
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return;
  }

  const normalizedCode = String(code).padStart(4, '0');
  const cache = shadowCodeCache[normalizedType];
  const existingCode = cache.get(numericId);
  if (existingCode && existingCode !== normalizedCode) {
    shadowCodeReverseCache.delete(existingCode);
  }

  cache.set(numericId, normalizedCode);
  shadowCodeReverseCache.set(normalizedCode, {
    type: normalizedType,
    id: numericId,
  });
}

function clearShadowCodeCaches() {
  shadowCodeCache.user.clear();
  shadowCodeCache.pnj.clear();
  shadowCodeReverseCache.clear();
}

function generateShadowCodeCandidate() {
  const buffer = crypto.randomBytes(2);
  const candidateNumber = buffer.readUInt16BE(0) % SHADOW_CODE_SPACE;
  return String(candidateNumber).padStart(4, '0');
}

async function loadShadowCodeFromDb(type, id) {
  try {
    const [rows] = await pool.execute(
      'SELECT code FROM shadow_codes WHERE entity_type = ? AND entity_id = ?',
      [type, id]
    );
    if (!rows.length) {
      return null;
    }

    const code = rows[0].code;
    setShadowCodeInCache(type, id, code);
    return code;
  } catch (err) {
    console.error('Erreur lors du chargement du code shadow depuis la base', err);
    throw err;
  }
}

async function createShadowCode(type, id) {
  for (let attempt = 0; attempt < SHADOW_CODE_SPACE; attempt += 1) {
    const candidate = generateShadowCodeCandidate();
    if (shadowCodeReverseCache.has(candidate)) {
      continue;
    }

    try {
      await pool.execute(
        'INSERT INTO shadow_codes (code, entity_type, entity_id) VALUES (?, ?, ?)',
        [candidate, type, id]
      );
      setShadowCodeInCache(type, id, candidate);
      return candidate;
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        await refreshShadowCodeCache();
        continue;
      }
      console.error('Erreur lors de la création du code shadow', err);
      throw err;
    }
  }

  throw new Error('Plus de codes shadow disponibles');
}

async function formatShadowCode(type, id) {
  const normalizedType = normalizeShadowType(type);
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 0) {
    throw new Error('Identifiant invalide pour la génération de code shadow');
  }

  const cache = shadowCodeCache[normalizedType];
  if (cache.has(numericId)) {
    return cache.get(numericId);
  }

  const loaded = await loadShadowCodeFromDb(normalizedType, numericId);
  if (loaded) {
    return loaded;
  }

  return createShadowCode(normalizedType, numericId);
}

async function decodeShadowCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim();
  if (!/^\d{4}$/.test(normalized)) {
    return null;
  }

  const cached = shadowCodeReverseCache.get(normalized);
  if (cached) {
    return cached;
  }

  try {
    const [rows] = await pool.execute(
      'SELECT entity_type, entity_id FROM shadow_codes WHERE code = ?',
      [normalized]
    );
    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    const normalizedType = normalizeShadowType(row.entity_type);
    const numericId = Number(row.entity_id);
    if (!Number.isInteger(numericId)) {
      return null;
    }

    setShadowCodeInCache(normalizedType, numericId, normalized);
    return {
      type: normalizedType,
      id: numericId,
    };
  } catch (err) {
    console.error('Erreur lors du décodage du code shadow', err);
    return null;
  }
}

async function refreshShadowCodeCache() {
  try {
    clearShadowCodeCaches();
    const [rows] = await pool.execute(
      'SELECT code, entity_type, entity_id FROM shadow_codes'
    );
    rows.forEach((row) => {
      const normalizedType = normalizeShadowType(row.entity_type);
      const numericId = Number(row.entity_id);
      if (!Number.isInteger(numericId)) {
        return;
      }
      setShadowCodeInCache(normalizedType, numericId, row.code);
    });
  } catch (err) {
    console.error('Erreur lors du chargement des codes shadow', err);
  }
}

async function ensureShadowCodesForType(type) {
  const table = type === 'pnj' ? 'pnjs' : 'users';
  try {
    const [rows] = await pool.execute(`SELECT id FROM ${table} ORDER BY id ASC`);
    for (const row of rows) {
      try {
        await formatShadowCode(type, row.id);
      } catch (err) {
        console.error(
          `Erreur lors de la génération du code shadow pour ${type} ${row.id}`,
          err
        );
      }
    }
  } catch (err) {
    console.error(`Erreur lors du chargement des identifiants ${table}`, err);
  }
}

function hasShadowAccessForUser(username, isAdmin) {
  if (allowAdminShadowAccess && isAdmin) {
    return true;
  }
  if (!username) {
    return false;
  }
  return hiddenAccessUsers.has(username.toLowerCase());
}

function hasShadowAccessForPnj(name) {
  if (!name) {
    return false;
  }
  return hiddenAccessPnjs.has(name.toLowerCase());
}

function updateShadowAccessFromSession(req) {
  if (req.session.pnjId) {
    req.session.hasShadowAccess = hasShadowAccessForPnj(req.session.username);
  } else {
    req.session.hasShadowAccess = hasShadowAccessForUser(
      req.session.username,
      req.session.isAdmin
    );
  }
}

async function getShadowIdentity(req) {
  if (req.session.pnjId) {
    return {
      type: 'pnj',
      id: req.session.pnjId,
      code: await formatShadowCode('pnj', req.session.pnjId),
      label: req.session.username,
    };
  }

  return {
    type: 'user',
    id: req.session.userId,
    code: await formatShadowCode('user', req.session.userId),
    label: req.session.username,
  };
}

async function resolveShadowCode(code) {
  if (!code) {
    return null;
  }

  const normalized = code.trim();
  let decoded = await decodeShadowCode(normalized);
  if (!decoded) {
    await refreshShadowCodeCache();
    decoded = await decodeShadowCode(normalized);
    if (!decoded) {
      return null;
    }
  }

  if (decoded.type === 'user') {
    const [rows] = await pool.execute(
      'SELECT id, username, is_admin FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length) {
      return null;
    }
    const user = rows[0];
    const hasAccess = hasShadowAccessForUser(
      user.username,
      user.is_admin === 1
    );
    return {
      type: 'user',
      id: user.id,
      code: await formatShadowCode('user', user.id),
      label: user.username,
      hasAccess,
    };
  }

  const [rows] = await pool.execute('SELECT id, name FROM pnjs WHERE id = ?', [decoded.id]);
  if (!rows.length) {
    return null;
  }
  const pnj = rows[0];
  const hasAccess = hasShadowAccessForPnj(pnj.name);
  return {
    type: 'pnj',
    id: pnj.id,
    code: await formatShadowCode('pnj', pnj.id),
    label: pnj.name,
    hasAccess,
  };
}

function requireShadowAccess(req, res, next) {
  if (!req.session.hasShadowAccess) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  next();
}

function formatShadowMessage(message) {
  return {
    id: message.id,
    senderCode: message.sender.code,
    senderLabel: message.sender.label,
    receiverCode: message.receiver.code,
    receiverLabel: message.receiver.label,
    content: message.content,
    createdAt: message.createdAt,
  };
}

// Statuts pour les relations utilisateur/PNJ dans la table pnj_contacts :
// 0 - en attente de validation par le joueur
// 1 - contact accepté
// 2 - en attente de validation par le PNJ

function requireAuth(req, res, next) {
  if (!req.session.userId && !req.session.pnjId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  updateShadowAccessFromSession(req);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  next();
}

function handleDbError(err, res) {
  const connectionCodes = [
    'ECONNREFUSED',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'ENOTFOUND',
  ];

  if (err && connectionCodes.includes(err.code)) {
    return res
      .status(500)
      .json({ error: 'Erreur de connexion à la base de données' });
  }

  return res.status(500).json({ error: 'Erreur serveur' });
}

// Enregistrement d'un nouvel utilisateur
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    try {
      await formatShadowCode('user', result.insertId);
    } catch (codeErr) {
      await pool.execute('DELETE FROM users WHERE id = ?', [result.insertId]);
      throw codeErr;
    }
    res.status(201).json({ message: 'Utilisateur créé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Connexion
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.execute(
      'SELECT id, password_hash, is_admin FROM users WHERE username = ?',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiant inconnu' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    req.session.userId = user.id;
    req.session.username = username;
    req.session.isAdmin = user.is_admin === 1;
    await formatShadowCode('user', user.id);
    updateShadowAccessFromSession(req);
    res.json({
      message: 'Connexion réussie',
      userId: user.id,
      isAdmin: req.session.isAdmin,
      hasShadowAccess: !!req.session.hasShadowAccess,
    });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Informations sur l'utilisateur connecté
app.get('/me', (req, res) => {
  if (!req.session.userId && !req.session.pnjId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  res.json({
    userId: req.session.userId || null,
    pnjId: req.session.pnjId || null,
    username: req.session.username,
    isAdmin: !!req.session.isAdmin,
    isPnj: !!req.session.pnjId,
    isImpersonating: !!req.session.isImpersonating,
    hasShadowAccess: !!req.session.hasShadowAccess,
  });
});

// Déconnexion
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return handleDbError(err, res);
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Déconnexion réussie' });
  });
});

// Récupération des contacts d'un utilisateur
app.get('/contacts', requireAuth, async (req, res) => {
  if (req.session.pnjId) {
    try {
      const [rows] = await pool.execute(
        `SELECT u.id, u.username, 0 AS is_pnj,
          (SELECT COUNT(*) FROM messages m WHERE m.sender_user_id = u.id AND m.receiver_pnj_id = ? AND m.is_read = 0) AS unread_count
         FROM pnj_contacts c JOIN users u ON c.user_id = u.id WHERE c.pnj_id = ? AND c.status = 1`,
        [req.session.pnjId, req.session.pnjId]
      );
      return res.json(rows);
    } catch (err) {
      return handleDbError(err, res);
    }
  }

  const userId = req.session.userId;
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, 0 AS is_pnj,
          (SELECT COUNT(*) FROM messages m WHERE m.sender_user_id = u.id AND m.receiver_user_id = ? AND m.is_read = 0) AS unread_count
       FROM contacts c JOIN users u ON c.contact_id = u.id WHERE c.user_id = ? AND c.status = 1
       UNION
       SELECT p.id, p.name AS username, 1 AS is_pnj,
          (SELECT COUNT(*) FROM messages m WHERE m.sender_pnj_id = p.id AND m.receiver_user_id = ? AND m.is_read = 0) AS unread_count
       FROM pnj_contacts c JOIN pnjs p ON c.pnj_id = p.id WHERE c.user_id = ? AND c.status = 1`,
      [userId, userId, userId, userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Récupération des demandes de contact
app.get('/contact-requests', requireAuth, async (req, res) => {
  try {
    if (req.session.pnjId) {
      const [rows] = await pool.execute(
        `SELECT u.username, c.user_id AS requesterId, 0 AS is_pnj FROM pnj_contacts c JOIN users u ON c.user_id = u.id WHERE c.pnj_id = ? AND c.status = 2`,
        [req.session.pnjId]
      );
      return res.json(rows);
    }

    const userId = req.session.userId;
    const [rows] = await pool.execute(
      `SELECT u.username, c.user_id AS requesterId, 0 AS is_pnj FROM contacts c JOIN users u ON c.user_id = u.id WHERE c.contact_id = ? AND c.status = 0
       UNION
       SELECT p.name AS username, c.pnj_id AS requesterId, 1 AS is_pnj FROM pnj_contacts c JOIN pnjs p ON c.pnj_id = p.id WHERE c.user_id = ? AND c.status = 0`,
      [userId, userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Récupération des demandes en attente envoyées
app.get('/pending-requests', requireAuth, async (req, res) => {
  if (req.session.pnjId) {
    try {
      const [rows] = await pool.execute(
        `SELECT u.username, c.user_id AS targetId, 0 AS is_pnj FROM pnj_contacts c JOIN users u ON c.user_id = u.id WHERE c.pnj_id = ? AND c.status = 0`,
        [req.session.pnjId]
      );
      return res.json(rows);
    } catch (err) {
      return handleDbError(err, res);
    }
  }

  const userId = req.session.userId;
  try {
    const [rows] = await pool.execute(
      `SELECT u.username, c.contact_id AS targetId, 0 AS is_pnj FROM contacts c JOIN users u ON c.contact_id = u.id WHERE c.user_id = ? AND c.status = 0
       UNION
       SELECT p.name AS username, c.pnj_id AS targetId, 1 AS is_pnj FROM pnj_contacts c JOIN pnjs p ON c.pnj_id = p.id WHERE c.user_id = ? AND c.status = 2`,
      [userId, userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Envoi d'une demande de contact
app.post('/contacts', requireAuth, async (req, res) => {
  const { contactUsername } = req.body;

  if (req.session.pnjId) {
    try {
      const [users] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [contactUsername]
      );
      if (!users.length) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }
      const contactId = users[0].id;
      await pool.execute(
        'INSERT INTO pnj_contacts (pnj_id, user_id, status) VALUES (?, ?, 0)',
        [req.session.pnjId, contactId]
      );
      return res.status(201).json({ message: 'Demande envoyée' });
    } catch (err) {
      return handleDbError(err, res);
    }
  }

  const userId = req.session.userId;
  try {
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [contactUsername]
    );

    if (users.length) {
      const contactId = users[0].id;
      await pool.execute(
        'INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, 0)',
        [userId, contactId]
      );
      return res.status(201).json({ message: 'Demande envoyée' });
    }

    const [pnjs] = await pool.execute(
      'SELECT id FROM pnjs WHERE name = ?',
      [contactUsername]
    );
    if (pnjs.length) {
      const pnjId = pnjs[0].id;
      await pool.execute(
        'INSERT INTO pnj_contacts (pnj_id, user_id, status) VALUES (?, ?, 2)',
        [pnjId, userId]
      );
      return res.status(201).json({ message: 'Demande envoyée' });
    }

    res.status(404).json({ error: 'Utilisateur introuvable' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Acceptation d'une demande de contact
app.post('/contacts/accept', requireAuth, async (req, res) => {
  const { requesterId, isPnj } = req.body;
  try {
    if (req.session.pnjId) {
      await pool.execute(
        'UPDATE pnj_contacts SET status = 1 WHERE pnj_id = ? AND user_id = ? AND status = 2',
        [req.session.pnjId, requesterId]
      );
      return res.json({ message: 'Contact accepté' });
    }

    const userId = req.session.userId;
    if (isPnj) {
      await pool.execute(
        'UPDATE pnj_contacts SET status = 1 WHERE pnj_id = ? AND user_id = ? AND status = 0',
        [requesterId, userId]
      );
      return res.json({ message: 'Contact accepté' });
    }

    await pool.execute(
      'UPDATE contacts SET status = 1 WHERE user_id = ? AND contact_id = ? AND status = 0',
      [requesterId, userId]
    );
    await pool.execute(
      'INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, 1)',
      [userId, requesterId]
    );
    res.json({ message: 'Contact accepté' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Suppression d'un contact
app.delete('/contacts', requireAuth, async (req, res) => {
  const { contactId, isPnj } = req.body;

  if (req.session.pnjId) {
    try {
      await pool.execute(
        'DELETE FROM pnj_contacts WHERE pnj_id = ? AND user_id = ?',
        [req.session.pnjId, contactId]
      );
      return res.json({ message: 'Contact supprimé' });
    } catch (err) {
      return handleDbError(err, res);
    }
  }

  const userId = req.session.userId;
  try {
    if (isPnj) {
      await pool.execute(
        'DELETE FROM pnj_contacts WHERE pnj_id = ? AND user_id = ?',
        [contactId, userId]
      );
    } else {
      await pool.execute(
        'DELETE FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)',
        [userId, contactId, contactId, userId]
      );
    }
    res.json({ message: 'Contact supprimé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Récupération des messages entre deux contacts
app.get('/messages', requireAuth, async (req, res) => {
  const { contactId, isPnj } = req.query;

  try {
    if (req.session.pnjId) {
      const pnjId = req.session.pnjId;
      const [rows] = await pool.execute(
        `SELECT id, sender_user_id, sender_pnj_id, receiver_user_id, receiver_pnj_id, content, created_at, is_read FROM messages WHERE (sender_pnj_id = ? AND receiver_user_id = ?) OR (sender_user_id = ? AND receiver_pnj_id = ?) ORDER BY created_at ASC`,
        [pnjId, contactId, contactId, pnjId]
      );
      const unreadIds = rows
        .filter((r) => r.receiver_pnj_id === pnjId && !r.is_read)
        .map((r) => r.id);
      if (unreadIds.length) {
        await pool.execute(
          `UPDATE messages SET is_read = 1 WHERE id IN (${unreadIds
            .map(() => '?')
            .join(',')})`,
          unreadIds
        );
      }
      return res.json(rows);
    }

    const userId = req.session.userId;
    if (isPnj === '1') {
      const [rows] = await pool.execute(
        `SELECT id, sender_user_id, sender_pnj_id, receiver_user_id, receiver_pnj_id, content, created_at, is_read FROM messages WHERE (sender_user_id = ? AND receiver_pnj_id = ?) OR (sender_pnj_id = ? AND receiver_user_id = ?) ORDER BY created_at ASC`,
        [userId, contactId, contactId, userId]
      );
      const unreadIds = rows
        .filter((r) => r.receiver_user_id === userId && !r.is_read)
        .map((r) => r.id);
      if (unreadIds.length) {
        await pool.execute(
          `UPDATE messages SET is_read = 1 WHERE id IN (${unreadIds
            .map(() => '?')
            .join(',')})`,
          unreadIds
        );
      }
      return res.json(rows);
    }

    const [rows] = await pool.execute(
      `SELECT id, sender_user_id, sender_pnj_id, receiver_user_id, receiver_pnj_id, content, created_at, is_read FROM messages WHERE (sender_user_id = ? AND receiver_user_id = ?) OR (sender_user_id = ? AND receiver_user_id = ?) ORDER BY created_at ASC`,
      [userId, contactId, contactId, userId]
    );
    const unreadIds = rows
      .filter((r) => r.receiver_user_id === userId && !r.is_read)
      .map((r) => r.id);
    if (unreadIds.length) {
      await pool.execute(
        `UPDATE messages SET is_read = 1 WHERE id IN (${unreadIds
          .map(() => '?')
          .join(',')})`,
        unreadIds
      );
    }
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Envoi d'un message
app.post('/messages', requireAuth, async (req, res) => {
  const { receiverId, content, isReceiverPnj } = req.body;

  const senderUserId = req.session.userId || null;
  const senderPnjId = req.session.pnjId || null;
  const receiverUserId = isReceiverPnj ? null : receiverId;
  const receiverPnjId = isReceiverPnj ? receiverId : null;

  try {
    await pool.execute(
      'INSERT INTO messages (sender_user_id, sender_pnj_id, receiver_user_id, receiver_pnj_id, content, is_read) VALUES (?, ?, ?, ?, ?, 0)',
      [senderUserId, senderPnjId, receiverUserId, receiverPnjId, content]
    );
    res.status(201).json({ message: 'Message envoyé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.get('/shadow/access', requireAuth, async (req, res) => {
  if (!req.session.hasShadowAccess) {
    return res.status(403).json({ error: 'Accès interdit' });
  }

  try {
    const identity = await getShadowIdentity(req);
    res.json({
      code: identity.code,
      identity: identity.label,
      type: identity.type,
    });
  } catch (err) {
    console.error("Erreur lors de la récupération de l'identité shadow", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/shadow/messages', requireAuth, requireShadowAccess, async (req, res) => {
  try {
    const identity = await getShadowIdentity(req);
    const inbox = shadowMessages
      .filter((message) => message.receiver.code === identity.code)
      .map(formatShadowMessage);
    const sent = shadowMessages
      .filter((message) => message.sender.code === identity.code)
      .map(formatShadowMessage);
    res.json({ inbox, sent });
  } catch (err) {
    console.error('Erreur lors du chargement des messages shadow', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/shadow/messages', requireAuth, requireShadowAccess, async (req, res) => {
  const contactCodeInput =
    typeof req.body.contactCode === 'string' ? req.body.contactCode.trim() : '';
  const contentInput = typeof req.body.content === 'string' ? req.body.content : '';
  const normalizedContent = contentInput.replace(/\r\n?/g, '\n');
  if (!contactCodeInput || !normalizedContent.trim()) {
    return res.status(400).json({ error: 'Code contact et message requis' });
  }

  try {
    const target = await resolveShadowCode(contactCodeInput);
    if (!target || !target.hasAccess) {
      return res.status(404).json({ error: 'Code contact introuvable' });
    }

    const sender = await getShadowIdentity(req);
    const storedSender = { ...sender };
    const storedReceiver = {
      type: target.type,
      id: target.id,
      code: target.code,
      label: target.label,
    };
    const message = {
      id: shadowMessageId++,
      sender: storedSender,
      receiver: storedReceiver,
      content: normalizedContent,
      createdAt: new Date().toISOString(),
    };
    shadowMessages.push(message);
    res.status(201).json({ message: 'Transmission envoyée', payload: formatShadowMessage(message) });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.get('/admin/shadow-access', requireAdmin, async (req, res) => {
  try {
    const [userRows] = await pool.execute(
      `SELECT u.id, u.username
       FROM shadow_access_users sau
       JOIN users u ON u.id = sau.user_id
       ORDER BY u.username ASC`
    );
    const [pnjRows] = await pool.execute(
      `SELECT p.id, p.name
       FROM shadow_access_pnjs sap
       JOIN pnjs p ON p.id = sap.pnj_id
       ORDER BY p.name ASC`
    );

    const envUsers = envHiddenAccessUsersRaw
      .map((name, index) => ({
        display: name,
        normalized: envHiddenAccessUsers[index],
      }))
      .filter(
        ({ normalized }) =>
          !userRows.some((row) => row.username.toLowerCase() === normalized)
      )
      .map(({ display }) => ({ username: display, source: 'env' }));

    const envPnjs = envHiddenAccessPnjsRaw
      .map((name, index) => ({
        display: name,
        normalized: envHiddenAccessPnjs[index],
      }))
      .filter(
        ({ normalized }) =>
          !pnjRows.some((row) => row.name.toLowerCase() === normalized)
      )
      .map(({ display }) => ({ name: display, source: 'env' }));

    res.json({
      users: [
        ...userRows.map((row) => ({
          id: row.id,
          username: row.username,
          source: 'db',
        })),
        ...envUsers,
      ],
      pnjs: [
        ...pnjRows.map((row) => ({
          id: row.id,
          name: row.name,
          source: 'db',
        })),
        ...envPnjs,
      ],
    });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, username
       FROM users
       WHERE is_admin = 0
       ORDER BY username ASC`
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/shadow-access', requireAdmin, async (req, res) => {
  const { type, identifier } = req.body;
  const normalized = (identifier || '').trim().toLowerCase();
  if (!type || !normalized || !['user', 'pnj'].includes(type)) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  try {
    if (type === 'user') {
      const [rows] = await pool.execute(
        'SELECT id, username FROM users WHERE LOWER(username) = ? LIMIT 1',
        [normalized]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }
      const user = rows[0];
      await pool.execute(
        'INSERT INTO shadow_access_users (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id',
        [user.id]
      );
      await loadShadowAccessFromDb();
      return res
        .status(201)
        .json({ message: `Accès shadow accordé à l\'utilisateur ${user.username}` });
    }

    const [rows] = await pool.execute(
      'SELECT id, name FROM pnjs WHERE LOWER(name) = ? LIMIT 1',
      [normalized]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'PNJ introuvable' });
    }
    const pnj = rows[0];
    await pool.execute(
      'INSERT INTO shadow_access_pnjs (pnj_id) VALUES (?) ON DUPLICATE KEY UPDATE pnj_id = pnj_id',
      [pnj.id]
    );
    await loadShadowAccessFromDb();
    return res
      .status(201)
      .json({ message: `Accès shadow accordé au PNJ ${pnj.name}` });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Lancer de dés
app.post('/dice', requireAuth, async (req, res) => {
  let diceArray = [];
  if (Array.isArray(req.body.dice)) {
    diceArray = req.body.dice;
  } else {
    const { sides, count, modifier } = req.body;
    if (sides !== undefined && count !== undefined) {
      diceArray = [{ sides, count, modifier }];
    }
  }

  if (!diceArray.length) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  const entries = [];

  for (const { sides, count, modifier } of diceArray) {
    const intSides = parseInt(sides, 10);
    const intCount = parseInt(count, 10);
    const intModifier = parseInt(modifier, 10) || 0;
    if (!intSides || !intCount || intSides < 1 || intCount < 1) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }
    const rolls = [];
    for (let i = 0; i < intCount; i++) {
      rolls.push(Math.floor(Math.random() * intSides) + 1);
    }
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + intModifier;
    const modSign = intModifier >= 0 ? `+${intModifier}` : `${intModifier}`;
    const resultString =
      intModifier !== 0
        ? `${rolls.join(' + ')} ${modSign} = ${total}`
        : rolls.join(', ');
    const entry = {
      username: req.session.username,
      dice:
        intModifier !== 0
          ? `${intCount}d${intSides} ${modSign}`
          : `${intCount}d${intSides}`,
      result: resultString,
      rolls: rolls.join(', '),
      modifier: intModifier,
      total,
    };
    entries.push(entry);
    diceLog.push(entry);
    if (diceLog.length > 50) diceLog.shift();
    try {
      await pool.execute(
        'INSERT INTO dice_rolls (user_id, sides, dice_count, result) VALUES (?, ?, ?, ?)',
        [req.session.userId, intSides, intCount, entry.result]
      );
    } catch (err) {
      return handleDbError(err, res);
    }
  }

  res.json(entries);
});

// Historique des dés
app.get('/dice', requireAuth, (req, res) => {
  res.json(diceLog);
});

// Statistiques des lancers
app.get('/stats', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  try {
    const [rows] = await pool.execute(
      `SELECT dr.user_id, u.username, dr.sides, dr.dice_count, dr.result
       FROM dice_rolls dr
       JOIN users u ON dr.user_id = u.id`
    );
    const stats = {};
    for (const row of rows) {
      if (!stats[row.user_id]) {
        stats[row.user_id] = { username: row.username, dice: {} };
      }
      if (!stats[row.user_id].dice[row.sides]) {
        stats[row.user_id].dice[row.sides] = {
          rolls: 0,
          diceRolled: 0,
          totalSum: 0,
          maxRoll: 0,
        };
      }
      const diceStat = stats[row.user_id].dice[row.sides];
      const numbers = row.result.match(/-?\d+/g) || [];
      const diceNumbers = numbers.slice(0, row.dice_count);
      const diceSum = diceNumbers.reduce((sum, n) => sum + parseInt(n, 10), 0);
      const total = row.result.includes('=')
        ? parseInt(numbers[numbers.length - 1], 10)
        : diceSum;
      diceStat.rolls += 1;
      diceStat.diceRolled += row.dice_count;
      diceStat.totalSum += diceSum;

      if (total > diceStat.maxRoll) diceStat.maxRoll = total;
    }
    const result = Object.values(stats).map((u) => ({
      username: u.username,
      dice: Object.entries(u.dice).map(([sides, d]) => ({
        sides: parseInt(sides, 10),
        rolls: d.rolls,
        diceRolled: d.diceRolled,
        average: d.diceRolled ? +(d.totalSum / d.diceRolled).toFixed(2) : 0,

        max: d.maxRoll,
      })),
    }));

    const currentUsername = req.session.username;
    const currentUserIndex = result.findIndex(
      (u) => u.username === currentUsername
    );
    let currentUserStats = null;
    if (currentUserIndex !== -1) {
      currentUserStats = result.splice(currentUserIndex, 1)[0];
    }

    const totalPlayers = (currentUserStats ? 1 : 0) + result.length;
    const totalPages = 1 + Math.ceil(result.length / limit);

    let statsPage;
    if (page === 1) {
      statsPage = currentUserStats ? [currentUserStats] : [];
    } else {
      const start = (page - 2) * limit;
      statsPage = result.slice(start, start + limit);
    }

    res.json({ stats: statsPage, page, totalPages });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Gestion des PNJ (admin)
app.get('/admin/pnjs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.description,
          (SELECT COUNT(*) FROM pnj_contacts c WHERE c.pnj_id = p.id AND c.status = 2) AS pending_requests,
          (SELECT COUNT(*) FROM messages m WHERE m.receiver_pnj_id = p.id AND m.is_read = 0) AS unread_messages
       FROM pnjs p`
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/pnjs', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO pnjs (name, description) VALUES (?, ?)',
      [name, description]
    );
    try {
      await formatShadowCode('pnj', result.insertId);
    } catch (codeErr) {
      await pool.execute('DELETE FROM pnjs WHERE id = ?', [result.insertId]);
      throw codeErr;
    }
    res.status(201).json({ message: 'PNJ créé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/pnjs/:id/impersonate', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT id, name FROM pnjs WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'PNJ introuvable' });
    }
    await formatShadowCode('pnj', rows[0].id);
    req.session.adminId = req.session.userId;
    req.session.adminUsername = req.session.username;
    req.session.userId = null;
    req.session.isAdmin = false;
    req.session.pnjId = rows[0].id;
    req.session.username = rows[0].name;
    req.session.isImpersonating = true;
    updateShadowAccessFromSession(req);
    res.json({ message: 'Connexion en tant que PNJ réussie' });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/stop-impersonating', (req, res) => {
  if (!req.session.isImpersonating || !req.session.adminId) {
    return res.status(400).json({ error: 'Pas en mode PNJ' });
  }
  req.session.userId = req.session.adminId;
  req.session.username = req.session.adminUsername;
  req.session.isAdmin = true;
  req.session.pnjId = null;
  req.session.isImpersonating = false;
  delete req.session.adminId;
  delete req.session.adminUsername;
  updateShadowAccessFromSession(req);
  res.json({ message: 'Retour au mode admin' });
});

app.put('/admin/pnjs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    await pool.execute(
      'UPDATE pnjs SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    res.json({ message: 'PNJ mis à jour' });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.delete('/admin/pnjs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM pnjs WHERE id = ?', [id]);
    res.json({ message: 'PNJ supprimé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/announcements', requireAdmin, async (req, res) => {
  const rawMessage =
    typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const cleanedMessage = rawMessage.replace(/\r\n?/g, '\n');
  const rawSignature =
    typeof req.body.signature === 'string' ? req.body.signature.trim() : '';
  if (rawSignature.length > 255) {
    return res
      .status(400)
      .json({ error: 'La signature doit contenir 255 caractères au maximum' });
  }
  const signature = rawSignature || null;
  const userIdsInput = Array.isArray(req.body.userIds) ? req.body.userIds : [];
  const userIds = Array.from(
    new Set(
      userIdsInput
        .map((value) => parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

  if (!cleanedMessage) {
    return res.status(400).json({ error: 'Le message est requis' });
  }

  if (!userIds.length) {
    return res
      .status(400)
      .json({ error: 'Au moins un destinataire doit être sélectionné' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO announcements (message, signature, created_by) VALUES (?, ?, ?)',
      [cleanedMessage, signature, req.session.userId || null]
    );
    const announcementId = result.insertId;
    const valuesPlaceholders = userIds.map(() => '(?, ?)').join(', ');
    const values = userIds.flatMap((userId) => [announcementId, userId]);
    await connection.execute(
      `INSERT INTO announcement_recipients (announcement_id, user_id) VALUES ${valuesPlaceholders}`,
      values
    );
    await connection.commit();
    res.status(201).json({ message: 'Annonce envoyée' });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Erreur lors du rollback des annonces', rollbackErr);
      }
    }
    handleDbError(err, res);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/announcements/unread', requireAuth, async (req, res) => {
  if (!req.session.userId) {
    return res.json([]);
  }

  try {
    const [rows] = await pool.execute(
      `SELECT ar.announcement_id AS id,
              a.message,
              a.signature,
              a.created_at AS createdAt
       FROM announcement_recipients ar
       JOIN announcements a ON a.id = ar.announcement_id
       WHERE ar.user_id = ? AND ar.is_read = 0
       ORDER BY a.created_at ASC`,
      [req.session.userId]
    );

    const formatted = rows.map((row) => ({
      id: row.id,
      message: row.message,
      signature: row.signature,
      createdAt: row.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/announcements/:id/read', requireAuth, async (req, res) => {
  if (!req.session.userId) {
    return res.status(403).json({ error: 'Accès réservé aux joueurs' });
  }

  const announcementId = parseInt(req.params.id, 10);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide' });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE announcement_recipients
       SET is_read = 1, read_at = NOW()
       WHERE announcement_id = ? AND user_id = ?`,
      [announcementId, req.session.userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Annonce introuvable' });
    }

    res.json({ message: 'Annonce confirmée' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Page d'erreur 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
