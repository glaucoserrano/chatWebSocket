'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'chat.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db;
try {
  console.log(`[db] Iniciando banco de dados em: ${DB_FILE}`);
  db = new Database(DB_FILE, { timeout: 5000 });
  db.pragma('journal_mode = WAL'); // Modo de alta performance
  
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

  try {
    db.exec(`ALTER TABLE rooms ADD COLUMN category TEXT DEFAULT 'Outros'`);
    db.exec(`ALTER TABLE rooms ADD COLUMN description TEXT DEFAULT ''`);
    db.exec(`ALTER TABLE rooms ADD COLUMN tags TEXT DEFAULT '[]'`);
    db.exec(`ALTER TABLE rooms ADD COLUMN capacity INTEGER DEFAULT 50`);
  } catch(e) {} // Falha silenciosamente se a coluna já existir

  console.log('[db] Tabelas verificadas/criadas com sucesso.');

  // Insere sala Geral por padrão
  const stmtRoom = db.prepare('INSERT OR IGNORE INTO rooms (name, creator, createdAt) VALUES (?, ?, ?)');
  stmtRoom.run('geral', 'Sistema', new Date().toISOString());
  console.log('[db] Banco de dados pronto.');
} catch (err) {
  console.error('❌ ERRO CRÍTICO NO BANCO DE DADOS:', err.message);
  console.error('Verifique as permissões da pasta "data" ou se o volume está montado corretamente.');
  // Em vez de process.exit, vamos tentar rodar mesmo sem banco (embora falhe depois) 
  // para vermos o erro no log do Railway antes do SIGTERM
}

/** --- SALAS --- **/

function saveRoom(name, creator, category = 'Outros', description = '', tags = [], capacity = 50) {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO rooms (name, creator, createdAt, category, description, tags, capacity) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET 
      category=excluded.category,
      description=excluded.description,
      tags=excluded.tags,
      capacity=excluded.capacity
  `);
  stmt.run(name, creator, new Date().toISOString(), category, description, JSON.stringify(tags), capacity);
}

function getRooms() {
  if (!db) return [];
  const rows = db.prepare('SELECT * FROM rooms').all();
  return rows.map(r => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : []
  }));
}

function deleteRoom(name) {
  if (!db) return;
  db.prepare('DELETE FROM rooms WHERE name = ?').run(name);
  db.prepare('DELETE FROM messages WHERE room = ?').run(name);
}

/** --- MENSAGENS --- **/

function saveMessage(msg) {
  if (!db) return;
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
  if (!db) return { messages: [], hasMore: false };
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
  if (!db) return null;
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
  if (!db) return { error: 'Banco de dados offline.' };
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) return { error: 'Mensagem não encontrada.' };
  if (msg.name !== username) return { error: 'Não autorizado.' };

  const editedAt = new Date().toISOString();
  db.prepare('UPDATE messages SET text = ?, editedAt = ? WHERE id = ?').run(newText, editedAt, messageId);
  return { success: true, message: { ...msg, text: newText, editedAt } };
}

function deleteMessage(room, messageId, username) {
  if (!db) return { error: 'Banco de dados offline.' };
  const msg = db.prepare('SELECT name, isPrivate FROM messages WHERE id = ?').get(messageId);
  if (!msg) return { error: 'Mensagem não encontrada.' };

  const isGlauco = username.toLowerCase() === 'glauco';
  const canModerate = isGlauco && !msg.isPrivate;

  if (msg.name !== username && !canModerate) return { error: 'Não autorizado.' };

  db.prepare('UPDATE messages SET deleted = 1, text = ? WHERE id = ?').run('[mensagem removida]', messageId);
  return { success: true };
}

function deleteAllMessagesFromRoom(room) {
  if (!db) return;
  db.prepare('DELETE FROM messages WHERE room = ?').run(room);
}

function markAsRead(messageId, username) {
  if (!db) return;
  const msg = db.prepare('SELECT readBy FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;

  const readBy = JSON.parse(msg.readBy);
  if (!readBy.includes(username)) {
    readBy.push(username);
    db.prepare('UPDATE messages SET readBy = ? WHERE id = ?').run(JSON.stringify(readBy), messageId);
  }
}

function searchMessages(room, term) {
  if (!db) return [];
  const query = 'SELECT * FROM messages WHERE room = ? AND text LIKE ? AND deleted = 0 ORDER BY timestamp DESC LIMIT 50';
  const rows = db.prepare(query).all(room, `%${term}%`);
  return rows.map(m => ({
    ...m,
    replyTo: m.replyTo ? JSON.parse(m.replyTo) : null,
    reactions: JSON.parse(m.reactions),
    readBy: JSON.parse(m.readBy)
  }));
}

function closeDb() {
  if (db) {
    console.log('[db] Fechando conexão SQLite...');
    db.close();
  }
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
  searchMessages,
  closeDb
};
