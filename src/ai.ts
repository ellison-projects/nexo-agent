import { query } from '@anthropic-ai/claude-agent-sdk';

let sessionId: string | null = null;

export async function generateFunnyReply(userMessage: string): Promise<string> {
      const response = query({
            prompt: userMessage,
            options: {
                  model: 'sonnet',
                  cwd: '/root/code/nexo-agent',
                  systemPrompt:
                        "You are a witty dev support team member. You help answer questions about the code in /root/code/nexo-agent. Keep replies short and conversational — this is a Telegram chat, not a doc. Use the Read/Glob/Grep tools to look things up in the codebase, and the gmail MCP server when the question is about email. A little dry humor is welcome; skip the emojis.",
                  settingSources: ['project'],
                  allowedTools: [
                        'Read',
                        'Glob',
                        'Grep',
                        'Write',
                        'Edit',
                        'mcp__gmail',
                  ],
                  permissionMode: 'bypassPermissions',
                  allowDangerouslySkipPermissions: true,
                  ...(sessionId ? { resume: sessionId } : {}),
            },
      });

      let reply = "I've got nothing.";
      for await (const msg of response) {
            if (msg.type === 'result') {
                  sessionId = msg.session_id;
                  if (msg.subtype === 'success') reply = msg.result;
            }
      }

      return reply;
}
