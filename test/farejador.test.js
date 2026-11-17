import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, median } from '../lib/util.js';
import { analyze, bestOffer } from '../lib/score.js';
import { parseProductPage } from '../lib/providers/pageurl.js';
import { mapItem } from '../lib/providers/mercadolivre.js';
import demo from '../lib/providers/demo.js';
import { detectAlerts } from '../lib/monitor.js';

test('parsePrice entende formatos BR e US', () => {
  assert.equal(parsePrice('R$ 1.299,90'), 1299.9);
  assert.equal(parsePrice('1299.90'), 1299.9);
  assert.equal(parsePrice('1,299.90'), 1299.9);
  assert.equal(parsePrice('1.299'), 1299);
  assert.equal(parsePrice('59,9'), 59.9);
  assert.equal(parsePrice(12.5), 12.5);
  assert.equal(parsePrice('grátis'), null);
});

const o = (title, price, extra = {}) => ({ id: title + price, provider: 'x', title, price, condition: 'new', store: 's', ...extra });

test('analyze: acessório, irrelevante e desconto inflado', () => {
  const offers = [
    ...[1000, 1050, 1100, 1150, 1200].map((p) => o('Notebook Gamer X', p)),
    o('Capa para Notebook Gamer X', 40),
    o('Cadeira de escritório', 300),
    o('Notebook Gamer X Turbo', 1000, { oldPrice: 2000 }),
  ];
  const r = analyze(offers, 'notebook gamer');
  assert.equal(r.dropped, 1);
  const capa = r.offers.find((x) => x.title.startsWith('Capa'));
  assert.ok(capa.flags.includes('accessory') && capa.score <= 20);
  const fake = r.offers.find((x) => x.title.endsWith('Turbo'));
  assert.ok(fake.flags.includes('inflatedDiscount'), 'desconto de 50% com preço só 9% abaixo da mediana');
  assert.ok(r.stats.median >= 1050 && r.stats.median <= 1100);
  assert.equal(bestOffer(r.offers).price, 1000);
});

test('analyze: mais barato pontua mais', () => {
  const r = analyze([800, 1000, 1000, 1000, 1200].map((p) => o('Fone Bluetooth', p)), 'fone bluetooth');
  const by = (p) => r.offers.find((x) => x.price === p).score;
  assert.ok(by(800) > by(1000) && by(1000) > by(1200));
});

test('pageurl lê JSON-LD (inclui @graph) e meta tags', () => {
  const ld = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Product","name":"Cafeteira &amp; Cia","image":["https://i/x.jpg"],"offers":{"@type":"Offer","price":"289,90","priceCurrency":"BRL"}}]}</script>`;
  const a = parseProductPage(ld, 'https://www.loja.com/p/1');
  assert.equal(a.price, 289.9); assert.equal(a.title, 'Cafeteira & Cia'); assert.equal(a.store, 'loja.com');
  const meta = `<title>Tênis</title><meta property="og:title" content="Tênis Veloz"><meta property="product:price:amount" content="199.00">`;
  assert.equal(parseProductPage(meta, 'https://l.com/t').price, 199);
  assert.equal(parseProductPage('<html></html>', 'https://l.com'), null);
});

test('mercadolivre mapeia resposta da API', () => {
  const m = mapItem({ id: 'MLB1', title: 'X', price: 10, original_price: 20, permalink: 'https://p', thumbnail: 'http://t.jpg', condition: 'new', shipping: { free_shipping: true }, seller: { nickname: 'loja' } });
  assert.deepEqual([m.image, m.freeShipping, m.oldPrice, m.store], ['https://t.jpg', true, 20, 'loja']);
});

test('demo é determinístico e getItem devolve o mesmo anúncio', async () => {
  const a = await demo.search('air fryer'), b = await demo.search('air fryer');
  assert.deepEqual(a, b);
  assert.equal(a.length, 20);
  const item = await demo.getItem(a[3].id);
  assert.equal(item.price, a[3].price);
});

test('alertas: alvo, queda e sem repetição', () => {
  const w = { id: 'w', title: 'X', target: 100, history: [{ price: 120 }] };
  assert.equal(detectAlerts(w, { price: 95, t: 1 })[0].kind, 'target');
  w.history.push({ price: 95 });
  assert.equal(detectAlerts(w, { price: 94, t: 2 }).length, 0, 'já estava abaixo do alvo');
  const w2 = { id: 'w', title: 'X', target: null, history: [{ price: 100 }] };
  assert.equal(detectAlerts(w2, { price: 90, t: 1 })[0].kind, 'drop');
  assert.equal(median([3, 1, 2]), 2);
});

