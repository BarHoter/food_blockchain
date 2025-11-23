const { Pool } = require('pg');

function getDbSelection() {
  const source = (process.env.DB_SOURCE || '').toLowerCase(); // 'internal' | 'external'
  const hasInternal = !!process.env.DATABASE_URL_INTERNAL;
  const hasExternal = !!process.env.DATABASE_URL_EXTERNAL;
  const fallback = process.env.DATABASE_URL || null;

  const runningOnRender = !!(process.env.RENDER || process.env.RENDER_INTERNAL_HOSTNAME);

  if (source === 'internal' && hasInternal) return { url: process.env.DATABASE_URL_INTERNAL, source: 'internal' };
  if (source === 'external' && hasExternal) return { url: process.env.DATABASE_URL_EXTERNAL, source: 'external' };

  if (runningOnRender && hasInternal) return { url: process.env.DATABASE_URL_INTERNAL, source: 'internal' };
  if (!runningOnRender && hasExternal) return { url: process.env.DATABASE_URL_EXTERNAL, source: 'external' };

  return { url: fallback, source: fallback ? 'default' : 'none' };
}

function needsSSL(url) {
  const flag = (process.env.DB_SSL || '').toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  if (!url) return false;
  // Heuristics: common managed Postgres providers require SSL
  return /render\.com|neon\.tech|supabase\.co|rds\.amazonaws\.com/.test(url);
}

function maskConnectionString(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch (_) {
    return url ? url.replace(/:(.*?)@/, ':****@') : '';
  }
}

const selection = getDbSelection();
const connectionString = selection.url;
const sslEnabled = needsSSL(connectionString);
const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      }
    : undefined
);

function getDbInfo() {
  return {
    configured: !!connectionString,
    source: selection.source,
    url: connectionString,
    maskedUrl: connectionString ? maskConnectionString(connectionString) : '',
    ssl: sslEnabled,
  };
}

async function ensureSchema() {
  const info = getDbInfo();
  if (!info.configured) return;
  // Create table if it does not exist; avoid dropping or seeding here.
  const ddl = `
    CREATE TABLE IF NOT EXISTS actors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      physical_address TEXT NOT NULL,
      blockchain_address TEXT NOT NULL,
      logo_url TEXT
    );
  `;
  await pool.query(ddl);
  // Enforce case-insensitive uniqueness of blockchain_address
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_blockchain_address_unique ON actors (lower(blockchain_address))'
  );

  // Items catalog with macro nutrients
  const itemsDdl = `
    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY,
      name TEXT,
      protein NUMERIC,
      carbs NUMERIC,
      fat NUMERIC,
      unit TEXT
    );
  `;
  await pool.query(itemsDdl);
  // Backward-compatible migration: add 'unit' column if it was missing
  await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS unit TEXT");

  // Linking table from batch to item (batch id stored as TEXT to support external identifiers)
  const linkDdl = `
    CREATE TABLE IF NOT EXISTS batch_items (
      batch_id TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
      PRIMARY KEY (batch_id),
      UNIQUE (batch_id)
    );
  `;
  await pool.query(linkDdl);

  const transfersDdl = `
    CREATE TABLE IF NOT EXISTS transfer_statuses (
      transfer_id BIGINT PRIMARY KEY,
      status TEXT NOT NULL,
      sender TEXT,
      recipient TEXT,
      batch_external_id TEXT,
      item_id TEXT,
      quantity NUMERIC,
      planned_ship_date BIGINT,
      last_event TEXT,
      last_block BIGINT,
      last_block_time BIGINT,
      last_tx TEXT,
      last_log_index INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(transfersDdl);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfer_statuses (status)');

  const transferChangesDdl = `
    CREATE TABLE IF NOT EXISTS transfer_changes (
      id BIGSERIAL PRIMARY KEY,
      transfer_id BIGINT,
      event TEXT,
      status TEXT,
      sender TEXT,
      recipient TEXT,
      batch_external_id TEXT,
      item_id TEXT,
      quantity NUMERIC,
      block BIGINT,
      block_time BIGINT,
      tx_hash TEXT,
      log_index INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tx_hash, log_index)
    );
  `;
  await pool.query(transferChangesDdl);
}

module.exports = pool;
module.exports.getDbInfo = getDbInfo;
module.exports.ensureSchema = ensureSchema;
