const nodemailer = require('nodemailer');

function createResetMailer(env = process.env) {
  let transport;
  return async ({ email, code }) => {
    if (!env.SMTP_HOST || !env.SMTP_FROM || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('SMTP is not configured');
    }
    transport ||= nodemailer.createTransport({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === 'true', requireTLS: env.SMTP_SECURE !== 'true',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, socketTimeout: 15000,
    });
    await transport.sendMail({ from: env.SMTP_FROM, to: email,
      subject: 'GUC scheduling — password reset code',
      text: `Your password reset code is ${code}. It expires in 10 minutes and can be used once. If you did not request it, ignore this email.` });
  };
}

module.exports = { createResetMailer };
