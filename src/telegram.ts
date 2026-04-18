import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { env } from './env';

const API = `https://api.telegram.org/bot${env.telegramBotToken}`;
const FILE_API = `https://api.telegram.org/file/bot${env.telegramBotToken}`;

export type TelegramPhotoSize = {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
};

export type TelegramUpdate = {
      update_id: number;
      message?: {
            chat: { id: number };
            text?: string;
            caption?: string;
            photo?: TelegramPhotoSize[];
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

export async function downloadPhoto(fileId: string): Promise<string> {
      const infoRes = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`);
      if (!infoRes.ok) throw new Error(`Telegram getFile failed: ${infoRes.status} ${await infoRes.text()}`);
      const info = (await infoRes.json()) as { ok: boolean; result: { file_path: string } };
      if (!info.ok) throw new Error('Telegram getFile returned ok=false');

      const remotePath = info.result.file_path;
      const ext = extname(remotePath) || '.jpg';
      const localPath = join(tmpdir(), `nexo-bot-${fileId}${ext}`);

      const fileRes = await fetch(`${FILE_API}/${remotePath}`);
      if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
      const bytes = Buffer.from(await fileRes.arrayBuffer());
      await writeFile(localPath, bytes);
      return localPath;
}
