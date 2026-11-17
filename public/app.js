const $ = (s) => document.querySelector(s);
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u ?? '') ? u : null);
const ago = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora' : m < 60 ? `${m} min atrás` : `${Math.round(m / 60)} h atrás`; };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 3200);
}

const TAGS = {
  accessory: ['Provável acessório', 'warn'], used: ['Usado', ''], freeShipping: ['Frete grátis', ''],
  inflatedDiscount: ['Desconto inflado', 'warn'], trusted: ['✔ Loja confiável', 'good'], untrusted: ['⚠ Vendedor não verificado', 'warn'], historicLow: ['Menor preço já visto', 'good'],
};
let lastSearch = null;

// ---------- abas ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#tab-search').hidden = name !== 'search';
  $('#tab-watch').hidden = name !== 'watch';
  if (name === 'watch') loadWatches();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- provedores ----------
async function loadProviders() {
  const list = (await api('/api/providers')).filter((p) => p.searchable);
  const real = list.filter((p) => p.id !== 'demo' && p.available);
  $('#providers').innerHTML = list.map((p) => {
    const on = real.length ? real.includes(p) : p.id === 'demo';
    return `<label title="${p.available ? '' : 'Configure as credenciais no servidor (veja o README)'}"><input type="checkbox" value="${p.id}" ${on ? 'checked' : ''} ${p.available ? '' : 'disabled'}> ${esc(p.name)}${p.available ? '' : ' <small class="muted">(sem credenciais)</small>'}</label>`;
  }).join('');
}
const selectedProviders = () => [...document.querySelectorAll('#providers input:checked')].map((i) => i.value);

// ---------- busca ----------
async function search() {
  const q = $('#q').value.trim();
  if (!q) return;
  const params = new URLSearchParams({ q, providers: selectedProviders().join(','), sort: $('#sort').value, cond: $('#cond').value, min: $('#min').value, max: $('#max').value, trusted: $('#trusted').checked ? '1' : '0' });
  $('#empty').textContent = 'Farejando…'; $('#empty').hidden = false; $('#results').innerHTML = '';
  try {
    const r = await api('/api/search?' + params);
    lastSearch = { q, ...r };
    renderResults();
  } catch (e) { $('#empty').textContent = e.message; }
}
function renderResults() {
  const { offers, stats, errors, dropped, hiddenUntrusted } = lastSearch;
  $('#errors').innerHTML = errors.map((e) => `<div class="err"><b>${esc(e.provider)}</b>: ${esc(e.message)}</div>`).join('');
  $('#empty').hidden = offers.length > 0;
  if (!offers.length) $('#empty').textContent = 'Nenhuma oferta encontrada com esses filtros.';
  $('#summary').hidden = !offers.length;
  if (offers.length) {
    $('#summary').innerHTML = `
      <div><b>${stats.count}</b><span>ofertas comparadas</span></div>
      <div><b>${brl(stats.min)}</b><span>menor preço</span></div>
      <div><b>${brl(stats.median)}</b><span>preço típico (mediana)</span></div>
      <div><b>${brl(stats.max)}</b><span>maior preço</span></div>
      ${dropped ? `<div><b>${dropped}</b><span>descartadas (fora do assunto)</span></div>` : ''}
      ${hiddenUntrusted ? `<div><b>${hiddenUntrusted}</b><span>ocultas (vendedor não confiável)</span></div>` : ''}
      <div class="actions"><button class="ghost" id="watchQuery">🔔 Monitorar esta busca</button></div>`;
    $('#watchQuery').onclick = () => addWatch({ type: 'query', query: lastSearch.q, providers: lastSearch.providers, trustedOnly: lastSearch.trustedOnly, cond: $('#cond').value === 'used' ? 'used' : 'new' }, 'Monitorando a melhor oferta de “' + lastSearch.q + '”');
  }
  $('#results').innerHTML = offers.map(card).join('');
  $('#results').querySelectorAll('[data-watch]').forEach((b) => (b.onclick = () => {
    const o = offers[+b.dataset.watch];
    addWatch({ type: 'item', provider: o.provider, itemId: o.id, url: o.url, trustedOnly: lastSearch.trustedOnly }, 'Monitorando este anúncio');
  }));
}
function card(o, i) {
  const cls = o.flags.includes('accessory') ? 's-acc' : o.score >= 65 ? 's-hi' : o.score >= 45 ? 's-mid' : 's-lo';
  const vs = o.vsMedian === 0 ? '' : o.vsMedian > 0
    ? `<span class="vs pos">${o.vsMedian}% abaixo do típico</span>` : `<span class="vs neg">${-o.vsMedian}% acima do típico</span>`;
  const url = safeUrl(o.url), img = safeUrl(o.image);
  return `<article class="card">
    <span class="score ${cls}" title="Nota do Farejador (0–100)">${o.score}</span>
    <div class="img">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : 'sem imagem'}</div>
    <h3>${esc(o.title)}</h3>
    <div><span class="price">${brl(o.price)}</span>${o.oldPrice ? `<span class="old">${brl(o.oldPrice)}</span>` : ''}</div>
    <div class="verdict">${esc(o.verdict)} ${vs}</div>
    <div class="store">${esc(o.store)}${o.rating ? ` · ★ ${o.rating}` : ''}</div>
    <div class="tags">${o.flags.map((f) => TAGS[f] && `<span class="tag ${TAGS[f][1]}" ${f === 'trusted' && o.trustReason ? `title="${esc(o.trustReason)}"` : ''}>${TAGS[f][0]}</span>`).join('')}</div>
    <div class="row">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><button class="ghost">Ver oferta ↗</button></a>` : '<span class="tag">simulado</span>'}
      <button class="ghost" data-watch="${i}">🔔 Monitorar anúncio</button></div>
  </article>`;
}

async function addWatch(body, msg) {
  const raw = prompt('Avisar quando chegar a qual preço? (deixe vazio para só acompanhar)', '');
  if (raw === null) return;
  const target = raw.trim() ? Number(raw.replace(/\./g, '').replace(',', '.')) : null;
  try { await api('/api/watches', { method: 'POST', body: { ...body, target } }); toast(msg); refreshCounts(); }
  catch (e) { toast(e.message); }
}

// ---------- monitorados ----------
function spark(h) {
  if (h.length < 2) return '<div class="muted" style="grid-column:1/-1;font-size:12px">Histórico começa a aparecer após a segunda verificação.</div>';
  const ps = h.map((x) => x.price), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const pts = ps.map((p, i) => `${(i / (ps.length - 1)) * 300},${50 - ((p - lo) / span) * 44}`).join(' ');
  return `<svg class="spark" viewBox="0 0 300 56" preserveAspectRatio="none" role="img" aria-label="Histórico de preço">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
