const pool = require('./db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping db init');
    return;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS actors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    physical_address TEXT NOT NULL,
    blockchain_address TEXT NOT NULL,
    logo_url TEXT
  )`);
  // Ensure all expected columns exist even if an older version
  // of the table was created previously. This avoids runtime
  // errors when the admin interface tries to insert or update
  // records with missing columns.
  await pool.query(
    "ALTER TABLE actors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL"
  );
  await pool.query(
    "ALTER TABLE actors ADD COLUMN IF NOT EXISTS physical_address TEXT NOT NULL"
  );
  await pool.query(
    "ALTER TABLE actors ADD COLUMN IF NOT EXISTS blockchain_address TEXT NOT NULL"
  );
  await pool.query(
    "ALTER TABLE actors ADD COLUMN IF NOT EXISTS logo_url TEXT"
  );
  console.log('Database initialized');
  await pool.end();
}

main().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
