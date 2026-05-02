import { createServer } from 'node:http';
import { readFile, readdir, appendFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');
const indexPath = resolve(publicDir, 'index.html');
const briefingsDir = resolve(publicDir, 'briefings');
const apiSnapshotsDir = resolve(publicDir, 'api-snapshots');
const webhookLogPath = resolve(__dirname, '../../logs/webhook.log');
const port = Number(process.env.WEB_PORT ?? 8080);

async function purgeOldWebhookLogs(): Promise<void> {
  if (!existsSync(webhookLogPath)) return;

  try {
    const content = await readFile(webhookLogPath, 'utf-8');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Split into log entries (each starts with [timestamp])
    const entries = content.split(/(?=\[\d{4}-\d{2}-\d{2}T)/);

    // Filter to keep only entries from last 7 days
    const recentEntries = entries.filter(entry => {
      const match = entry.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
      if (!match) return false;

      const entryDate = new Date(match[1]);
      return entryDate >= sevenDaysAgo;
    });

    // Write back only recent entries
    await writeFile(webhookLogPath, recentEntries.join(''), 'utf-8');
  } catch (err) {
    console.error('Failed to purge old webhook logs:', err);
  }
}

async function logWebhook(source: string, payload: any): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${source}\n${JSON.stringify(payload, null, 2)}\n\n`;

  try {
    await appendFile(webhookLogPath, logEntry, 'utf-8');
  } catch (err) {
    console.error('Failed to write webhook log:', err);
  }
}

function formatVercelWebhook(payload: any): string {
  const { type, deployment, team } = payload;

  // Extract key info
  const deploymentUrl = deployment?.url || 'unknown';
  const projectName = deployment?.project?.name || team?.name || 'unknown';
  const status = deployment?.state || type?.replace('deployment.', '') || 'unknown';
  const creator = deployment?.creator?.username || 'unknown';

  // Status emoji
  let emoji = '🔔';
  if (status === 'READY' || status === 'succeeded') emoji = '✅';
  else if (status === 'ERROR' || status === 'failed' || status === 'error') emoji = '❌';
  else if (status === 'BUILDING' || status === 'created') emoji = '🔨';
  else if (status === 'CANCELED') emoji = '⚠️';

  return `${emoji} *Vercel Deployment ${status}*\n\n` +
         `**Project:** ${projectName}\n` +
         `**URL:** https://${deploymentUrl}\n` +
         `**Creator:** ${creator}\n` +
         (deployment?.meta?.githubCommitMessage ? `**Commit:** ${deployment.meta.githubCommitMessage}\n` : '') +
         `\n_${new Date().toISOString()}_`;
}

async function sendTelegramMessage(text: string): Promise<void> {
  const botToken = process.env.DEBUG_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.DEBUG_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Missing DEBUG_TELEGRAM_BOT_TOKEN or DEBUG_TELEGRAM_CHAT_ID for webhook notification');
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

        // Detect webhook source
        let source = 'generic';
        let message = '';

        if (payload.type?.startsWith('deployment.') || payload.deployment) {
          // Vercel webhook
          source = 'vercel';
          await logWebhook(source, payload);
          message = formatVercelWebhook(payload);
        } else {
          // Generic webhook - log raw JSON
          source = 'generic';
          await logWebhook(source, payload);
          message = `🔔 *Webhook Notification*\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n_${new Date().toISOString()}_`;
        }

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

server.listen(port, async () => {
  console.log(`nexo-web listening on http://0.0.0.0:${port}`);

  // Purge old webhook logs on startup
  await purgeOldWebhookLogs();

  // Purge old webhook logs daily
  setInterval(purgeOldWebhookLogs, 24 * 60 * 60 * 1000);
});
