const pool = require('./db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping db init');
    return;
  }
  // Drop table if it exists so the schema and demo data are recreated on each build
  await pool.query('DROP TABLE IF EXISTS actors');
  await pool.query(`CREATE TABLE actors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    physical_address TEXT NOT NULL,
    blockchain_address TEXT NOT NULL,
    logo_url TEXT
  )`);

  // Insert some demo data to play with
  await pool.query(
    'INSERT INTO actors (name, physical_address, blockchain_address, logo_url) VALUES ' +
      '($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',
    [
      'Alice Farm',
      '100 Apple Way',
      '0x0000000000000000000000000000000000000001',
      'https://placehold.co/100x100?text=Alice',
      'Bob Distributor',
      '200 Banana Blvd',
      '0x0000000000000000000000000000000000000002',
      'https://placehold.co/100x100?text=Bob',
      'Carol Retail',
      '300 Cherry Ct',
      '0x0000000000000000000000000000000000000003',
      'https://placehold.co/100x100?text=Carol'
    ]
  );

  console.log('Database initialized with demo data');
  await pool.end();
}

main().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
