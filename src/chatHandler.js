'use strict';

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const { RateLimiter } = require('./rateLimiter');
const { saveMessage, getHistory, toggleReaction, editMessage, deleteMessage, saveRoom, getRooms, deleteRoom, markAsRead, searchMessages, closeDb } = require('./db');

const MAX_NAME_LENGTH = parseInt(process.env.MAX_NAME_LENGTH || '20', 10);
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '500', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
const RATE_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '5000', 10);
const RATE_MAX = parseInt(process.env.RATE_LIMIT_MAX || '10', 10);

// Carrega salas do banco de dados
const ROOMS_DATA = new Map();
const dbRooms = getRooms();
if (dbRooms.length === 0) {
  ROOMS_DATA.set('geral', { name: 'geral', creator: 'Sistema', createdAt: new Date().toISOString() });
} else {
  dbRooms.forEach(r => ROOMS_DATA.set(r.name, r));
}

const AVAILABLE_ROOMS = () => Array.from(ROOMS_DATA.keys());
const ROOM_LABELS = {}; // Será preenchido dinamicamente
dbRooms.forEach(r => { ROOM_LABELS[r.name] = `# ${r.name}`; });
if (!ROOM_LABELS['geral']) ROOM_LABELS['geral'] = 'Geral';
const ALLOWED_REACTIONS = ['😀','😂','😍','🤔','😎','🥳','😢','😡','👍','👎','🙌','🔥','❤️','✅','⚡','🎉','💡','🚀','💬','🤝','😮','🥹','😴','🤣'];

const rateLimiter = new RateLimiter({ windowMs: RATE_WINDOW, maxRequests: RATE_MAX });
const clients = new Map(); // Map<ws, { name, room, sessionId, isAlive }>

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(data)); }
}

