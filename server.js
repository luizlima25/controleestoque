import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store } from './lib/store.js';
import { providers } from './lib/providers/index.js';
import { runSearch } from './lib/search.js';
import { checkWatch, startMonitor } from './lib/monitor.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);
const MONITOR_MINUTES = Number(process.env.MONITOR_MINUTES ?? 5);
const store = new Store(join(process.env.DATA_DIR ?? join(ROOT, 'data'), 'db.json'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, fail) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 1e6) { fail(new Error('corpo grande demais')); req.destroy(); } });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { fail(new Error('JSON inválido')); } });
});
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const publicProviders = () => Object.values(providers).map((p) => ({ id: p.id, name: p.name, searchable: p.searchable !== false }));

async function api(req, res, url) {
  const p = url.pathname, m = req.method, q = url.searchParams;

  if (p === '/api/providers') return json(res, 200, publicProviders());

  if (p === '/api/search' && m === 'GET') {
    const text = (q.get('q') ?? '').trim();
    if (!text) return json(res, 400, { error: 'Digite o que você procura' });
    const r = await runSearch({
      q: text, providerIds: (q.get('providers') ?? '').split(',').filter(Boolean),
      min: num(q.get('min')), max: num(q.get('max')), cond: q.get('cond') ?? 'all', sort: q.get('sort') ?? 'score',
    });
    return json(res, 200, r);
  }

  if (p === '/api/watches' && m === 'GET') return json(res, 200, store.data.watches);

  if (p === '/api/watches' && m === 'POST') {
    const b = await readBody(req);
    const w = { id: randomUUID(), createdAt: Date.now(), target: num(b.target), history: [], best: null, lastCheck: null, error: null };
    if (b.type === 'item') {
      const prov = providers[b.provider];
      if (!prov) return json(res, 400, { error: 'Provedor desconhecido' });
      const id = b.provider === 'pageurl' ? String(b.url ?? '').trim() : String(b.itemId ?? '');
      if (!id) return json(res, 400, { error: 'Informe o link ou o anúncio' });
      let item;
      try { item = await prov.getItem(id); } catch (e) { return json(res, 422, { error: e.message }); }
      if (!item) return json(res, 422, { error: 'Anúncio não encontrado' });
      Object.assign(w, { type: 'item', title: item.title, image: item.image, item: { provider: b.provider, id } });
    } else {
      const query = String(b.query ?? '').trim();
      if (!query) return json(res, 400, { error: 'Informe a busca' });
      const ids = (b.providers ?? []).filter((id) => providers[id]?.searchable !== false && providers[id]);
      Object.assign(w, { type: 'query', query, providers: ids.length ? ids : ['demo'], cond: b.cond === 'used' ? 'used' : 'new' });
    }
    store.data.watches.unshift(w);
    await checkWatch(store, w);
    return json(res, 201, w);
  }

  const wm = p.match(/^\/api\/watches\/([\w-]+)(\/check)?$/);
  if (wm) {
    const w = store.data.watches.find((x) => x.id === wm[1]);
    if (!w) return json(res, 404, { error: 'Monitor não encontrado' });
    if (wm[2] && m === 'POST') return json(res, 200, await checkWatch(store, w));
    if (m === 'PATCH') { w.target = num((await readBody(req)).target); store.save(); return json(res, 200, w); }
    if (m === 'DELETE') {
      store.data.watches = store.data.watches.filter((x) => x !== w);
      store.data.alerts = store.data.alerts.filter((a) => a.watchId !== w.id);
      store.save();
      return json(res, 200, { ok: true });
    }
  }

  if (p === '/api/alerts' && m === 'GET') return json(res, 200, store.data.alerts);
  if (p === '/api/alerts/read' && m === 'POST') { store.data.alerts.forEach((a) => (a.read = true)); store.save(); return json(res, 200, { ok: true }); }

  return json(res, 404, { error: 'Rota não encontrada' });
}

async function serveStatic(res, pathname) {
  const file = resolve(PUBLIC, '.' + normalize('/' + (pathname === '/' ? 'index.html' : pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('Não encontrado'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

const monitor = startMonitor(store, MONITOR_MINUTES);
server.listen(PORT, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Farejador em http://localhost:${PORT}  (monitorando a cada ${MONITOR_MINUTES} min)`);
  setTimeout(monitor.tick, 3000);
});
