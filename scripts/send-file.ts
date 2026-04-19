import { env } from '../src/env';
import { sendDocument } from '../src/telegram';

const [, , filePath, ...captionParts] = process.argv;

if (!filePath) {
      console.error('Usage: tsx --env-file=.env scripts/send-file.ts <path> [caption...]');
      process.exit(1);
}

const caption = captionParts.join(' ').trim() || undefined;
const chatId = Number(env.telegramChatId);

try {
      const messageId = await sendDocument(chatId, filePath, caption);
      console.log(`Sent ${filePath} to chat ${chatId} (message ${messageId})`);
} catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
}
