const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const FRONTEND_SRC_DIR = path.join(__dirname, '..', 'frontend');
// Load .env if present so server and frontend config pick up defaults
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}
// Import DB module after env is loaded so it can see DATABASE_URL* vars
const pool = require('./db');
const syncActorsFromIndexer = require('./sync-actors-db');
const FRONTEND_DIST_DIR = path.join(FRONTEND_SRC_DIR, 'dist');
const USE_DIST = fs.existsSync(path.join(FRONTEND_DIST_DIR, 'index.html'));
const FRONTEND_DIR = USE_DIST ? FRONTEND_DIST_DIR : FRONTEND_SRC_DIR;
const INDEXER_DIR = path.join(__dirname, '..', 'indexer');
const PORT = process.env.PORT || 8080;
const ADDRESS_FILE = path.join(__dirname, '..', 'addresses.json');
const NETWORK = process.env.NETWORK;

let indexerRunning = false;

if (!process.env.CONTRACT_ADDRESS) {
  try {
    const data = fs.readFileSync(ADDRESS_FILE, 'utf8');
    const map = JSON.parse(data);
    const net = NETWORK || Object.keys(map)[0];
    const addr = map[net];
    if (addr) {
      process.env.CONTRACT_ADDRESS = addr;
      console.log('Using %s contract address from %s', net, ADDRESS_FILE);
    } else if (NETWORK) {
      console.warn(`No address for network ${NETWORK} in ${ADDRESS_FILE}`);
    }
  } catch (_) {}
}

function serveConfig(res) {
  res.writeHead(200, { 'Content-Type': 'application/javascript' });
  const addr = process.env.CONTRACT_ADDRESS || '';
  const providerUrl = process.env.PROVIDER_URL || (
    process.env.INFURA_PROJECT_ID
      ? `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      : ''
  );
  res.end(
    `window.CONTRACT_ADDRESS = '${addr}';\n` +
    `window.PROVIDER_URL = '${providerUrl}';`
  );
}
function serveConfigJson(res) {
  const addr = process.env.CONTRACT_ADDRESS || '';
  const providerUrl = process.env.PROVIDER_URL || (
    process.env.INFURA_PROJECT_ID
      ? `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      : ''
  );
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ CONTRACT_ADDRESS: addr, PROVIDER_URL: providerUrl }));
}

if (!process.env.CONTRACT_ADDRESS) {
  console.warn(
    'CONTRACT_ADDRESS env var is required for the dashboard refresh to work (or place the address in addresses.json)'
  );
}

function mime(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.jsx')) return 'application/javascript';
  if (file.endsWith('.tsx')) return 'application/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.csv')) return 'text/csv';
  return 'text/plain';
}

function serveFile(res, filePath) {
  fs.promises.readFile(filePath)
    .then((data) => {
      res.writeHead(200, { 'Content-Type': mime(filePath) });
      res.end(data);
    })
    .catch(() => {
      res.writeHead(404);
      res.end();
    });
}

