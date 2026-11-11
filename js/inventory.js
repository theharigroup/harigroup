const cfg = window.HARI_CONFIG;
const $ = id => document.getElementById(id);
if (!cfg || !cfg.apiBase || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
  $('setup').classList.remove('hidden');
  $('auth').hidden = true;
  throw new Error('Inventory portal public configuration is missing');
}
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
let session = null;
const API = cfg.apiBase.replace(/\/$/, '');

// ---------- small DOM helper (text is always set with textContent, never innerHTML) ----------
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
}

// ---------- API ----------
async function authedFetch(path, opts = {}) {
  if (!session) throw new Error('Please sign in again.');
  const r = await fetch(API + path, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + session.access_token } });
  if (r.status === 401) { await client.auth.signOut(); throw new Error('Your session expired. Please sign in again.'); }
  if (r.status === 403) throw new Error('Your account is not approved for inventory access.');
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Request failed (' + r.status + ').'); }
  return r.json();
}
const api = path => authedFetch(path);

// ---------- auth ----------
async function refresh() {
  const { data } = await client.auth.getSession(); session = data.session;
  $('auth').hidden = !!session; $('portal').hidden = !session;
  if (!session) { resetPortal(); return; }
  $('member').textContent = session.user.email;
  try {
    const o = await api('/api/overview');
    $('inventory-name').textContent = o.inventory_name || 'Chemical Inventory';
  } catch (e) { $('message').textContent = e.message; }
  loadPanels();
}
$('login').addEventListener('submit', async e => {
  e.preventDefault(); $('loginError').textContent = '';
  const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
  const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  btn.disabled = false;
  if (error) { $('loginError').textContent = 'Invalid email or password.'; return; }
  $('password').value = '';
  refresh();
});
$('logout').addEventListener('click', async () => { await client.auth.signOut(); refresh(); });
client.auth.onAuthStateChange((event, next) => {
  session = next;
  if (event === 'SIGNED_OUT') setTimeout(refresh, 0);   // keep the screen in step with expiry / sign-out in another tab
});

// ---------- state ----------
const state = { rows: [], filters: { location: null, supplier: null }, sort: { key: null, dir: 1 }, selected: null, token: 0, view: 'search' };
const sizeOf = c => [c.size, c.unit].filter(Boolean).join(' ');
function resetPortal() {
  Object.assign(state, { rows: [], filters: { location: null, supplier: null }, selected: null });
  $('results').replaceChildren(); $('query').value = ''; closeDetail();
  $('message').textContent = 'Search by name, CAS number, barcode or structure.';
  $('empty-state').hidden = false; $('empty-state').lastChild.textContent = 'Results will appear here.'; state.emptyText = ''; $('structure-preview').classList.add('hidden');
  $('facets').hidden = true; structureCache.clear();
}

// ---------- structures (lazy: only rows that scroll into view are resolved) ----------
const structureCache = new Map();
function resolveStructure(c) {
  const key = (c.cas || c.name || '').trim();
  if (!key) return Promise.resolve(null);
  if (!structureCache.has(key)) {
    const p = new URLSearchParams(c.cas ? { cas: c.cas } : { name: c.name });
    structureCache.set(key, api('/api/structure/resolve?' + p).catch(() => null));
  }
  return structureCache.get(key);
}
const pubchemPng = (cid, size) => 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + encodeURIComponent(cid) + '/PNG?image_size=' + size + 'x' + size;
const lazy = new IntersectionObserver(entries => entries.forEach(en => {
  if (!en.isIntersecting) return;
  lazy.unobserve(en.target);
  const { img, c, fallback } = en.target._job;
  resolveStructure(c).then(d => {
    const cid = d && d.cid || fallback;
    if (cid) { img.src = pubchemPng(cid, 160); img.dataset.cid = cid; }
    else img.replaceWith(h('span', { class: 'text-[10px] text-slate-400', text: 'No structure' }));
  });
}), { rootMargin: '200px' });

