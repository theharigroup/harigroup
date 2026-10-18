import os
from functools import lru_cache
import httpx
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from jose import jwt, JWTError

BASE = os.getenv('CHEMINVENTORY_URL', 'https://app.cheminventory.net').rstrip('/')
TOKEN = os.getenv('CHEMINVENTORY_API_TOKEN', '')
ORIGIN = os.getenv('FRONTEND_ORIGIN', '')
SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_AUDIENCE = os.getenv('SUPABASE_AUDIENCE', 'authenticated')
ALLOWED_EMAILS = {x.strip().lower() for x in os.getenv('ALLOWED_EMAILS', '').split(',') if x.strip()}
app = FastAPI(title='Hari Group Inventory API', docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN] if ORIGIN else [], allow_methods=['GET', 'POST'], allow_headers=['Authorization'])

@lru_cache(maxsize=1)
def jwks():
    if not SUPABASE_URL: raise HTTPException(503, 'Auth not configured')
    try:
        r = httpx.get(f'{SUPABASE_URL}/auth/v1/.well-known/jwks.json', timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        raise HTTPException(503, 'Authentication keys unavailable')

def authorized(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401, 'Sign in required')
    token = authorization[7:]
    try:
        header = jwt.get_unverified_header(token)
        key = next(k for k in jwks().get('keys', []) if k.get('kid') == header.get('kid'))
        claims = jwt.decode(token, key, algorithms=['RS256', 'ES256'], audience=SUPABASE_AUDIENCE, issuer=f'{SUPABASE_URL}/auth/v1')
    except (JWTError, StopIteration, ValueError, KeyError):
        raise HTTPException(401, 'Invalid session')
    email = str(claims.get('email', '')).lower()
    if not ALLOWED_EMAILS or email not in ALLOWED_EMAILS or claims.get('role') != 'authenticated':
        raise HTTPException(403, 'Not approved for Hari Group inventory')
    return email

async def chem(endpoint: str, extra: dict | None = None):
    if not TOKEN: raise HTTPException(503, 'ChemInventory token not configured')
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(f'{BASE}/api/{endpoint}', json={'authtoken': TOKEN, **(extra or {})})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, 'ChemInventory service unavailable')
    if payload.get('status') != 'success': raise HTTPException(502, 'ChemInventory request failed')
    return payload.get('data')

@app.get('/health')
def health(): return {'status':'ok'}

@app.get('/api/overview')
async def overview(_=Depends(authorized)):
    details = await chem('general/getdetails')
    user = details.get('user', {})
    return {'inventory_id': user.get('inventory'), 'inventory_name': user.get('inventoryname')}

@app.get('/api/search')
async def search(q: str = '', type: str = 'name', _=Depends(authorized)):
    q = q.strip()
    if not q or len(q) > 160: raise HTTPException(400, 'Query must be 1–160 characters')
    if type not in ('name', 'cas', 'barcode'): raise HTTPException(400, 'Unsupported search type')
    details = await chem('general/getdetails')
    inventory = details.get('user', {}).get('inventory')
    if not isinstance(inventory, int): raise HTTPException(502, 'Inventory ID unavailable')
    result = await chem('search/execute', {'inventory': inventory, 'type': type, 'contents': q})
    containers = result.get('containers', []) if isinstance(result, dict) else []
    return {'containers': [{'name': c.get('name'), 'cas': c.get('cas'), 'size': c.get('size'), 'unit': c.get('unit'), 'location': c.get('locationtext'), 'barcode': c.get('barcode'), 'supplier': c.get('supplier')} for c in containers]}

@app.get('/api/orders')
async def orders(_=Depends(authorized)):
    result = await chem('order/load')
    return [{'name': o.get('name'), 'size': o.get('size'), 'supplier': o.get('supplier'), 'dateordered': o.get('dateordered')} for o in result] if isinstance(result, list) else []

@app.get('/api/watchlists')
async def watchlists(_=Depends(authorized)):
    result = await chem('watchlist/load')
    return {scope: [{'name': w.get('name'), 'id': w.get('id')} for w in entries] for scope, entries in result.items() if isinstance(entries, list)} if isinstance(result, dict) else {}

# V2: public PubChem resolution. Never transmit ChemInventory tokens to PubChem.
import re
from fastapi import Body
from pydantic import BaseModel
CAS_RE = re.compile(r'^\d{2,7}-\d{2}-\d$')
PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