function runScript(script) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code));
  });
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer((req, res) => {
  // Friendly message if frontend hasn’t been built
  if (!USE_DIST && req.method === 'GET' && ['/', '/dashboard', '/admin'].includes(req.url)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Frontend not built</title>
      <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:2rem;line-height:1.5}</style>
      </head><body>
      <h1>Frontend not built</h1>
      <p>The static server serves compiled assets only. Build the frontend first:</p>
      <pre><code>npm run build</code></pre>
      <p>Then run:</p>
      <pre><code>npm run serve</code></pre>
      <p>Alternatively, use Vite during development:</p>
      <pre><code>npm run dev</code></pre>
      <p>If you use <code>npm run dev</code>, start this server separately for the API and configure a Vite proxy for <code>/api</code>.</p>
      </body></html>`);
    return;
  }
  if (req.method === 'GET' && req.url === '/config.js') {
    serveConfig(res);
    return;
  }
  if (req.method === 'GET' && req.url === '/config.json') {
    serveConfigJson(res);
    return;
  }
  if (req.method === 'GET' && req.url === '/api/db-status') {
    try {
      const info = (typeof pool.getDbInfo === 'function') ? pool.getDbInfo() : { configured: false };
      if (!info.configured) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ configured: false, source: 'none', url: '', maskedUrl: '', ssl: false, connected: false }));
        return;
      }
      pool.query('SELECT 1').then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...info, connected: true }));
      }).catch(err => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...info, connected: false, error: err.message }));
      });
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ configured: false, source: 'none', url: '', maskedUrl: '', ssl: false, connected: false, error: String(err) }));
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/api/refresh') {
    if (!process.env.CONTRACT_ADDRESS) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: 'CONTRACT_ADDRESS not set' })
      );
      return;
    }
    if (indexerRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'indexer running' }));
      return;
    }
    indexerRunning = true;
    // Run event indexers sequentially: transfers, actors, and batch->item links
    (async () => {
      const code1 = await runScript('indexer.js');
      const code2 = await runScript('index-actors.js');
      const code3 = await runScript('index-items.js');
      indexerRunning = false;
      const ok = code1 === 0 && code2 === 0 && code3 === 0;
      res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok }));
    })();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/actors/sync') {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    if (!process.env.CONTRACT_ADDRESS) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CONTRACT_ADDRESS not set' }));
      return;
    }
    if (indexerRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'indexer running' }));
      return;
    }
    indexerRunning = true;
    (async () => {
      try {
        const code = await runScript('index-actors.js');
        if (code !== 0) {
          throw new Error('index-actors.js failed');
        }
        const { inserted } = await syncActorsFromIndexer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          inserted: inserted.length,
          addresses: inserted.map(row => row.blockchain_address)
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
      } finally {
        indexerRunning = false;
      }
    })();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/actors') {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    pool
      .query('SELECT id, name, physical_address, blockchain_address, logo_url FROM actors ORDER BY id')
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/items') {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    pool
      .query('SELECT item_id, name, protein, carbs, fat, unit FROM items ORDER BY item_id')
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/items') {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    parseJson(req)
      .then(async body => {
        const id = (body.item_id || '').trim();
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'item_id is required' }));
          return null;
        }
        // try insert; unique violation -> 409, otherwise 500 with error details
        try {
          const result = await pool.query(
            'INSERT INTO items (item_id, name, protein, carbs, fat, unit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING item_id, name, protein, carbs, fat, unit',
            [id, body.name || null, body.protein || null, body.carbs || null, body.fat || null, body.unit || null]
          );
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.rows[0]));
        } catch (e) {
          if (e && e.code === '23505') {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'item already exists' }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e?.message || 'insert failed' }));
          }
        }
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'PUT' && req.url.startsWith('/api/items/')) {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    const itemId = decodeURIComponent(req.url.split('/').pop() || '');
    parseJson(req)
      .then(async body => {
        const result = await pool.query(
          'UPDATE items SET name=$1, protein=$2, carbs=$3, fat=$4, unit=$5 WHERE item_id=$6 RETURNING item_id, name, protein, carbs, fat, unit',
          [body.name || null, body.protein || null, body.carbs || null, body.fat || null, body.unit || null, itemId]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0] || {}));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'DELETE' && req.url.startsWith('/api/items/')) {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    const itemId = decodeURIComponent(req.url.split('/').pop() || '');
    pool.query('DELETE FROM items WHERE item_id=$1', [itemId])
      .then(() => { res.writeHead(204); res.end(); })
      .catch(err => { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message })); });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/actors') {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    parseJson(req)
      .then(async body => {
        const addr = (body.blockchain_address || '').trim().toLowerCase();
        if (!addr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'blockchain_address is required' }));
          return null;
        }
        const exists = await pool.query('SELECT id FROM actors WHERE lower(blockchain_address) = $1 LIMIT 1', [addr]);
        if (exists.rows.length) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Blockchain address already assigned to another actor' }));
          return null;
        }
        const result = await pool.query(
          'INSERT INTO actors (name, physical_address, blockchain_address, logo_url) VALUES ($1,$2,$3,$4) RETURNING id, name, physical_address, blockchain_address, logo_url',
          [body.name, body.physical_address, addr, body.logo_url]
        );
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0]));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'PUT' && req.url.startsWith('/api/actors/')) {
    const id = req.url.split('/').pop();
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    parseJson(req)
      .then(async body => {
        const addr = (body.blockchain_address || '').trim().toLowerCase();
        if (!addr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'blockchain_address is required' }));
          return null;
        }
        const exists = await pool.query('SELECT id FROM actors WHERE lower(blockchain_address) = $1 AND id <> $2 LIMIT 1', [addr, id]);
        if (exists.rows.length) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Blockchain address already assigned to another actor' }));
          return null;
        }
        const result = await pool.query(
          'UPDATE actors SET name=$1, physical_address=$2, blockchain_address=$3, logo_url=$4 WHERE id=$5 RETURNING id, name, physical_address, blockchain_address, logo_url',
          [body.name, body.physical_address, addr, body.logo_url, id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0] || {}));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'DELETE' && req.url.startsWith('/api/actors/')) {
    const id = req.url.split('/').pop();
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_INTERNAL && !process.env.DATABASE_URL_EXTERNAL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }
    pool
      .query('DELETE FROM actors WHERE id=$1', [id])
      .then(() => {
        res.writeHead(204);
        res.end();
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  let urlPath = req.url;
  if (["/", "/dashboard", "/admin"].includes(urlPath)) {
    urlPath = "index.html"; // ensure relative so path.join doesn't reset
  } else if (urlPath.startsWith("/")) {
    // strip leading slash so join stays within FRONTEND_DIR
    urlPath = urlPath.slice(1);
  }
  let filePath = path.join(FRONTEND_DIR, urlPath);
  if (filePath.startsWith(FRONTEND_DIR) && fs.existsSync(filePath)) {
    serveFile(res, filePath);
    return;
  }

  // Strip the /indexer/ prefix so requests map to files under INDEXER_DIR
  const idxPath = path.join(
    INDEXER_DIR,
    req.url.replace(/^\/indexer\//, '')
  );
  if (idxPath.startsWith(INDEXER_DIR) && fs.existsSync(idxPath)) {
    serveFile(res, idxPath);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving frontend from: ${FRONTEND_DIR}`);
});

// Optionally run indexers on startup to ensure JSON files exist.
// Set INDEX_ON_START=false to disable.
if (process.env.CONTRACT_ADDRESS && process.env.INDEX_ON_START !== 'false') {
  (async () => {
    try {
      await runScript('indexer.js');
      await runScript('index-actors.js');
      console.log('Initial indexing complete.');
    } catch (e) {
      console.warn('Initial indexing failed:', e);
    }
  })();
}

// Ensure DB schema exists on startup (no-op if not configured).
// Disable with DB_INIT_ON_START=false
if (typeof pool.ensureSchema === 'function' && process.env.DB_INIT_ON_START !== 'false') {
  pool.ensureSchema()
    .then(() => console.log('DB schema ensured.'))
    .catch(err => console.warn('DB schema ensure failed:', err.message || err));
}
