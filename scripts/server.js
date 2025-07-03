const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const INDEXER_DIR = path.join(__dirname, '..', 'indexer');
const PORT = process.env.PORT || 8080;

function serveConfig(res) {
  res.writeHead(200, { 'Content-Type': 'application/javascript' });
  const addr = process.env.CONTRACT_ADDRESS || '';
  res.end(`window.CONTRACT_ADDRESS = '${addr}';`);
}

if (!process.env.CONTRACT_ADDRESS) {
  console.warn(
    'CONTRACT_ADDRESS env var is required for the dashboard refresh to work'
  );
}

function mime(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
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
    const child = spawn(process.execPath, [path.join(__dirname, 'indexer.js')], {
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
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

  const idxPath = path.join(INDEXER_DIR, req.url.replace(/^\//, ''));
  if (idxPath.startsWith(INDEXER_DIR) && fs.existsSync(idxPath)) {
    serveFile(res, idxPath);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
