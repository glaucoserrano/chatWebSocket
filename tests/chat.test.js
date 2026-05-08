'use strict';

const { RateLimiter } = require('../src/rateLimiter');
const { saveMessage, getHistory } = require('../src/db');
const path = require('path');
const fs = require('fs');

// ─── RateLimiter ─────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  test('permite até o limite de requisições', () => {
    const rl = new RateLimiter({ windowMs: 10000, maxRequests: 3 });
    const fakeWs = {};
    expect(rl.isAllowed(fakeWs)).toBe(true);
    expect(rl.isAllowed(fakeWs)).toBe(true);
    expect(rl.isAllowed(fakeWs)).toBe(true);
    expect(rl.isAllowed(fakeWs)).toBe(false); // 4ª deve ser bloqueada
  });

  test('libera após a janela de tempo expirar', async () => {
    const rl = new RateLimiter({ windowMs: 100, maxRequests: 1 });
    const fakeWs = {};
    expect(rl.isAllowed(fakeWs)).toBe(true);
    expect(rl.isAllowed(fakeWs)).toBe(false);
    await new Promise((r) => setTimeout(r, 150));
    expect(rl.isAllowed(fakeWs)).toBe(true); // janela expirou
  });

  test('remove cliente sem erros', () => {
    const rl = new RateLimiter();
    const fakeWs = {};
    rl.isAllowed(fakeWs);
    expect(() => rl.remove(fakeWs)).not.toThrow();
    expect(() => rl.remove(fakeWs)).not.toThrow(); // remoção dupla deve ser segura
  });
});

// ─── DB (persistência) ────────────────────────────────────────────────────────

describe('DB - persistência de mensagens', () => {
  const TEST_FILE = path.join(__dirname, '..', 'data', 'messages.json');

  beforeEach(() => {
    // Limpa o arquivo antes de cada teste
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  test('salva e recupera mensagens de uma sala', () => {
    saveMessage({ room: 'geral', name: 'Alice', text: 'Olá!', timestamp: '2026-01-01T00:00:00.000Z' });
    saveMessage({ room: 'geral', name: 'Bob', text: 'Oi!', timestamp: '2026-01-01T00:00:01.000Z' });

    const result = getHistory('geral');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].name).toBe('Alice');
    expect(result.messages[1].text).toBe('Oi!');
  });

  test('retorna array vazio para sala sem histórico', () => {
    const result = getHistory('sala-inexistente');
    expect(result.messages).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  test('respeita o limite de mensagens retornadas', () => {
    for (let i = 0; i < 10; i++) {
      saveMessage({ room: 'geral', name: 'User', text: `msg ${i}`, timestamp: new Date().toISOString() });
    }
    const result = getHistory('geral', 5);
    expect(result.messages).toHaveLength(5);
    // Deve retornar as 5 mais recentes
    expect(result.messages[result.messages.length - 1].text).toBe('msg 9');
  });

  test('mensagens de salas diferentes não se misturam', () => {
    saveMessage({ room: 'geral', name: 'Alice', text: 'Olá geral', timestamp: new Date().toISOString() });
    saveMessage({ room: 'tecnologia', name: 'Bob', text: 'Olá tech', timestamp: new Date().toISOString() });

    expect(getHistory('geral').messages).toHaveLength(1);
    expect(getHistory('tecnologia').messages).toHaveLength(1);
    expect(getHistory('geral').messages[0].text).toBe('Olá geral');
  });
});
