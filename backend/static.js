'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

function byteRange(header, size) {
  // Ignore unsupported/malformed ranges; a single valid but unsatisfiable range receives 416.
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!match || !match[1] && !match[2]) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ([first, last].some(n => n !== null && !Number.isSafeInteger(n)) || !size) return false;
  const start = first === null ? Math.max(0, size - last) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  return start >= size || end < start ? false : { start, end };
}

function sendFile(req, res, filename) {
  const stat = fs.statSync(filename), extension = path.extname(filename);
  if (extension === '.svg') {
    // SVGs are passive images, including when opened directly in a browser.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
  }
  const html = extension === '.html', pdf = extension === '.pdf';
  const etag = `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
  if (!html) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if ((req.headers['if-none-match'] || '').split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.slice(2))) {
      res.writeHead(304); return res.end();
    }
  }
  if (pdf) res.setHeader('Accept-Ranges', 'bytes');
  const ifRange = req.headers['if-range'];
  const canRange = !ifRange || Number.isFinite(Date.parse(ifRange)) && Math.floor(stat.mtimeMs / 1000) <= Date.parse(ifRange) / 1000;
  const range = pdf && req.method === 'GET' && canRange ? byteRange(req.headers.range, stat.size) : null;
  if (range === false) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Content-Length': 0 }); return res.end();
  }
  if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
  res.writeHead(range ? 206 : 200, { 'Content-Type': TYPES[extension], 'Content-Length': range ? range.end - range.start + 1 : stat.size });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filename, range || undefined);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

module.exports = { sendFile };
