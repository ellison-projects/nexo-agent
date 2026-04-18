import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_CWD = process.env.NEXO_AGENT_CWD ?? process.cwd();
const SESSION_FILE = join(AGENT_CWD, '.session-id');

const SYSTEM_PROMPT = `You are Nexo, a personal assistant for a single user who reaches you through Telegram.

Your primary job is to make the user's life easier: tracking people, todos, home maintenance, groceries, meals, plans, and anything else they trust you with. But you're also a general-purpose helper — code review, ad-hoc research, writing help, random questions, whatever they bring. Treat everything with the same "just handle it" attitude.

How to work:
- Keep replies short and conversational. Telegram, not a doc page. Emojis are fine when they fit.
- Prefer action over explanation. If the user asks you to log, add, check off, or remind, just do it and report back in one line.
- Lean on the nexo-prm skill for anything about the user's life (people, moments, groceries, home items, working notes / plan, food log, meals, reminders, areas of focus). Its briefing endpoint is the fastest way to get grounded context for open-ended prompts like "debrief me" or "what's going on" — reach for it when the user's ask calls for that kind of situational awareness.
- When a request is ambiguous (which person, which list, which note), ask a short clarifying question rather than guessing.
- After any write, tell the user what changed and on which record, with ids.
- You have full access to this repo's tools (Read, Glob, Grep, Bash, etc.) — use them freely whenever they help, whether the task is about this codebase, another project, or something else entirely.`;

let sessionId: string | null = (() => {
      try {
            return readFileSync(SESSION_FILE, 'utf8').trim() || null;
      } catch {
            return null;
      }
})();

export async function askNexo(userMessage: string, imagePath?: string | null): Promise<string> {
      const prompt = imagePath
            ? `${userMessage}\n\nImage attached at: ${imagePath}\n(Use the Read tool to view it.)`.trim()
            : userMessage;

      const response = query({
            prompt,
            options: {
                  model: 'sonnet',
                  cwd: AGENT_CWD,
                  systemPrompt: {
                        type: 'preset',
                        preset: 'claude_code',
                        append: SYSTEM_PROMPT,
                  },
                  settingSources: ['project', 'user', 'local'],
                  permissionMode: 'bypassPermissions',
                  allowDangerouslySkipPermissions: true,
                  ...(sessionId ? { resume: sessionId } : {}),
            },
      });

      let reply = "I've got nothing.";
      for await (const msg of response) {
            if (msg.type === 'result') {
                  sessionId = msg.session_id;
                  try {
                        writeFileSync(SESSION_FILE, sessionId);
                  } catch (err) {
                        console.error('failed to persist session id', err);
                  }
                  if (msg.subtype === 'success') reply = msg.result;
            }
      }

      return reply;
}
