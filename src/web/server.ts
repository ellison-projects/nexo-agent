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

const server = createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' }).end('Method Not Allowed');
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
