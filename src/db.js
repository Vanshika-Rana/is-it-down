const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS monitors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('up', 'down')),
      response_time_ms INTEGER,
      status_code INTEGER,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL,
      resolved_at TIMESTAMPTZ
    );
  `);
}

async function closeDb() {
  await pool.end();
}

module.exports = {
  query,
  initDb,
  closeDb,
};
