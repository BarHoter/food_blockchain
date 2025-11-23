const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const pool = require('./db');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const INDEXER_DIR = path.join(__dirname, '..', 'indexer');
const ITEMS_MAP_FILE = path.join(INDEXER_DIR, 'items-map.json');
const ITEM_NAME_PREFIX = process.env.SYNC_ITEM_NAME_PREFIX || 'Recovered item';

async function loadIndexedItems() {
  try {
    const raw = await fs.promises.readFile(ITEMS_MAP_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function defaultItemName(id) {
  return `${ITEM_NAME_PREFIX} ${id}`;
}

async function ensureItemExists(itemId) {
  const exists = await pool.query('SELECT 1 FROM items WHERE item_id=$1 LIMIT 1', [itemId]);
  if (exists.rows.length) return false;
  await pool.query(
    'INSERT INTO items (item_id, name, protein, carbs, fat, unit) VALUES ($1,$2,NULL,NULL,NULL,NULL) ON CONFLICT DO NOTHING',
    [itemId, defaultItemName(itemId)]
  );
  return true;
}

async function syncItemsFromIndexer() {
  const info = typeof pool.getDbInfo === 'function' ? pool.getDbInfo() : { configured: false };
  if (!info.configured) {
    throw new Error('DATABASE_URL not configured');
  }
  if (typeof pool.ensureSchema === 'function') {
    await pool.ensureSchema();
  }

  const map = await loadIndexedItems();
  const entries = Object.entries(map).filter(
    ([batchId, itemId]) => batchId && itemId
  );
  if (!entries.length) {
    return { inserted: 0, updated: 0, itemsCreated: 0 };
  }

  const existingLinks = new Map();
  const existingRows = await pool.query('SELECT batch_id, item_id FROM batch_items');
  for (const row of existingRows.rows) {
    existingLinks.set(row.batch_id, row.item_id);
  }

  let inserted = 0;
  let updated = 0;
  let itemsCreated = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [batchId, itemId] of entries) {
      const hadLink = existingLinks.has(batchId);
      const existingItem = existingLinks.get(batchId);
      if (hadLink && existingItem === itemId) continue;

      const created = await ensureItemExists(itemId);
      if (created) itemsCreated += 1;

      await client.query(
        'INSERT INTO batch_items (batch_id, item_id) VALUES ($1,$2) ON CONFLICT (batch_id) DO UPDATE SET item_id=EXCLUDED.item_id',
        [batchId, itemId]
      );

      if (hadLink) {
        if (existingItem !== itemId) updated += 1;
      } else {
        inserted += 1;
      }

      existingLinks.set(batchId, itemId);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { inserted, updated, itemsCreated };
}

async function main() {
  try {
    const result = await syncItemsFromIndexer();
    console.log(`Synced batch->item links. inserted=${result.inserted} updated=${result.updated} itemsCreated=${result.itemsCreated}`);
  } catch (err) {
    console.error('Item sync failed:', err.message || err);
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

module.exports = syncItemsFromIndexer;
