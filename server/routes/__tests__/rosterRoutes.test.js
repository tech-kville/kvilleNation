/**
 * Route-level tests for /api/roster.
 *
 * Airtable and the audit collection are stubbed, but everything else is real:
 * a real Express app, real HTTP requests, and the real authenticateToken
 * middleware verifying real JWTs.
 */

process.env.JWT_SECRET = 'test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../../lib/airtableTents', () => {
  class AirtableConfigError extends Error {}
  return {
    AirtableConfigError,
    fetchAllTents: jest.fn(),
    fetchTentById: jest.fn(),
    patchTent: jest.fn(),
  };
});

jest.mock('../../models/RosterChange', () => ({ create: jest.fn() }));

jest.mock('../../lib/blockedTentNotifier', () => ({
  notifyIfBlocked: jest.fn().mockResolvedValue({ notified: true }),
}));

const airtable = require('../../lib/airtableTents');
const RosterChange = require('../../models/RosterChange');
const { notifyIfBlocked } = require('../../lib/blockedTentNotifier');
const { setCheckInProgress } = require('../../lib/checkState');
const rosterRoutes = require('../rosterRoutes');

const CAPTAIN = 'jd123';
const MEMBER = 'js456';
const OUTSIDER = 'zz999';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function makeTent(overrides = {}) {
  return {
    id: 'recTENT1',
    order: '12',
    name: 'Cameron Crazies',
    type: 'Black',
    captain: CAPTAIN,
    captainName: 'Jane Doe',
    members: 'Jane Doe, John Smith, Amy Lu',
    netIDs: 'jd123, js456, al789',
    numberOfMisses: 0,
    startDate: today(),
    ...overrides,
  };
}

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/roster', rosterRoutes);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  // Node's global fetch keeps sockets alive, which would make server.close()
  // hang forever waiting for them to drain.
  server.closeAllConnections();
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  setCheckInProgress(false);
});

function tokenFor(netID, extra = {}) {
  return jwt.sign({ netID, firstName: 'Test', lastName: 'User', ...extra }, process.env.JWT_SECRET);
}

