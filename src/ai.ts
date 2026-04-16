import { query } from '@anthropic-ai/claude-agent-sdk';

export async function generateFunnyReply(userMessage: string): Promise<string> {
      const response = query({
            prompt: `Respond with a short, witty, funny reply (one or two sentences, no emojis unless genuinely funny) to this message: "${userMessage}"`,
            options: { model: 'sonnet' },
      });

      for await (const msg of response) {
            if (msg.type === 'result' && msg.subtype === 'success') return msg.result;
      }

      return "I've got nothing.";
}
