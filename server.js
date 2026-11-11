// Oficina de agentes — servidor local sin dependencias (Node 18+).
// Sirve la interfaz, guarda la configuración del equipo y llama a la API de Anthropic.
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 8020;
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 4000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages';

const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DRAFTS = path.join(ROOT, 'drafts');
const CONFIG_FILE = path.join(DATA, 'config.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Petición demasiado grande'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error('JSON no válido'), { status: 400 }); }
}

function slugify(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'borrador';
}

// --- Anthropic: streaming de texto -------------------------------------------------
async function streamAgent(req, res) {
  if (!API_KEY) return sendJson(res, 503, { error: 'Falta ANTHROPIC_API_KEY en el archivo .env' });
  const { system, prompt } = await readBody(req);
  if (!prompt) return sendJson(res, 400, { error: 'Falta el texto de la petición' });

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system || undefined,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });
  } catch (err) {
    return sendJson(res, 502, { error: 'No se pudo conectar con Anthropic: ' + err.message });
  }

  if (!upstream.ok) {
    let message = `Anthropic respondió ${upstream.status}`;
    try { const j = await upstream.json(); if (j?.error?.message) message += ': ' + j.error.message; } catch {}
    return sendJson(res, upstream.status === 429 ? 429 : 502, { error: message });
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          let data;
          try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            res.write(data.delta.text);
          } else if (data.type === 'error') {
            res.write('\n\n[Error de Anthropic: ' + (data.error?.message || 'desconocido') + ']');
          }
        }
      }
    }
  } catch (err) {
    if (!controller.signal.aborted) res.write('\n\n[Conexión interrumpida: ' + err.message + ']');
  }
  res.end();
}

// --- Rutas ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { ready: Boolean(API_KEY), model: MODEL });
  }

  if (p === '/api/config' && req.method === 'GET') {
    if (!existsSync(CONFIG_FILE)) return sendJson(res, 200, { cfg: null });
    return sendJson(res, 200, JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')));
  }

  if (p === '/api/config' && req.method === 'PUT') {
    const body = await readBody(req);
    if (!Array.isArray(body.cfg)) return sendJson(res, 400, { error: 'cfg debe ser una lista' });
    await fs.mkdir(DATA, { recursive: true });
    const record = { cfg: body.cfg, context: typeof body.context === 'string' ? body.context : undefined, updatedAt: new Date().toISOString() };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(record, null, 2));
    return sendJson(res, 200, record);
  }

  if (p === '/api/agent' && req.method === 'POST') return streamAgent(req, res);

  if (p === '/api/drafts' && req.method === 'GET') {
    await fs.mkdir(DRAFTS, { recursive: true });
    const files = (await fs.readdir(DRAFTS)).filter(f => f.endsWith('.md'));
    const list = await Promise.all(files.map(async file => {
      const text = await fs.readFile(path.join(DRAFTS, file), 'utf8');
      const title = (text.match(/^#\s+(.+)$/m) || [, file])[1];
      const { mtimeMs } = await fs.stat(path.join(DRAFTS, file));
      return { file, title, mtime: mtimeMs };
    }));
    list.sort((a, b) => a.mtime - b.mtime);
    return sendJson(res, 200, { drafts: list });
  }

  if (p === '/api/drafts' && req.method === 'POST') {
    const { title, text } = await readBody(req);
    if (!title || !text) return sendJson(res, 400, { error: 'Faltan title o text' });
    await fs.mkdir(DRAFTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = `${stamp}-${slugify(title)}.md`;
    await fs.writeFile(path.join(DRAFTS, file), text);
    return sendJson(res, 200, { file, title });
  }

  const draftMatch = p.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch && req.method === 'GET') {
    const file = path.basename(decodeURIComponent(draftMatch[1]));
    if (!file.endsWith('.md')) return sendJson(res, 400, { error: 'Archivo no válido' });
    const full = path.join(DRAFTS, file);
    if (!existsSync(full)) return sendJson(res, 404, { error: 'No existe' });
    return sendJson(res, 200, { file, text: await fs.readFile(full, 'utf8') });
  }

  return sendJson(res, 404, { error: 'Ruta no encontrada' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Prohibido'); }
  try {
    const data = await fs.readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Oficina de agentes en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  Modelo: ${MODEL}`);
  if (!API_KEY) console.log('  ⚠ Falta ANTHROPIC_API_KEY: copia .env.example a .env y pon tu clave.\n');
});
