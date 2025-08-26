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

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
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
      'SELECT id, password_hash FROM users WHERE username = ?',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiant inconnu' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    req.session.userId = user.id;
    req.session.username = username;
    res.json({ message: 'Connexion réussie', userId: user.id });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Informations sur l'utilisateur connecté
app.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  res.json({ userId: req.session.userId, username: req.session.username });
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
  const userId = req.session.userId;
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username FROM contacts c JOIN users u ON c.contact_id = u.id WHERE c.user_id = ? AND c.status = 1`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Récupération des demandes de contact
app.get('/contact-requests', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  try {
    const [rows] = await pool.execute(
      `SELECT u.username, c.user_id AS requesterId FROM contacts c JOIN users u ON c.user_id = u.id WHERE c.contact_id = ? AND c.status = 0`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Envoi d'une demande de contact
app.post('/contacts', requireAuth, async (req, res) => {
  const { contactUsername } = req.body;
  const userId = req.session.userId;
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
      'INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, 0)',
      [userId, contactId]
    );
    res.status(201).json({ message: 'Demande envoyée' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Acceptation d'une demande de contact
app.post('/contacts/accept', requireAuth, async (req, res) => {
  const { requesterId } = req.body;
  const userId = req.session.userId;
  try {
    await pool.execute(
      'UPDATE contacts SET status = 1 WHERE user_id = ? AND contact_id = ?',
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
  const { contactId } = req.body;
  const userId = req.session.userId;
  try {
    await pool.execute(
      'DELETE FROM contacts WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)',
      [userId, contactId, contactId, userId]
    );
    res.json({ message: 'Contact supprimé' });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Récupération des messages entre deux utilisateurs
app.get('/messages', requireAuth, async (req, res) => {
  const { contactId } = req.query;
  const userId = req.session.userId;
  try {
    const [rows] = await pool.execute(
      `SELECT sender_id, receiver_id, content, created_at FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC`,
      [userId, contactId, contactId, userId]
    );
    res.json(rows);
  } catch (err) {
    handleDbError(err, res);
  }
});

// Envoi d'un message
app.post('/messages', requireAuth, async (req, res) => {
  const { receiverId, content } = req.body;
  const senderId = req.session.userId;
  try {
    await pool.execute(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [senderId, receiverId, content]
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
      let total = 0;
      if (row.result.includes('=')) {
        total = parseInt(numbers[numbers.length - 1], 10);
      } else {
        total = numbers.reduce((sum, n) => sum + parseInt(n, 10), 0);
      }
      diceStat.rolls += 1;
      diceStat.diceRolled += row.dice_count;
      diceStat.totalSum += total;
      if (total > diceStat.maxRoll) diceStat.maxRoll = total;
    }
    const result = Object.values(stats).map((u) => ({
      username: u.username,
      dice: Object.entries(u.dice).map(([sides, d]) => ({
        sides: parseInt(sides, 10),
        rolls: d.rolls,
        diceRolled: d.diceRolled,
        average: d.rolls ? +(d.totalSum / d.rolls).toFixed(2) : 0,
        max: d.maxRoll,
      })),
    }));
    res.json(result);
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
