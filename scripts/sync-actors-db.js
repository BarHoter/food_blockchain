const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const pool = require('./db');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const INDEXER_DIR = path.join(__dirname, '..', 'indexer');
const ACTORS_FILE = path.join(INDEXER_DIR, 'actors.json');
const DEFAULT_PHYSICAL =
  process.env.SYNC_ACTOR_PHYSICAL ||
  'Recovered via /api/actors/sync';
const DEFAULT_LOGO = process.env.SYNC_ACTOR_LOGO_URL || '';

function defaultName(addr) {
  const prefix = process.env.SYNC_ACTOR_NAME_PREFIX || 'Recovered actor';
  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  return `${prefix} ${short}`;
}

async function loadIndexedActors() {
  try {
    const raw = await fs.promises.readFile(ACTORS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const addresses = Array.isArray(parsed.addresses) ? parsed.addresses : [];
    return addresses
      .map(a => (a || '').toLowerCase())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function syncActorsFromIndexer() {
  const info = typeof pool.getDbInfo === 'function' ? pool.getDbInfo() : { configured: false };
  if (!info.configured) {
    throw new Error('DATABASE_URL not configured');
  }
  if (typeof pool.ensureSchema === 'function') {
    await pool.ensureSchema();
  }

  const onchain = await loadIndexedActors();
  if (!onchain.length) {
    return { inserted: [] };
  }
  const existingQuery = await pool.query('SELECT blockchain_address FROM actors');
  const existing = new Set(
    existingQuery.rows
      .map(row => (row.blockchain_address || '').toLowerCase())
      .filter(Boolean)
  );
  const inserted = [];

  for (const addr of onchain) {
    if (existing.has(addr)) continue;
    const nameTemplate = process.env.SYNC_ACTOR_NAME_TEMPLATE;
    const generatedName = nameTemplate
      ? nameTemplate.replace('{address}', addr)
      : defaultName(addr);
    const result = await pool.query(
      'INSERT INTO actors (name, physical_address, blockchain_address, logo_url) VALUES ($1,$2,$3,$4) RETURNING id, name, physical_address, blockchain_address, logo_url',
      [generatedName, DEFAULT_PHYSICAL, addr, DEFAULT_LOGO]
    );
    inserted.push(result.rows[0]);
    existing.add(addr);
  }

  return { inserted };
}

async function main() {
  try {
    const { inserted } = await syncActorsFromIndexer();
    console.log(`Synced ${inserted.length} actor(s) from on-chain index.`);
    if (inserted.length) {
      console.log('Imported addresses:', inserted.map(a => a.blockchain_address).join(', '));
    }
  } catch (err) {
    console.error('Actor sync failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (typeof pool.end === 'function') {
      await pool.end();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = syncActorsFromIndexer;
