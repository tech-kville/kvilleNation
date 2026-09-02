/**
 * The five-day roster edit window.
 *
 * Per the published policy (see the tenting FAQ), a tent can change its roster
 * during the five days after it begins tenting. Everything here is computed in
 * America/New_York — the same timezone the tent-check UI stamps its timestamps
 * in — so the window closes at midnight local to K-Ville, not UTC.
 *
 * Pure — no I/O.
 */

const TIME_ZONE = 'America/New_York';

/** Days after Start Date that the window stays open. Start Date + 5, inclusive. */
const WINDOW_DAYS = 5;

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The ET wall-clock fields for a given UTC instant. */
function etPartsOf(utcMs) {
  const parts = {};
  for (const { type, value } of PARTS_FORMATTER.formatToParts(new Date(utcMs))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  // Some ICU versions report midnight as hour 24.
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

/** How far ET is from UTC at a given instant, in ms (negative — ET is behind). */
function etOffsetMs(utcMs) {
  const p = etPartsOf(utcMs);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

/**
 * The UTC instant for an ET wall-clock time.
 * Guess, measure the offset at the guess, correct — twice, so the answer is
 * stable even for times near a DST transition.
 *
 * The correction runs on whole seconds (etOffsetMs has no sub-second
 * resolution) and the milliseconds are added back at the end.
 */
function etWallClockToUTC(year, month, day, hour, minute, second, ms = 0) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    utc = target - etOffsetMs(utc);
  }
  return utc + ms;
}

/**
 * The ET calendar date an Airtable value falls on.
 * Airtable date-only fields arrive as "YYYY-MM-DD"; those are already calendar
 * dates and must NOT be run through Date.parse, which would read them as UTC
 * midnight and land on the previous day in ET.
 */
function toETCalendarDate(value) {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return { year: +dateOnly[1], month: +dateOnly[2], day: +dateOnly[3] };
  }

  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;

  const p = etPartsOf(ms);
  return { year: p.year, month: p.month, day: p.day };
}

/** Add whole days to a calendar date. Pure calendar math, no timezone involved. */
function addDays({ year, month, day }, days) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Resolve the edit window for a tent.
 *
 * @param {string|null} startDate  Airtable's `Start Date` value.
 * @param {number} [now]          UTC ms; injectable for tests.
 * @returns {{ isOpen: boolean, opensAt: string|null, closesAt: string|null, reason: string|null }}
 *
 * reason is null when open, otherwise one of:
 *   'no-start-date'  — blank or unparseable Start Date; nothing to compute from
 *   'not-started'    — the tent has not begun tenting yet
 *   'window-closed'  — the five days have passed
 */
function getEditWindow(startDate, now = Date.now()) {
  const start = toETCalendarDate(startDate);
  if (!start) {
    return { isOpen: false, opensAt: null, closesAt: null, reason: 'no-start-date' };
  }

  const opensAtMs = etWallClockToUTC(start.year, start.month, start.day, 0, 0, 0, 0);

  const lastDay = addDays(start, WINDOW_DAYS);
  const closesAtMs = etWallClockToUTC(lastDay.year, lastDay.month, lastDay.day, 23, 59, 59, 999);

  const opensAt = new Date(opensAtMs).toISOString();
  const closesAt = new Date(closesAtMs).toISOString();

  if (now < opensAtMs) {
    return { isOpen: false, opensAt, closesAt, reason: 'not-started' };
  }
  if (now > closesAtMs) {
    return { isOpen: false, opensAt, closesAt, reason: 'window-closed' };
  }
  return { isOpen: true, opensAt, closesAt, reason: null };
}

module.exports = { getEditWindow, WINDOW_DAYS, TIME_ZONE };
