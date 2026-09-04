const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authenticateToken');
const RosterChange = require('../models/RosterChange');
const {
  fetchAllTents,
  fetchTentById,
  patchTent,
  AirtableConfigError,
} = require('../lib/airtableTents');
const {
  parseRoster,
  serializeRoster,
  validateRoster,
  diffRosters,
} = require('../lib/roster');
const { getEditWindow } = require('../lib/rosterWindow');
const { diagnoseTent } = require('../lib/tentDiagnostics');
const { notifyIfBlocked } = require('../lib/blockedTentNotifier');

const CONTACT = 'tenting.kville@gmail.com';

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Shape a tent for the client, with the two parallel columns parsed into a roster. */
function presentTent(tent) {
  return {
    id: tent.id,
    order: tent.order,
    name: tent.name,
    type: tent.type,
    captain: tent.captain,
    captainName: tent.captainName,
    numberOfMisses: tent.numberOfMisses,
    startDate: tent.startDate,
    roster: parseRoster(tent.members, tent.netIDs),
  };
}

/**
 * Find the caller's tent: the one they captain, or failing that, the one they
 * are rostered on. Matching is on netID only — never on name fields, which
 * would let a netID that happens to be a substring of somebody's name match
 * the wrong tent.
 */
function findTentForUser(tents, netID) {
  const me = norm(netID);
  if (!me) return { tent: null, isCaptain: false };

  const captained = tents.find((t) => norm(t.captain) === me);
  if (captained) return { tent: captained, isCaptain: true };

  const memberOf = tents.find((t) =>
    parseRoster(t.members, t.netIDs).some((m) => norm(m.netID) === me)
  );
  return { tent: memberOf || null, isCaptain: false };
}

/** Roster editing is captain-only, and only while the five-day window is open. */
function resolvePermission(tent, isCaptain) {
  const window = getEditWindow(tent.startDate);
  if (!isCaptain) {
    return { canEdit: false, reason: 'not-captain', window };
  }
  return { canEdit: window.isOpen, reason: window.reason, window };
}

function handleAirtableError(res, error, context) {
  if (error instanceof AirtableConfigError) {
    return res.status(500).json({
      error: 'Airtable config not set',
      code: 'airtable-config',
    });
  }
  console.error(`${context}:`, error.response?.data || error.message);
  return res.status(500).json({
    error: `Something went wrong. Please email ${CONTACT}.`,
    code: 'server-error',
  });
}

/**
 * GET /api/roster/my-tent
 * The caller's tent plus whether they may currently edit it.
 * Resolved server-side so the client never downloads every tent's roster.
 */
router.get('/my-tent', authenticateToken, async (req, res) => {
  try {
    const tents = await fetchAllTents();
    const { tent, isCaptain } = findTentForUser(tents, req.user.netID);

    if (!tent) {
      return res.json({ tent: null, isCaptain: false, canEdit: false, reason: 'no-tent', window: null });
    }

    const { canEdit, reason, window } = resolvePermission(tent, isCaptain);
    const diagnosis = diagnoseTent(tent);

    // A captain whose stored record is malformed cannot fix it themselves, so
    // tell the VPs the moment they land on the page — they should not have to
    // report it, and the alert carries detail they could not have provided.
    // Deliberately not awaited: the page must not wait on SMTP.
    if (isCaptain && !diagnosis.ok) {
      notifyIfBlocked(tent, req.user.netID);
    }

    return res.json({
      tent: presentTent(tent),
      isCaptain,
      canEdit,
      reason,
      window,
      dataProblem: isCaptain && !diagnosis.ok,
    });
  } catch (error) {
    return handleAirtableError(res, error, 'Error loading tent for roster editor');
  }
});

/**
 * PATCH /api/roster/my-tent
 * Body: { roster: [{ name, netID }], expectedMembers, expectedNetIDs }
 *
 * The `expected*` fields are the raw column values the client loaded. Airtable
 * has no ETags or conditional writes, so re-reading the record and comparing
 * them is what stops a captain with a stale page open from silently clobbering
 * an edit a VP just made in Airtable.
 */
