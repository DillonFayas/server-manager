'use strict';

const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

let transporter = null;

function initEmail() {
  const cfg = getConfig();
  if (!cfg.email || !cfg.email.enabled) {
    transporter = null;
    return;
  }
  try {
    transporter = nodemailer.createTransport({
      service: cfg.email.service,
      auth: { user: cfg.email.user, pass: cfg.email.pass },
    });
    console.log('Email notifications enabled');
  } catch (err) {
    console.error('Failed to setup email transporter:', err.message);
    transporter = null;
  }
}

async function sendCrashEmail(project, exitCode, lastLogs) {
  const cfg = getConfig();
  if (!cfg.email.enabled || !transporter) return;
  try {
    const logText = lastLogs.slice(-100).map((l) => l.text).join('');
    await transporter.sendMail({
      from: cfg.email.user,
      to: cfg.email.recipient,
      subject: `Project Crash Alert: ${project.name}`,
      text:
        `Project "${project.name}" has crashed.\n\nDetails:\n- Path: ${project.path}\n` +
        `- Command: ${project.command}\n- Exit Code: ${exitCode}\n- Time: ${new Date().toLocaleString()}\n\n` +
        `Last 100 log lines attached.`,
      attachments: [{ filename: `${project.name}-crash-logs.txt`, content: logText }],
    });
    console.log(`Crash email sent for project: ${project.name}`);
  } catch (err) {
    console.error('Failed to send crash email:', err.message);
  }
}

module.exports = { initEmail, sendCrashEmail };
