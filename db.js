const mysql = require('mysql2/promise');

const {
  DB_HOST = '127.0.0.1',
  DB_PORT,
  DB_USER = 'podjdr',
  DB_PASSWORD = 'podmdp',
  DB_NAME = 'bdd_podjdr',
  DB_CONN_LIMIT,
} = process.env;

const poolConfig = {
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
};

if (DB_PORT) {
  const parsedPort = parseInt(DB_PORT, 10);
  if (!Number.isNaN(parsedPort) && parsedPort > 0) {
    poolConfig.port = parsedPort;
  }
}

if (DB_CONN_LIMIT) {
  const parsedLimit = parseInt(DB_CONN_LIMIT, 10);
  if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
    poolConfig.connectionLimit = parsedLimit;
  }
}

const pool = mysql.createPool(poolConfig);

module.exports = { pool };
