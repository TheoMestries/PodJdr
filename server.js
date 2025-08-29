const express = require('express');
const path = require('path');
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

// Statuts pour les relations utilisateur/PNJ dans la table pnj_contacts :
// 0 - en attente de validation par le joueur
// 1 - contact accepté
// 2 - en attente de validation par le PNJ

function requireAuth(req, res, next) {
  if (!req.session.userId && !req.session.pnjId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
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
    await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
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
    res.json({
      message: 'Connexion réussie',
      userId: user.id,
      isAdmin: req.session.isAdmin,
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
      'SELECT id, name, description FROM pnjs'
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

app.post('/admin/pnjs', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  try {
    await pool.execute(
      'INSERT INTO pnjs (name, description) VALUES (?, ?)',
      [name, description]
    );
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
    req.session.adminId = req.session.userId;
    req.session.adminUsername = req.session.username;
    req.session.userId = null;
    req.session.isAdmin = false;
    req.session.pnjId = rows[0].id;
    req.session.username = rows[0].name;
    req.session.isImpersonating = true;
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

// Page d'erreur 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
