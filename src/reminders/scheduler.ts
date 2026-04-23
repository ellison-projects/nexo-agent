// Reconciles a set of "wanted" future reminder occurrences against persisted
// state. New occurrences get scheduled via `at`; occurrences that dropped out
// of the feed (completed/dismissed in NexoPRM, or fire-time changed) get
// `atrm`'d. Called every tick by the poll loop.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { env } from '../env';
import { classify } from './classify';
import { computeFireTime } from './fire-time';
import { expandOccurrences, parseIcal } from './ics';
import { type State, type StateEntry, loadState, saveState, stateKey } from './state';

export interface ReconcileInput {
      ical: string;
      /** Look this far forward for occurrences to schedule. 25h covers the
       * next-day case even when the tick is slightly late. */
      horizonMs: number;
      now: Date;
      statePath: string;
}

export interface ReconcileSummary {
      scheduled: number;
      cancelled: number;
      kept: number;
      pruned: number;
      errors: Array<{ key: string; error: string }>;
}

interface WantedOccurrence {
      key: string;
      uid: string;
      fireTs: number;
      message: string;
}

export async function reconcile(input: ReconcileInput): Promise<ReconcileSummary> {
      const { ical, horizonMs, now, statePath } = input;
      const state = await loadState(statePath);
      const windowEnd = new Date(now.getTime() + horizonMs);

      const events = parseIcal(ical);
      const wanted = new Map<string, WantedOccurrence>();

      for (const event of events) {
            const hit = classify(event.uid);
            if (!hit) continue;

            for (const occ of expandOccurrences(event, now, windowEnd)) {
                  const fireTs = computeFireTime(occ).getTime();
                  // Skip occurrences whose fire time has already passed. The
                  // feed sometimes still lists them for a grace period; we
                  // don't want to spam late.
                  if (fireTs <= now.getTime()) continue;
                  if (fireTs > now.getTime() + horizonMs) continue;

                  const key = stateKey(occ.uid, occ.start.getTime());
                  const message = `${hit.emoji} ${occ.summary}`;
                  wanted.set(key, { key, uid: occ.uid, fireTs, message });
            }
      }

      const summary: ReconcileSummary = {
            scheduled: 0,
            cancelled: 0,
            kept: 0,
            pruned: 0,
            errors: [],
      };

      // Cancel / prune: anything in state that isn't wanted, or whose fireTs
      // no longer matches, needs to go. Also prune entries whose fire time
      // has already passed — the at-job has fired (or silently failed) and
      // the state entry is now stale.
      for (const [key, entry] of Object.entries(state)) {
            const want = wanted.get(key);
            if (want && want.fireTs === entry.fireTs) {
                  summary.kept++;
                  continue;
            }
            if (entry.fireTs <= now.getTime()) {
                  delete state[key];
                  summary.pruned++;
                  continue;
            }
            try {
                  await atRemove(entry.atJobId);
                  delete state[key];
                  summary.cancelled++;
            } catch (err) {
                  summary.errors.push({ key, error: `atrm failed: ${errorMessage(err)}` });
            }
      }

      // Schedule new wanted occurrences.
      for (const want of wanted.values()) {
            if (state[want.key]) continue; // already scheduled
            try {
                  const atJobId = await atSchedule({
                        fireTs: want.fireTs,
                        now: now.getTime(),
                        message: want.message,
                  });
                  const entry: StateEntry = {
                        atJobId,
                        fireTs: want.fireTs,
                        summary: want.message,
                  };
                  state[want.key] = entry;
                  summary.scheduled++;
            } catch (err) {
                  summary.errors.push({ key: want.key, error: `at failed: ${errorMessage(err)}` });
            }
      }

      await saveState(statePath, state);
      return summary;
}

interface AtScheduleArgs {
      fireTs: number;
      now: number;
      message: string;
}

/** Schedule a one-shot curl-to-Telegram via `at`. The token and chat id are
 * baked into the at-spool script at scheduling time (same tradeoff the
 * telegram-reminder skill already accepts — the spool dir is not a broadcast
 * surface). Message body is routed through a temp file to sidestep shell
 * escaping entirely. Returns the at job id. */
async function atSchedule(args: AtScheduleArgs): Promise<string> {
      // `at` takes relative minutes with no sub-minute precision. Round up so
      // we never fire early.
      const deltaMin = Math.max(1, Math.ceil((args.fireTs - args.now) / 60_000));

      // Unique temp path per scheduling attempt — the message file is read
      // and deleted by the at-job itself. Using randomBytes avoids collisions
      // if two reconciles race (they shouldn't, but cheap insurance).
      const nonce = randomBytes(6).toString('hex');
      const msgPath = join(tmpdir(), `nexo-reminder-${nonce}.txt`);
      await writeFile(msgPath, args.message, 'utf8');

      const script = [
            `curl -s "https://api.telegram.org/bot${env.telegramReminderBotToken}/sendMessage" \\`,
            `  -d "chat_id=${env.telegramChatId}" \\`,
            `  --data-urlencode "text@${msgPath}"`,
            `rm -f "${msgPath}"`,
            '',
      ].join('\n');

      const { stderr } = await runCommand('at', [`now + ${deltaMin} minutes`], script);
      const match = stderr.match(/job\s+(\d+)\s+at/);
      if (!match) {
            // Best-effort cleanup so we don't leave orphan temp files when
            // `at` itself rejected the script.
            await unlink(msgPath).catch(() => {});
            throw new Error(`could not parse at job id from: ${stderr.trim()}`);
      }
      return match[1];
}

async function atRemove(jobId: string): Promise<void> {
      await runCommand('atrm', [jobId], '');
}

async function runCommand(cmd: string, args: string[], stdin: string): Promise<{ stdout: string; stderr: string }> {
      return new Promise((resolve, reject) => {
            const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('error', reject);
            child.on('close', (code) => {
                  if (code === 0) resolve({ stdout, stderr });
                  else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
            });
            if (stdin.length > 0) child.stdin.write(stdin);
            child.stdin.end();
      });
}

function errorMessage(err: unknown): string {
      return err instanceof Error ? err.message : String(err);
}
