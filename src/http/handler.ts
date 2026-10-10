import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import { AppError, badRequest } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { Router } from './router';
import { serveStatic } from './static';

const MAX_BODY_BYTES = 16 * 1024;

// Turns a node:http request into a RequestContext, runs the matching route and
// writes JSON back. Anything that isn't an API route falls through to public/.
export function createRequestHandler(router: Router, logger: Logger) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      const match = router.match(method, url.pathname);
      if (!match) {
        if (method === 'GET' && (await serveStatic(url.pathname, res))) return;
        sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'No such route' } });
        return;
      }
      const body = method === 'POST' ? await readJson(req) : undefined;
      const reply = await match.handler({
        method,
        path: url.pathname,
        params: match.params,
        query: url.searchParams,
        headers: req.headers,
        body,
      });
      sendJson(res, reply.status, reply.body);
    } catch (err) {
      if (err instanceof AppError) {
        sendJson(res, err.status, { error: { code: err.code, message: err.message } });
      } else if (err instanceof ZodError) {
        sendJson(res, 400, { error: { code: 'VALIDATION_FAILED', message: 'Invalid request', issues: err.issues } });
      } else {
        logger.error('unhandled error', { method, path: url.pathname, error: String((err as Error)?.stack ?? err) });
        sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
      }
    }
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('INVALID_JSON', 'Body is not valid JSON');
  }
}
