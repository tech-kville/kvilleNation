/**
 * Tells the VPs of Tenting when a tent's Airtable record is broken in a way
 * its captain cannot repair.
 *
 * Deliberately narrow: it fires only for stored-data problems, never for a
 * captain's own mistakes (removing themselves, adding a 13th member). Those
 * are self-correctable and would be pure noise.
 *
 * Like the mailer, this never throws into a request path — a captain's page
 * must load whether or not we managed to tell anyone about it.
 */

const BlockedTentNotice = require('../models/BlockedTentNotice');
const { diagnoseTent } = require('./tentDiagnostics');
const { sendMail, DEFAULT_RECIPIENT } = require('./mailer');

/** How long the same problem on the same tent stays quiet after an alert. */
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000;

function buildBody(tent, diagnosis, actorNetID) {
  const lines = [
    `Tent ${tent.order}${tent.name ? ` — "${tent.name}"` : ''} cannot be edited by its captain.`,
    '',
    `Captain field: ${tent.captain || '(empty)'}`,
    `Type:          ${tent.type || '(none)'}`,
    `Start Date:    ${tent.startDate || '(none)'}`,
    actorNetID ? `Hit by:        ${actorNetID}` : null,
    '',
    'Problems found:',
    ...diagnosis.problems.map((p) => `  • ${p.message}`),
    '',
    'Current Airtable values:',
    `  Members: ${tent.members || '(empty)'}`,
    `  netIDs:  ${tent.netIDs || '(empty)'}`,
    '',
    'The Members and netIDs columns are comma-separated and must line up',
    'position by position — the first name goes with the first netID, and so on.',
    '',
    'This is an automated message from kvillenation.com. You will not be',
    'emailed about this same tent and problem again for 24 hours.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Diagnose a tent and alert the VPs if it is broken.
 *
 * @param {object} tent      A mapped Airtable tent record.
 * @param {string} actorNetID  Who ran into it, for context in the email.
 * @returns {Promise<{notified: boolean, reason?: string, problems?: Array}>}
 */
async function notifyIfBlocked(tent, actorNetID) {
  try {
    const diagnosis = diagnoseTent(tent);
    if (diagnosis.ok) return { notified: false, reason: 'healthy' };

    const now = new Date();
    const cutoff = new Date(now.getTime() - RESEND_AFTER_MS);

    // Atomic find-and-update: only claims the send if no alert for this exact
    // problem has gone out inside the window. Two concurrent requests cannot
    // both win, so the captain double-clicking cannot produce two emails.
    const claimed = await BlockedTentNotice.findOneAndUpdate(
      {
        tentRecordId: tent.id,
        signature: diagnosis.signature,
        $or: [{ lastSentAt: { $lt: cutoff } }, { lastSentAt: { $exists: false } }],
      },
      {
        $set: {
          lastSentAt: now,
          tentOrder: String(tent.order ?? ''),
          tentName: tent.name,
          problems: diagnosis.problems.map((p) => ({ code: p.code, message: p.message })),
        },
        $inc: { timesSent: 1 },
      },
      { new: true }
    );

    if (!claimed) {
      // Either we alerted recently, or this is the first sighting and no row
      // exists yet. upsert:true above would race, so create explicitly and let
      // the unique index reject the loser.
      try {
        await BlockedTentNotice.create({
          tentRecordId: tent.id,
          signature: diagnosis.signature,
          tentOrder: String(tent.order ?? ''),
          tentName: tent.name,
          problems: diagnosis.problems.map((p) => ({ code: p.code, message: p.message })),
          lastSentAt: now,
        });
      } catch (err) {
        // Duplicate key => a row already exists and is inside the quiet window.
        if (err.code === 11000) return { notified: false, reason: 'already-notified' };
        throw err;
      }
    }

    const subject = `[K-Ville] Tent ${tent.order} roster is blocked — needs a VP fix`;
    const result = await sendMail({ subject, text: buildBody(tent, diagnosis, actorNetID) });

    return {
      notified: result.sent,
      reason: result.sent ? undefined : result.reason,
      problems: diagnosis.problems,
    };
  } catch (error) {
    console.error('[blockedTentNotifier] failed:', error.message);
    return { notified: false, reason: error.message };
  }
}

module.exports = { notifyIfBlocked, RESEND_AFTER_MS, DEFAULT_RECIPIENT };
