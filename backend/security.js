'use strict';
require('./runtime');
const crypto = require('node:crypto');
const net = require('node:net');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { transaction } = require('./database');
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function failure(status, message, retryAfter) { return Object.assign(new Error(message), { status, retryAfter }); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function cookieToken(req) { return (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('edu_session='))?.slice(12) || ''; }
function ipAddress(value) { return value?.startsWith('::ffff:') ? value.slice(7) : value; }
function clientIp(req, trustedProxies) {
  let address = ipAddress(req.socket.remoteAddress) || 'unknown';
  if (!trustedProxies.has(address)) return address;
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',').map(p => ipAddress(p.trim()));
  if (forwarded.length > 10 || forwarded.some(ip => !net.isIP(ip))) return address;
  // Walk from the actual socket peer toward the client. Untrusted hops terminate the chain.
  while (trustedProxies.has(address) && forwarded.length) address = forwarded.pop();
  return address;
}
function requestOrigin(req, trustedProxies, publicOrigin) {
  const trusted = trustedProxies.has(ipAddress(req.socket.remoteAddress));
  const forwarded = name => trusted ? req.headers[name]?.split(',').at(-1).trim() : '';
  const protocol = forwarded('x-forwarded-proto') || (req.socket.encrypted ? 'https' : 'http');
  const host = forwarded('x-forwarded-host') || req.headers.host || '';
  let origin = publicOrigin;
  if (!origin) {
    if (!['https', 'http'].includes(protocol) || !host || /[\s\\/@?#,]/.test(host)) throw failure(400, 'عنوان الطلب غير صالح.');
    try { origin = new URL(`${protocol}://${host}`).origin; }
    catch { throw failure(400, 'عنوان الطلب غير صالح.'); }
  }
  return { origin, allowed: !req.headers.origin || req.headers.origin === origin };
}
function createLimiter(db, now) {
  return {
    check(key, maximum, windowMs, increment = true) {
      return transaction(db, () => {
        const time = now();
        let entry = db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
        if (!entry || entry.until <= time) entry = { count: 0, until: time + windowMs };
        if (entry.count >= maximum) throw failure(429, 'محاولات كثيرة. حاول مرة أخرى بعد قليل.', Math.max(1, Math.ceil((entry.until - time) / 1000)));
        if (increment) db.prepare('INSERT INTO rate_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until').run(key, entry.count + 1, entry.until);
      });
    },
    clear(key) { db.prepare('DELETE FROM rate_limits WHERE key=?').run(key); }
  };
}
function passwordHasher() {
  let active = 0;
  return async (password, salt) => {
    if (active >= 4) throw failure(503, 'الخدمة مشغولة الآن. حاول بعد لحظة.', 1);
    active++;
    try { return await scrypt(password, salt, 32, HASH_OPTIONS); }
    finally { active--; }
  };
}
function readJson(req, limit = 32768) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); reject(failure(415, 'صيغة الطلب غير مدعومة.')); return; }
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') { req.resume(); reject(failure(415, 'صيغة الطلب غير مدعومة.')); return; }
    if (Number(req.headers['content-length']) > limit) { req.resume(); reject(failure(413, 'الطلب أكبر من الحجم المسموح.')); return; }
    const chunks = []; let bytes = 0; let exceeded = false;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limit) { if (!exceeded) { exceeded = true; chunks.length = 0; reject(failure(413, 'الطلب أكبر من الحجم المسموح.')); } return; }
      if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return;
      try {
        const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        const inspect = (value, depth = 0) => {
          if (depth > 20) throw new Error();
          if (!value || typeof value !== 'object') return;
          for (const key of Object.keys(value)) {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error();
            inspect(value[key], depth + 1);
          }
        };
        inspect(body);
        resolve(body);
      }
      catch { reject(failure(400, 'طلب غير صالح.')); }
    });
    req.on('aborted', () => reject(failure(400, 'انقطع إرسال الطلب.')));
    req.on('error', reject);
  });
}
module.exports = { UUID, failure, tokenHash, cookieToken, ipAddress, clientIp, requestOrigin, createLimiter, passwordHasher, readJson };