class StructureQuery(BaseModel):
    smiles: str = Field(min_length=1, max_length=350)

async def pubchem_cid(identifier: str, namespace: str = 'name'):
    try:
        async with httpx.AsyncClient(timeout=18, follow_redirects=False) as client:
            # POST avoids encoding problems for SMILES with #, /, +, etc.
            r = await client.post(f'{PUBCHEM}/compound/{namespace}/cids/JSON', data={namespace: identifier})
            if r.status_code in (400, 404): return None
            r.raise_for_status()
            ids = r.json().get('IdentifierList', {}).get('CID', [])
            return ids[0] if ids else None
    except (httpx.HTTPError, ValueError, KeyError):
        return None

@app.get('/api/structure/resolve')
async def resolve_structure(cas: str = '', name: str = '', _=Depends(authorized)):
    identifier = cas.strip() if cas.strip() else name.strip()
    if not identifier or len(identifier) > 180:
        raise HTTPException(400, 'Provide a chemical name or CAS number')
    cid = await pubchem_cid(identifier)
    return {'cid': cid, 'image_url': f'{PUBCHEM}/compound/cid/{cid}/PNG?image_size=300x300' if cid else None,
            'source': 'PubChem' if cid else None}

@app.post('/api/structure/search')
async def structure_search(body: StructureQuery, _=Depends(authorized)):
    smiles = body.smiles.strip()
    cid = await pubchem_cid(smiles, 'smiles')
    if not cid:
        return {'cid': None, 'containers': [], 'candidates': [], 'message': 'Structure could not be resolved by PubChem.'}
    try:
        async with httpx.AsyncClient(timeout=18) as client:
            r = await client.get(f'{PUBCHEM}/compound/cid/{cid}/synonyms/JSON')
            r.raise_for_status()
            synonyms = r.json().get('InformationList', {}).get('Information', [{}])[0].get('Synonym', [])
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        synonyms = []
    # PubChem synonyms are uncurated; candidate CAS values are not proof of identity.
    candidates = list(dict.fromkeys(s for s in synonyms if CAS_RE.fullmatch(s)))[:8]
    details = await chem('general/getdetails')
    inventory = details.get('user', {}).get('inventory') if isinstance(details, dict) else None
    if not isinstance(inventory, int): raise HTTPException(502, 'Inventory ID unavailable')
    found = []
    for cas in candidates:
        result = await chem('search/execute', {'inventory': inventory, 'type': 'cas', 'contents': cas})
        for c in result.get('containers', []) if isinstance(result, dict) else []:
            # Filter returned results to exact CAS (avoid substring matches).
            if str(c.get('cas', '')).strip() != cas: continue
            found.append({'name': c.get('name'), 'cas': c.get('cas'), 'size': c.get('size'),
                          'unit': c.get('unit'), 'location': c.get('locationtext'),
                          'barcode': c.get('barcode'), 'supplier': c.get('supplier')})
    unique = list({(str(c['cas']), str(c['barcode']), str(c['location'])): c for c in found}.values())
    return {'cid': cid, 'containers': unique, 'candidates': candidates,
            'image_url': f'{PUBCHEM}/compound/cid/{cid}/PNG?image_size=300x300',
            'message': 'Identifier-based exact candidate search; not substructure or similarity search.'}


# V3: local RDKit structure index. Populated only by an administrator CSV import.
# Keep DATABASE_PATH on persistent private storage; Render ephemeral filesystem is NOT durable.
import csv, io, sqlite3, json, asyncio
from pathlib import Path
from rdkit import Chem, DataStructs
from rdkit.Chem import Draw
from fastapi.responses import Response

DATABASE_PATH = os.getenv('STRUCTURE_DB_PATH', '/tmp/hari_structure_index.sqlite3')
ADMIN_EMAILS = {x.strip().lower() for x in os.getenv('STRUCTURE_ADMIN_EMAILS', '').split(',') if x.strip()}
INDEX_LIMIT = 25000

def database():
    path = Path(DATABASE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=15)
    db.execute('CREATE TABLE IF NOT EXISTS molecules (cas TEXT PRIMARY KEY, name TEXT, smiles TEXT NOT NULL)')
    return db

