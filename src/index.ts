import { unlink } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { env } from './env';
import { downloadPhoto, editMessage, getUpdates, sendMessage } from './telegram';
import { askNexo } from './ai';

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

async function main() {
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
                        if (String(msg.chat.id) !== env.telegramChatId) continue;

                        const text = msg.text ?? msg.caption ?? '';
                        const largestPhoto = msg.photo?.at(-1);
                        if (!text && !largestPhoto) continue;

                        console.log(`You: ${text}${largestPhoto ? ' [+photo]' : ''}`);
                        const processingId = await sendMessage(msg.chat.id, '....').catch(() => null);

                        let imagePath: string | null = null;
                        try {
                              if (largestPhoto) {
                                    imagePath = await downloadPhoto(largestPhoto.file_id);
                              }
                              const reply = await askNexo(text, imagePath);
                              console.log(`Bot: ${reply}`);
                              if (processingId !== null) {
                                    await editMessage(msg.chat.id, processingId, reply);
                              } else {
                                    await sendMessage(msg.chat.id, reply);
                              }
                        } catch (err) {
                              console.error('Failed to handle message:', err);
                              const errText = 'Something broke on my end. Try again.';
                              if (processingId !== null) {
                                    await editMessage(msg.chat.id, processingId, errText).catch(() => {});
                              } else {
                                    await sendMessage(msg.chat.id, errText).catch(() => {});
                              }
                        } finally {
                              if (imagePath) {
                                    await unlink(imagePath).catch(() => {});
                              }
                        }
                  }
            } catch (err) {
                  console.error('Poll error, retrying in 5s:', err);
                  await new Promise((r) => setTimeout(r, 5000));
            }
      }
}

main().catch((err) => {
      console.error(err);
      process.exit(1);
});
