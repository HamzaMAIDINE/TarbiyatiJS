'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { smtpConfig, smtpTransport } = require('../backend/smtp');
const { brevoConfig, brevoTransport } = require('../backend/brevo');

async function checkEmail() {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const api = brevoConfig();
  const config = api || smtpConfig();
  if (!config) throw new Error('Configure BREVO_API_KEY and SMTP_FROM for HTTPS delivery, or SMTP_USER, SMTP_KEY and SMTP_FROM for SMTP. See README.md.');
  const transport = api ? brevoTransport(config) : smtpTransport(config);
  try {
    await transport.verify();
    console.log(`${api ? 'Brevo HTTPS connection and API authentication' : 'SMTP connection and login'} succeeded. No email was sent by this check. Restart the app and request a new verification code to check delivery.`);
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.code || '') ? error.code : 'DELIVERY_ERROR';
    const hints = {
      ETIMEDOUT: api ? 'The HTTPS connection timed out. Check internet access to api.brevo.com:443.'
        : `SMTP could not complete its connection to ${config.host}:${config.port}. Check outbound SMTP access, or configure BREVO_API_KEY to use HTTPS on port 443.`,
      EAUTH: 'The SMTP login/key was rejected. Copy the SMTP login and SMTP key from Brevo settings.',
      EBREVO_AUTH: 'The API key or its permissions were rejected. Use an active API key, separate from SMTP_KEY; check Brevo IP authorization too.'
    };
    throw new Error(`${api ? 'Brevo HTTPS' : 'SMTP'} check failed (${code}${Number.isInteger(error.responseCode) ? ', ' + error.responseCode : ''}). ${hints[code] || 'Check your mail configuration and Brevo account status.'}`);
  } finally { transport.close?.(); }
}

checkEmail().catch(error => { console.error(error.message); process.exitCode = 1; });
