/**
 * Data-integrity diagnosis for a tent's Airtable record.
 *
 * This answers one question: is this record broken in a way the captain
 * CANNOT fix themselves? That is the line between "your data is malformed,
 * a VP has to repair it in Airtable" and "you typed something wrong".
 *
 * It always inspects the STORED record, never an incoming request. A captain
 * trying to remove themselves is a user error; the captain being absent from
 * the stored row is a data problem. Same rule, opposite handling.
 *
 * Pure — no I/O.
 */

const { parseRoster, MAX_MEMBERS } = require('./roster');
const { getEditWindow } = require('./rosterWindow');

/** A netID slot holding more than one value, e.g. "ajc150 acd82" or "mps69. cvv4". */
const EMBEDDED_SEPARATOR = /[\s.]/;

function splitColumn(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @returns {{ ok: boolean, problems: Array<{code, message, ...detail}>, signature: string }}
 *
 * `signature` is a stable fingerprint of which problems are present. It is what
 * the notifier de-duplicates on, so a captain reloading the page does not
 * generate a new alert, but a record breaking in a NEW way does.
 */
function diagnoseTent(tent) {
  const problems = [];

  const names = splitColumn(tent.members);
  const netIDs = splitColumn(tent.netIDs);

  // Checked first: this is the usual root cause, and it makes the column
  // lengths disagree as a side effect. Reporting it first means the email
  // leads with the fix rather than the symptom.
  netIDs.forEach((id, i) => {
    if (EMBEDDED_SEPARATOR.test(id)) {
      problems.push({
        code: 'embedded-separator',
        slot: i + 1,
        value: id,
        message: `netIDs slot ${i + 1} contains more than one value ("${id}") — the separator should be a comma.`,
      });
    }
  });

  if (names.length !== netIDs.length) {
    problems.push({
      code: 'column-length-mismatch',
      names: names.length,
      netIDs: netIDs.length,
      message: `Members has ${names.length} entries but netIDs has ${netIDs.length}. The two columns must line up position by position.`,
    });
  }

  const roster = parseRoster(tent.members, tent.netIDs);

  roster.forEach((member, i) => {
    if (!member.name) {
      problems.push({
        code: 'missing-name',
        slot: i + 1,
        netID: member.netID,
        message: `Slot ${i + 1} has netID "${member.netID}" but no name.`,
      });
    }
    if (!member.netID) {
      problems.push({
        code: 'missing-netid',
        slot: i + 1,
        name: member.name,
        message: `Slot ${i + 1} has name "${member.name}" but no netID.`,
      });
    }
  });

  const captain = norm(tent.captain);
  if (!captain) {
    problems.push({ code: 'no-captain', message: 'The Captain field is empty.' });
  } else if (!roster.some((m) => norm(m.netID) === captain)) {
    problems.push({
      code: 'captain-not-in-roster',
      captain: tent.captain,
      message: `The captain's netID ("${tent.captain}") does not appear in the tent's own netIDs list.`,
    });
  }

  if (getEditWindow(tent.startDate).reason === 'no-start-date') {
    problems.push({
      code: 'no-start-date',
      message: 'This tent has no usable Start Date, so the five-day edit window cannot be computed.',
    });
  }

  if (roster.length > MAX_MEMBERS) {
    problems.push({
      code: 'over-capacity',
      count: roster.length,
      message: `This tent has ${roster.length} members, over the ${MAX_MEMBERS} cap.`,
    });
  }

  return {
    ok: problems.length === 0,
    problems,
    signature: [...new Set(problems.map((p) => p.code))].sort().join('|'),
  };
}

module.exports = { diagnoseTent };
