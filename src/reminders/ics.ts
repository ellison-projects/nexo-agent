// Minimal iCalendar parser + RRULE expander, scoped to the subset of the spec
// that the NexoPRM calendar feed (lib/calendar-feed.ts in nexoprm) actually
// emits. Deliberately not a general-purpose RFC 5545 implementation — if the
// feed grows beyond what's handled here, extend alongside it.

import { wallClockToUtc } from './zone';

export interface VEvent {
      uid: string;
      summary: string;
      description?: string;
      url?: string;
      /** UTC instant of the first occurrence (or midnight UTC of the date for all-day). */
      dtstart: Date;
      isAllDay: boolean;
      /** For timed events with a TZID. Omitted for all-day and UTC events. */
      tzid?: string;
      /** Raw RRULE value (minus the "RRULE:" prefix). Undefined for one-shot events. */
      rrule?: string;
      /** Raw VALARM TRIGGER values (the portion after the colon). Captured so
       * kind-specific fire-time rules can honor lead times (e.g. recurring
       * tasks with lead_time_days). */
      alarmTriggers?: string[];
}

export interface Occurrence {
      uid: string;
      summary: string;
      description?: string;
      url?: string;
      /** UTC instant when this occurrence starts. For all-day events this is
       * midnight UTC of the date — call sites apply the local-time fire rule. */
      start: Date;
      isAllDay: boolean;
      tzid?: string;
      /** Propagated from the parent VEvent so fire-time logic can read lead
       * times without re-parsing the ICS. */
      alarmTriggers?: string[];
}

/** Unfold continuation lines (RFC 5545 §3.1): CRLF followed by space/tab
 * continues the previous logical line. */
function unfoldLines(ical: string): string[] {
      const raw = ical.replace(/\r\n/g, '\n').split('\n');
      const out: string[] = [];
      for (const line of raw) {
            if (line.length === 0) continue;
            if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
                  out[out.length - 1] += line.slice(1);
            } else {
                  out.push(line);
            }
      }
      return out;
}

/** Parse a `DTSTART` line. Supports the three forms the feed emits:
 *   DTSTART;VALUE=DATE:YYYYMMDD
 *   DTSTART;TZID=America/Chicago:YYYYMMDDTHHMMSS
 *   DTSTART:YYYYMMDDTHHMMSSZ
 */
function parseDtStart(line: string): { date: Date; isAllDay: boolean; tzid?: string } | null {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) return null;
      const params = line.slice(0, colonIdx); // e.g. "DTSTART;TZID=America/Chicago"
      const value = line.slice(colonIdx + 1);

      const isAllDay = /VALUE=DATE(?:;|$)/.test(params);
      const tzidMatch = params.match(/TZID=([^;:]+)/);
      const tzid = tzidMatch?.[1];

      if (isAllDay) {
            // YYYYMMDD — interpret as midnight UTC of that date. The fire-time
            // layer converts to a local wall-clock fire time.
            const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
            if (!m) return null;
            return { date: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), isAllDay: true };
      }

      // Timed: YYYYMMDDTHHMMSS (with optional Z for UTC).
      const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
      if (!m) return null;
      const [, y, mo, d, h, mi, s, z] = m;

      if (z === 'Z') {
            return { date: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`), isAllDay: false };
      }

      if (tzid) {
            // Local wall-clock in the given zone. Convert via the shared
            // zone helper. Month goes 0-indexed for the Date.UTC convention.
            return { date: wallClockToUtc(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), tzid), isAllDay: false, tzid };
      }

      // Floating time — treat as UTC. The feed doesn't emit floating times
      // for anything we care about, so this branch is a safety net only.
      return { date: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`), isAllDay: false };
}

/** Unescape the four sequences iCalendar text values use (RFC 5545 §3.3.11). */
function unescapeIcalText(s: string): string {
      return s
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';')
            .replace(/\\\\/g, '\\');
}

export function parseIcal(ical: string): VEvent[] {
      const lines = unfoldLines(ical);
      const events: VEvent[] = [];
      let current: Partial<VEvent> | null = null;
      let inAlarm = false;

      for (const line of lines) {
            if (line === 'BEGIN:VEVENT') {
                  current = {};
                  inAlarm = false;
                  continue;
            }
            if (line === 'END:VEVENT') {
                  if (current && current.uid && current.summary && current.dtstart) {
                        events.push(current as VEvent);
                  }
                  current = null;
                  inAlarm = false;
                  continue;
            }
            if (!current) continue;

            // VALARMs: most fields (ACTION, DESCRIPTION) are ignored since
            // they exist for calendar-app UX, not push. TRIGGER is captured
            // because it encodes lead times that some kinds (recurring tasks)
            // want to honor.
            if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
            if (line === 'END:VALARM') { inAlarm = false; continue; }
            if (inAlarm) {
                  if (line.startsWith('TRIGGER:') || line.startsWith('TRIGGER;')) {
                        const colon = line.indexOf(':');
                        const value = line.slice(colon + 1);
                        if (!current.alarmTriggers) current.alarmTriggers = [];
                        current.alarmTriggers.push(value);
                  }
                  continue;
            }

            if (line.startsWith('UID:')) current.uid = line.slice(4);
            else if (line.startsWith('SUMMARY:')) current.summary = unescapeIcalText(line.slice(8));
            else if (line.startsWith('DESCRIPTION:')) current.description = unescapeIcalText(line.slice(12));
            else if (line.startsWith('URL:')) current.url = line.slice(4);
            else if (line.startsWith('RRULE:')) current.rrule = line.slice(6);
            else if (line.startsWith('DTSTART')) {
                  const parsed = parseDtStart(line);
                  if (parsed) {
                        current.dtstart = parsed.date;
                        current.isAllDay = parsed.isAllDay;
                        current.tzid = parsed.tzid;
                  }
            }
      }

      return events;
}

