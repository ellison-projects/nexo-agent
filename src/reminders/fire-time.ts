// Given an ICS occurrence, decide the concrete UTC instant at which the
// Telegram push should fire. Timed occurrences fire at their DTSTART; all-day
// occurrences fire at 8am America/Chicago on the event's date.

import type { Occurrence } from './ics';

const LOCAL_ZONE = 'America/Chicago';
const ALL_DAY_HOUR_LOCAL = 8;

export function computeFireTime(occ: Occurrence): Date {
      if (!occ.isAllDay) return occ.start;

      // The parser stores all-day dates as midnight UTC of the calendar date.
      // Take that date's YYYY-MM-DD and resolve 8am LOCAL_ZONE to a UTC instant.
      const y = occ.start.getUTCFullYear();
      const m = occ.start.getUTCMonth();
      const d = occ.start.getUTCDate();
      return localWallClockToUtc(y, m, d, ALL_DAY_HOUR_LOCAL, 0, 0, LOCAL_ZONE);
}

function localWallClockToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tzid: string): Date {
      const guess = Date.UTC(y, m, d, h, mi, s);
      const offset1 = zoneOffsetMinutes(new Date(guess), tzid);
      const refined = guess - offset1 * 60_000;
      const offset2 = zoneOffsetMinutes(new Date(refined), tzid);
      return new Date(guess - offset2 * 60_000);
}

function zoneOffsetMinutes(instant: Date, tzid: string): number {
      const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tzid,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
      }).formatToParts(instant);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      return Math.round((asUtc - instant.getTime()) / 60_000);
}