// ---------- results ----------
function visibleRows() {
  let rows = state.rows.filter(c =>
    (!state.filters.location || c.location === state.filters.location) &&
    (!state.filters.supplier || c.supplier === state.filters.supplier));
  const { key, dir } = state.sort;
  if (key) rows = [...rows].sort((a, b) => String(key === 'size' ? sizeOf(a) : a[key] ?? '').localeCompare(String(key === 'size' ? sizeOf(b) : b[key] ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * dir);
  return rows;
}
function renderResults() {
  const rows = visibleRows();
  const body = $('results'); body.replaceChildren();
  const empty = $('empty-state');
  empty.hidden = rows.length > 0;
  if (!rows.length) empty.lastChild.textContent = state.rows.length ? 'No containers match the selected filters.' : (state.emptyText || 'Results will appear here.');
  for (const c of rows) {
    const img = h('img', { alt: 'Structure of ' + (c.name || 'chemical'), width: 64, height: 64, class: 'w-16 h-16 object-contain bg-white border border-slate-100' });
    const imgCell = h('td', { class: 'p-2' }, img);
    const tr = h('tr', { tabindex: 0, class: state.selected === c ? 'sel' : '' },
      imgCell,
      h('td', { class: 'p-2 align-top' }, h('div', { class: 'font-semibold text-slate-800', text: c.name || '—' }), h('div', { class: 'font-mono text-[11px] text-slate-500', text: c.cas || '' })),
      h('td', { class: 'p-2 align-top whitespace-nowrap text-slate-700', text: sizeOf(c) || '—' }),
      h('td', { class: 'p-2 align-top text-slate-700', text: c.location || '—' }),
      h('td', { class: 'p-2 align-top hidden md:table-cell font-mono text-xs text-slate-600', text: c.barcode || '—' }),
      h('td', { class: 'p-2 align-top hidden lg:table-cell text-slate-700', text: c.supplier || '—' }));
    const open = () => openDetail(c, tr);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    body.appendChild(tr);
    imgCell._job = { img, c, fallback: state.fallbackCid };
    lazy.observe(imgCell);
  }
  document.querySelectorAll('.sort-btn').forEach(b => { b.classList.toggle('asc', b.dataset.sort === state.sort.key && state.sort.dir === 1); b.classList.toggle('desc', b.dataset.sort === state.sort.key && state.sort.dir === -1); });
  const total = state.rows.length;
  if (total) $('message').textContent = (rows.length === total ? total : rows.length + ' of ' + total) + ' container' + (total === 1 ? '' : 's') + (state.note ? ' — ' + state.note : '');
}
function renderFacets() {
  $('facets').hidden = state.rows.length === 0;
  for (const [key, label] of [['location', 'Location'], ['supplier', 'Supplier']]) {
    const counts = new Map();
    state.rows.forEach(c => { const v = c[key]; if (v) counts.set(v, (counts.get(v) || 0) + 1); });
    const box = $('facet-' + key); box.replaceChildren();
    if (!counts.size) continue;
    box.append(h('div', { class: 'text-[11px] font-semibold text-slate-500 mt-3 mb-1', text: label }));
    [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([v, n]) =>
      box.append(h('button', { type: 'button', class: 'facet-row' + (state.filters[key] === v ? ' on' : ''), title: v,
        onclick: () => { state.filters[key] = state.filters[key] === v ? null : v; renderFacets(); renderResults(); renderChips(); } },
        h('span', { text: v }), h('span', { text: n }))));
  }
  renderChips();
}
function renderChips() {
  const box = $('active-filters'); box.replaceChildren();
  for (const k of ['location', 'supplier']) if (state.filters[k])
    box.append(h('span', { class: 'fchip' }, state.filters[k], h('button', { type: 'button', 'aria-label': 'Remove filter', text: '×', onclick: () => { state.filters[k] = null; renderFacets(); renderResults(); } })));
}
document.querySelectorAll('.sort-btn').forEach(b => b.addEventListener('click', () => {
  state.sort = state.sort.key === b.dataset.sort ? { key: b.dataset.sort, dir: -state.sort.dir } : { key: b.dataset.sort, dir: 1 };
  renderResults();
}));

// ---------- detail panel ----------
function copyBtn(text) {
  return h('button', { type: 'button', class: 'text-slate-400 hover:text-slate-800 ml-2', 'aria-label': 'Copy', title: 'Copy',
    onclick: async e => { try { await navigator.clipboard.writeText(text); e.currentTarget.textContent = '✓'; setTimeout(() => e.currentTarget && (e.currentTarget.textContent = '⧉'), 1200); } catch {} }, text: '⧉' });
}
function field(label, value, copy) {
  return h('div', {}, h('div', { class: 'text-[10px] font-bold uppercase tracking-wider text-slate-400', text: label }),
    h('div', { class: 'text-sm text-slate-800 break-words' }, value || '—', copy && value ? copyBtn(value) : null));
}
async function openDetail(c, tr) {
  state.selected = c;
  document.querySelectorAll('#results tr.sel').forEach(r => r.classList.remove('sel')); tr && tr.classList.add('sel');
  const big = h('img', { alt: 'Structure of ' + (c.name || ''), class: 'w-full max-w-[220px] mx-auto bg-white border border-slate-100 hidden' });
  const link = h('div', {});
  $('detail-body').replaceChildren(
    h('div', { class: 'text-center' }, big),
    h('h4', { class: 'font-bold text-slate-900 text-base leading-snug', text: c.name || 'Unnamed chemical' }),
    field('CAS number', c.cas, true), field('Container size', sizeOf(c)), field('Location', c.location),
    field('Barcode', c.barcode, true), field('Supplier', c.supplier), link,
    h('a', { href: 'https://app.cheminventory.net', target: '_blank', rel: 'noopener noreferrer', class: 'block text-center text-xs font-semibold border border-slate-300 py-2 hover:bg-slate-100', text: 'Open in ChemInventory ↗' }));
  $('detail').classList.remove('hidden'); document.body.classList.add('inv-detail-open');
  const d = await resolveStructure(c); const cid = d && d.cid || state.fallbackCid;
  if (state.selected !== c || !cid) return;
  big.src = pubchemPng(cid, 300); big.classList.remove('hidden');
  link.append(h('a', { href: 'https://pubchem.ncbi.nlm.nih.gov/compound/' + encodeURIComponent(cid), target: '_blank', rel: 'noopener noreferrer', class: 'text-xs text-blue-700 underline', text: 'View on PubChem (CID ' + cid + ') ↗' }));
}
function closeDetail() { state.selected = null; $('detail').classList.add('hidden'); document.body.classList.remove('inv-detail-open'); document.querySelectorAll('#results tr.sel').forEach(r => r.classList.remove('sel')); }
$('detail-close').addEventListener('click', closeDetail);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// ---------- search ----------
$('type').addEventListener('change', () => {
  $('query').placeholder = $('type').value === 'smiles' ? 'Enter SMILES, e.g. CC(=O)O' : 'Search name, CAS, barcode or SMILES…';
});
$('search').addEventListener('submit', async e => {
  e.preventDefault();
  setView('search');
  const mine = ++state.token;                     // ignore late answers from older searches
  const type = $('type').value, q = $('query').value.trim();
  if (!q) return;
  closeDetail();
  $('message').textContent = 'Searching…'; $('results').replaceChildren(); $('empty-state').hidden = true;
  $('structure-preview').replaceChildren(); $('structure-preview').classList.add('hidden');
  try {
    let data;
    if (type === 'smiles') {
      data = await authedFetch('/api/structure/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smiles: q }) });
      if (mine !== state.token) return;
      if (data.cid) {
        $('structure-preview').append(h('img', { src: pubchemPng(data.cid, 300), width: 120, height: 120, alt: 'PubChem 2D structure', class: 'bg-white border border-slate-100' }),
          h('p', { class: 'text-xs text-slate-600', text: 'PubChem CID ' + data.cid + '. ' + (data.message || '') }));
        $('structure-preview').classList.remove('hidden');
      }
    } else {
      data = await api('/api/search?type=' + encodeURIComponent(type) + '&q=' + encodeURIComponent(q));
      if (mine !== state.token) return;
    }
    Object.assign(state, { rows: data.containers || [], fallbackCid: data.cid || null, note: type === 'smiles' ? '' : (data.message || ''),
      filters: { location: null, supplier: null }, selected: null });
    state.emptyText = 'No containers found.';
    if (!state.rows.length) $('message').textContent = 'No containers found' + (data.message ? ' — ' + data.message : '.');
    renderFacets(); renderResults();
  } catch (err) { if (mine === state.token) { $('message').textContent = err.message; $('empty-state').hidden = false; } }
});

// ---------- CSV export ----------
$('export-csv').addEventListener('click', () => {
  const rows = visibleRows();
  if (!rows.length) { $('message').textContent = 'Nothing to export — run a search first.'; return; }
  const cell = v => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const lines = [['Chemical', 'CAS', 'Size', 'Location', 'Barcode', 'Supplier'].map(cell).join(',')]
    .concat(rows.map(c => [c.name, c.cas, sizeOf(c), c.location, c.barcode, c.supplier].map(cell).join(',')));
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: 'inventory_' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- sidebar views, orders, watchlists ----------
function setView(v) {
  state.view = v;
  document.querySelectorAll('.inv-nav').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  ['search', 'orders', 'watchlists'].forEach(n => { $('view-' + n).hidden = n !== v; });
  if (v !== 'search') closeDetail();
}
document.querySelectorAll('.inv-nav').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
async function loadPanels() {
  try {
    const orders = await api('/api/orders');
    $('count-orders').textContent = orders.length || '';
    const body = $('orders'); body.replaceChildren();
    if (!orders.length) body.append(h('tr', {}, h('td', { colspan: 4, class: 'p-6 text-center text-slate-400', text: 'No open orders.' })));
    orders.forEach(o => body.append(h('tr', {}, h('td', { class: 'p-3 font-semibold text-slate-800', text: o.name || '—' }), h('td', { class: 'p-3', text: o.size || '—' }), h('td', { class: 'p-3', text: o.supplier || '—' }), h('td', { class: 'p-3 text-slate-600', text: o.dateordered || '—' }))));
  } catch (e) { $('orders').replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'p-6 text-center text-rose-600', text: 'Unable to load orders.' }))); }
  try {
    const data = await api('/api/watchlists');
    const box = $('watchlists'); box.replaceChildren();
    let n = 0;
    for (const [scope, list] of Object.entries(data)) {
      if (!list.length) continue; n += list.length;
      box.append(h('div', { class: 'text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1', text: scope }),
        h('ul', { class: 'divide-y divide-slate-100 border border-slate-100' }, list.map(w => h('li', { class: 'px-3 py-2 text-sm text-slate-700', text: w.name || '—' }))));
    }
    if (!n) box.append(h('p', { class: 'text-slate-400 text-center py-6', text: 'No watchlists.' }));
    $('count-watchlists').textContent = n || '';
  } catch (e) { $('watchlists').replaceChildren(h('p', { class: 'text-rose-600', text: 'Unable to load watchlists.' })); }
}
refresh();
