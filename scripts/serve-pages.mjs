import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const prefix = '/math-scratchpad/';
const offlineTestPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5qUAAAAASUVORK5CYII=',
  'base64',
);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
let directory = process.env.PAGES_TEST_DIST ?? (process.env.PW_PREBUILT === '1' && existsSync('dist-a') ? 'dist-a' : 'dist');
let controlOverride;

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'POST' && url.pathname === '/__switch') {
    const target = url.searchParams.get('to');
    if (target === 'a' || target === 'b' || target === 'kill') {
      directory = target === 'kill' ? 'dist-kill' : 'dist-' + target;
      response.writeHead(204).end();
    } else response.writeHead(400).end();
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__control') {
    const enabled = url.searchParams.get('enabled');
    controlOverride = enabled === 'true' ? true : enabled === 'false' ? false : undefined;
    response.writeHead(204).end();
    return;
  }
  if (request.method === 'GET' && url.pathname === `${prefix}offline-fixtures/same-origin.png`) {
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': offlineTestPng.length,
      'Cache-Control': 'max-age=600',
    });
    response.end(offlineTestPng);
    return;
  }
  if (!url.pathname.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const file = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    if (file === 'pwa-control.json' && controlOverride !== undefined) {
      const body = Buffer.from(JSON.stringify({ swEnabled: controlOverride }));
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const root = resolve(directory);
    const path = resolve(root, file);
    if (!path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body;
    let status = 200;
    let extension = path.slice(path.lastIndexOf('.'));
    try {
      body = await readFile(path);
    } catch {
      status = 404;
      extension = '.html';
      body = await readFile(resolve(root, '404.html')).catch(() => readFile(resolve(root, 'index.html')));
    }
    response.writeHead(status, {
      'Content-Type': mime[extension] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': file === 'sw.js' ? 'no-cache' : 'max-age=600',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(400).end();
  }
}).listen(Number(process.env.PAGES_TEST_PORT ?? 4173), '127.0.0.1');