interface RRuleParts {
      freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
      interval: number;
      byDay?: string[]; // e.g. ["MO", "WE"]
      until?: Date;
      count?: number;
}

function parseRRule(rrule: string): RRuleParts | null {
      const parts: Partial<RRuleParts> = { interval: 1 };
      for (const piece of rrule.split(';')) {
            const [k, v] = piece.split('=');
            if (k === 'FREQ' && (v === 'DAILY' || v === 'WEEKLY' || v === 'MONTHLY' || v === 'YEARLY')) {
                  parts.freq = v;
            } else if (k === 'INTERVAL') {
                  parts.interval = Math.max(1, Number(v) || 1);
            } else if (k === 'BYDAY') {
                  parts.byDay = v.split(',');
            } else if (k === 'UNTIL') {
                  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
                  if (m) {
                        parts.until = new Date(Date.UTC(
                              Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                              Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)
                        ));
                  }
            } else if (k === 'COUNT') {
                  parts.count = Number(v);
            }
      }
      if (!parts.freq) return null;
      return parts as RRuleParts;
}

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Expand an event into concrete occurrences in [windowStart, windowEnd).
 * For non-recurring events emits at most one occurrence (the DTSTART). For
 * recurring events walks forward from DTSTART applying INTERVAL, optionally
 * filtered by BYDAY (weekly only — the only BYDAY use the feed emits). */
export function expandOccurrences(event: VEvent, windowStart: Date, windowEnd: Date): Occurrence[] {
      const base: Occurrence = {
            uid: event.uid,
            summary: event.summary,
            description: event.description,
            url: event.url,
            start: event.dtstart,
            isAllDay: event.isAllDay,
            tzid: event.tzid,
            alarmTriggers: event.alarmTriggers,
      };

      if (!event.rrule) {
            return event.dtstart >= windowStart && event.dtstart < windowEnd ? [base] : [];
      }

      const rule = parseRRule(event.rrule);
      if (!rule) return [];

      const results: Occurrence[] = [];
      const dt = event.dtstart;
      const stopAt = rule.until ? new Date(Math.min(rule.until.getTime(), windowEnd.getTime())) : windowEnd;

      // Cap iterations as a safety net — no real RRULE we care about produces
      // thousands of instances in a 25-hour window.
      const maxIter = 4000;

      if (rule.freq === 'DAILY') {
            for (let i = 0, emitted = 0; i < maxIter; i++) {
                  const t = new Date(dt.getTime() + i * rule.interval * 86400_000);
                  if (t >= stopAt) break;
                  if (rule.count !== undefined && emitted >= rule.count) break;
                  if (t >= windowStart) results.push({ ...base, start: t });
                  emitted++;
            }
            return results;
      }

      if (rule.freq === 'WEEKLY') {
            const byDayNums = rule.byDay?.map((d) => DAY_CODES[d]).filter((n) => n !== undefined);
            // Walk week-by-week (INTERVAL). Within each week emit the matching
            // BYDAY days if specified, else the DTSTART day-of-week.
            for (let wk = 0, emitted = 0; wk < maxIter; wk++) {
                  const weekStart = new Date(dt.getTime() + wk * rule.interval * 7 * 86400_000);
                  const days = byDayNums && byDayNums.length > 0 ? byDayNums : [dt.getUTCDay()];
                  for (const target of days) {
                        const diff = (target - weekStart.getUTCDay() + 7) % 7;
                        const t = new Date(weekStart.getTime() + diff * 86400_000);
                        if (t < dt) continue;
                        if (t >= stopAt) return results;
                        if (rule.count !== undefined && emitted >= rule.count) return results;
                        if (t >= windowStart) results.push({ ...base, start: t });
                        emitted++;
                  }
            }
            return results;
      }

      if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
            const step = rule.freq === 'MONTHLY' ? 1 : 12;
            for (let i = 0, emitted = 0; i < maxIter; i++) {
                  const t = new Date(dt);
                  t.setUTCMonth(t.getUTCMonth() + i * rule.interval * step);
                  if (t >= stopAt) break;
                  if (rule.count !== undefined && emitted >= rule.count) break;
                  if (t >= windowStart) results.push({ ...base, start: t });
                  emitted++;
            }
            return results;
      }

      return results;
}
