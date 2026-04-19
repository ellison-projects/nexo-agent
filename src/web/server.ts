import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '../../public/index.html');
const port = Number(process.env.WEB_PORT ?? 8080);

const server = createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' }).end('Method Not Allowed');
    return;
  }
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
