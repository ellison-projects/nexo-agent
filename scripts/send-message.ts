import { env } from '../src/env';
import { sendLongMessage } from '../src/telegram';

async function readStdin(): Promise<string> {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
}

const argvText = process.argv.slice(2).join(' ').trim();
const text = (argvText || (await readStdin())).trim();

if (!text) {
      console.error('Usage: tsx --env-file=.env scripts/send-message.ts <text>');
      console.error('       echo "<text>" | tsx --env-file=.env scripts/send-message.ts');
      process.exit(1);
}

try {
      const chatId = Number(env.telegramChatId);
      const ids = await sendLongMessage(chatId, text);
      console.log(`Sent ${ids.length} message(s) to chat ${chatId}: ${ids.join(', ')}`);
} catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
}