function broadcast(msg, room, excludeWs = null) {
  const payload = JSON.stringify(msg);
  const isPrivate = room && room.startsWith('p:');

  if (isPrivate) {
    // Para DMs, enviamos especificamente para os dois usuários envolvidos
    const parts = room.split(':');
    const user1 = parts[1];
    const user2 = parts[2];
    clients.forEach((info, ws) => {
      if ((info.name === user1 || info.name === user2) && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  } else {
    // Broadcast normal por sala
    clients.forEach((info, ws) => {
      if (info.room === room && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

function broadcastRoomList() {
  const payload = JSON.stringify({ type: 'room_list_update', rooms: AVAILABLE_ROOMS() });
  clients.forEach((_, ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

function broadcastUserList() {
  const users = [];
  clients.forEach((info) => {
    if (info.name) {
      users.push({ name: info.name, status: info.status || 'online' });
    }
  });
  const payload = JSON.stringify({ type: 'user_list', users });
  clients.forEach((_, ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

function findWsByName(name) {
  if (!name) return null;
  const searchName = name.trim().toLowerCase();
  for (const [ws, info] of clients) {
    if (info.name && info.name.trim().toLowerCase() === searchName) return ws;
  }
  return null;
}

function getPrivateRoomId(u1, u2) {
  return 'p:' + [u1, u2].sort().join(':');
}

function isNameTaken(name, room, excludeWs) {
  for (const [ws, info] of clients) {
    if (ws === excludeWs) { continue; }
    if (info.room === room && info.name && info.name.toLowerCase() === name.toLowerCase()) { return true; }
  }
  return false;
}

function now() { return new Date().toISOString(); }

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleJoin(ws, msg) {
  try {
    const name = validateName(msg.name);
    if (!name) { return send(ws, { type: 'error', text: 'Nome inválido. Use entre 1 e 20 caracteres.' }); }

    const roomName = msg.room || 'geral';
    if (!ROOMS_DATA.has(roomName)) {
      ROOMS_DATA.set(roomName, { name: roomName, creator: 'Sistema', createdAt: new Date().toISOString() });
    }
    
    const room = roomName;
    if (isNameTaken(name, room, ws)) {
      return send(ws, { type: 'error', text: `O nome "${name}" já está em uso nesta sala.` });
    }

    const sessionId = msg.sessionId || uuidv4();
    clients.set(ws, { name, room, sessionId, isAlive: true, status: 'online' });

    const { messages: history, hasMore } = getHistory(room, 30);
    const roomInfo = ROOMS_DATA.get(room);
    send(ws, { type: 'welcome', sessionId, name, room, roomInfo, rooms: AVAILABLE_ROOMS(), history, hasMore, timestamp: now() });
    
    broadcastRoomList();

    console.log(`[join] ${name} → "${room}"`);
    broadcast({ type: 'info', text: `${name} entrou no chat 👋`, timestamp: now() }, room, ws);
    broadcastUserList();
  } catch (err) {
    console.error('[handleJoin] Error:', err);
  }
}

function handleChatMessage(ws, msg, info) {
  try {
    if (!info.name) { return send(ws, { type: 'error', text: 'Entre no chat antes de enviar mensagens.' }); }

    const text = validateText(msg.text);
    if (!text) { return send(ws, { type: 'error', text: `Mensagem inválida (máx ${MAX_MESSAGE_LENGTH} caracteres).` }); }

    // Valida e sanitiza replyTo, se presente
    let replyTo = null;
    if (msg.replyTo && typeof msg.replyTo === 'object') {
      replyTo = {
        id: String(msg.replyTo.id || '').slice(0, 36),
        name: String(msg.replyTo.name || '').slice(0, MAX_NAME_LENGTH),
        text: String(msg.replyTo.text || '').slice(0, 100),
      };
    }

    const id = uuidv4();
    const timestamp = now();
    const payload = { type: 'message', id, name: info.name, text, room: info.room, timestamp, replyTo, reactions: {} };

    broadcast(payload, info.room);
    saveMessage({ id, room: info.room, name: info.name, text, timestamp, replyTo });
  } catch (err) {
    console.error('[handleChatMessage] Error:', err);
  }
}

function handleTyping(ws, msg, info) {
  try {
    if (!info.name) { return; }
    broadcast({ type: 'typing', name: info.name, isTyping: !!msg.isTyping }, info.room, ws);
  } catch (err) {
    console.error('[handleTyping] Error:', err);
  }
}

function handleSwitchRoom(ws, msg, info) {
  try {
    if (!info.name) { return; }
    const newRoom = msg.room ? msg.room.trim().toLowerCase() : 'geral';
    if (!newRoom) return;

    // Adiciona à lista de salas se for nova
    if (!ROOMS_DATA.has(newRoom)) {
      const rData = { name: newRoom, creator: info.name || 'Sistema', createdAt: new Date().toISOString() };
      ROOMS_DATA.set(newRoom, rData);
      saveRoom(newRoom, rData.creator);
    }
    
    if (!ROOM_LABELS[newRoom]) ROOM_LABELS[newRoom] = `# ${newRoom}`;

    info.room = newRoom;
    const { messages: history, hasMore } = getHistory(newRoom, 30);
    const roomInfo = ROOMS_DATA.get(newRoom);
    send(ws, { type: 'room_changed', room: newRoom, roomInfo, rooms: AVAILABLE_ROOMS(), history, hasMore, timestamp: now() });
    
    broadcastRoomList();
    
    const oldRoom = info.room;
    
    broadcastUserList();
    
    if (oldRoom !== newRoom) {
      broadcast({ type: 'info', text: `${info.name} entrou na sala 👋`, timestamp: now() }, newRoom, ws);
      broadcastUserList();
    }
    console.log(`[switch_room] ${info.name} → "${newRoom}"`);
  } catch (err) {
    console.error('[handleSwitchRoom] Error:', err);
  }
}

function handleDeleteRoom(ws, msg, info) {
  try {
    if (!info.name) return;
    const room = msg.room;
    if (room === 'geral') return send(ws, { type: 'error', text: 'A sala Geral não pode ser excluída.' });
    
    const roomInfo = ROOMS_DATA.get(room);
    if (!roomInfo) return send(ws, { type: 'error', text: 'Sala não encontrada.' });
    
    if (roomInfo.creator !== info.name && info.name !== 'Admin') {
      return send(ws, { type: 'error', text: 'Apenas o criador da sala pode excluí-la.' });
    }

    // 1. Remove do banco de dados (SQLite lida com mensagens via deleteRoom)
    deleteRoom(room);

    // 2. Remove a sala da lista
    ROOMS_DATA.delete(room);
    delete ROOM_LABELS[room];

    // 3. Avisa a todos
    broadcast({ type: 'room_deleted', room }, room); // Avisa quem está na sala
    broadcastRoomList(); // Atualiza lista para todos
    
    console.log(`[delete_room] ${info.name} excluiu a sala "${room}"`);
  } catch (err) {
    console.error('[handleDeleteRoom] Error:', err);
  }
}

/** Paginação: cliente pede mensagens anteriores à mensagem de ID `before` */
function handleLoadHistory(ws, msg, info) {
  try {
    if (!info.name) { return; }
    const room = msg.room || info.room;
    const { messages, hasMore } = getHistory(room, 30, msg.before || null);
    send(ws, { type: 'history_chunk', messages, hasMore, room });
  } catch (err) {
    console.error('[handleLoadHistory] Error:', err);
  }
}

/** Toggle de reação emoji em uma mensagem */
function handleReact(ws, msg, info) {
  try {
    if (!info.name) { return; }
    if (!ALLOWED_REACTIONS.includes(msg.emoji)) {
      return send(ws, { type: 'error', text: 'Emoji não permitido.' });
    }

    const room = msg.room || info.room;
    const reactions = toggleReaction(room, msg.messageId, msg.emoji, info.name);
    if (reactions === null) { return send(ws, { type: 'error', text: 'Mensagem não encontrada.' }); }

    broadcast({ type: 'reaction_update', messageId: msg.messageId, reactions, room: room }, room);
  } catch (err) {
    console.error('[handleReact] Error:', err);
  }
}

/** Editar mensagem própria (janela de 15 min) */
function handleEditMessage(ws, msg, info) {
  try {
    if (!info.name) { return; }
    const text = validateText(msg.text);
    if (!text) { return send(ws, { type: 'error', text: 'Texto inválido para edição.' }); }

    const room = msg.room || info.room;
    const result = editMessage(room, msg.id, text, info.name);
    if (result.error) { return send(ws, { type: 'error', text: result.error }); }

    broadcast({ type: 'message_edited', id: msg.id, text: text, editedAt: result.message.editedAt, room }, room);
    console.log(`[edit] ${info.name} editou mensagem ${msg.id}`);
  } catch (err) {
    console.error('[handleEditMessage] Error:', err);
  }
}

function handleDeleteMessage(ws, msg, info) {
  try {
    if (!info.name) { return; }
    const room = msg.room || info.room;
    const result = deleteMessage(room, msg.id, info.name);
    if (result.error) { return send(ws, { type: 'error', text: result.error }); }

    broadcast({ type: 'message_deleted', id: msg.id, room }, room);
    console.log(`[delete] ${info.name} deletou mensagem ${msg.id}`);
  } catch (err) {
    console.error('[handleDeleteMessage] Error:', err);
  }
}

function handleSetStatus(ws, msg, info) {
  try {
    if (!info.name) return;
    const validStatuses = ['online', 'away', 'busy'];
    const status = validStatuses.includes(msg.status) ? msg.status : 'online';
    info.status = status;
    
    broadcastUserList();
    
    console.log(`[status] ${info.name} -> ${status}`);
  } catch (err) {
    console.error('[handleSetStatus] Error:', err);
  }
}

function handlePrivateMessage(ws, msg, info) {
  try {
    if (!info.name) return send(ws, { type: 'error', text: 'Entre no chat antes de enviar mensagens.' });
    const targetWs = findWsByName(msg.to);
    if (!targetWs) return send(ws, { type: 'error', text: `Usuário "${msg.to}" não está online.` });

    const text = validateText(msg.text);
    if (!text) return send(ws, { type: 'error', text: 'Mensagem inválida.' });

    const id = uuidv4();
    const timestamp = now();
    const room = getPrivateRoomId(info.name, msg.to);
    
    // Suporte a replyTo em DMs
    const replyTo = msg.replyTo || null;
    
    const payload = { type: 'message', id, name: info.name, text, room, timestamp, isPrivate: true, to: msg.to, replyTo };

    send(ws, payload); // Envia para o remetente
    send(targetWs, payload); // Envia para o destinatário
    saveMessage({ id, room, name: info.name, text, timestamp, isPrivate: true, to: msg.to, replyTo });
  } catch (err) {
    console.error('[handlePrivateMessage] Error:', err);
  }
}

function handleMarkRead(ws, msg, info) {
  try {
    if (!info.name) return;
    markAsRead(msg.messageId, info.name);
    // Notifica o remetente original (opcional, para UI de checks)
    broadcast({ type: 'message_read', messageId: msg.messageId, user: info.name, room: msg.room }, msg.room);
  } catch (err) {
    console.error('[handleMarkRead] Error:', err);
  }
}

function handleSearch(ws, msg, info) {
  try {
    if (!info.name || !msg.term) return;
    const results = searchMessages(msg.room || info.room, msg.term);
    send(ws, { type: 'search_results', results, term: msg.term });
  } catch (err) {
    console.error('[handleSearch] Error:', err);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupChatHandler(wss) {
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

  // Graceful Shutdown
  process.on('SIGTERM', () => {
    console.log('[server] Recebido SIGTERM — Encerrando servidor...');
    clearInterval(heartbeatTimer);
    wss.close(() => {
      closeDb();
      process.exit(0);
    });
  });

  wss.on('connection', (ws, req) => {
    console.log(`[conexão] ${req.socket.remoteAddress}`);
    clients.set(ws, { name: null, room: null, sessionId: null, isAlive: true });

    ws.on('pong', () => {
      const info = clients.get(ws);
      if (info) { info.isAlive = true; }
    });

    ws.on('message', (rawData) => {
      let msg;
      try { msg = JSON.parse(rawData.toString()); }
      catch { return send(ws, { type: 'error', text: 'Mensagem inválida (JSON malformado).' }); }

      const info = clients.get(ws);
      console.log(`[ws] Mensagem recebida de ${info?.name || 'anon'}: ${msg.type}`);
      if (info && info.name && !rateLimiter.isAllowed(ws)) {
        return send(ws, { type: 'error', text: 'Muitas mensagens. Aguarde alguns segundos.' });
      }

      switch (msg.type) {
        case 'join':           handleJoin(ws, msg); break;
        case 'message':        handleChatMessage(ws, msg, info || {}); break;
        case 'typing':         handleTyping(ws, msg, info || {}); break;
        case 'switch_room':    handleSwitchRoom(ws, msg, info || {}); break;
        case 'load_history':   handleLoadHistory(ws, msg, info || {}); break;
        case 'react':          handleReact(ws, msg, info || {}); break;
        case 'edit_message':   handleEditMessage(ws, msg, info || {}); break;
        case 'delete_message': handleDeleteMessage(ws, msg, info || {}); break;
        case 'change_status':   handleSetStatus(ws, msg, info || {}); break;
        case 'private_message': handlePrivateMessage(ws, msg, info || {}); break;
        case 'delete_room':     handleDeleteRoom(ws, msg, info || {}); break;
        case 'mark_read':       handleMarkRead(ws, msg, info || {}); break;
        case 'search':          handleSearch(ws, msg, info || {}); break;
        default:               send(ws, { type: 'error', text: 'Tipo de mensagem desconhecido.' });
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      rateLimiter.remove(ws);
      clients.delete(ws);
      if (info && info.name && info.room) {
        console.log(`[desconexão] ${info.name} saiu de "${info.room}"`);
        broadcast({ type: 'info', text: `${info.name} saiu do chat 👋`, timestamp: now() }, info.room);
        broadcastUserList();
      }
    });

    ws.on('error', (err) => console.error(`[erro ws] ${err.message}`));
  });
}

module.exports = { setupChatHandler };
