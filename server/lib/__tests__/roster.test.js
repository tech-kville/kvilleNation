const {
  MAX_MEMBERS,
  parseRoster,
  serializeRoster,
  validateRoster,
  diffRosters,
} = require('../roster');

const CAPTAIN = 'jd123';
const ROSTER = [
  { name: 'Jane Doe', netID: 'jd123' },
  { name: 'John Smith', netID: 'js456' },
  { name: 'Amy Lu', netID: 'al789' },
];

describe('parseRoster', () => {
  it('pairs the two parallel columns by position', () => {
    expect(parseRoster('Jane Doe, John Smith, Amy Lu', 'jd123, js456, al789')).toEqual(ROSTER);
  });

  it('tolerates inconsistent comma spacing', () => {
    expect(parseRoster('Jane Doe,John Smith ,  Amy Lu', 'jd123,js456 ,  al789')).toEqual(ROSTER);
  });

  it('returns an empty roster for empty or missing columns', () => {
    expect(parseRoster('', '')).toEqual([]);
    expect(parseRoster(null, undefined)).toEqual([]);
  });

  it('pads rather than throws when the columns have drifted out of sync', () => {
    // A malformed record still has to render read-only.
    expect(parseRoster('A, B, C', 'a1, b1')).toEqual([
      { name: 'A', netID: 'a1' },
      { name: 'B', netID: 'b1' },
      { name: 'C', netID: '' },
    ]);
    expect(parseRoster('A', 'a1, b1')).toEqual([
      { name: 'A', netID: 'a1' },
      { name: '', netID: 'b1' },
    ]);
  });

  it('drops slots that are empty on both sides', () => {
    expect(parseRoster('A, , C', 'a1, , c1')).toEqual([
      { name: 'A', netID: 'a1' },
      { name: 'C', netID: 'c1' },
    ]);
  });
});

describe('serializeRoster', () => {
  it('round-trips with parseRoster', () => {
    const columns = serializeRoster(ROSTER);
    expect(columns).toEqual({
      members: 'Jane Doe, John Smith, Amy Lu',
      netIDs: 'jd123, js456, al789',
    });
    expect(parseRoster(columns.members, columns.netIDs)).toEqual(ROSTER);
  });

  it('keeps the two columns aligned after a removal', () => {
    const columns = serializeRoster(ROSTER.filter((m) => m.netID !== 'js456'));
    expect(columns.members).toBe('Jane Doe, Amy Lu');
    expect(columns.netIDs).toBe('jd123, al789');
  });

  it('produces empty columns for an empty roster', () => {
    expect(serializeRoster([])).toEqual({ members: '', netIDs: '' });
  });
});

describe('validateRoster', () => {
  const codes = (roster, captain = CAPTAIN) =>
    validateRoster(roster, captain).errors.map((e) => e.code);

  it('accepts a well-formed roster containing the captain', () => {
    expect(validateRoster(ROSTER, CAPTAIN)).toEqual({ ok: true, errors: [] });
  });

  it('matches the captain case-insensitively', () => {
    expect(validateRoster(ROSTER, 'JD123').ok).toBe(true);
  });

  it(`rejects more than ${MAX_MEMBERS} members`, () => {
    const tooMany = Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => ({
      name: `Member ${i}`,
      netID: i === 0 ? CAPTAIN : `n${i}`,
    }));
    expect(codes(tooMany)).toContain('too-many-members');
    expect(validateRoster(tooMany.slice(0, MAX_MEMBERS), CAPTAIN).ok).toBe(true);
  });

  it('rejects removing the captain', () => {
    expect(codes(ROSTER.filter((m) => m.netID !== CAPTAIN))).toContain('captain-removed');
  });

  it('rejects duplicate netIDs regardless of case', () => {
    expect(codes([...ROSTER, { name: 'Amy L', netID: 'AL789' }])).toContain('duplicate-netid');
  });

  it('rejects entries missing a name or a netID', () => {
    expect(codes([...ROSTER, { name: 'No NetID', netID: '' }])).toContain('incomplete-entry');
    expect(codes([...ROSTER, { name: '  ', netID: 'nn111' }])).toContain('incomplete-entry');
  });

  it('rejects commas, which would corrupt the column encoding', () => {
    expect(codes([...ROSTER, { name: 'Lu, Amy', netID: 'la222' }])).toContain('invalid-character');
  });

  it('rejects a non-array roster', () => {
    expect(codes(null)).toEqual(['invalid-roster']);
  });
});

describe('diffRosters', () => {
  it('reports who joined and who left', () => {
    const after = [ROSTER[0], ROSTER[1], { name: 'New Guy', netID: 'ng001' }];
    expect(diffRosters(ROSTER, after)).toEqual({
      added: [{ name: 'New Guy', netID: 'ng001' }],
      removed: [{ name: 'Amy Lu', netID: 'al789' }],
    });
  });

  it('reports nothing when the roster is unchanged', () => {
    expect(diffRosters(ROSTER, ROSTER)).toEqual({ added: [], removed: [] });
  });

  it('treats a rename as neither an add nor a remove', () => {
    // The audit log keeps the full before/after strings, so renames stay visible there.
    const renamed = [{ name: 'Jane A. Doe', netID: 'jd123' }, ROSTER[1], ROSTER[2]];
    expect(diffRosters(ROSTER, renamed)).toEqual({ added: [], removed: [] });
  });
});