// ---------- confiança e renovação de token ----------
import { mlSellerTrust, isTrustedUrl } from '../lib/trust.js';
import { createAuth, createMercadoLivre } from '../lib/providers/mercadolivre.js';
import { runSearch } from '../lib/search.js';

test('mlSellerTrust: loja oficial, MercadoLíder, reputação verde e desconhecido', () => {
  assert.equal(mlSellerTrust({ official_store_id: 1 }).trusted, true);
  assert.equal(mlSellerTrust({ seller: { seller_reputation: { power_seller_status: 'platinum' } } }).trusted, true);
  const verde = { level_id: '5_green', transactions: { completed: 500, ratings: { positive: 0.97 } } };
  assert.equal(mlSellerTrust({ seller: { seller_reputation: verde } }).trusted, true);
  const novo = { level_id: '5_green', transactions: { completed: 5, ratings: { positive: 1 } } };
  assert.equal(mlSellerTrust({ seller: { seller_reputation: novo } }).trusted, false, 'poucas vendas não bastam');
  assert.equal(mlSellerTrust({ seller: { seller_reputation: { level_id: '2_orange' } } }).trusted, false);
  assert.equal(mlSellerTrust({ seller: {} }).trusted, null);
});

test('isTrustedUrl: domínios e subdomínios, e não engana com sufixo parecido', () => {
  assert.ok(isTrustedUrl('https://www.kabum.com.br/produto/1'));
  assert.ok(!isTrustedUrl('https://kabum.com.br.golpe.xyz/p'));
  assert.ok(!isTrustedUrl('https://naokabum.com.br/p'));
  assert.ok(isTrustedUrl('https://minhaloja.com/p', { TRUSTED_DOMAINS: 'minhaloja.com' }));
  assert.ok(!isTrustedUrl('lixo'));
});

test('token: renova ao vencer, sem pedidos duplicados', async () => {
  let t = 0, tokens = 0;
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push(url);
    if (url.endsWith('/oauth/token')) {
      tokens++;
      assert.match(opts.body, /grant_type=client_credentials/);
      return { ok: true, status: 200, json: async () => ({ access_token: 'tk' + tokens, expires_in: 600 }) };
    }
    return { ok: true, status: 200, json: async () => ({ results: [{ id: 'A', title: 'X', price: 1 }] }) };
  };
  const auth = createAuth({ env: { ML_CLIENT_ID: 'i', ML_CLIENT_SECRET: 's' }, fetchFn, now: () => t });
  const ml = createMercadoLivre({ auth, fetchFn });
  await Promise.all([ml.search('a'), ml.search('b')]);
  assert.equal(tokens, 1, 'dois pedidos simultâneos compartilham um único token');
  t += 700_000; // passou do vencimento
  await ml.search('c');
  assert.equal(tokens, 2);
});

test('token: 403 com token auto renova e repete uma vez; sem credenciais dá erro claro', async () => {
  let tokens = 0, hits = 0;
  const fetchFn = async (url) => {
    if (url.endsWith('/oauth/token')) { tokens++; return { ok: true, status: 200, json: async () => ({ access_token: 't' + tokens, expires_in: 21600 }) }; }
    hits++;
    return hits === 1 ? { ok: false, status: 403 } : { ok: true, status: 200, json: async () => ({ results: [] }) };
  };
  const ml = createMercadoLivre({ auth: createAuth({ env: { ML_CLIENT_ID: 'i', ML_CLIENT_SECRET: 's' }, fetchFn }), fetchFn });
  await ml.search('x');
  assert.deepEqual([tokens, hits], [2, 2]);

  const semCred = createMercadoLivre({ auth: createAuth({ env: {}, fetchFn }), fetchFn: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(semCred.search('x'), /ML_CLIENT_ID/);
});

test('runSearch: oculta não confiáveis antes de calcular a mediana', async () => {
  const withUntrusted = await runSearch({ q: 'air fryer', providerIds: ['demo'], trustedOnly: false });
  const only = await runSearch({ q: 'air fryer', providerIds: ['demo'], trustedOnly: true });
  assert.ok(only.hiddenUntrusted > 0);
  assert.ok(only.offers.every((o) => !o.flags.includes('untrusted')));
  assert.ok(withUntrusted.offers.some((o) => o.flags.includes('untrusted')));
  assert.ok(withUntrusted.offers.filter((o) => o.flags.includes('untrusted')).every((o) => o.score <= 40));
});
