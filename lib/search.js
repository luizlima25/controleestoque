import { providers } from './providers/index.js';
import { analyze, sortOffers } from './score.js';

/** Consulta vários provedores em paralelo; falha de um não derruba os outros. */
export async function runSearch({ q, providerIds, min, max, cond = 'all', sort = 'score', historicMin }) {
  const ids = (providerIds?.length ? providerIds : ['demo']).filter((id) => providers[id]?.searchable !== false && providers[id]);
  const errors = [];
  const settled = await Promise.all(ids.map(async (id) => {
    try { return await providers[id].search(q); }
    catch (e) { errors.push({ provider: id, message: e.message }); return []; }
  }));

  const { offers, stats, dropped } = analyze(settled.flat(), q, { historicMin });
  const filtered = offers.filter((o) =>
    (min == null || o.price >= min) && (max == null || o.price <= max) &&
    (cond === 'all' || o.condition === cond));
  return { offers: sortOffers(filtered, sort), stats, dropped, errors, providers: ids };
}
