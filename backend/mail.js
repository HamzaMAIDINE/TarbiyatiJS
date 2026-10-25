'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { transaction } = require('./database');
const { smtpConfig, smtpTransport } = require('./smtp');
const { brevoConfig, brevoTransport } = require('./brevo');

function createMailer({ db, now, production, directory, deliverMail,
  smtp, brevo, fetchMail, webhookUrl = process.env.EMAIL_WEBHOOK_URL, webhookToken = process.env.EMAIL_WEBHOOK_TOKEN, logger }) {
  const brevoSettings = !deliverMail ? (brevo === undefined ? brevoConfig() : brevo) : null;
  const smtpSettings = !deliverMail && !brevoSettings ? (smtp === undefined ? smtpConfig() : smtp) : null;
  const api = brevoSettings ? brevoTransport(brevoSettings, fetchMail) : null;
  const transport = smtpSettings ? smtpTransport(smtpSettings) : null;
  const gateway = production ? webhookUrl : null;
  if (gateway) {
    const url = new URL(gateway);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('EMAIL_WEBHOOK_URL must use HTTPS without embedded credentials or a fragment.');
  }
  const available = Boolean(deliverMail || api || transport || gateway || !production && directory);
  const delivery = deliverMail || api || transport || gateway ? 'email' : available ? 'preview' : 'unavailable';
  const transportName = deliverMail ? 'custom' : api ? 'brevo_https' : transport ? 'smtp' : gateway ? 'gateway' : delivery;
  const deliver = deliverMail || (api ? api.send : transport ? message => transport.sendMail({
    from: { name: smtpSettings.name, address: smtpSettings.from }, to: message.to, subject: message.subject, text: message.text,
    messageId: `<${message.id}@${smtpSettings.from.split('@')[1]}>`
  }) : gateway ? async message => {
    const response = await fetch(gateway, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': message.id,
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}) }, body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000), redirect: 'error' });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Email gateway rejected delivery.');
  } : message => {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, `${message.id}.txt`), `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`, { mode: 0o600 });
  });
  let working = null; let stopped = false;
  function queue(to, subject, text, proofHash = null) {
    db.prepare('INSERT INTO mail_jobs(id,recipient,subject,body,created_at,next_attempt,token_hash) VALUES(?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), to, subject, text, now(), now(), proofHash);
  }
  function flush() {
    if (!available || stopped || working) return working || Promise.resolve();
    working = (async () => {
      // Reserve a bounded batch before waiting on network I/O. next_attempt also
      // acts as a two-minute lease so crashed workers do not strand the queue.
      const jobs = transaction(db, () => {
        const time = now();
        db.prepare(`UPDATE mail_jobs SET status='failed',body='' WHERE status='pending' AND token_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM account_tokens WHERE account_tokens.token_hash=mail_jobs.token_hash AND expires_at>?)`).run(time);
        const due = db.prepare("SELECT * FROM mail_jobs WHERE status='pending' AND next_attempt<=? ORDER BY created_at LIMIT 3").all(time);
        for (const job of due) {
          job.next_attempt = time + 120000;
          db.prepare('UPDATE mail_jobs SET next_attempt=? WHERE id=?').run(job.next_attempt, job.id);
        }
        return due;
      });
      for (const job of jobs) {
        if (job.token_hash && !db.prepare('SELECT 1 FROM account_tokens WHERE token_hash=? AND expires_at>?').get(job.token_hash, now())) {
          db.prepare("UPDATE mail_jobs SET status='failed',body='' WHERE id=? AND status='pending' AND next_attempt=?").run(job.id, job.next_attempt);
          continue;
        }
        try {
          await deliver({ id: job.id, to: job.recipient, subject: job.subject, text: job.body });
          db.prepare("UPDATE mail_jobs SET status='sent',body='',attempts=attempts+1 WHERE id=? AND status='pending' AND next_attempt=?").run(job.id, job.next_attempt);
        } catch (error) {
          const attempts = job.attempts + 1;
          db.prepare("UPDATE mail_jobs SET attempts=?,status=?,next_attempt=?,body=CASE WHEN ? THEN ? ELSE body END WHERE id=? AND status='pending' AND next_attempt=?")
            .run(attempts, attempts >= 5 ? 'failed' : 'pending', now() + Math.min(3600000, 60000 * 2 ** attempts), attempts >= 5 ? 1 : 0, '', job.id, job.next_attempt);
          logger({ event: 'mail_delivery_failed', jobId: job.id, attempts, transport: transportName,
            ...(typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? { errorCode: error.code } : {}),
            ...(Number.isInteger(error.responseCode) ? { responseCode: error.responseCode } : {}) });
        }
      }
    })().finally(() => { working = null; });
    return working;
  }
  const timer = available ? setInterval(() => flush().catch(() => logger({ event: 'mail_queue_failed' })), 1000) : null;
  timer?.unref();
  return { available, delivery, queue, flush, stop() {
    stopped = true; clearInterval(timer); return (working || Promise.resolve()).finally(() => transport?.close());
  } };
}
module.exports = { createMailer };
