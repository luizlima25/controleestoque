// Leitor universal: cola o link de QUALQUER página de produto e o Farejador
// extrai o preço via dados estruturados (schema.org JSON-LD, Open Graph, itemprop).
import { parsePrice, fetchWithTimeout } from '../util.js';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function* walk(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (node && typeof node === 'object') {
    yield node;
    if (node['@graph']) yield* walk(node['@graph']);
  }
}
const isProduct = (n) => [].concat(n['@type'] ?? []).some((t) => /Product/i.test(t));

function fromOffers(offers) {
  for (const o of [].concat(offers ?? [])) {
    const price = parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
    if (price) return { price, available: !/OutOfStock|SoldOut/i.test(o.availability ?? '') };
  }
  return null;
}

export function parseProductPage(html, url) {
  let name = null, image = null, price = null;

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try { json = JSON.parse(m[1].trim()); } catch { continue; }
    for (const n of walk(json)) {
      if (!isProduct(n)) continue;
      const got = fromOffers(n.offers);
      if (got) {
        price = got.price;
        name = n.name ?? name;
        const img = [].concat(n.image ?? [])[0];
        image = (typeof img === 'object' ? img?.url : img) ?? image;
        break;
      }
    }
    if (price) break;
  }

  const meta = (re) => html.match(re)?.[1];
  if (!price) {
    price = parsePrice(meta(/<meta[^>]+(?:property|name)=["'](?:product|og):price:amount["'][^>]+content=["']([^"']+)["']/i)
      ?? meta(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product|og):price:amount["']/i)
      ?? meta(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i));
  }
  name ??= meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ?? meta(/<title>([^<]+)<\/title>/i);
  image ??= meta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (!price) return null;

  let store = url;
  try { store = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return {
    id: url, provider: 'pageurl', title: decode(String(name ?? url)).trim(), price,
    oldPrice: null, url, image: image ?? null, store, condition: 'new',
    freeShipping: false, rating: null,
  };
}

export default {
  id: 'pageurl',
  name: 'Link de qualquer loja',
  available: () => true,
  searchable: false, // só serve para monitorar um link específico
  async search() { return []; },
  async getItem(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('Informe um link http(s) válido');
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Farejador/1.0)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      redirect: 'follow',
    }, 15000);
    if (!res.ok) throw new Error(`A loja respondeu ${res.status}`);
    const item = parseProductPage(await res.text(), url);
    if (!item) throw new Error('Não encontrei o preço nessa página (a loja pode carregar o preço via JavaScript)');
    return item;
  },
};
