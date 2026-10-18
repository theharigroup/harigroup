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
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(response.status === 403 ? 'Your account is not approved for inventory access.' : (body.detail || 'Request failed ('+response.status+').')); }
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
    structureCache.set(key, api('/api/structure/resolve?' + params).catch(error => ({error: error.message})));
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
    const indicator = document.createElement('span'); indicator.className = 'text-xs text-slate-500'; indicator.textContent = 'Loading structure…';
    td.appendChild(indicator); tr.appendChild(td);
    for (const key of ['name','cas','size','location','barcode','supplier'])
      cell(tr, key === 'size' ? [c.size,c.unit].filter(Boolean).join(' ') : c[key]);
    $('results').appendChild(tr);
    resolveStructure(c).then(data => {
      const cid = data?.cid || fallbackCid;
      if (cid) {
        img.onload = () => indicator.replaceWith(img);
        img.onerror = () => { indicator.textContent = 'Image unavailable'; };
        img.src = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + encodeURIComponent(cid) + '/PNG?image_size=200x200';
      } else { indicator.textContent = data?.error ? 'Lookup failed' : 'Not available'; indicator.title = data?.error || ''; }
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


// V3 molecular search — the separate structure index is not the ChemInventory database.
let jsmeApplet = null;
window.jsmeOnLoad = function () {
  try {
    jsmeApplet = new JSApplet.JSME('jsme_container', '640px', '340px', {options:'query,hydrogens'});
  } catch (e) { $('jsme_container').textContent = 'Drawing editor unavailable; enter SMILES instead.'; }
};
$('use-drawing').addEventListener('click', () => {
  if (!jsmeApplet) { $('match-message').textContent='Editor not loaded. Paste a SMILES string.'; return; }
  try { $('draw-smiles').value = jsmeApplet.smiles(); }
  catch (e) { $('match-message').textContent='Could not export SMILES. Paste it manually.'; }
});
async function authorizedFetch(path, options={}) {
  const {data:{session:current}} = await client.auth.getSession();
  if (!current) throw new Error('Sign in first');
  const headers = {...options.headers, Authorization:'Bearer '+current.access_token};
  const r=await fetch(cfg.apiBase.replace(/\/$/,'')+path,{...options,headers});
  const result=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(result.detail || 'Request failed ('+r.status+')');
  return result;
}
$('match-search').addEventListener('click', async()=>{
  const smiles=$('draw-smiles').value.trim();
  if(!smiles){$('match-message').textContent='Enter or draw a structure first.';return;}
  $('match-results').replaceChildren(); $('match-message').textContent='Searching indexed structures…';
  try {
    const result=await authorizedFetch('/api/structure/match',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({smiles,mode:$('match-mode').value,threshold:Number($('similarity-threshold').value),limit:100})
    });
    $('match-message').textContent=`${result.total_matches} structure match(es); ${result.indexed_compounds} indexed compounds. ${result.coverage}.`;
    for(const match of result.matches){
      const tr=document.createElement('tr');tr.className='border-b border-slate-200';
      const td=document.createElement('td');td.className='p-2';
      const img=document.createElement('img');img.width=120;img.height=90;img.alt='RDKit molecular structure';
      // Use authenticated fetch to avoid putting unpublished structures into third-party URLs.
      td.textContent='Loading…';tr.appendChild(td);
      (async()=>{try{const {data:{session:current}}=await client.auth.getSession();const response=await fetch(cfg.apiBase.replace(/\/$/,'')+'/api/structure/draw?smiles='+encodeURIComponent(match.smiles),{headers:{Authorization:'Bearer '+current.access_token}});if(!response.ok)throw new Error('Unavailable');const blob=await response.blob();const url=URL.createObjectURL(blob);img.onload=()=>URL.revokeObjectURL(url);img.src=url;td.replaceChildren(img);}catch(e){td.textContent=match.smiles;}})();
      cell(tr,match.name);cell(tr,match.cas);cell(tr,match.score.toFixed(3));
      const action=document.createElement('td');action.className='p-2';
      const button=document.createElement('button');button.type='button';button.textContent='Check containers';button.className='border rounded px-2 py-1 bg-white';
      button.addEventListener('click',async()=>{
        button.disabled=true;button.textContent='Checking…';
        try {const live=await api('/api/search?type=cas&q='+encodeURIComponent(match.cas));
          const exact=(live.containers||[]).filter(c=>String(c.cas||'').trim()===match.cas);
          renderResults(exact); $('message').textContent=exact.length+' live container(s) for CAS '+match.cas;
          button.textContent=exact.length+' container(s)';
        }catch(e){button.textContent='Lookup failed';button.title=e.message;}
        finally{button.disabled=false;}
      });
      action.appendChild(button);tr.appendChild(action);$('match-results').appendChild(tr);
    }
  }catch(e){$('match-message').textContent=e.message;}
});
$('index-upload').addEventListener('click',async()=>{
  const file=$('index-file').files[0];if(!file){$('index-status').textContent='Choose a CSV file first.';return;}
  $('index-status').textContent='Importing…';
  try {const form=new FormData();form.append('file',file);
    const data=await authorizedFetch('/api/structure/index/import',{method:'POST',body:form});
    $('index-status').textContent=`Imported ${data.imported} records. Total indexed: ${data.indexed_compounds}.`;
  }catch(e){$('index-status').textContent=e.message;}
});
