const cfg = window.HARI_CONFIG;
const $ = id => document.getElementById(id);
if (!cfg || !cfg.apiBase || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
  document.getElementById('setup').classList.remove('hidden');
  document.getElementById('auth').hidden = true;
  throw new Error('Inventory portal public configuration is missing');
}
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
let session = null;
function cell(row, value) { const td = document.createElement('td'); td.textContent = value == null ? '—' : String(value); row.appendChild(td); }
async function api(path) {
  const response = await fetch(cfg.apiBase.replace(/\/$/,'') + path, {headers:{Authorization:'Bearer '+session.access_token}});
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account is not approved for inventory access.' : 'Request failed ('+response.status+').');
  return response.json();
}
async function refresh() {
  const {data} = await client.auth.getSession(); session = data.session;
  $('auth').hidden = !!session; $('portal').hidden = !session;
  if (session) { $('member').textContent = session.user.email; try {const o = await api('/api/overview'); $('message').textContent = 'Connected to '+(o.inventory_name || 'ChemInventory'); loadPanels();} catch(e) {$('message').textContent=e.message;} }
}
$('login').addEventListener('submit', async e => { e.preventDefault(); $('loginError').textContent=''; const {error} = await client.auth.signInWithPassword({email:$('email').value,password:$('password').value}); if(error) $('loginError').textContent=error.message; else refresh(); });
$('logout').addEventListener('click', async () => {await client.auth.signOut(); refresh();});
const structureCache = new Map();
async function resolveStructure(c) {
  const key = (c.cas || c.name || '').trim();
  if (!key) return null;
  if (!structureCache.has(key)) {
    const params = new URLSearchParams(c.cas ? {cas:c.cas} : {name:c.name});
    structureCache.set(key, api('/api/structure/resolve?' + params).catch(() => null));
  }
  return structureCache.get(key);
}
function renderResults(containers, fallbackCid = null) {
  $('results').replaceChildren();
  for (const c of containers) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'p-2';
    const img = document.createElement('img');
    img.alt = '2D molecular structure (PubChem)';
    img.width = 100; img.height = 100; img.loading = 'lazy';
    img.className = 'object-contain bg-white border border-slate-100 rounded';
    td.appendChild(img); tr.appendChild(td);
    for (const key of ['name','cas','size','location','barcode','supplier'])
      cell(tr, key === 'size' ? [c.size,c.unit].filter(Boolean).join(' ') : c[key]);
    $('results').appendChild(tr);
    resolveStructure(c).then(data => {
      const cid = data?.cid || fallbackCid;
      if (cid) img.src = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + encodeURIComponent(cid) + '/PNG?image_size=200x200';
      else { img.replaceWith(document.createTextNode('Not available')); }
    });
  }
}
$('type').addEventListener('change', () => {
  $('query').placeholder = $('type').value === 'smiles' ? 'Enter SMILES, e.g. CC(=O)O' : 'Enter chemical name, CAS or barcode';
});
$('search').addEventListener('submit', async e => {
  e.preventDefault();
  $('message').textContent = 'Searching…'; $('results').replaceChildren();
  $('structure-preview').replaceChildren(); $('structure-preview').classList.add('hidden');
  try {
    const type = $('type').value, q = $('query').value.trim();
    let data;
    if (type === 'smiles') {
      const response = await fetch(cfg.apiBase.replace(/\/$/,'') + '/api/structure/search', {
        method:'POST', headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({smiles:q})
      });
      if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.detail || 'Structure search failed ('+response.status+')'); }
      data = await response.json();
      if (data.image_url) {
        const img = document.createElement('img'); img.src = data.image_url; img.width = 170; img.height = 170; img.alt = 'PubChem 2D structure';
        const note = document.createElement('p'); note.textContent = 'PubChem CID: '+data.cid+'. Candidate CAS-based inventory matches; not a substructure search.';
        $('structure-preview').append(img,note); $('structure-preview').classList.remove('hidden');
      }
    } else {
      data = await api('/api/search?type='+encodeURIComponent(type)+'&q='+encodeURIComponent(q));
    }
    renderResults(data.containers || [], data.cid || null);
    $('message').textContent = (data.containers || []).length + ' container(s) found' + (data.message ? ' — '+data.message : '');
  } catch(err) { $('message').textContent = err.message; }
});
async function loadPanels(){for(const [endpoint,id,formatter] of [['/api/orders','orders',x=>x.name],['/api/watchlists','watchlists',x=>x.name]]){try{const data=await api(endpoint);const values=Array.isArray(data)?data:Object.values(data).flat();$(id).textContent=values.length?values.slice(0,15).map(formatter).join(' • '):'No records';}catch(e){$(id).textContent='Unable to load';}}}
client.auth.onAuthStateChange((_event, nextSession)=>{session=nextSession;}); refresh();
