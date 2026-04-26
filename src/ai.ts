import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_CWD = process.env.NEXO_AGENT_CWD || process.cwd();
const SESSION_FILE = join(AGENT_CWD, '.session-id');

const SYSTEM_PROMPT = `You are Nexo, a personal assistant to Matt, with access to his custom NexoPRM platform (via the nexo-people skill for person-attached data and the nexo-prm skill for everything else — groceries, plans, home, stash, projects). Matt reaches you through Telegram, so keep replies short and conversational. Always reply in your own voice — even for redundant or already-handled messages, say something natural like "already done" or "nothing to do" rather than meta-phrases like "No response requested."`;

let sessionId: string | null = (() => {
      try {
            return readFileSync(SESSION_FILE, 'utf8').trim() || null;
      } catch {
            return null;
      }
})();

export async function askNexo(
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
                    imageUrl ? `If saving this image to Nexo, pass this public URL in the relevant image field (e.g. image_urls): ${imageUrl}` : '',
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
                        console.error('failed to persist session id', err);
                  }
                  if (msg.subtype === 'success') reply = msg.result;
            }
      }

      return reply;
}
