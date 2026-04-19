import { unlink } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { env } from './env';
import { fetchPhoto, editMessage, getUpdates, sendMessage, type TelegramUpdate } from './telegram';
import { askNexo } from './ai';

type QueuedMessage = {
      msg: NonNullable<TelegramUpdate['message']>;
      placeholderId: number | null;
      chatId: number;
};

async function skipBacklog(): Promise<number> {
      const pending = await getUpdates(0, 0);
      return pending.length ? pending[pending.length - 1].update_id + 1 : 0;
}

function gitStartupReport(): string {
      try {
            const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
            if (dirty) {
                  return `⚠️ Pending local changes — skipping pull:\n${dirty}`;
            }
            const before = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
            execSync('git pull --ff-only', { encoding: 'utf8' });
            const after = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
            if (before === after) {
                  return '✅ No updates pulled — repo already up to date';
            }
            const commits = execSync(`git log --oneline ${before}..${after}`, { encoding: 'utf8' }).trim();
            const count = commits.split('\n').length;
            return `✅ Pulled ${count} new commit${count === 1 ? '' : 's'}:\n${commits}`;
      } catch (err) {
            return `Git check failed: ${(err as Error).message}`;
      }
}

function ordinal(n: number): string {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function placeholderText(position: number): string {
      return position === 1 ? '....' : `⏳ queued (${ordinal(position)} in line)`;
}

const queue: QueuedMessage[] = [];
const state = { processing: false };
let resolveNext: (() => void) | null = null;
function notifyWorker() {
      const r = resolveNext;
      resolveNext = null;
      r?.();
}
function waitForMessage(): Promise<void> {
      return new Promise((r) => {
            resolveNext = r;
      });
}

async function poll(): Promise<void> {
      let offset = await skipBacklog();
      console.log(`Nexo listening for Telegram messages from chat ${env.telegramChatId}...`);
      const gitReport = gitStartupReport();
      await sendMessage(Number(env.telegramChatId), `Nexo online 🚀\n\n${gitReport}`).catch(() => {});

      while (true) {
            try {
                  const updates = await getUpdates(offset);
                  for (const update of updates) {
                        offset = update.update_id + 1;
                        const msg = update.message;
                        if (!msg) continue;

                        if (String(msg.chat.id) !== env.telegramChatId) {
                              const username = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name ?? 'unknown';
                              const chatType = msg.chat.type === 'private' ? 'private chat' : msg.chat.type;
                              await sendMessage(
                                    Number(env.telegramChatId),
                                    `⚠️ Message received from unknown ${chatType}: ${username} (ID: ${msg.chat.id})`
                              ).catch(() => {});
                              continue;
                        }

                        const text = msg.text ?? msg.caption ?? '';
                        const largestPhoto = msg.photo?.at(-1);
                        if (!text && !largestPhoto) continue;

                        console.log(`You: ${text}${largestPhoto ? ' [+photo]' : ''}`);

                        const position = queue.length + (state.processing ? 1 : 0) + 1;
                        const placeholderId = await sendMessage(msg.chat.id, placeholderText(position)).catch(() => null);
                        queue.push({ msg, placeholderId, chatId: msg.chat.id });
                        notifyWorker();
                  }
            } catch (err) {
                  console.error('Poll error, retrying in 5s:', err);
                  await new Promise((r) => setTimeout(r, 5000));
            }
      }
}

async function work(): Promise<void> {
      while (true) {
            if (queue.length === 0) {
                  await waitForMessage();
                  continue;
            }
            const item = queue.shift()!;
            state.processing = true;

            if (item.placeholderId !== null) {
                  await editMessage(item.chatId, item.placeholderId, '....').catch(() => {});
            }
            for (let i = 0; i < queue.length; i++) {
                  const q = queue[i];
                  if (q.placeholderId === null) continue;
                  await editMessage(q.chatId, q.placeholderId, placeholderText(i + 2)).catch(() => {});
            }

            const { msg, placeholderId, chatId } = item;
            const text = msg.text ?? msg.caption ?? '';
            const largestPhoto = msg.photo?.at(-1);
            let imagePath: string | null = null;
            let imageUrl: string | null = null;
            try {
                  if (largestPhoto) {
                        const photo = await fetchPhoto(largestPhoto.file_id);
                        imagePath = photo.localPath;
                        imageUrl = photo.publicUrl;
                  }
                  const reply = await askNexo(text, imagePath, imageUrl);
                  console.log(`Bot: ${reply}`);
                  if (placeholderId !== null) {
                        await editMessage(chatId, placeholderId, reply);
                  } else {
                        await sendMessage(chatId, reply);
                  }
            } catch (err) {
                  console.error('Failed to handle message:', err);
                  const errText = 'Something broke on my end. Try again.';
                  if (placeholderId !== null) {
                        await editMessage(chatId, placeholderId, errText).catch(() => {});
                  } else {
                        await sendMessage(chatId, errText).catch(() => {});
                  }
            } finally {
                  if (imagePath) {
                        await unlink(imagePath).catch(() => {});
                  }
                  state.processing = false;
            }
      }
}

async function main() {
      await Promise.all([poll(), work()]);
}

main().catch((err) => {
      console.error(err);
      process.exit(1);
});
