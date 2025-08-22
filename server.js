const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Enregistrement d'un nouvel utilisateur
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, hash]
    );
    res.status(201).json({ message: 'Utilisateur créé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute(
      'SELECT id, password_hash FROM users WHERE email = ?',
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Email inconnu' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    res.json({ message: 'Connexion réussie', userId: user.id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