async function loadWatches() {
  const list = await api('/api/watches');
  $('#watchCount').textContent = list.length;
  $('#watchEmpty').hidden = list.length > 0;
  $('#watchList').innerHTML = list.map((w) => {
    const ps = w.history.map((h) => h.price), min = ps.length ? Math.min(...ps) : null, cur = ps.at(-1);
    const prev = ps.at(-2), delta = prev ? ((cur - prev) / prev) * 100 : 0;
    const hit = w.target != null && cur != null && cur <= w.target;
    const url = safeUrl(w.best?.url);
    return `<article class="watch" data-id="${w.id}">
      <div><h3>${esc(w.title ?? w.query)} ${hit ? '<span class="badge hit">alvo atingido</span>' : ''}</h3>
        <div class="meta">${w.type === 'item' ? 'Anúncio específico' : 'Melhor oferta da busca'} · ${w.best ? esc(w.best.store) : ''} · verificado ${ago(w.lastCheck)}</div>
        ${w.type === 'query' && w.best ? `<div class="meta">Agora: ${esc(w.best.title)}</div>` : ''}
        ${w.error ? `<div class="err">${esc(w.error)}</div>` : ''}</div>
      <div class="now">${cur != null ? brl(cur) : '—'}<div class="meta">${prev ? (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + Math.abs(delta).toFixed(1) + '% vs. anterior' : ''}${min != null ? ` · mín. ${brl(min)}` : ''}</div></div>
      ${spark(w.history)}
      <div class="foot">
        <label>Alvo R$ <input type="number" step="0.01" min="0" value="${w.target ?? ''}" data-target></label>
        <button class="ghost" data-act="save">Salvar alvo</button>
        <button class="ghost" data-act="check">Verificar agora</button>
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><button class="ghost">Abrir ↗</button></a>` : ''}
        <button class="ghost danger" data-act="del" style="margin-left:auto">Remover</button>
      </div></article>`;
  }).join('');
}
$('#watchList').addEventListener('click', async (e) => {
  const act = e.target.dataset.act; if (!act) return;
  const el = e.target.closest('.watch'), id = el.dataset.id;
  try {
    if (act === 'del') { if (!confirm('Parar de monitorar?')) return; await api(`/api/watches/${id}`, { method: 'DELETE' }); }
    if (act === 'check') { e.target.textContent = 'Verificando…'; await api(`/api/watches/${id}/check`, { method: 'POST' }); }
    if (act === 'save') { await api(`/api/watches/${id}`, { method: 'PATCH', body: { target: el.querySelector('[data-target]').value } }); toast('Alvo salvo'); }
  } catch (err) { toast(err.message); }
  loadWatches(); refreshCounts();
});

// ---------- alertas ----------
async function refreshCounts() {
  const [w, a] = await Promise.all([api('/api/watches'), api('/api/alerts')]);
  $('#watchCount').textContent = w.length;
  const unread = a.filter((x) => !x.read);
  $('#bellCount').hidden = !unread.length; $('#bellCount').textContent = unread.length;
  $('#alerts').innerHTML = a.length ? a.map((x) => `<div class="a ${x.read ? '' : 'unread'}">${esc(x.message)}<div class="muted">${ago(x.t)}</div></div>`).join('')
    : '<div class="a muted">Nenhum alerta ainda.</div>';
  if (!$('#tab-watch').hidden && !document.activeElement?.matches?.('input')) loadWatches();
}
$('#bell').onclick = async () => {
  const box = $('#alerts'); box.hidden = !box.hidden;
  if (!box.hidden) { await api('/api/alerts/read', { method: 'POST' }); setTimeout(refreshCounts, 1500); }
};

// ---------- eventos ----------
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search(); });
['sort', 'cond', 'trusted'].forEach((id) => $('#' + id).addEventListener('change', () => lastSearch && search()));
$('#urlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const target = $('#urlTarget').value || null;
  try {
    await api('/api/watches', { method: 'POST', body: { type: 'item', provider: 'pageurl', url: $('#urlInput').value, target, trustedOnly: $('#trusted').checked } });
    toast('Link monitorado'); $('#urlInput').value = ''; refreshCounts(); showTab('watch');
  } catch (err) { toast(err.message); }
});

loadProviders(); refreshCounts(); setInterval(refreshCounts, 30000);
