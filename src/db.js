'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '100', 10);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    console.warn('[db] Arquivo de mensagens corrompido — iniciando do zero.');
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[db] Erro ao salvar mensagens:', err.message);
  }
}

function saveMessage({ room, name, text, timestamp }) {
  const data = loadData();
  if (!data[room]) { data[room] = []; }
  data[room].push({ name, text, timestamp });
  if (data[room].length > MAX_HISTORY) {
    data[room] = data[room].slice(-MAX_HISTORY);
  }
  saveData(data);
}

function getHistory(room, limit = 50) {
  const data = loadData();
  const messages = data[room] || [];
  return messages.slice(-limit);
}

module.exports = { saveMessage, getHistory };
