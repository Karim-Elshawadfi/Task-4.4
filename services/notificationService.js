// Req 13: email an advisor when they are added to or removed from the advising system.
// Same shape as services/resetMailer.js (Person 1): a factory that returns an async sender,
// so tests and app.js can inject a fake one.
const nodemailer = require('nodemailer');

function advisorEmailContent({ full_name, action }) {
  const added = action === 'ADDED';
  return {
    subject: added ? 'GUC scheduling — you were added as an advisor' : 'GUC scheduling — you were removed as an advisor',
    text: added
      ? `Dear ${full_name},\n\nYou have been added to the GUC advising system. You can now be assigned advising students.`
      : `Dear ${full_name},\n\nYou have been removed from the GUC advising system. You will no longer be assigned advising students, and your current students have been unassigned from you.`,
  };
}

function createAdvisorMailer(env = process.env) {
  let transport;
  return async ({ email, full_name, action }) => {
    if (!env.SMTP_HOST || !env.SMTP_FROM || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('SMTP is not configured');
    }
    transport ||= nodemailer.createTransport({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === 'true', requireTLS: env.SMTP_SECURE !== 'true',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, socketTimeout: 15000,
    });
    await transport.sendMail({ from: env.SMTP_FROM, to: email, ...advisorEmailContent({ full_name, action }) });
  };
}

module.exports = { createAdvisorMailer, advisorEmailContent };
