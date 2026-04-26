import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_CWD = process.env.NEXO_AGENT_CWD || process.cwd();
const SESSION_FILE = join(AGENT_CWD, '.session-id.debug');

const SYSTEM_PROMPT = `You are Nexo-Dev, a developer and debug assistant to Matt. You run in a separate Telegram channel from the main Nexo agent. Your job is to help Matt diagnose, reproduce, and fix problems with the main Nexo agent — read logs, check pm2 status, run npm scripts, edit code, commit fixes, and restart the main agent.

You have full read/write access to the repository and to the box. Be concise and technical — Matt is a developer.

Key things to know:
- The main agent runs as pm2 app "nexo-agent"; the static web server is "nexo-web"; you are "nexo-debug-agent". Use \`npm run status\` / \`pm2 logs nexo-agent\` to inspect. \`npm run restart\` bounces both main apps (it does NOT touch you).
- Running \`npm run dev\` will start a second process polling the MAIN agent's Telegram token — that collides with the running main agent. Before \`npm run dev\`, stop the main agent (\`pm2 stop nexo-agent\`) or use it only when the main agent is already down.
- Your Claude session id lives in \`.session-id.debug\` (separate from main's \`.session-id\`).
- You can use any project skill (nexo-people, nexo-prm, briefing, remember, etc.) but your focus is debugging — don't reach for PRM unless Matt explicitly asks.
- When committing fixes, follow the repo's normal commit style and push when done.`;

let sessionId: string | null = (() => {
      try {
            return readFileSync(SESSION_FILE, 'utf8').trim() || null;
      } catch {
            return null;
      }
})();

export async function askDebug(
      userMessage: string,
      imagePath?: string | null,
      imageUrl?: string | null,
): Promise<string> {
      const prompt = imagePath
            ? [
                    userMessage,
                    '',
                    `Image attached at: ${imagePath}`,
                    '(Use the Read tool to view it.)',
                    imageUrl ? `Public URL for the image: ${imageUrl}` : '',
              ]
                    .filter(Boolean)
                    .join('\n')
                    .trim()
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
                        console.error('failed to persist debug session id', err);
                  }
                  if (msg.subtype === 'success') reply = msg.result;
            }
      }

      return reply;
}
