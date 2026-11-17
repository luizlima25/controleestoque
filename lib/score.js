// Cérebro do Farejador: dá nota às ofertas comparando-as ENTRE SI,
// em vez de confiar no "desconto" que a loja diz ter.
import { tokens, norm, median } from './util.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function relevance(title, query) {
  const qt = tokens(query);
  if (!qt.length) return 1;
  const t = norm(title);
  return qt.filter((x) => t.includes(x)).length / qt.length;
}

/**
 * @param offers  ofertas normalizadas dos provedores
 * @param query   texto buscado
 * @param opts.historicMin  menor preço já registrado para esta busca (opcional)
 * @returns { offers, stats, dropped }
 */
export function analyze(offers, query, opts = {}) {
  const kept = [];
  let dropped = 0;
  for (const o of offers) {
    if (!(o.price > 0)) { dropped++; continue; }
    const rel = relevance(o.title, query);
    if (rel < 0.67) { dropped++; continue; }
    kept.push({ ...o, relevance: rel });
  }

  // Preço de referência: mediana dos novos (se houver amostra), sem acessórios.
  const news = kept.filter((o) => o.condition !== 'used');
  const base = news.length >= 4 ? news : kept;
  const rough = median(base.map((o) => o.price));
  const clean = base.filter((o) => o.price >= rough * 0.3);
  const ref = median(clean.map((o) => o.price)) ?? rough;
  const prices = clean.map((o) => o.price);

  const out = kept.map((o) => {
    const flags = [];
    const accessory = ref && o.price < ref * 0.3;
    if (accessory) flags.push('accessory');
    if (o.condition === 'used') flags.push('used');
    if (o.freeShipping) flags.push('freeShipping');

    const vsRef = ref ? (ref - o.price) / ref : 0; // >0 = mais barato que a mediana
    const claimed = o.oldPrice > o.price ? 1 - o.price / o.oldPrice : 0;
    if (claimed >= 0.2 && vsRef < claimed / 2) flags.push('inflatedDiscount');
    if (opts.historicMin && o.price <= opts.historicMin) flags.push('historicLow');

    // Usado já "deveria" custar ~30% menos que novo; só o que passa disso é vantagem.
    const edge = o.condition === 'used' ? vsRef - 0.3 : vsRef;
    let score = 50 + edge * 150; // na mediana = 50; 1/3 abaixo = 100
    if (o.freeShipping) score += 5;
    if (o.rating) score += clamp((o.rating - 4) * 10, -10, 8);
    if (o.condition === 'used') score = Math.min(score - 8, 75);
    if (flags.includes('inflatedDiscount')) score -= 10;
    if (flags.includes('historicLow')) score += 5;
    score = Math.round(clamp(score, 0, 100));
    if (accessory) score = Math.min(score, 20);

    const verdict = accessory ? 'Provável acessório'
      : score >= 80 ? 'Ótima oferta'
      : score >= 65 ? 'Boa oferta'
      : score >= 45 ? 'Na média'
      : 'Acima do mercado';
    return { ...o, score, verdict, flags, vsMedian: Math.round(vsRef * 100) };
  });

  return {
    offers: out,
    dropped,
    stats: {
      count: clean.length,
      min: prices.length ? Math.min(...prices) : null,
      median: ref ?? null,
      max: prices.length ? Math.max(...prices) : null,
    },
  };
}

export function sortOffers(offers, sort = 'score') {
  const by = {
    score: (a, b) => b.score - a.score || a.price - b.price,
    price: (a, b) => a.price - b.price,
    discount: (a, b) => b.vsMedian - a.vsMedian,
  }[sort] || ((a, b) => b.score - a.score);
  return [...offers].sort(by);
}

/** Melhor oferta "de verdade" para monitorar: a mais barata que não é acessório. */
export function bestOffer(offers) {
  return offers.filter((o) => !o.flags.includes('accessory') && !o.flags.includes('used'))
    .sort((a, b) => a.price - b.price)[0]
    ?? offers.filter((o) => !o.flags.includes('accessory')).sort((a, b) => a.price - b.price)[0]
    ?? null;
}
