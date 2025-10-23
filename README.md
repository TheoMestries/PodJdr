# PodJdr

Prototype d'interface de pod futuriste pour un jeu de rôle. Ce dépôt contient un
petit serveur Node.js qui sert une page de connexion stylisée.

## Démarrage

```bash
npm start
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000) pour voir la page de
connexion.

### Configuration de la base de données

Le pool MySQL lit plusieurs variables d'environnement pour s'adapter à ton
serveur :

| Variable        | Valeur par défaut | Description |
| --------------- | ----------------- | ----------- |
| `DB_HOST`       | `127.0.0.1`       | Hôte de la base. Utilise `127.0.0.1` si MariaDB n'écoute pas sur l'IPv6 `::1` associé à `localhost`. |
| `DB_PORT`       | `3306`            | Port de connexion (optionnel si standard). |
| `DB_USER`       | `root`            | Utilisateur de connexion. |
| `DB_PASSWORD`   | `root`            | Mot de passe associé. |
| `DB_NAME`       | `bdd_podjdr`      | Base de données à utiliser. |
| `DB_CONN_LIMIT` | _(non défini)_    | Taille maximale du pool (optionnel). |

Adapte ces valeurs à la base créée sur ton serveur (par exemple `DB_USER=podjdr`
et `DB_PASSWORD=motdepasse_solide`).

## Déploiement derrière un reverse proxy existant

L'application Node écoute sur le port défini par la variable d'environnement
`PORT` (3000 par défaut). Sur un serveur où le port 80 est déjà utilisé par un
autre site, laisse l'application tourner sur son port interne et fais-la
desservir par le reverse proxy existant.

### Exemple avec Nginx et un sous-domaine

Ajoute un bloc serveur dédié (par exemple pour `podjdr.trancheur.com`) dans
`/etc/nginx/sites-available/podjdr` :

```nginx
server {
  listen 80;
  server_name podjdr.trancheur.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Active ensuite le site et recharge Nginx :

```bash
sudo ln -s /etc/nginx/sites-available/podjdr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Exemple dans un site déjà existant

Si tu dois partager le même nom de domaine que le site actuel, ajoute une
section `location` dans son bloc serveur :

```nginx
location /podjdr/ {
  proxy_pass http://127.0.0.1:3000/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;
}
```

Redémarre Nginx pour prendre en compte la modification :

```bash
sudo systemctl reload nginx
```

Dans ce cas, configure l'application pour qu'elle génère des liens relatifs ou
prenne en compte le préfixe `/podjdr/` si nécessaire.

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

Les codes de contact utilisés dans la messagerie sont stockés dans une table
unique afin d'éviter tout doublon entre joueurs et PNJ :

```sql
CREATE TABLE shadow_codes (
  code CHAR(4) PRIMARY KEY,
  entity_type ENUM('user', 'pnj') NOT NULL,
  entity_id INT NOT NULL,
  UNIQUE KEY unique_shadow_entity (entity_type, entity_id)
);
```

Les comptes listés dans les variables d'environnement `HIDDEN_MESSAGE_USERS`
et `HIDDEN_MESSAGE_PNJS` restent pris en compte et apparaissent dans
l'interface en lecture seule.
