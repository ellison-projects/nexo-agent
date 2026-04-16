import { env } from './env';
import { getUpdates, sendMessage } from './telegram';
import { generateFunnyReply } from './ai';

async function skipBacklog(): Promise<number> {
      const pending = await getUpdates(0, 0);
      return pending.length ? pending[pending.length - 1].update_id + 1 : 0;
}

async function main() {
      let offset = await skipBacklog();
      console.log(`Listening for Telegram messages from chat ${env.telegramChatId}...`);

      while (true) {
            try {
                  const updates = await getUpdates(offset);
                  for (const update of updates) {
                        offset = update.update_id + 1;
                        const msg = update.message;
                        if (!msg?.text) continue;
                        if (String(msg.chat.id) !== env.telegramChatId) continue;

                        console.log(`You: ${msg.text}`);
                        try {
                              const reply = await generateFunnyReply(msg.text);
                              console.log(`Bot: ${reply}`);
                              await sendMessage(msg.chat.id, reply);
                        } catch (err) {
                              console.error('Failed to handle message:', err);
                              await sendMessage(msg.chat.id, 'Something broke on my end. Try again.').catch(() => {});
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