async function call(method, path, { netID, body, claims } = {}) {
  const headers = {};
  if (netID) headers.Authorization = `Bearer ${tokenFor(netID, claims)}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...headers, Connection: 'close' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** A well-formed save request derived from a tent's current columns. */
function savePayload(tent, roster) {
  return { roster, expectedMembers: tent.members, expectedNetIDs: tent.netIDs };
}

const CURRENT_ROSTER = [
  { name: 'Jane Doe', netID: 'jd123' },
  { name: 'John Smith', netID: 'js456' },
  { name: 'Amy Lu', netID: 'al789' },
];

describe('auth', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await call('GET', '/api/roster/my-tent');
    expect(res.status).toBe(401);
  });
});

describe('GET /my-tent', () => {
  it('returns the captain\'s tent as editable inside the window', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.status).toBe(200);
    expect(res.body.isCaptain).toBe(true);
    expect(res.body.canEdit).toBe(true);
    expect(res.body.reason).toBeNull();
    expect(res.body.tent.roster).toEqual(CURRENT_ROSTER);
  });

  it('still shows the tent to a rostered non-captain, but read-only', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: MEMBER });

    expect(res.body.tent.roster).toEqual(CURRENT_ROSTER);
    expect(res.body.isCaptain).toBe(false);
    expect(res.body.canEdit).toBe(false);
    expect(res.body.reason).toBe('not-captain');
  });

  it('reports window-closed once the five days have passed', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent({ startDate: daysAgo(10) })]);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.canEdit).toBe(false);
    expect(res.body.reason).toBe('window-closed');
  });

  it('reports no-start-date when Start Date is blank', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent({ startDate: null })]);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.canEdit).toBe(false);
    expect(res.body.reason).toBe('no-start-date');
  });

  it('returns no tent for someone who is not on any roster', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: OUTSIDER });

    expect(res.body).toMatchObject({ tent: null, canEdit: false, reason: 'no-tent' });
  });

  it('does not match a netID against name fields', async () => {
    // 'amy' appears inside "Amy Lu" but is nobody's netID.
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: 'amy' });

    expect(res.body.tent).toBeNull();
  });
});

describe('PATCH /my-tent', () => {
  const withCaptainTent = (tent = makeTent()) => {
    airtable.fetchAllTents.mockResolvedValue([tent]);
    airtable.fetchTentById.mockResolvedValue(tent);
    airtable.patchTent.mockImplementation(async (id, fields) => ({
      ...tent,
      members: fields.Members,
      netIDs: fields.netIDs,
    }));
    return tent;
  };

  it('saves an added member and keeps the two columns aligned', async () => {
    const tent = withCaptainTent();
    const next = [...CURRENT_ROSTER, { name: 'New Guy', netID: 'ng001' }];

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, next),
    });

    expect(res.status).toBe(200);
    expect(airtable.patchTent).toHaveBeenCalledWith('recTENT1', {
      Members: 'Jane Doe, John Smith, Amy Lu, New Guy',
      netIDs: 'jd123, js456, al789, ng001',
    });
    expect(res.body.tent.roster).toEqual(next);
    expect(res.body.added).toEqual([{ name: 'New Guy', netID: 'ng001' }]);
  });

  it('saves a removal, dropping the same position from both columns', async () => {
    const tent = withCaptainTent();
    const next = CURRENT_ROSTER.filter((m) => m.netID !== 'js456');

    await call('PATCH', '/api/roster/my-tent', { netID: CAPTAIN, body: savePayload(tent, next) });

    expect(airtable.patchTent).toHaveBeenCalledWith('recTENT1', {
      Members: 'Jane Doe, Amy Lu',
      netIDs: 'jd123, al789',
    });
  });

  it('writes an audit record after the Airtable write succeeds', async () => {
    const tent = withCaptainTent();
    const next = [...CURRENT_ROSTER, { name: 'New Guy', netID: 'ng001' }];

    await call('PATCH', '/api/roster/my-tent', { netID: CAPTAIN, body: savePayload(tent, next) });

    expect(RosterChange.create).toHaveBeenCalledTimes(1);
    expect(RosterChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tentRecordId: 'recTENT1',
        actorNetID: CAPTAIN,
        actorName: 'Test User',
        before: { members: tent.members, netIDs: tent.netIDs },
        after: { members: 'Jane Doe, John Smith, Amy Lu, New Guy', netIDs: 'jd123, js456, al789, ng001' },
        added: [{ name: 'New Guy', netID: 'ng001' }],
        removed: [],
      })
    );
  });

  it('still reports success if only the audit log fails', async () => {
    const tent = withCaptainTent();
    RosterChange.create.mockRejectedValue(new Error('mongo down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(200);
    console.error.mockRestore();
  });

  it('refuses a non-captain', async () => {
    withCaptainTent();

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: MEMBER,
      body: { roster: CURRENT_ROSTER, expectedMembers: '', expectedNetIDs: '' },
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not-captain');
    expect(res.body.error).toContain('tenting.kville@gmail.com');
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('refuses once the window has closed, even though the UI would hide the editor', async () => {
    const tent = withCaptainTent(makeTent({ startDate: daysAgo(10) }));

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('window-closed');
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('refuses when the tent has no start date', async () => {
    const tent = withCaptainTent(makeTent({ startDate: null }));

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('no-start-date');
  });

  it('honours a Start Date a VP changed after the page was loaded', async () => {
    // Listing says the window is open; the fresh re-read says it is not.
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);
    airtable.fetchTentById.mockResolvedValue(makeTent({ startDate: daysAgo(10) }));

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(makeTent(), CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('window-closed');
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('rejects a stale save rather than clobbering a VP edit made in Airtable', async () => {
    const tent = makeTent();
    airtable.fetchAllTents.mockResolvedValue([tent]);
    // A VP added someone directly in Airtable since the captain loaded the page.
    airtable.fetchTentById.mockResolvedValue(
      makeTent({ members: `${tent.members}, VP Add`, netIDs: `${tent.netIDs}, vp001` })
    );

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('stale');
    expect(res.body.tent.roster).toHaveLength(4); // the client is handed the truth
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('does not treat comma spacing alone as a concurrent edit', async () => {
    const tent = withCaptainTent();

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: {
        roster: CURRENT_ROSTER.slice(0, 2),
        expectedMembers: 'Jane Doe,John Smith ,  Amy Lu',
        expectedNetIDs: 'jd123,js456 ,  al789',
      },
    });

    expect(res.status).toBe(200);
  });

  it.each([
    ['captain-removed', CURRENT_ROSTER.filter((m) => m.netID !== CAPTAIN)],
    ['duplicate-netid', [...CURRENT_ROSTER, { name: 'Amy L', netID: 'AL789' }]],
    ['incomplete-entry', [...CURRENT_ROSTER, { name: 'No NetID', netID: '' }]],
    ['invalid-character', [...CURRENT_ROSTER, { name: 'Lu, Amy', netID: 'la222' }]],
    [
      'too-many-members',
      Array.from({ length: 13 }, (_, i) => ({
        name: `Member ${i}`,
        netID: i === 0 ? CAPTAIN : `n${i}`,
      })),
    ],
  ])('rejects a roster that violates %s', async (code, roster) => {
    const tent = withCaptainTent();

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, roster),
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('rejects a body without a roster array', async () => {
    const res = await call('PATCH', '/api/roster/my-tent', { netID: CAPTAIN, body: { roster: 'nope' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid-roster');
  });
});

describe('roster edits pause during a tent check', () => {
  // A roster must not shift under a Line Monitor mid-check.
  afterEach(() => setCheckInProgress(false));

  it('reports the roster as locked while a check is running', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);
    setCheckInProgress(true);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.canEdit).toBe(false);
    expect(res.body.reason).toBe('check-in-progress');
  });

  it('refuses a save that lands mid-check, leaving Airtable untouched', async () => {
    const tent = makeTent();
    airtable.fetchAllTents.mockResolvedValue([tent]);
    airtable.fetchTentById.mockResolvedValue(tent);
    setCheckInProgress(true);

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('check-in-progress');
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });

  it('allows edits again once the check ends', async () => {
    const tent = makeTent();
    airtable.fetchAllTents.mockResolvedValue([tent]);
    airtable.fetchTentById.mockResolvedValue(tent);
    airtable.patchTent.mockImplementation(async (id, f) => ({ ...tent, members: f.Members, netIDs: f.netIDs }));

    setCheckInProgress(true);
    let res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN, body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });
    expect(res.status).toBe(409);

    setCheckInProgress(false);
    res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN, body: savePayload(tent, CURRENT_ROSTER.slice(0, 2)),
    });
    expect(res.status).toBe(200);
  });

  it('does not mask a closed window as a check pause', async () => {
    // A tent that could not edit anyway keeps its real reason.
    airtable.fetchAllTents.mockResolvedValue([makeTent({ startDate: daysAgo(10) })]);
    setCheckInProgress(true);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.reason).toBe('window-closed');
  });
});

describe('blocked-tent alerts to the VPs', () => {
  // "ajc150 acd82" in one slot is the real defect from tent 46 in the live base.
  const brokenTent = () => makeTent({ members: 'Jane Doe, John Smith', netIDs: 'jd123 js456' });

  it('alerts the VPs when a captain loads a malformed record', async () => {
    airtable.fetchAllTents.mockResolvedValue([brokenTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.dataProblem).toBe(true);
    expect(notifyIfBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recTENT1' }),
      CAPTAIN
    );
  });

  it('stays silent for a healthy record', async () => {
    airtable.fetchAllTents.mockResolvedValue([makeTent()]);

    const res = await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(res.body.dataProblem).toBe(false);
    expect(notifyIfBlocked).not.toHaveBeenCalled();
  });

  it('does not alert for a non-captain viewing a broken tent', async () => {
    // Only the captain is blocked from editing, so only they trigger the alert.
    airtable.fetchAllTents.mockResolvedValue([
      makeTent({ captain: 'someoneelse', members: 'Jane Doe, John Smith', netIDs: 'jd123 js456' }),
    ]);

    await call('GET', '/api/roster/my-tent', { netID: CAPTAIN });

    expect(notifyIfBlocked).not.toHaveBeenCalled();
  });

  it('refuses a save on a malformed record and blames the data, not the captain', async () => {
    const tent = brokenTent();
    airtable.fetchAllTents.mockResolvedValue([tent]);
    airtable.fetchTentById.mockResolvedValue(tent);

    const res = await call('PATCH', '/api/roster/my-tent', {
      netID: CAPTAIN,
      body: savePayload(tent, [{ name: 'Jane Doe', netID: 'jd123' }]),
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('data-problem');
    expect(res.body.error).toContain('VPs of Tenting');
    expect(res.body.problems.length).toBeGreaterThan(0);
    expect(notifyIfBlocked).toHaveBeenCalled();
    expect(airtable.patchTent).not.toHaveBeenCalled();
  });
});

describe('GET /changes', () => {
  it('is refused for a captain who is not a Line Monitor', async () => {
    const res = await call('GET', '/api/roster/changes', { netID: CAPTAIN });
    expect(res.status).toBe(403);
  });

  it('is allowed for a Line Monitor', async () => {
    const rows = [{ _id: '1', tentRecordId: 'recTENT1' }];
    RosterChange.find = jest.fn(() => ({
      sort: () => ({ limit: () => ({ lean: async () => rows }) }),
    }));

    const res = await call('GET', '/api/roster/changes', {
      netID: 'lm001',
      claims: { isLineMonitor: true },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});
