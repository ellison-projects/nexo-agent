import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');
const indexPath = resolve(publicDir, 'index.html');
const briefingsDir = resolve(publicDir, 'briefings');
const apiSnapshotsDir = resolve(publicDir, 'api-snapshots');
const port = Number(process.env.WEB_PORT ?? 8080);

async function sendTelegramMessage(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID for webhook notification');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send Telegram notification: ${response.status}`);
    }
  } catch (err) {
    console.error('Error sending Telegram notification:', err);
  }
}

const server = createServer(async (req, res) => {
  // Webhook endpoint - POST requests forward to Telegram
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const timestamp = new Date().toISOString();

        // Format webhook notification
        const message = `🔔 *Webhook Notification*\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n_${timestamp}_`;

        await sendTelegramMessage(message);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Webhook received' }));
      } catch (err) {
        console.error('Webhook processing error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to process webhook' }));
      }
    });

    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET, POST' }).end('Method Not Allowed');
    return;
  }

  // API: list all snapshots (briefings + api-snapshots)
  if (req.url === '/api/snapshots') {
    try {
      const briefingFiles = await readdir(briefingsDir).catch(() => []);
      const apiFiles = await readdir(apiSnapshotsDir).catch(() => []);

      const briefings = briefingFiles
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          filename: f,
          name: f.replace('.md', '').replace(/_/g, ' '),
          date: f.split('_')[0] || '',
          type: 'briefing',
          url: `/briefings/${f}`
        }));

      const apiSnapshots = apiFiles
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const isLLM = f.startsWith('llm');
          const isFeatures = f.startsWith('features');
          let type = 'api';
          if (isLLM) type = 'llm';
          else if (isFeatures) type = 'features';

          return {
            filename: f,
            name: f.replace('.md', '').replace(/_/g, ' '),
            date: f.split('-')[0] || '',
            type,
            url: `/api-snapshots/${f}`
          };
        });

      const allSnapshots = [...briefings, ...apiSnapshots].sort((a, b) =>
        b.filename.localeCompare(a.filename)
      );

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }).end(JSON.stringify(allSnapshots));
    } catch (err) {
      res.writeHead(200, {
        'Content-Type': 'application/json'
      }).end(JSON.stringify([]));
    }
    return;
  }

  // Serve briefing snapshot files
  if (req.url?.startsWith('/briefings/')) {
    const filename = basename(req.url.slice('/briefings/'.length));
    if (!filename.endsWith('.md')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
      return;
    }
    try {
      const content = await readFile(join(briefingsDir, filename), 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache'
      }).end(content);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
    }
    return;
  }

  // Serve API snapshot files
  if (req.url?.startsWith('/api-snapshots/')) {
    const filename = basename(req.url.slice('/api-snapshots/'.length));
    if (!filename.endsWith('.md')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
      return;
    }
    try {
      const content = await readFile(join(apiSnapshotsDir, filename), 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache'
      }).end(content);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
    }
    return;
  }

  // Serve index.html
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
    return;
  }
  try {
    const html = await readFile(indexPath);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    }).end(html);
  } catch (err) {
    console.error('Failed to read index.html:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`nexo-web listening on http://0.0.0.0:${port}`);
});
