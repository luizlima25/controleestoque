// Mercado Livre via API oficial (site MLB = Brasil).
// Autenticação (escolha uma):
//   ML_CLIENT_ID + ML_CLIENT_SECRET  → o Farejador pede e RENOVA o token sozinho (recomendado)
//   ML_TOKEN                         → token fixo (vence em ~6h)
import { fetchWithTimeout } from '../util.js';
import { mlSellerTrust } from '../trust.js';

const API = 'https://api.mercadolibre.com';

export function createAuth({ env = process.env, fetchFn = fetchWithTimeout, now = Date.now } = {}) {
  let token = null, expires = 0, pending = null;
  const auto = () => !!(env.ML_CLIENT_ID && env.ML_CLIENT_SECRET);

  async function refresh() {
    const res = await fetchFn(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET }).toString(),
    });
    if (!res.ok) throw new Error(`Não consegui renovar o token do Mercado Livre (${res.status}). Confira ML_CLIENT_ID e ML_CLIENT_SECRET.`);
    const j = await res.json();
    if (!j.access_token) throw new Error('Resposta de token do Mercado Livre sem access_token');
    token = j.access_token;
    expires = now() + Math.max(60, (j.expires_in ?? 21600) - 120) * 1000; // renova 2 min antes
  }

  return {
    auto,
    async headers() {
      if (!auto()) return env.ML_TOKEN ? { Authorization: `Bearer ${env.ML_TOKEN}` } : {};
      if (!token || now() >= expires) await (pending ??= refresh().finally(() => (pending = null)));
      return { Authorization: `Bearer ${token}` };
    },
    invalidate() { token = null; expires = 0; },
  };
}

export function mapItem(r) {
  const trust = mlSellerTrust(r);
  return {
    id: r.id,
    provider: 'mercadolivre',
    title: r.title,
    price: r.price,
    oldPrice: r.original_price ?? null,
    url: r.permalink,
    image: r.thumbnail ? r.thumbnail.replace(/^http:/, 'https:') : null,
    store: r.seller?.nickname ?? 'Mercado Livre',
    condition: r.condition === 'used' ? 'used' : 'new',
    freeShipping: !!r.shipping?.free_shipping,
    rating: null,
    sold: r.sold_quantity ?? null,
    trusted: trust.trusted,
    trustReason: trust.reason,
  };
}

export function createMercadoLivre({ auth = createAuth(), fetchFn = fetchWithTimeout } = {}) {
  async function get(path, retried = false) {
    const res = await fetchFn(API + path, { headers: { Accept: 'application/json', ...(await auth.headers()) } });
    if ((res.status === 401 || res.status === 403) && auth.auto() && !retried) {
      auth.invalidate(); // token pode ter sido revogado: renova e tenta uma vez
      return get(path, true);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ' — configure ML_CLIENT_ID/ML_CLIENT_SECRET (ou ML_TOKEN)' : '';
      throw new Error(`Mercado Livre respondeu ${res.status}${hint}`);
    }
    return res.json();
  }
  return {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    available: () => true,
    async search(query) {
      const data = await get(`/sites/MLB/search?q=${encodeURIComponent(query)}&limit=50`);
      return (data.results ?? []).map(mapItem);
    },
    async getItem(id) {
      return mapItem(await get(`/items/${encodeURIComponent(id)}`));
    },
  };
}

export default createMercadoLivre();
