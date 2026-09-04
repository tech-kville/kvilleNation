const { diagnoseTent } = require('../tentDiagnostics');

const healthy = {
  order: '1',
  captain: 'jd123',
  members: 'Jane Doe, John Smith, Amy Lu',
  netIDs: 'jd123, js456, al789',
  startDate: '2026-01-15',
};

const codes = (tent) => diagnoseTent(tent).problems.map((p) => p.code);

describe('diagnoseTent', () => {
  it('reports nothing for a well-formed record', () => {
    const result = diagnoseTent(healthy);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.signature).toBe('');
  });

  describe('the real defects found in the live base', () => {
    it('catches a space-separated netID slot (order 46)', () => {
      const tent = {
        ...healthy,
        members: 'Alex Citardi, Anne Dillon, Catherine Papa',
        netIDs: 'ajc150 acd82, cep92',
        captain: 'ajc150',
      };
      const result = diagnoseTent(tent);
      expect(result.problems[0]).toMatchObject({ code: 'embedded-separator', slot: 1, value: 'ajc150 acd82' });
      // The mismatch is a downstream symptom, so it is reported after the cause.
      expect(result.problems.map((p) => p.code)).toContain('column-length-mismatch');
    });

    it('catches a period-separated netID slot, and the captain it hides (order 113)', () => {
      const tent = {
        ...healthy,
        members: 'Michael Setji, Chaitan Veeraswamy',
        netIDs: 'mps69. cvv4',
        captain: 'mps69',
      };
      const result = diagnoseTent(tent);
      expect(result.problems.map((p) => p.code)).toEqual(
        expect.arrayContaining(['embedded-separator', 'captain-not-in-roster'])
      );
    });

    it('catches an orphan netID with no matching name (order 79)', () => {
      const tent = { ...healthy, netIDs: 'jd123, js456, al789, trn14' };
      expect(codes(tent)).toEqual(expect.arrayContaining(['column-length-mismatch', 'missing-name']));
    });
  });

  it('reports a name with no netID', () => {
    const tent = { ...healthy, members: 'Jane Doe, John Smith, Amy Lu, Nitin Nagarajan' };
    const problems = diagnoseTent(tent).problems;
    expect(problems.find((p) => p.code === 'missing-netid')).toMatchObject({ slot: 4, name: 'Nitin Nagarajan' });
  });

  it('reports a captain missing from their own roster', () => {
    expect(codes({ ...healthy, captain: 'zz999' })).toContain('captain-not-in-roster');
  });

  it('reports an empty Captain field separately', () => {
    expect(codes({ ...healthy, captain: '' })).toContain('no-captain');
  });

  it.each([null, '', '   ', 'not a date'])('reports an unusable Start Date (%p)', (startDate) => {
    expect(codes({ ...healthy, startDate })).toContain('no-start-date');
  });

  it('reports a roster over the 12 cap', () => {
    const names = Array.from({ length: 13 }, (_, i) => `Member ${i}`).join(', ');
    const ids = Array.from({ length: 13 }, (_, i) => (i === 0 ? 'jd123' : `n${i}`)).join(', ');
    expect(codes({ ...healthy, members: names, netIDs: ids })).toContain('over-capacity');
  });

  it('does not flag a captain who is merely cased differently', () => {
    expect(codes({ ...healthy, captain: 'JD123' })).not.toContain('captain-not-in-roster');
  });

  describe('signature', () => {
    it('is stable across repeated diagnosis of the same record', () => {
      const tent = { ...healthy, captain: 'zz999' };
      expect(diagnoseTent(tent).signature).toBe(diagnoseTent(tent).signature);
    });

    it('is identical for the same problem regardless of slot detail', () => {
      const a = diagnoseTent({ ...healthy, captain: 'zz999' }).signature;
      const b = diagnoseTent({ ...healthy, captain: 'yy888' }).signature;
      expect(a).toBe(b);
    });

    it('changes when the record breaks in a new way', () => {
      const before = diagnoseTent({ ...healthy, captain: 'zz999' }).signature;
      const after = diagnoseTent({ ...healthy, captain: 'zz999', startDate: null }).signature;
      expect(after).not.toBe(before);
    });

    it('deduplicates repeated codes so many bad slots are one signature', () => {
      const tent = { ...healthy, members: 'A, B, C', netIDs: 'a1 a2, b1 b2, c1 c2' };
      expect(diagnoseTent(tent).signature.split('|').filter((c) => c === 'embedded-separator')).toHaveLength(1);
    });
  });
});
