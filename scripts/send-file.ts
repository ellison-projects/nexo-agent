import { extname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../src/env';
import { sendDocument } from '../src/telegram';
import { compileTypst } from '../src/pdf';

const [, , inputPath, ...captionParts] = process.argv;

if (!inputPath) {
      console.error('Usage: tsx --env-file=.env scripts/send-file.ts <path> [caption...]');
      process.exit(1);
}

const caption = captionParts.join(' ').trim() || undefined;
const chatId = Number(env.telegramChatId);

async function resolveSendPath(path: string): Promise<string> {
      if (extname(path).toLowerCase() !== '.typ') return path;
      const pdfPath = join(tmpdir(), `${basename(path, '.typ')}.pdf`);
      await compileTypst(path, pdfPath);
      console.log(`Compiled ${path} -> ${pdfPath}`);
      return pdfPath;
}

try {
      const sendPath = await resolveSendPath(inputPath);
      const messageId = await sendDocument(chatId, sendPath, caption);
      console.log(`Sent ${sendPath} to chat ${chatId} (message ${messageId})`);
} catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
}
