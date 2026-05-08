'use strict';

require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { setupChatHandler } = require('./src/chatHandler');
const { closeDb } = require('./src/db');

const PORT = parseInt(process.env.PORT || '3000', 10);
// Em produção (Railway, Render, etc.) deve escutar em 0.0.0.0
// 'localhost' só aceita conexões internas — causa 502 em cloud providers
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));

  // Proteção contra directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
setupChatHandler(wss);

// Graceful Shutdown para Railway
process.on('SIGTERM', () => {
  console.log('[server] Recebido SIGTERM — Encerrando suavemente...');
  wss.close(() => {
    closeDb();
    server.close(() => {
      console.log('[server] Processo encerrado com sucesso.');
      process.exit(0);
    });
  });
});

const serverStart = server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  console.error(`❌ Falha ao iniciar servidor: ${err.message}`);
  process.exit(1);
});
