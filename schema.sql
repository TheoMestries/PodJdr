-- Schéma de base de données pour PodJdr
-- À exécuter après avoir créé la base `bdd_podjdr`.
-- Exemple :
--   mysql -u podjdr -p bdd_podjdr < schema.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pnjs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacts (
  user_id INT NOT NULL,
  contact_id INT NOT NULL,
  status TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, contact_id),
  CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_contact FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_contacts_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pnj_contacts (
  pnj_id INT NOT NULL,
  user_id INT NOT NULL,
  status TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pnj_id, user_id),
  CONSTRAINT fk_pnj_contacts_pnj FOREIGN KEY (pnj_id) REFERENCES pnjs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pnj_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_pnj_contacts_status CHECK (status IN (0, 1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sender_user_id INT DEFAULT NULL,
  sender_pnj_id INT DEFAULT NULL,
  receiver_user_id INT DEFAULT NULL,
  receiver_pnj_id INT DEFAULT NULL,
  content TEXT NOT NULL,
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Les contraintes CHECK garantissant un seul type d'expéditeur/récepteur
  -- ont été retirées pour assurer la compatibilité avec MariaDB installée ;
  -- cette validation doit être effectuée par l'application.
  CONSTRAINT fk_messages_sender_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_sender_pnj FOREIGN KEY (sender_pnj_id) REFERENCES pnjs(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_receiver_user FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_receiver_pnj FOREIGN KEY (receiver_pnj_id) REFERENCES pnjs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_messages_receiver_user ON messages (receiver_user_id, is_read);
CREATE INDEX idx_messages_receiver_pnj ON messages (receiver_pnj_id, is_read);
CREATE INDEX idx_messages_user_thread ON messages (sender_user_id, receiver_user_id, created_at);
CREATE INDEX idx_messages_pnj_thread ON messages (sender_pnj_id, receiver_pnj_id, created_at);

CREATE TABLE IF NOT EXISTS dice_rolls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  sides INT NOT NULL,
  dice_count INT NOT NULL,
  result VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dice_rolls_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shadow_access_users (
  user_id INT PRIMARY KEY,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shadow_access_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shadow_access_pnjs (
  pnj_id INT PRIMARY KEY,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shadow_access_pnjs_pnj FOREIGN KEY (pnj_id) REFERENCES pnjs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shadow_codes (
  code CHAR(4) PRIMARY KEY,
  entity_type ENUM('user', 'pnj') NOT NULL,
  entity_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_shadow_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
