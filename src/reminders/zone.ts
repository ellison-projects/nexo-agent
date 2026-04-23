// Timezone arithmetic helpers shared by the ICS parser (which turns TZID
// wall-clocks into UTC instants) and the fire-time layer (which turns
// all-day UTC midnights into 8am-local UTC instants). Isolated so the
// DST-handling refine-step lives in one place.

/** Given a wall-clock moment in a named IANA zone, return the corresponding
 * UTC instant. Iterates once to handle DST transitions: the first guess uses
 * the offset computed for a UTC-treated copy of the moment, then we refine
 * once with the offset at the tentative UTC result. */
export function wallClockToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tzid: string): Date {
      const guess = Date.UTC(y, m, d, h, mi, s);
      const offset1 = zoneOffsetMinutes(new Date(guess), tzid);
      const refined = guess - offset1 * 60_000;
      const offset2 = zoneOffsetMinutes(new Date(refined), tzid);
      return new Date(guess - offset2 * 60_000);
}

/** Return the offset (in minutes east of UTC) for the given instant in the
 * given IANA zone. E.g. America/Chicago in summer → -300 (CDT). */
export function zoneOffsetMinutes(instant: Date, tzid: string): number {
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
