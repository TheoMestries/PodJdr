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

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
      return res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
