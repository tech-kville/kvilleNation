const { getEditWindow, WINDOW_DAYS } = require('../rosterWindow');

const at = (iso) => Date.parse(iso);

// Jan 15 2026 (EST, UTC-5): window runs Jan 15 00:00:00.000 ET
// through Jan 20 23:59:59.999 ET, i.e. Jan 21 04:59:59.999Z.
const WINTER_START = '2026-01-15';
const WINTER_OPENS = '2026-01-15T05:00:00.000Z';
const WINTER_CLOSES = '2026-01-21T04:59:59.999Z';

describe('getEditWindow', () => {
  it(`spans ${WINDOW_DAYS} days after the start date, in Eastern time`, () => {
    const w = getEditWindow(WINTER_START, at('2026-01-17T12:00:00Z'));
    expect(w).toEqual({
      isOpen: true,
      opensAt: WINTER_OPENS,
      closesAt: WINTER_CLOSES,
      reason: null,
    });
  });

  it('is open at the first and last millisecond', () => {
    expect(getEditWindow(WINTER_START, at(WINTER_OPENS)).isOpen).toBe(true);
    expect(getEditWindow(WINTER_START, at(WINTER_CLOSES)).isOpen).toBe(true);
  });

  it('is closed one millisecond either side', () => {
    expect(getEditWindow(WINTER_START, at(WINTER_OPENS) - 1).reason).toBe('not-started');
    expect(getEditWindow(WINTER_START, at(WINTER_CLOSES) + 1).reason).toBe('window-closed');
  });

  it('closes at ET midnight, not UTC midnight', () => {
    // 00:30Z on Jan 21 is still 19:30 on Jan 20 in K-Ville — the window is open.
    expect(getEditWindow(WINTER_START, at('2026-01-21T00:30:00Z')).isOpen).toBe(true);
  });

  it('handles a window that crosses the spring DST transition', () => {
    // DST starts Sun Mar 8 2026, so the closing day is EDT (UTC-4).
    const w = getEditWindow('2026-03-06', at('2026-03-10T12:00:00Z'));
    expect(w.opensAt).toBe('2026-03-06T05:00:00.000Z'); // EST
    expect(w.closesAt).toBe('2026-03-12T03:59:59.999Z'); // EDT
    expect(w.isOpen).toBe(true);
  });

  it('reads a date-only value as an ET calendar date, not UTC midnight', () => {
    // Parsed as UTC this would be Jan 14 19:00 ET and the window would open a day early.
    expect(getEditWindow(WINTER_START, at('2026-01-15T04:00:00Z')).reason).toBe('not-started');
  });

  it('accepts a full timestamp as well as a date-only value', () => {
    const w = getEditWindow('2026-01-15T18:30:00.000Z', at('2026-01-17T12:00:00Z'));
    expect(w.opensAt).toBe(WINTER_OPENS);
    expect(w.closesAt).toBe(WINTER_CLOSES);
  });

  it.each([null, undefined, '', '   ', 'not a date'])(
    'reports no-start-date for %p',
    (value) => {
      expect(getEditWindow(value, at('2026-01-17T12:00:00Z'))).toEqual({
        isOpen: false,
        opensAt: null,
        closesAt: null,
        reason: 'no-start-date',
      });
    }
  );
});
