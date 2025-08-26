# PodJdr

Prototype d'interface de pod futuriste pour un jeu de rôle. Ce dépôt contient un
petit serveur Node.js qui sert une page de connexion stylisée.

## Démarrage

```bash
npm start
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000) pour voir la page de
connexion.

## Base de données

Les lancers de dés sont maintenant enregistrés dans la table `dice_rolls` afin de
permettre de futures statistiques. Exemple de structure :

```sql
CREATE TABLE dice_rolls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  sides INT NOT NULL,
  dice_count INT NOT NULL,
  result VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```
