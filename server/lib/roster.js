/**
 * Roster parsing, validation, and diffing.
 *
 * Airtable stores a tent's roster as two comma-separated strings that are
 * positionally parallel: index N of `Members` is the same person as index N
 * of `netIDs`. Every function here preserves that alignment.
 *
 * Pure — no I/O, no Airtable, no Mongo.
 */

const MAX_MEMBERS = 12;

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim());
}

/**
 * Turn the two parallel Airtable columns into [{ name, netID }].
 *
 * If the columns have drifted out of sync (one longer than the other), the
 * shorter is padded with '' rather than throwing — a malformed record still
 * needs to render read-only so the captain can see something and email the VPs.
 * Slots that are empty on both sides are dropped.
 */
function parseRoster(membersStr, netIDsStr) {
  const names = splitList(membersStr);
  const netIDs = splitList(netIDsStr);
  const length = Math.max(names.length, netIDs.length);

  const roster = [];
  for (let i = 0; i < length; i++) {
    const name = names[i] || '';
    const netID = netIDs[i] || '';
    if (!name && !netID) continue;
    roster.push({ name, netID });
  }
  return roster;
}

/** Inverse of parseRoster: back to the two Airtable column values. */
function serializeRoster(roster) {
  return {
    members: roster.map((m) => String(m.name ?? '').trim()).join(', '),
    netIDs: roster.map((m) => String(m.netID ?? '').trim()).join(', '),
  };
}

/**
 * Enforce the rules a captain may not break on their own.
 * Returns { ok, errors: [{ code, message, ... }] } — codes drive the client's
 * info boxes, messages exist so a raw API response is still readable.
 */
function validateRoster(roster, captainNetID) {
  const errors = [];

  if (!Array.isArray(roster)) {
    return {
      ok: false,
      errors: [{ code: 'invalid-roster', message: 'Roster must be a list of members.' }],
    };
  }

  if (roster.length > MAX_MEMBERS) {
    errors.push({
      code: 'too-many-members',
      message: `Tents are capped at ${MAX_MEMBERS} members.`,
      max: MAX_MEMBERS,
      count: roster.length,
    });
  }

  if (roster.some((m) => !String(m?.name ?? '').trim() || !String(m?.netID ?? '').trim())) {
    errors.push({
      code: 'incomplete-entry',
      message: 'Every member needs both a name and a netID.',
    });
  }

  // A comma in either field would corrupt the parallel-list encoding on save.
  if (roster.some((m) => String(m?.name ?? '').includes(',') || String(m?.netID ?? '').includes(','))) {
    errors.push({
      code: 'invalid-character',
      message: 'Names and netIDs cannot contain commas.',
    });
  }

  const seen = new Set();
  const duplicates = new Set();
  for (const member of roster) {
    const key = norm(member?.netID);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    errors.push({
      code: 'duplicate-netid',
      message: 'That netID is already on this roster.',
      netIDs: [...duplicates],
    });
  }

  if (!seen.has(norm(captainNetID))) {
    errors.push({
      code: 'captain-removed',
      message: 'The captain cannot be removed from their own tent.',
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Which people joined and which left, matched on netID.
 * A member who was only renamed appears in neither list; the audit log stores
 * the full before/after strings, so renames stay recoverable.
 */
function diffRosters(before, after) {
  const beforeKeys = new Set(before.map((m) => norm(m.netID)));
  const afterKeys = new Set(after.map((m) => norm(m.netID)));

  return {
    added: after.filter((m) => !beforeKeys.has(norm(m.netID))),
    removed: before.filter((m) => !afterKeys.has(norm(m.netID))),
  };
}

module.exports = {
  MAX_MEMBERS,
  parseRoster,
  serializeRoster,
  validateRoster,
  diffRosters,
};
