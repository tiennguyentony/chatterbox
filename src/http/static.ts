import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../../public', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Serves the demo web client. Returns false if there is no such file.
export async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = resolve(join(PUBLIC_DIR, relative));
  if (!file.startsWith(PUBLIC_DIR + sep)) return false;

  const type = TYPES[extname(file)];
  if (!type) return false;
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(content);
    return true;
  } catch {
    return false;
  }
}
