// Provedor de demonstração: catálogo simulado e determinístico.
// Os preços "respiram" a cada janela de tempo, então o monitoramento
// funciona offline, sem depender de nenhuma loja.
import { norm } from '../util.js';

const BUCKET_MS = 2 * 60 * 1000;
const STORES = ['Lojão do Zé', 'MegaPreço', 'Eletro Brasil', 'Casa & Tech', 'Promo Já', 'Shopping Central'];
const VARIANTS = ['', 'Pro', 'Plus', 'Lite', 'Max', '2024', 'Premium', 'Básico', 'Edição Especial', 'Novo Lacrado', 'Compact', 'Ultra', 'Eco', 'Turbo'];
const ACCESSORIES = ['Capa Protetora para', 'Película de Vidro para', 'Cabo Carregador para'];
const BASES = [[/iphone|galaxy|celular|smartphone/, 2800], [/notebook|laptop/, 3400], [/\btv\b|televis/, 2300],
  [/fone|headset|airpods/, 260], [/tenis/, 320], [/cafeteira|air ?fryer|fritadeira/, 380],
  [/playstation|ps5|xbox|console/, 3600], [/geladeira|fogao|lavadora/, 2700]];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function catalog(query, now = Date.now()) {
  const q = norm(query).trim();
  const r = rng(hash(q));
  const base = (BASES.find(([re]) => re.test(q))?.[1] ?? 90 + Math.floor(r() * 1900)) * (0.9 + r() * 0.2);
  const bucket = Math.floor(now / BUCKET_MS);
  const name = titleCase(query.trim());
  const items = [];
  for (let n = 0; n < 20; n++) {
    const kind = n < 14 ? 'new' : n < 17 ? 'used' : 'accessory';
    const v = VARIANTS[n % VARIANTS.length];
    const title = kind === 'accessory' ? `${ACCESSORIES[n - 17]} ${name}`
      : kind === 'used' ? `${name} ${v} Seminovo`.replace('  ', ' ')
      : `${name} ${v}`.trim();
    const mult = kind === 'accessory' ? 0.04 + r() * 0.04 : kind === 'used' ? 0.55 + r() * 0.15
      : (0.84 + r() * 0.36) * (/Pro|Max|Ultra|Premium/.test(v) ? 1.15 : 1);
    const wobble = rng(hash(q + n) ^ bucket);
    let price = base * mult * (0.94 + wobble() * 0.12);
    if (kind === 'new' && wobble() < 0.07) price *= 0.82; // promoção relâmpago
    price = Math.round(price * 100) / 100;
    const fake = r() < 0.3; // "de R$ X" inflado
    items.push({
      id: `${encodeURIComponent(q)}~${n}`,
      provider: 'demo',
      title,
      price,
      oldPrice: kind === 'new' ? Math.round(price * (fake ? 1.5 + r() * 0.4 : 1.05 + r() * 0.15)) : null,
      url: null,
      image: null,
      store: STORES[Math.floor(r() * STORES.length)],
      condition: kind === 'used' ? 'used' : 'new',
      freeShipping: r() < 0.5,
      rating: kind === 'accessory' ? null : Math.round((3.6 + r() * 1.4) * 10) / 10,
    });
  }
  return items;
}

export default {
  id: 'demo',
  name: 'Demonstração (simulado)',
  available: () => true,
  async search(query) {
    if (!query.trim()) return [];
    return catalog(query);
  },
  async getItem(id) {
    const [q] = id.split('~');
    return catalog(decodeURIComponent(q)).find((o) => o.id === id) ?? null;
  },
};
