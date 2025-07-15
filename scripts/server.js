const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pool = require('./db');

const FRONTEND_DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const FRONTEND_DIR = fs.existsSync(FRONTEND_DIST_DIR)
  ? FRONTEND_DIST_DIR
  : path.join(__dirname, '..', 'frontend');
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
  const providerUrl = process.env.PROVIDER_URL || '';
  res.end(
    `window.CONTRACT_ADDRESS = '${addr}';\n` +
    `window.PROVIDER_URL = '${providerUrl}';`
  );
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
  if (req.method === 'GET' && req.url === '/config.js') {
    serveConfig(res);
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
    const child = spawn(process.execPath, [path.join(__dirname, 'indexer.js')], {
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      indexerRunning = false;
      res.writeHead(code === 0 ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: code === 0 }));
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/actors') {
    pool
      .query('SELECT id, name, address FROM actors ORDER BY id')
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

  if (req.method === 'POST' && req.url === '/api/actors') {
    parseJson(req)
      .then(body =>
        pool.query(
          'INSERT INTO actors (name, address) VALUES ($1,$2) RETURNING id, name, address',
          [body.name, body.address]
        )
      )
      .then(result => {
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
    parseJson(req)
      .then(body =>
        pool.query(
          'UPDATE actors SET name=$1, address=$2 WHERE id=$3 RETURNING id, name, address',
          [body.name, body.address, id]
        )
      )
      .then(result => {
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
  if (urlPath === '/' || urlPath === '/dashboard') urlPath = '/index.html';
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
});