router.patch('/my-tent', authenticateToken, async (req, res) => {
  const { roster, expectedMembers, expectedNetIDs } = req.body || {};

  if (!Array.isArray(roster)) {
    return res.status(400).json({
      error: 'Roster must be a list of members.',
      code: 'invalid-roster',
    });
  }

  try {
    const tents = await fetchAllTents();
    const { tent, isCaptain } = findTentForUser(tents, req.user.netID);

    if (!tent || !isCaptain) {
      return res.status(403).json({
        error: `Only a tent's captain can edit its roster. Please email ${CONTACT}.`,
        code: 'not-captain',
      });
    }

    // Re-read the record: it is the basis for both the window check and the
    // staleness check, so a Start Date a VP just changed is respected too.
    const current = await fetchTentById(tent.id);
    if (!current) {
      return res.status(404).json({
        error: `This tent no longer exists in Airtable. Please email ${CONTACT}.`,
        code: 'tent-missing',
      });
    }

    const window = getEditWindow(current.startDate);
    if (!window.isOpen) {
      return res.status(403).json({
        error: 'This tent\'s roster is not currently editable.',
        code: window.reason,
        window,
      });
    }

    // Normalize both sides through parse/serialize so a difference in comma
    // spacing alone is not mistaken for a concurrent edit.
    const currentRoster = parseRoster(current.members, current.netIDs);
    const currentCanonical = serializeRoster(currentRoster);
    const expectedCanonical = serializeRoster(parseRoster(expectedMembers, expectedNetIDs));

    if (
      currentCanonical.members !== expectedCanonical.members ||
      currentCanonical.netIDs !== expectedCanonical.netIDs
    ) {
      return res.status(409).json({
        error: 'This roster changed while your page was open.',
        code: 'stale',
        tent: presentTent(current),
      });
    }

    // Diagnose the STORED record before validating the submission. A captain
    // whose Airtable row is malformed would otherwise get a validation error
    // blaming them for a problem they did not cause and cannot fix.
    const diagnosis = diagnoseTent(current);
    if (!diagnosis.ok) {
      notifyIfBlocked(current, req.user.netID);
      return res.status(409).json({
        error:
          `Your tent's roster data needs a fix that only the VPs of Tenting can make. ` +
          `They have been notified automatically — no need to email, but you can reach ` +
          `them at ${CONTACT} if it is urgent.`,
        code: 'data-problem',
        problems: diagnosis.problems.map((p) => p.message),
      });
    }

    const nextRoster = roster.map((m) => ({
      name: String(m?.name ?? '').trim(),
      netID: String(m?.netID ?? '').trim(),
    }));

    const { ok, errors } = validateRoster(nextRoster, current.captain);
    if (!ok) {
      return res.status(400).json({
        error: errors[0].message,
        code: errors[0].code,
        errors,
      });
    }

    const next = serializeRoster(nextRoster);
    const updated = await patchTent(current.id, {
      Members: next.members,
      netIDs: next.netIDs,
    });

    // Logged only after Airtable accepts the write, so the audit trail always
    // reflects what actually landed.
    const { added, removed } = diffRosters(currentRoster, nextRoster);
    try {
      await RosterChange.create({
        tentRecordId: current.id,
        tentOrder: String(current.order ?? ''),
        tentName: current.name,
        actorNetID: req.user.netID,
        actorName: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        before: currentCanonical,
        after: next,
        added,
        removed,
      });
    } catch (logError) {
      // The roster is already saved; a failed log must not report failure to
      // the captain, but the VPs need to know the trail has a hole in it.
      console.error('Roster saved but audit log failed:', logError.message);
    }

    return res.json({
      tent: presentTent(updated),
      isCaptain: true,
      canEdit: true,
      reason: null,
      window: getEditWindow(updated.startDate),
      added,
      removed,
    });
  } catch (error) {
    return handleAirtableError(res, error, 'Error saving roster');
  }
});

/**
 * GET /api/roster/blocked
 * Every tent whose Airtable record is malformed. Line Monitors only.
 *
 * Proactive counterpart to the email alert: rather than waiting for a captain
 * to trip over a broken record, this scans all of them.
 */
router.get('/blocked', authenticateToken, async (req, res) => {
  if (!req.user.isLineMonitor && !req.user.isSuperUser) {
    return res.status(403).json({ error: 'Line Monitors only', code: 'forbidden' });
  }

  try {
    const tents = await fetchAllTents();
    const blocked = tents
      .map((tent) => ({ tent, diagnosis: diagnoseTent(tent) }))
      .filter(({ diagnosis }) => !diagnosis.ok)
      .map(({ tent, diagnosis }) => ({
        id: tent.id,
        order: tent.order,
        name: tent.name,
        type: tent.type,
        captain: tent.captain,
        members: tent.members,
        netIDs: tent.netIDs,
        problems: diagnosis.problems,
      }));

    return res.json({ scanned: tents.length, blocked });
  } catch (error) {
    return handleAirtableError(res, error, 'Error scanning tents');
  }
});

/**
 * GET /api/roster/changes
 * Audit feed for the LM dashboard. Line Monitors and superusers only.
 */
router.get('/changes', authenticateToken, async (req, res) => {
  if (!req.user.isLineMonitor && !req.user.isSuperUser) {
    return res.status(403).json({ error: 'Line Monitors only', code: 'forbidden' });
  }

  try {
    const changes = await RosterChange.find({}).sort({ createdAt: -1 }).limit(100).lean();
    return res.json(changes);
  } catch (error) {
    console.error('Error loading roster changes:', error.message);
    return res.status(500).json({ error: 'Failed to load roster changes' });
  }
});

module.exports = router;
