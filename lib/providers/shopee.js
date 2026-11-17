// Shopee Brasil via API oficial de Afiliados (GraphQL). Gratuita, mas exige cadastro:
//   1. entre em https://affiliate.shopee.com.br e peça acesso à "Open API"
//   2. copie AppID e Secret  →  SHOPEE_APP_ID=... SHOPEE_SECRET=... npm start
// Não raspamos o site: a busca interna da Shopee é protegida contra robôs e vetada nos termos de uso.
import { createHash } from 'node:crypto';
import { fetchWithTimeout, parsePrice } from '../util.js';

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const FIELDS = 'itemId productName priceMin priceMax priceDiscountRate imageUrl productLink shopName shopType ratingStar sales';
// shopType: 1 = Loja Oficial (Shopee Mall), 2 = Vendedor Preferido, 4 = Vendedor Preferido Plus
const TRUSTED_TYPES = { 1: 'Loja Oficial Shopee', 2: 'Vendedor Preferido', 4: 'Vendedor Preferido Plus' };

export function sign({ appId, secret, timestamp, payload }) {
  const signature = createHash('sha256').update(appId + timestamp + payload + secret).digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export function mapNode(n) {
  const price = parsePrice(n.priceMin);
  const rate = Number(n.priceDiscountRate) || 0;
  const badge = (n.shopType ?? []).map((t) => TRUSTED_TYPES[t]).find(Boolean);
  return {
    id: String(n.itemId),
    provider: 'shopee',
    title: n.productName,
    price,
    oldPrice: rate > 0 && rate < 95 && price ? Math.round((price / (1 - rate / 100)) * 100) / 100 : null,
    url: n.productLink,
    image: n.imageUrl ?? null,
    store: n.shopName ?? 'Shopee',
    condition: 'new', // a API de afiliados só lista produtos novos
    freeShipping: false, // não informado pela API
    rating: n.ratingStar ? Math.round(Number(n.ratingStar) * 10) / 10 : null,
    sold: n.sales ?? null,
    trusted: !!badge,
    trustReason: badge ?? 'Loja sem selo Oficial/Preferencial',
  };
}

export function createShopee({ env = process.env, fetchFn = fetchWithTimeout, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const configured = () => !!(env.SHOPEE_APP_ID && env.SHOPEE_SECRET);

  async function gql(args) {
    if (!configured()) throw new Error('Shopee: defina SHOPEE_APP_ID e SHOPEE_SECRET (cadastro grátis em affiliate.shopee.com.br)');
    const payload = JSON.stringify({ query: `{ productOfferV2(${args}) { nodes { ${FIELDS} } } }` });
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: sign({ appId: env.SHOPEE_APP_ID, secret: env.SHOPEE_SECRET, timestamp: String(now()), payload }) },
      body: payload,
    });
    if (!res.ok) throw new Error(`Shopee respondeu ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Shopee: ${json.errors[0].message}`);
    return json.data?.productOfferV2?.nodes ?? [];
  }

  return {
    id: 'shopee',
    name: 'Shopee',
    available: configured,
    async search(query) {
      return (await gql(`keyword: ${JSON.stringify(query)}, sortType: 1, page: 1, limit: 50`)).map(mapNode);
    },
    async getItem(id) {
      const n = Number(id);
      if (!Number.isSafeInteger(n)) throw new Error('ID de produto da Shopee inválido');
      const node = (await gql(`itemId: ${n}, limit: 1`))[0];
      return node ? mapNode(node) : null;
    },
  };
}

export default createShopee();
