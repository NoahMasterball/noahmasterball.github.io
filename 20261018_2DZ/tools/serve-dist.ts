// Serves dist/ under the same sub-path GitHub Pages serves the published build at (SUB_PATH,
// tools/lib/deploy.ts). The Playwright smoke test runs against this to prove the production
// build works from a sub-path with relative assets.
//
// Usage: node tools/serve-dist.ts
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { DIST_DIR as dist, E2E_PORT, E2E_URL, LOCAL_HOST, SUB_PATH } from './lib/deploy.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    // stat throws for missing paths; "not a file" is the correct answer then
    return false;
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(SUB_PATH)) {
    res.writeHead(404).end(`Not found (the build is served under ${SUB_PATH})`);
    return;
  }
  const relative = decodeURIComponent(url.pathname.slice(SUB_PATH.length)) || 'index.html';
  const file = normalize(join(dist, relative));
  if (!file.startsWith(dist + sep) || !isFile(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(E2E_PORT, LOCAL_HOST, () => {
  console.log(`Serving dist/ at ${E2E_URL}`);
});
