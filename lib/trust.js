// Camada de confiança: só deixamos entrar ofertas de lojas/vendedores com lastro.

// Grandes varejistas brasileiros. Personalize com TRUSTED_DOMAINS="loja1.com.br,loja2.com.br"
// (acrescenta à lista) ou TRUSTED_DOMAINS_ONLY=1 para usar só os seus.
const DEFAULT_DOMAINS = [
  'mercadolivre.com.br', 'amazon.com.br', 'magazineluiza.com.br', 'magalu.com', 'americanas.com.br',
  'submarino.com.br', 'shoptime.com.br', 'casasbahia.com.br', 'pontofrio.com.br', 'extra.com.br',
  'carrefour.com.br', 'fastshop.com.br', 'kabum.com.br', 'pichau.com.br', 'terabyteshop.com.br',
  'leroymerlin.com.br', 'havan.com.br', 'samsung.com', 'apple.com', 'dell.com', 'lenovo.com',
  'nike.com.br', 'netshoes.com.br', 'dafiti.com.br', 'centauro.com.br', 'oboticario.com.br',
];

export function trustedDomains(env = process.env) {
  const extra = (env.TRUSTED_DOMAINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return env.TRUSTED_DOMAINS_ONLY ? extra : [...DEFAULT_DOMAINS, ...extra];
}

export function isTrustedUrl(url, env = process.env) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return trustedDomains(env).some((d) => host === d || host.endsWith('.' + d));
}

/**
 * Reputação de vendedor do Mercado Livre → { trusted, reason }.
 * Confiável se for loja oficial, MercadoLíder Gold/Platinum, ou reputação verde
 * com volume e avaliações positivas altas. Sem dados de reputação → desconhecido (null).
 */
export function mlSellerTrust(item) {
  const rep = item.seller?.seller_reputation;
  if (item.official_store_id) return { trusted: true, reason: 'Loja oficial' };
  if (!rep) return { trusted: null, reason: null };
  if (['gold', 'platinum'].includes(rep.power_seller_status)) return { trusted: true, reason: `MercadoLíder ${rep.power_seller_status === 'gold' ? 'Gold' : 'Platinum'}` };
  const done = rep.transactions?.completed ?? 0;
  const pos = rep.transactions?.ratings?.positive ?? 0;
  if (['4_light_green', '5_green'].includes(rep.level_id) && done >= 100 && pos >= 0.9) {
    return { trusted: true, reason: `Reputação verde (${done} vendas, ${Math.round(pos * 100)}% positivas)` };
  }
  return { trusted: false, reason: 'Vendedor sem reputação sólida' };
}
