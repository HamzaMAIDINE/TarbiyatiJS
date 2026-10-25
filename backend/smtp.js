'use strict';
require('./runtime');
const nodemailer = require('nodemailer');

function smtpConfig(env = process.env) {
  const key = env.SMTP_KEY || env.SMTP_PASS;
  if (!env.SMTP_USER && !key && !env.SMTP_FROM) return null;
  if (!env.SMTP_HOST || !env.SMTP_USER || !key || !env.SMTP_FROM)
    throw new Error('Email setup requires SMTP_HOST, SMTP_USER, SMTP_KEY and SMTP_FROM. See .env.example.');
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port number.');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) throw new Error('SMTP_SECURE must be true or false.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM)) throw new Error('SMTP_FROM must be a verified sender email address.');
  return { host: env.SMTP_HOST, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER, pass: key, from: env.SMTP_FROM, name: env.SMTP_FROM_NAME || 'Tarbiyati · تربيتي' };
}

function smtpTransport(config) {
  return nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure,
    requireTLS: !config.secure, auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true });
}

module.exports = { smtpConfig, smtpTransport };
