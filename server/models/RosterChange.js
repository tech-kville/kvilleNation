const mongoose = require('mongoose');
const { Schema } = mongoose;

const memberSchema = new Schema({ name: String, netID: String }, { _id: false });

/**
 * An append-only record of every roster edit a captain makes on the website.
 *
 * Captains write straight through to Airtable, so this is what lets the VPs of
 * Tenting review — and if necessary reverse — a change after the fact. The
 * before/after fields hold the complete column values (canonicalized to
 * consistent comma spacing), so a change is always reconstructible even when
 * the added/removed diff misses something — a rename, for instance, shows in
 * neither list.
 */
const rosterChangeSchema = new Schema(
  {
    tentRecordId: { type: String, required: true, index: true },
    tentOrder: String,
    tentName: String,

    actorNetID: { type: String, required: true },
    actorName: String,

    before: {
      members: String,
      netIDs: String,
    },
    after: {
      members: String,
      netIDs: String,
    },

    added: [memberSchema],
    removed: [memberSchema],
  },
  { collection: 'rosterChanges', timestamps: true }
);

module.exports = mongoose.model('RosterChange', rosterChangeSchema);
