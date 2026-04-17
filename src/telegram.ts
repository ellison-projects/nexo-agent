import { env } from './env';

const API = `https://api.telegram.org/bot${env.telegramBotToken}`;

export type TelegramUpdate = {
      update_id: number;
      message?: {
            chat: { id: number };
            text?: string;
      };
};

export async function sendMessage(chatId: number, text: string): Promise<number> {
      const res = await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { ok: boolean; result: { message_id: number } };
      return data.result.message_id;
}

export async function editMessage(chatId: number, messageId: number, text: string): Promise<void> {
      const res = await fetch(`${API}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
      });
      if (!res.ok) throw new Error(`Telegram editMessageText failed: ${res.status} ${await res.text()}`);
}

export async function getUpdates(offset: number, timeoutSeconds = 30): Promise<TelegramUpdate[]> {
      const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=${timeoutSeconds}`);
      const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
      return data.ok ? data.result : [];
}
