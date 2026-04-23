// Persistent map of {uid::occurrenceTs → atJobId + metadata}. Survives
// process restarts so the reconciler can cancel at-jobs for reminders that
// disappeared from the feed. Written atomically via a temp-file rename so a
// crash mid-write can't leave a half-written JSON on disk.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface StateEntry {
      atJobId: string;
      fireTs: number; // ms epoch
      summary: string;
}

export type State = Record<string, StateEntry>;

export async function loadState(path: string): Promise<State> {
      try {
            const raw = await readFile(path, 'utf8');
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? (parsed as State) : {};
      } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
            throw err;
      }
}

export async function saveState(path: string, state: State): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
      await rename(tmp, path);
}

export function stateKey(uid: string, occurrenceTs: number): string {
      return `${uid}::${occurrenceTs}`;
}
