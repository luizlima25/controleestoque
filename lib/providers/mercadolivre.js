// Mercado Livre via API pública de busca (site MLB = Brasil).
// A API pode exigir token de app: defina ML_TOKEN no ambiente se receber 401/403.
import { fetchWithTimeout } from '../util.js';

const API = 'https://api.mercadolibre.com';
const headers = () => ({
  Accept: 'application/json',
  ...(process.env.ML_TOKEN ? { Authorization: `Bearer ${process.env.ML_TOKEN}` } : {}),
});

export function mapItem(r) {
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
  };
}

async function get(path) {
  const res = await fetchWithTimeout(API + path, { headers: headers() });
  if (!res.ok) throw new Error(`Mercado Livre respondeu ${res.status}${res.status === 403 || res.status === 401 ? ' (defina ML_TOKEN)' : ''}`);
  return res.json();
}

export default {
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
