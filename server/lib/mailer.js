/**
 * Outbound email, over Gmail SMTP as the tenting account itself.
 *
 * Two rules govern everything here:
 *
 *   1. It NEVER throws into a request path. A captain's page load must not
 *      fail because Gmail was slow or a credential expired.
 *   2. With no credentials configured it logs and no-ops. Local development
 *      and any deploy that has not set the env vars keep working untouched,
 *      rather than erroring on every send.
 *
 * Configure with MAIL_USER and MAIL_APP_PASSWORD (a Google App Password —
 * a normal account password will not work once 2FA is on). MAIL_TO overrides
 * the destination, which is useful for testing against your own inbox.
 */

const nodemailer = require('nodemailer');

const DEFAULT_RECIPIENT = 'tenting.kville@gmail.com';

let _transport = null;

function isConfigured() {
  return Boolean(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD);
}

function getTransport() {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_APP_PASSWORD,
    },
  });
  return _transport;
}

/** Reset the memoized transport. Tests use this; nothing else should need it. */
function resetTransport() {
  _transport = null;
}

/**
 * Send a plain-text message.
 * @returns {Promise<{sent: boolean, reason?: string}>} — never rejects.
 */
async function sendMail({ subject, text, to }) {
  if (!isConfigured()) {
    console.log(`[mailer] not configured (MAIL_USER/MAIL_APP_PASSWORD unset); skipping: "${subject}"`);
    return { sent: false, reason: 'not-configured' };
  }

  const recipient = to || process.env.MAIL_TO || DEFAULT_RECIPIENT;

  try {
    await getTransport().sendMail({
      from: `"K-Ville Nation" <${process.env.MAIL_USER}>`,
      to: recipient,
      subject,
      text,
    });
    return { sent: true };
  } catch (error) {
    console.error('[mailer] send failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

module.exports = { sendMail, isConfigured, resetTransport, DEFAULT_RECIPIENT };
