// Simple HTTP server for ECHOSWEEPER prototype
// Usage: node prototype/server.js
// Opens: http://localhost:3456
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3456;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(ROOT, url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`ECHOSWEEPER prototype → http://localhost:${PORT}`));
