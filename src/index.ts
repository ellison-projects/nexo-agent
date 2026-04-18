import { unlink } from 'node:fs/promises';
import { env } from './env';
import { downloadPhoto, editMessage, getUpdates, sendMessage } from './telegram';
import { generateFunnyReply } from './ai';

async function skipBacklog(): Promise<number> {
      const pending = await getUpdates(0, 0);
      return pending.length ? pending[pending.length - 1].update_id + 1 : 0;
}

async function main() {
      let offset = await skipBacklog();
      console.log(`Listening for Telegram messages from chat ${env.telegramChatId}...`);
      await sendMessage(Number(env.telegramChatId), 'bot started up 🚀').catch(() => {});

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
                              const reply = await generateFunnyReply(text, imagePath);
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
