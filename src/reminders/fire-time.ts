// Given an ICS occurrence, decide the concrete UTC instant at which the
// Telegram push should fire. Timed occurrences fire at their DTSTART. All-day
// occurrences fire at 8am America/Chicago on the event's date — except for
// recurring tasks, which additionally honor a `-P<N>D` VALARM trigger so the
// `lead_time_days` configured on the task surfaces as an N-days-earlier
// push (also at 8am Chicago).

import type { ReminderKind } from './classify';
import type { Occurrence } from './ics';

const LOCAL_ZONE = 'America/Chicago';
const ALL_DAY_HOUR_LOCAL = 8;

export function computeFireTime(occ: Occurrence, kind: ReminderKind): Date {
      if (!occ.isAllDay) return occ.start;

      let dateDate = occ.start;

      // Recurring tasks encode lead_time_days as a `-P<N>D` VALARM trigger
      // (see nexoprm/lib/calendar-feed.ts getRecurringTaskEvents). Other kinds
      // use VALARM for calendar-app UX and we deliberately ignore theirs.
      if (kind === 'recurring') {
            const leadDays = leadDaysFromTriggers(occ.alarmTriggers);
            if (leadDays > 0) {
                  dateDate = new Date(dateDate.getTime() - leadDays * 86400_000);
            }
      }

      const y = dateDate.getUTCFullYear();
      const m = dateDate.getUTCMonth();
      const d = dateDate.getUTCDate();
      return localWallClockToUtc(y, m, d, ALL_DAY_HOUR_LOCAL, 0, 0, LOCAL_ZONE);
}

function leadDaysFromTriggers(triggers: string[] | undefined): number {
      if (!triggers) return 0;
      for (const t of triggers) {
            const m = t.match(/^-P(\d+)D$/);
            if (m) return Number(m[1]);
      }
      return 0;
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
