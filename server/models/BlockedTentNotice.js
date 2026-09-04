const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One row per alert already sent about a broken tent record.
 *
 * This exists purely to stop the VPs' inbox filling up: a captain who reloads
 * their profile ten times must not generate ten emails. Deduplication has to
 * be durable rather than in-process — the API runs serverless, so an
 * in-memory cache would be empty on most invocations.
 *
 * Keyed on tent + problem signature, so a record that later breaks in a NEW
 * way does alert again rather than being silently swallowed.
 */
const blockedTentNoticeSchema = new Schema(
  {
    tentRecordId: { type: String, required: true },
    signature: { type: String, required: true },
    tentOrder: String,
    tentName: String,
    problems: [{ code: String, message: String }],
    lastSentAt: { type: Date, required: true },
    timesSent: { type: Number, default: 1 },
  },
  { collection: 'blockedTentNotices', timestamps: true }
);

blockedTentNoticeSchema.index({ tentRecordId: 1, signature: 1 }, { unique: true });

module.exports = mongoose.model('BlockedTentNotice', blockedTentNoticeSchema);
