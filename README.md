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

## Administration et PNJ

Un champ `is_admin` (TINYINT) peut être ajouté à la table `users` pour
identifier les administrateurs. Les comptes PNJ sont stockés séparément dans la
table :

```sql
CREATE TABLE pnjs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT
);
```

Les routes `/admin/pnjs` permettent aux administrateurs connectés de créer,
lister, modifier et supprimer ces comptes PNJ. Un administrateur peut également
"prendre le contrôle" d'un PNJ via `/admin/pnjs/:id/impersonate` afin d'accéder
à l'interface joueur en son nom.

Les contacts des PNJ sont stockés dans une table séparée :

```sql
CREATE TABLE pnj_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pnj_id INT NOT NULL,
  user_id INT NOT NULL,
  FOREIGN KEY (pnj_id) REFERENCES pnjs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```