def parse_structure(text):
    mol = Chem.MolFromSmiles(text)
    if mol is None: raise ValueError('Invalid SMILES')
    return mol

def index_status():
    with database() as db:
        count = db.execute('SELECT COUNT(*) FROM molecules').fetchone()[0]
    return {'indexed_compounds': count, 'coverage': 'Imported CSV only; not necessarily the complete ChemInventory catalog', 'persistent_storage_configured': DATABASE_PATH.startswith('/var/data/')}

@app.get('/api/structure/index/status')
def structure_index_status(_=Depends(authorized)):
    return index_status()

@app.post('/api/structure/index/import')
async def structure_index_import(file: UploadFile = File(...), email=Depends(authorized)):
    if not ADMIN_EMAILS or email not in ADMIN_EMAILS:
        raise HTTPException(403, 'Only approved structure index administrators may import')
    raw = await file.read(5_000_001)
    if len(raw) > 5_000_000: raise HTTPException(413, 'CSV exceeds 5 MB')
    try:
        reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
        if not reader.fieldnames or not {'cas','smiles'}.issubset({k.strip().lower() for k in reader.fieldnames}):
            raise HTTPException(400, 'CSV must have cas and smiles columns (optional name)')
        rows = []
        for record in reader:
            normalized = {k.strip().lower(): (v or '').strip() for k,v in record.items() if k}
            cas, smiles = normalized.get('cas',''), normalized.get('smiles','')
            if not cas or not smiles: continue
            if len(cas) > 80 or len(smiles) > 600: continue
            mol = Chem.MolFromSmiles(smiles)
            if mol is None: continue
            rows.append((cas, normalized.get('name','')[:250], Chem.MolToSmiles(mol)))
            if len(rows) > INDEX_LIMIT: raise HTTPException(413, 'Too many CSV records')
        with database() as db:
            db.executemany('INSERT INTO molecules(cas,name,smiles) VALUES(?,?,?) ON CONFLICT(cas) DO UPDATE SET name=excluded.name, smiles=excluded.smiles', rows)
        return {'imported':len(rows), **index_status()}
    except UnicodeError:
        raise HTTPException(400, 'Upload UTF-8 CSV')

class MatchRequest(BaseModel):
    smiles: str = Field(min_length=1, max_length=600)
    mode: str = 'exact'
    threshold: float = Field(default=0.65, ge=0.1, le=1)
    limit: int = Field(default=50, ge=1, le=100)

@app.post('/api/structure/match')
async def structure_match(body: MatchRequest, _=Depends(authorized)):
    if body.mode not in ('exact','substructure','similarity'):
        raise HTTPException(400, 'Invalid match mode')
    try: query = parse_structure(body.smiles)
    except ValueError: raise HTTPException(400, 'Invalid SMILES')
    query_smiles = Chem.MolToSmiles(query)
    from rdkit.Chem import rdFingerprintGenerator
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    if body.mode == 'similarity': query_fp = generator.GetFingerprint(query)
    with database() as db:
        entries = db.execute('SELECT cas,name,smiles FROM molecules').fetchall()
    matches=[]
    for cas,name,smiles in entries:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None: continue
        score = 1.0
        if body.mode == 'exact':
            if Chem.MolToSmiles(mol) != query_smiles: continue
        elif body.mode == 'substructure':
            if not mol.HasSubstructMatch(query): continue
        else:
            score = DataStructs.TanimotoSimilarity(query_fp, generator.GetFingerprint(mol))
            if score < body.threshold: continue
        matches.append({'cas':cas,'name':name,'smiles':smiles,'score':round(score,3)})
    matches.sort(key=lambda x:(-x['score'],x['name']))
    return {'matches':matches[:body.limit], 'total_matches':len(matches), **index_status(), 'note':'Structure matches are against the imported index only. Confirm stock and locations in live ChemInventory.'}

@app.get('/api/structure/draw')
def draw_structure(smiles: str, _=Depends(authorized)):
    if len(smiles) > 600: raise HTTPException(400, 'SMILES too long')
    try: mol = parse_structure(smiles)
    except ValueError: raise HTTPException(400, 'Invalid SMILES')
    return Response(content=_mol_png(mol),media_type='image/png')

def _mol_png(mol):
    buf=io.BytesIO()
    Draw.MolToImage(mol,size=(320,220)).save(buf,format='PNG')
    return buf.getvalue()
