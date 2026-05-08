'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'chat.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_FILE);

// Inicializa Tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    name TEXT PRIMARY KEY,
    creator TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT,
    name TEXT,
    text TEXT,
    timestamp TEXT,
    replyTo TEXT,
    reactions TEXT DEFAULT '{}',
    deleted INTEGER DEFAULT 0,
    editedAt TEXT,
    isPrivate INTEGER DEFAULT 0,
    targetUser TEXT,
    readBy TEXT DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room);
`);

// Insere sala Geral por padrão
const stmtRoom = db.prepare('INSERT OR IGNORE INTO rooms (name, creator, createdAt) VALUES (?, ?, ?)');
stmtRoom.run('geral', 'Sistema', new Date().toISOString());

/** --- SALAS --- **/

function saveRoom(name, creator) {
  const stmt = db.prepare('INSERT OR IGNORE INTO rooms (name, creator, createdAt) VALUES (?, ?, ?)');
  stmt.run(name, creator, new Date().toISOString());
}

function getRooms() {
  return db.prepare('SELECT * FROM rooms').all();
}

function deleteRoom(name) {
  db.prepare('DELETE FROM rooms WHERE name = ?').run(name);
  db.prepare('DELETE FROM messages WHERE room = ?').run(name);
}

/** --- MENSAGENS --- **/

function saveMessage(msg) {
  const stmt = db.prepare(`
    INSERT INTO messages (id, room, name, text, timestamp, replyTo, reactions, deleted, isPrivate, targetUser)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    msg.id,
    msg.room,
    msg.name,
    msg.text,
    msg.timestamp,
    msg.replyTo ? JSON.stringify(msg.replyTo) : null,
    JSON.stringify(msg.reactions || {}),
    msg.deleted ? 1 : 0,
    msg.isPrivate ? 1 : 0,
    msg.to || null
  );
}

function getHistory(room, limit = 30, before = null) {
  let query = 'SELECT * FROM messages WHERE room = ?';
  const params = [room];

  if (before) {
    const beforeMsg = db.prepare('SELECT timestamp FROM messages WHERE id = ?').get(before);
    if (beforeMsg) {
      query += ' AND timestamp < ?';
      params.push(beforeMsg.timestamp);
    }
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  
  // Formata os dados para o padrão do app
  const messages = rows.reverse().map(m => ({
    ...m,
    replyTo: m.replyTo ? JSON.parse(m.replyTo) : null,
    reactions: JSON.parse(m.reactions),
    deleted: !!m.deleted,
    isPrivate: !!m.isPrivate,
    to: m.targetUser,
    readBy: JSON.parse(m.readBy)
  }));

  const hasMore = messages.length === limit;
  return { messages, hasMore };
}

function toggleReaction(room, messageId, emoji, username) {
  const msg = db.prepare('SELECT reactions FROM messages WHERE id = ?').get(messageId);
  if (!msg) return null;

  const reactions = JSON.parse(msg.reactions);
  if (!reactions[emoji]) reactions[emoji] = [];

  const idx = reactions[emoji].indexOf(username);
  if (idx >= 0) {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji].push(username);
  }

  db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);
  return reactions;
}

function editMessage(room, messageId, newText, username) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) return { error: 'Mensagem não encontrada.' };
  if (msg.name !== username) return { error: 'Não autorizado.' };

  const editedAt = new Date().toISOString();
  db.prepare('UPDATE messages SET text = ?, editedAt = ? WHERE id = ?').run(newText, editedAt, messageId);
  return { success: true, message: { ...msg, text: newText, editedAt } };
}

function deleteMessage(room, messageId, username) {
  const msg = db.prepare('SELECT name FROM messages WHERE id = ?').get(messageId);
  if (!msg) return { error: 'Mensagem não encontrada.' };
  if (msg.name !== username) return { error: 'Não autorizado.' };

  db.prepare('UPDATE messages SET deleted = 1, text = "[mensagem removida]" WHERE id = ?').run(messageId);
  return { success: true };
}

function deleteAllMessagesFromRoom(room) {
  db.prepare('DELETE FROM messages WHERE room = ?').run(room);
}

function markAsRead(messageId, username) {
  const msg = db.prepare('SELECT readBy FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;

  const readBy = JSON.parse(msg.readBy);
  if (!readBy.includes(username)) {
    readBy.push(username);
    db.prepare('UPDATE messages SET readBy = ? WHERE id = ?').run(JSON.stringify(readBy), messageId);
  }
}

function searchMessages(room, term) {
  const query = 'SELECT * FROM messages WHERE room = ? AND text LIKE ? AND deleted = 0 ORDER BY timestamp DESC LIMIT 50';
  const rows = db.prepare(query).all(room, `%${term}%`);
  return rows.map(m => ({
    ...m,
    replyTo: m.replyTo ? JSON.parse(m.replyTo) : null,
    reactions: JSON.parse(m.reactions),
    readBy: JSON.parse(m.readBy)
  }));
}

module.exports = {
  saveRoom,
  getRooms,
  deleteRoom,
  saveMessage,
  getHistory,
  toggleReaction,
  editMessage,
  deleteMessage,
  deleteAllMessagesFromRoom,
  markAsRead,
  searchMessages
};
