const nodemailer = require('nodemailer');
const env = require('../config/env');
const { logger } = require('../config/logger');

/**
 * Email delivery abstraction. Uses SMTP when configured; otherwise falls back
 * to a JSON transport that logs the rendered message so development flows
 * (verification links, reset codes) remain fully testable without a mail server.
 */
let transporter;
if (env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || 587,
    secure: (env.SMTP_PORT || 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Fail fast if SMTP is unreachable — callers await sendMail inside request handlers.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
} else {
  transporter = nodemailer.createTransport({ jsonTransport: true });
}

const sendMail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html, text });
    if (!env.SMTP_HOST) {
      logger.info(`📧 [dev mail] to=${to} subject="${subject}"`, { preview: (text || '').slice(0, 200) });
    }
    return info;
  } catch (err) {
    logger.error(`Mail delivery failed to ${to}: ${err.message}`);
    return null; // Mail failures must never break API flows.
  }
};

const layout = (title, body) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F6F9FC;border-radius:12px">
    <p style="margin:0 0 4px;color:#16406F;font-weight:800;letter-spacing:1px">STUDENTS_ALAHLIYYA</p>
    <p style="margin:0 0 16px;color:#C9A648;font-size:11px;letter-spacing:3px;text-transform:uppercase">Rise to Excellence</p>
    <h2 style="color:#16406F;margin:0 0 16px">${title}</h2>
    <div style="background:#ffffff;border-radius:8px;padding:20px;color:#1A2C49;line-height:1.6">${body}</div>
    <p style="color:#94A6BC;font-size:12px;margin-top:16px">Students Alahliyya — automated message, do not reply.</p>
  </div>`;

const templates = {
  verifyEmail: (name, code) => ({
    subject: 'Verify your email address',
    html: layout('Verify your email', `<p>Hi ${name},</p><p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#4f46e5">${code}</p>
      <p>This code expires in 15 minutes.</p>`),
    text: `Hi ${name}, your verification code is ${code} (expires in 15 minutes).`,
  }),
  resetPassword: (name, code) => ({
    subject: 'Password reset request',
    html: layout('Reset your password', `<p>Hi ${name},</p><p>Your password reset code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#4f46e5">${code}</p>
      <p>If you did not request this, you can safely ignore this email.</p>`),
    text: `Hi ${name}, your password reset code is ${code}.`,
  }),
  enrollmentConfirmed: (name, courseTitle) => ({
    subject: `Enrolled: ${courseTitle}`,
    html: layout('Enrollment confirmed', `<p>Hi ${name},</p><p>You are now enrolled in <strong>${courseTitle}</strong>. Happy learning!</p>`),
    text: `Hi ${name}, you are now enrolled in ${courseTitle}.`,
  }),
  certificateIssued: (name, courseTitle, serial) => ({
    subject: `Certificate earned: ${courseTitle}`,
    html: layout('Congratulations!', `<p>Hi ${name},</p><p>You completed <strong>${courseTitle}</strong>.</p><p>Certificate serial: <code>${serial}</code></p>`),
    text: `Hi ${name}, you completed ${courseTitle}. Certificate serial: ${serial}.`,
  }),
  genericNotification: (name, title, body) => ({
    subject: title,
    html: layout(title, `<p>Hi ${name},</p><p>${body}</p>`),
    text: `Hi ${name}, ${title}: ${body}`,
  }),
};

module.exports = { sendMail, templates };
