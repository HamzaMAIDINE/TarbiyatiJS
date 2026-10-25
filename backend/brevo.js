'use strict';
require('./runtime');

function brevoConfig(env = process.env) {
  const key = env.BREVO_API_KEY;
  if (!key) return null;
  if (/^xsmtpsib-/i.test(key) || /[^\x21-\x7e]/.test(key)) throw new Error('BREVO_API_KEY must be a Brevo API key, separate from SMTP_KEY, with no spaces or line breaks.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM || '')) throw new Error('Brevo HTTPS delivery requires SMTP_FROM to be a verified sender email address.');
  return { key, from: env.SMTP_FROM, name: env.SMTP_FROM_NAME || 'Tarbiyati · تربيتي' };
}

function brevoTransport(config, fetchMail = globalThis.fetch) {
  async function request(route, body) {
    let response;
    try {
      response = await fetchMail('https://api.brevo.com/v3/' + route, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json', 'api-key': config.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      const code = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'ETIMEDOUT'
        : /^[A-Z_]+$/.test(error.cause?.code || '') ? error.cause.code : 'EBREVO_NETWORK';
      throw Object.assign(new Error('Brevo HTTPS connection failed.'), { code });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // A retry of an accepted request should complete the same queued job.
      if (body && payload?.code === 'duplicate_parameter' && /idempotenc[ye]/i.test(payload.message || '')) return { duplicate: true };
      const code = response.status === 401 || response.status === 403 ? 'EBREVO_AUTH'
        : response.status === 429 ? 'EBREVO_RATE_LIMIT' : response.status === 402 ? 'EBREVO_QUOTA'
        : response.status === 400 && /sender/i.test(payload?.message || '') ? 'EBREVO_SENDER' : 'EBREVO_REJECTED';
      // Provider responses can include addresses or message contents; keep errors/logs generic.
      throw Object.assign(new Error('Brevo HTTPS request was rejected.'), { code, responseCode: response.status });
    }
    if (!payload || body && (typeof payload.messageId !== 'string' || !payload.messageId)) throw Object.assign(new Error('Brevo returned an invalid response.'), { code: 'EBREVO_RESPONSE' });
    return payload;
  }
  return {
    verify: () => request('account').then(() => true),
    async send(message) {
      await request('smtp/email', { sender: { email: config.from, name: config.name }, to: [{ email: message.to }],
        subject: message.subject, textContent: message.text, headers: { IdempotencyKey: message.id } });
    }
  };
}

module.exports = { brevoConfig, brevoTransport };
