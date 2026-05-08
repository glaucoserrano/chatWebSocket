'use strict';

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const { RateLimiter } = require('./rateLimiter');
const { saveMessage, getHistory } = require('./db');

const MAX_NAME_LENGTH = parseInt(process.env.MAX_NAME_LENGTH || '20', 10);
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '500', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
const RATE_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '5000', 10);
const RATE_MAX = parseInt(process.env.RATE_LIMIT_MAX || '10', 10);

const AVAILABLE_ROOMS = ['geral', 'tecnologia', 'off-topic'];

const rateLimiter = new RateLimiter({ windowMs: RATE_WINDOW, maxRequests: RATE_MAX });

// Map<ws, { name, room, sessionId, isAlive }>
const clients = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateName(name) {
  if (typeof name !== 'string') { return null; }
  const clean = name.trim().replace(/[<>&"'`]/g, '');
  return (clean.length >= 1 && clean.length <= MAX_NAME_LENGTH) ? clean : null;
}

function validateText(text) {
  if (typeof text !== 'string') { return null; }
  const clean = text.trim();
  return (clean.length >= 1 && clean.length <= MAX_MESSAGE_LENGTH) ? clean : null;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, room, exclude = null) {
  const json = JSON.stringify(data);
  clients.forEach((info, ws) => {
    if (ws === exclude) { return; }
    if (room && info.room !== room) { return; }
    if (ws.readyState === WebSocket.OPEN) { ws.send(json); }
  });
}

function broadcastUserList(room) {
  const users = [];
  clients.forEach((info) => {
    if (info.room === room && info.name) { users.push(info.name); }
  });
  broadcast({ type: 'user_list', users, room }, room);
}

function isNameTaken(name, room, excludeWs) {
  for (const [ws, info] of clients) {
    if (ws === excludeWs) { continue; }
    if (info.room === room && info.name && info.name.toLowerCase() === name.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function now() {
  return new Date().toISOString();
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

function handleJoin(ws, msg) {
  const name = validateName(msg.name);
  if (!name) {
    return send(ws, { type: 'error', text: 'Nome inválido. Use entre 1 e 20 caracteres.' });
  }
  const room = AVAILABLE_ROOMS.includes(msg.room) ? msg.room : 'geral';
  if (isNameTaken(name, room, ws)) {
    return send(ws, { type: 'error', text: `O nome "${name}" já está em uso nesta sala.` });
  }
  const sessionId = msg.sessionId || uuidv4();
  clients.set(ws, { name, room, sessionId, isAlive: true });

  send(ws, { type: 'welcome', sessionId, name, room, rooms: AVAILABLE_ROOMS, history: getHistory(room, 50), timestamp: now() });
  console.log(`[join] ${name} → sala "${room}"`);
  broadcast({ type: 'info', text: `${name} entrou no chat 👋`, timestamp: now() }, room, ws);
  broadcastUserList(room);
}

function handleMessage(ws, msg, info) {
  if (!info.name) {
    return send(ws, { type: 'error', text: 'Entre no chat antes de enviar mensagens.' });
  }
  const text = validateText(msg.text);
  if (!text) {
    return send(ws, { type: 'error', text: `Mensagem inválida (máx ${MAX_MESSAGE_LENGTH} caracteres).` });
  }
  const timestamp = now();
  const payload = { type: 'message', id: uuidv4(), name: info.name, text, room: info.room, timestamp };
  broadcast(payload, info.room);
  saveMessage({ room: info.room, name: info.name, text, timestamp });
}

function handleTyping(ws, msg, info) {
  if (!info.name) { return; }
  broadcast({ type: 'typing', name: info.name, isTyping: !!msg.isTyping }, info.room, ws);
}

function handleSwitchRoom(ws, msg, info) {
  if (!info.name) { return; }
  const newRoom = AVAILABLE_ROOMS.includes(msg.room) ? msg.room : 'geral';
  if (newRoom === info.room) { return; }
  if (isNameTaken(info.name, newRoom, ws)) {
    return send(ws, { type: 'error', text: `O nome "${info.name}" já está em uso na sala "${newRoom}".` });
  }
  const oldRoom = info.room;
  broadcast({ type: 'info', text: `${info.name} saiu da sala 👋`, timestamp: now() }, oldRoom, ws);
  broadcastUserList(oldRoom);

  info.room = newRoom;
  clients.set(ws, info);

  send(ws, { type: 'room_changed', room: newRoom, history: getHistory(newRoom, 50), timestamp: now() });
  broadcast({ type: 'info', text: `${info.name} entrou na sala 👋`, timestamp: now() }, newRoom, ws);
  broadcastUserList(newRoom);
  console.log(`[switch_room] ${info.name} → "${newRoom}"`);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

function setupChatHandler(wss) {
  // Heartbeat: remove conexões zumbis
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      const info = clients.get(ws);
      if (!info) { return; }
      if (!info.isAlive) {
        console.log(`[heartbeat] Encerrando conexão zumbi${info.name ? ` de ${info.name}` : ''}`);
        return ws.terminate();
      }
      info.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => clearInterval(heartbeatTimer));

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[conexão] ${ip}`);
    clients.set(ws, { name: null, room: null, sessionId: null, isAlive: true });

    ws.on('pong', () => {
      const info = clients.get(ws);
      if (info) { info.isAlive = true; }
    });

    ws.on('message', (rawData) => {
      let msg;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return send(ws, { type: 'error', text: 'Mensagem inválida (JSON malformado).' });
      }

      const info = clients.get(ws);

      // Rate limiting só para usuários já autenticados
      if (info && info.name && !rateLimiter.isAllowed(ws)) {
        return send(ws, { type: 'error', text: 'Muitas mensagens. Aguarde alguns segundos.' });
      }

      switch (msg.type) {
        case 'join':        handleJoin(ws, msg); break;
        case 'message':     handleMessage(ws, msg, info || {}); break;
        case 'typing':      handleTyping(ws, msg, info || {}); break;
        case 'switch_room': handleSwitchRoom(ws, msg, info || {}); break;
        default:            send(ws, { type: 'error', text: 'Tipo de mensagem desconhecido.' });
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      rateLimiter.remove(ws);
      clients.delete(ws);
      if (info && info.name && info.room) {
        console.log(`[desconexão] ${info.name} saiu de "${info.room}"`);
        broadcast({ type: 'info', text: `${info.name} saiu do chat 👋`, timestamp: now() }, info.room);
        broadcastUserList(info.room);
      }
    });

    ws.on('error', (err) => console.error(`[erro ws] ${err.message}`));
  });
}

module.exports = { setupChatHandler };
