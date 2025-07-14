const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
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
  res.end(`window.CONTRACT_ADDRESS = '${addr}';`);
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

  let urlPath = req.url;
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/dashboard') urlPath = '/dashboard.html';
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
