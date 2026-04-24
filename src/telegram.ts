import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
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

function escapeHtml(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Convert the markdown subset Claude typically emits into Telegram-supported HTML.
// Telegram HTML mode supports: <b>, <i>, <s>, <u>, <code>, <pre>, <a>, <blockquote>.
export function mdToHtml(text: string): string {
      const placeholders: string[] = [];
      const stash = (html: string): string => {
            placeholders.push(html);
            return `\u0000${placeholders.length - 1}\u0000`;
      };

      let out = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang: string, body: string) => {
            const inner = escapeHtml(body.replace(/\n$/, ''));
            return stash(lang ? `<pre><code class="language-${escapeHtml(lang)}">${inner}</code></pre>` : `<pre>${inner}</pre>`);
      });

      out = out.replace(/`([^`\n]+)`/g, (_, body: string) => stash(`<code>${escapeHtml(body)}</code>`));

      out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
            return stash(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
      });

      out = escapeHtml(out);

      out = out.replace(/^(#{1,6})\s+(.+)$/gm, (_, _hashes: string, title: string) => `<b>${title}</b>`);
      out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
      out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/g, '$1<i>$2</i>');
      out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

      return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => placeholders[Number(i)]);
}

async function postMessage(endpoint: string, payload: Record<string, unknown>, text: string): Promise<Response> {
      const html = mdToHtml(text);
      const tryPost = (body: Record<string, unknown>) =>
            fetch(`${API}/${endpoint}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
            });

      const htmlRes = await tryPost({ ...payload, text: html, parse_mode: 'HTML' });
      if (htmlRes.ok) return htmlRes;
      // Telegram rejects malformed HTML with 400; fall back to plain text so the user still gets the message.
      if (htmlRes.status === 400) {
            console.error(`Telegram ${endpoint} HTML rejected, retrying as plain text:`, await htmlRes.clone().text());
            const plainRes = await tryPost({ ...payload, text });
            if (plainRes.ok) return plainRes;
            throw new Error(`Telegram ${endpoint} failed: ${plainRes.status} ${await plainRes.text()}`);
      }
      throw new Error(`Telegram ${endpoint} failed: ${htmlRes.status} ${await htmlRes.text()}`);
}

export async function sendMessage(chatId: number, text: string): Promise<number> {
      const res = await postMessage('sendMessage', { chat_id: chatId }, text);
      const data = (await res.json()) as { ok: boolean; result: { message_id: number } };
      return data.result.message_id;
}

// Telegram caps messages at 4096 chars. mdToHtml expands the text somewhat
// (bold/italic/link tags), so we chunk the raw markdown at a conservative
// size to leave room for expansion. Splits prefer paragraph > line > word
// > hard boundaries to keep chunks readable.
const CHUNK_TARGET = 3500;

export function chunkMessage(text: string, maxLen: number = CHUNK_TARGET): string[] {
      if (text.length <= maxLen) return [text];
      const separators = ['\n\n', '\n', ' ', ''];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > maxLen) {
            let splitAt = maxLen;
            for (const sep of separators) {
                  if (!sep) break;
                  const idx = remaining.lastIndexOf(sep, maxLen);
                  if (idx > 0) {
                        splitAt = idx + sep.length;
                        break;
                  }
            }
            const chunk = remaining.slice(0, splitAt).trimEnd();
            if (chunk) chunks.push(chunk);
            remaining = remaining.slice(splitAt);
      }
      if (remaining.trim()) chunks.push(remaining);
      return chunks;
}

export async function sendLongMessage(chatId: number, text: string): Promise<number[]> {
      const chunks = chunkMessage(text);
      const ids: number[] = [];
      for (const chunk of chunks) {
            ids.push(await sendMessage(chatId, chunk));
      }
      return ids;
}

export async function sendReminderBotMessage(chatId: number, text: string): Promise<number> {
      const res = await fetch(`https://api.telegram.org/bot${env.telegramReminderBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) throw new Error(`Telegram reminder sendMessage failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { ok: boolean; result: { message_id: number } };
      return data.result.message_id;
}

export async function editMessage(chatId: number, messageId: number, text: string): Promise<void> {
      await postMessage('editMessageText', { chat_id: chatId, message_id: messageId }, text);
}

export async function getUpdates(offset: number, timeoutSeconds = 30): Promise<TelegramUpdate[]> {
      const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=${timeoutSeconds}`);
      const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
      return data.ok ? data.result : [];
}

export async function sendDocument(chatId: number, filePath: string, caption?: string): Promise<number> {
      const bytes = await readFile(filePath);
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('document', new Blob([new Uint8Array(bytes)]), basename(filePath));
      if (caption) form.append('caption', caption);

      const res = await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Telegram sendDocument failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { ok: boolean; result: { message_id: number } };
      return data.result.message_id;
}

export async function fetchPhoto(fileId: string): Promise<{ localPath: string; publicUrl: string }> {
      const infoRes = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`);
      if (!infoRes.ok) throw new Error(`Telegram getFile failed: ${infoRes.status} ${await infoRes.text()}`);
      const info = (await infoRes.json()) as { ok: boolean; result: { file_path: string } };
      if (!info.ok) throw new Error('Telegram getFile returned ok=false');

      const remotePath = info.result.file_path;
      const publicUrl = `${FILE_API}/${remotePath}`;
      const ext = extname(remotePath) || '.jpg';
      const localPath = join(tmpdir(), `nexo-bot-${fileId}${ext}`);

      const fileRes = await fetch(publicUrl);
      if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
      const bytes = Buffer.from(await fileRes.arrayBuffer());
      await writeFile(localPath, bytes);
      return { localPath, publicUrl };
}
