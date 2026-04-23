// UID prefix → include/skip decision + short human-readable "kind" label used
// in the Telegram message. Kept in sync with the UID patterns emitted by
// lib/calendar-feed.ts in the nexoprm repo.

export type ReminderKind = 'ai' | 'todo' | 'home' | 'recurring';

interface ClassifyHit {
      kind: ReminderKind;
      /** Emoji prefix for the Telegram message. */
      emoji: string;
}

/** Return null for UIDs we intentionally skip (meal plans, weekly briefs,
 * important dates — these have their own delivery channel or would be noise
 * on Telegram). */
export function classify(uid: string): ClassifyHit | null {
      if (uid.startsWith('aireminder-')) return { kind: 'ai', emoji: '⏰' };
      if (uid.startsWith('todoreminder-')) return { kind: 'todo', emoji: '✅' };
      if (uid.startsWith('homeitem-')) return { kind: 'home', emoji: '🏠' };
      if (uid.startsWith('recurring-')) return { kind: 'recurring', emoji: '🔁' };
      return null;
}
