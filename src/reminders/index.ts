// Entry point for the nexo-reminders pm2 app. Polls the NexoPRM iCalendar
// feed on a fixed interval and reconciles upcoming occurrences against
// scheduled `at` jobs. Designed to be restart-safe — all durable state lives
// in the JSON file at DATA_PATH, not in memory.

import { join } from 'node:path';

import { env } from '../env';
import { reconcile } from './scheduler';

const POLL_INTERVAL_MS = 5 * 60_000;
const HORIZON_MS = 25 * 60 * 60_000; // 25 hours — schedule a day ahead
const FETCH_TIMEOUT_MS = 15_000;

const DATA_PATH = join(process.cwd(), 'data', 'reminders-state.json');

async function fetchFeed(url: string): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`feed fetch ${res.status}: ${await res.text()}`);
            return await res.text();
      } finally {
            clearTimeout(timer);
      }
}

async function tick(feedUrl: string): Promise<void> {
      const started = Date.now();
      try {
            const ical = await fetchFeed(feedUrl);
            const summary = await reconcile({
                  ical,
                  horizonMs: HORIZON_MS,
                  now: new Date(),
                  statePath: DATA_PATH,
            });
            const tookMs = Date.now() - started;
            const parts = [
                  `scheduled=${summary.scheduled}`,
                  `cancelled=${summary.cancelled}`,
                  `kept=${summary.kept}`,
                  `pruned=${summary.pruned}`,
                  `errors=${summary.errors.length}`,
                  `took=${tookMs}ms`,
            ];
            console.log(`[tick] ${parts.join(' ')}`);
            for (const err of summary.errors) console.error(`[tick.error] ${err.key}: ${err.error}`);
      } catch (err) {
            console.error(`[tick] failed: ${err instanceof Error ? err.message : String(err)}`);
      }
}

async function main(): Promise<void> {
      const feedUrl = env.calendarFeedUrl;
      if (!feedUrl) {
            console.error('NEXO_CALENDAR_FEED_URL is not set; aborting.');
            process.exit(1);
      }

      console.log(`nexo-reminders starting (poll every ${POLL_INTERVAL_MS / 1000}s, horizon ${HORIZON_MS / 3_600_000}h)`);

      await tick(feedUrl);
      setInterval(() => { void tick(feedUrl); }, POLL_INTERVAL_MS);
}

void main();
