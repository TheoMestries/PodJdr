const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

    res.json({ message: 'Connexion réussie', userId: user.id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupération des contacts d'un utilisateur
app.get('/contacts', async (req, res) => {
  const { userId } = req.query;
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
app.get('/contact-requests', async (req, res) => {
  const { userId } = req.query;
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
app.post('/contacts', async (req, res) => {
  const { userId, contactUsername } = req.body;
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
app.post('/contacts/accept', async (req, res) => {
  const { userId, requesterId } = req.body;
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
app.delete('/contacts', async (req, res) => {
  const { userId, contactId } = req.body;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
