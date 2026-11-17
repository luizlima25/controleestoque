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
