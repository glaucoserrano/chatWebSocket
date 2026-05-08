'use strict';

/**
 * Rate limiter baseado em janela deslizante (sliding window).
 * Permite até `maxRequests` mensagens por `windowMs` milissegundos por cliente.
 */
class RateLimiter {
  constructor({ windowMs = 5000, maxRequests = 10 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.clients = new Map();
  }

  isAllowed(ws) {
    const now = Date.now();
    const timestamps = this.clients.get(ws) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) {
      this.clients.set(ws, recent);
      return false;
    }
    recent.push(now);
    this.clients.set(ws, recent);
    return true;
  }

  remove(ws) {
    this.clients.delete(ws);
  }
}

module.exports = { RateLimiter };
