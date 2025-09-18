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
à l'interface joueur en son nom. Il peut ensuite revenir à son compte initial
via `/admin/stop-impersonating`.

Les contacts des PNJ sont stockés dans une table séparée. Comme pour les contacts entre joueurs, une demande doit être acceptée avant d'être active :

```sql
CREATE TABLE pnj_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pnj_id INT NOT NULL,
  user_id INT NOT NULL,
  status TINYINT DEFAULT 0,
  FOREIGN KEY (pnj_id) REFERENCES pnjs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Messagerie PNJ

Les PNJ peuvent désormais converser avec les joueurs. Les messages sont
enregistrés dans la table `messages` avec des colonnes permettant d'identifier
si l'expéditeur ou le destinataire est un utilisateur ou un PNJ :

```sql
CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_user_id INT,
  sender_pnj_id INT,
  receiver_user_id INT,
  receiver_pnj_id INT,
  content TEXT NOT NULL,
  is_read TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_user_id) REFERENCES users(id),
  FOREIGN KEY (sender_pnj_id) REFERENCES pnjs(id),
  FOREIGN KEY (receiver_user_id) REFERENCES users(id),
  FOREIGN KEY (receiver_pnj_id) REFERENCES pnjs(id)
);
```

La colonne `is_read` indique si le message a été consulté par son destinataire
(`0` = non lu, `1` = lu).

## Accès Shadow

L'interface administrateur permet d'accorder l'accès à la messagerie « Shadow »
à des joueurs ou à des PNJ. Deux tables stockent ces autorisations et sont
créées automatiquement si elles n'existent pas :

```sql
CREATE TABLE shadow_access_users (
  user_id INT PRIMARY KEY,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE shadow_access_pnjs (
  pnj_id INT PRIMARY KEY,
  FOREIGN KEY (pnj_id) REFERENCES pnjs(id) ON DELETE CASCADE
);
```

Les comptes listés dans les variables d'environnement `HIDDEN_MESSAGE_USERS`
et `HIDDEN_MESSAGE_PNJS` restent pris en compte et apparaissent dans
l'interface en lecture seule.
