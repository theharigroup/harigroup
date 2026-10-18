import os
from functools import lru_cache
import httpx
from fastapi import FastAPI, HTTPException, Depends, Header
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
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN] if ORIGIN else [], allow_methods=['GET'], allow_headers=['Authorization'])

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
