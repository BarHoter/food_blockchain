const pool = require('./db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping db init');
    return;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS actors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL
  )`);
  console.log('Database initialized');
  await pool.end();
}

main().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
