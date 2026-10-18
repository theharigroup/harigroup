const cfg = window.HARI_CONFIG;
const $ = id => document.getElementById(id);
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
$('search').addEventListener('submit', async e => {e.preventDefault(); $('message').textContent='Searching…'; $('results').replaceChildren(); try {const data=await api('/api/search?type='+encodeURIComponent($('type').value)+'&q='+encodeURIComponent($('query').value)); for(const c of data.containers){const tr=document.createElement('tr'); for(const key of ['name','cas','size','location','barcode','supplier']) cell(tr,key==='size' ? [c.size,c.unit].filter(Boolean).join(' ') : c[key]); $('results').appendChild(tr);} $('message').textContent=data.containers.length+' container(s) found';}catch(err){$('message').textContent=err.message;}});
async function loadPanels(){for(const [endpoint,id,formatter] of [['/api/orders','orders',x=>x.name],['/api/watchlists','watchlists',x=>x.name]]){try{const data=await api(endpoint);const values=Array.isArray(data)?data:Object.values(data).flat();$(id).textContent=values.length?values.slice(0,15).map(formatter).join(' • '):'No records';}catch(e){$(id).textContent='Unable to load';}}}
client.auth.onAuthStateChange((_event, nextSession)=>{session=nextSession;}); refresh();
