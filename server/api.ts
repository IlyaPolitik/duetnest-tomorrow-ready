import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { parseInput } from '../src/analysis-contract.ts';
import type { AnalysisResult } from '../src/analysis-contract.ts';
import { callMeta, backend } from './meta.ts';
import type { Config } from './meta.ts';
export function readConfig(root: string): Config {
  const file = resolve(root, '.env.server');
  const env = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const provider = (env.MODEL_PROVIDER ?? process.env.MODEL_PROVIDER ?? 'meta').trim();
  if (provider !== 'meta' && provider !== 'fireworks') throw new Error('Unsupported provider');
  const keyName = provider === 'fireworks' ? 'FIREWORKS_API_KEY' : 'MODEL_API_KEY';
  return { provider, key: (env[keyName] ?? process.env[keyName] ?? '').trim(), limit: 10 };
}
export function createApi(getConfig: () => Config, invoke = callMeta) {
  const csrf = randomBytes(32).toString('hex');
  let used = 0, busy = false, verified = false, verifiedIdentity = ''; 
  const requests = new Map<string, { body: string; identity: string; result: AnalysisResult }>();
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/meta/')) return next();
    const send = (code: number, data: unknown) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); };
    if (req.headers.host !== '127.0.0.1:4318' || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4318') || req.headers['sec-fetch-site'] === 'cross-site') return send(403, {status:'error', code:'origin', reason:'Only the local project interface is allowed.'});
    try {
      const config = getConfig();
      const target = backend(config), identity = JSON.stringify([target.provider, target.model, config.key]);
      if (verifiedIdentity !== identity) verified = false;
      if (req.method === 'GET' && req.url === '/api/meta/status') return send(200, { configured: !!config.key, provider: target.provider, model: target.model, csrf, remaining: Math.max(0,config.limit-used), verified });
      if (req.method !== 'POST' || req.url !== '/api/meta/analyze') return send(404, {status:'error',code:'not_found',reason:'Unknown operation.'});
      if (req.headers['x-duetnest-csrf'] !== csrf || req.headers.origin !== 'http://127.0.0.1:4318' || req.headers['content-type'] !== 'application/json') return send(403, {status:'error',code:'csrf',reason:'Refresh the page before analyzing.'});
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 100000) return send(413,{status:'error',code:'too_large',reason:'Document is too large.'}); chunks.push(chunk); }
      const input = parseInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const body = JSON.stringify(input), previous = requests.get(input.requestId);
      if (previous) return previous.body === body && previous.identity === identity ? send(200,previous.result) : send(409,{status:'error',code:'request_conflict',reason:'This request was already used for a different document.'});
      if ((input.provider ?? 'meta') !== target.provider) return send(409,{status:'error',code:'provider_changed',reason:'The provider changed. Refresh the status and check the recipient.'});
      if (!config.key) return send(503,{status:'unavailable',code:'missing_key',reason:`A dedicated ${target.label} key is not configured. Your source is saved.`});
      if (busy || used >= config.limit) return send(429,{status:'error',code:'local_limit',reason:busy ? 'Another document is still processing.' : 'The local limit of 10 requests per session has been reached.'});
      busy = true; used++;
      let result: AnalysisResult;
      try { result = await invoke(input,config); } catch { result = {status:'error',code:'outcome_unknown',reason:'The request outcome is unknown. It will not be retried automatically.'}; }
      finally { busy = false; }
      requests.set(input.requestId,{body,identity,result});
      if (result.status === 'ok') { verified = true; verifiedIdentity = identity; }
      send(200,result);
    } catch { send(400,{status:'error',code:'invalid_input',reason:'Could not read the request or server configuration.'}); }
  };
}
export function metaPlugin(): Plugin {
  return { name:'duetnest-meta-server', configureServer(server) { server.middlewares.use(createApi(() => readConfig(server.config.root))); }, configurePreviewServer(server) { server.middlewares.use(createApi(() => readConfig(server.config.root))); } };
}
