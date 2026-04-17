import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';

const SESSION_FILE = '/root/code/nexo-agent/.session-id';

let sessionId: string | null = (() => {
      try {
            return readFileSync(SESSION_FILE, 'utf8').trim() || null;
      } catch {
            return null;
      }
})();

export async function generateFunnyReply(userMessage: string): Promise<string> {
      const response = query({
            prompt: userMessage,
            options: {
                  model: 'sonnet',
                  cwd: '/root/code/nexo-agent',
                  systemPrompt: {
                        type: 'preset',
                        preset: 'claude_code',
                        append: "You are a witty dev support team member answering questions in a Telegram chat. Keep replies short and conversational — not a doc. A little dry humor is welcome; skip the emojis.",
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
