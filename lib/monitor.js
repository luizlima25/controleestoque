import { randomUUID } from 'node:crypto';
import { providers } from './providers/index.js';
import { runSearch } from './search.js';
import { bestOffer } from './score.js';

const MAX_HISTORY = 500;
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pick = (o) => o && { title: o.title, price: o.price, store: o.store, url: o.url, provider: o.provider, image: o.image };

/** Lê o preço atual de um monitor (busca ou anúncio específico). */
export async function snapshot(watch) {
  if (watch.type === 'item') {
    const item = await providers[watch.item.provider].getItem(watch.item.id);
    if (!item) throw new Error('Anúncio não encontrado (pode ter saído do ar)');
    return { t: Date.now(), price: item.price, best: pick(item) };
  }
  const hist = watch.history.map((h) => h.price);
  const r = await runSearch({ q: watch.query, providerIds: watch.providers, cond: watch.cond ?? 'new', sort: 'price', historicMin: hist.length ? Math.min(...hist) : null });
  const best = bestOffer(r.offers);
  if (!best) throw new Error(r.errors[0]?.message ?? 'Nenhuma oferta encontrada');
  return { t: Date.now(), price: best.price, median: r.stats.median, count: r.stats.count, best: pick(best) };
}

/** Compara o novo preço com o histórico e decide quais alertas disparar. */
export function detectAlerts(watch, snap) {
  const prev = watch.history.at(-1);
  const alerts = [];
  const mk = (kind, message) => alerts.push({ id: randomUUID(), watchId: watch.id, kind, message, price: snap.price, t: snap.t, read: false });
  const name = watch.title ?? watch.query;

  const hitTarget = watch.target != null && snap.price <= watch.target;
  const hadHit = watch.target != null && prev && prev.price <= watch.target;
  if (hitTarget && !hadHit) mk('target', `${name}: ${brl(snap.price)} — atingiu seu preço-alvo de ${brl(watch.target)}!`);

  if (prev) {
    const drop = (prev.price - snap.price) / prev.price;
    if (drop >= 0.05 && !(hitTarget && !hadHit)) mk('drop', `${name}: caiu ${Math.round(drop * 100)}% (${brl(prev.price)} → ${brl(snap.price)})`);
    const min = Math.min(...watch.history.map((h) => h.price));
    if (watch.history.length >= 3 && snap.price < min && !alerts.length) mk('low', `${name}: menor preço já registrado (${brl(snap.price)})`);
  }
  return alerts;
}

export async function checkWatch(store, watch) {
  try {
    const snap = await snapshot(watch);
    const alerts = detectAlerts(watch, snap);
    watch.history.push({ t: snap.t, price: snap.price, median: snap.median ?? null, count: snap.count ?? null });
    if (watch.history.length > MAX_HISTORY) watch.history.splice(0, watch.history.length - MAX_HISTORY);
    watch.best = snap.best;
    watch.lastCheck = snap.t;
    watch.error = null;
    store.data.alerts.unshift(...alerts);
    store.data.alerts.length = Math.min(store.data.alerts.length, 200);
  } catch (e) {
    watch.error = e.message;
    watch.lastCheck = Date.now();
  }
  store.save();
  return watch;
}

export function startMonitor(store, minutes) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { for (const w of [...store.data.watches]) await checkWatch(store, w); }
    finally { running = false; }
  };
  const timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
