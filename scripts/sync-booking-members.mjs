// Adds people listed in team.html to the booking system (name + email), with access to every active instrument.
// Only NEW people are added: anyone already in booking_members is left exactly as the admin set them.
// Needs env SUPABASE_URL and SUPABASE_SERVICE_KEY (GitHub secrets). Run: node scripts/sync-booking-members.mjs
import { readFileSync } from 'node:fs';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(1); }

const src = readFileSync('team.html', 'utf8');
const start = src.indexOf('const members = [');
const end = src.indexOf('];', start);
if (start < 0 || end < 0) { console.error('Could not find the members list in team.html'); process.exit(1); }
const block = src.slice(start, end);
const people = [];
for (const m of block.matchAll(/\{[^{}]*?\}/gs)) {
  const o = m[0];
  const name = (o.match(/\bname:\s*"([^"]+)"/) || [])[1];
  const email = (o.match(/\bemail:\s*"([^"]+)"/) || [])[1];
  if (name && email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) people.push({ name: name.trim(), email: email.trim().toLowerCase() });
}
console.log(`Found ${people.length} people with an email in team.html`);

const H = { apikey: KEY, 'Content-Type': 'application/json' };
if (KEY.split('.').length === 3) H.Authorization = 'Bearer ' + KEY;   // legacy JWT-style key
async function api(path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const existing = new Set((await api('booking_members?select=email')).map(x => x.email));
const fresh = people.filter(p => !existing.has(p.email));
if (!fresh.length) { console.log('Nobody new to add.'); process.exit(0); }

const instruments = await api('booking_instruments?select=id&active=eq.true');
await api('booking_members', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  body: JSON.stringify(fresh.map(p => ({ email: p.email, name: p.name, role: 'member', status: 'active' }))) });
const access = fresh.flatMap(p => instruments.map(i => ({ email: p.email, instrument_id: i.id })));
if (access.length) await api('booking_access', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(access) });
console.log('Added: ' + fresh.map(p => p.email).join(', '));

// Welcome email, only to the people just added. Skipped when SEND_WELCOME is not "true" or Resend is not configured.
const RESEND = process.env.RESEND_API_KEY, FROM = process.env.MAIL_FROM;
if (process.env.SEND_WELCOME !== 'true') { console.log('Welcome emails off for this run.'); process.exit(0); }
if (!RESEND || !FROM) { console.log('RESEND_API_KEY / MAIL_FROM not set: welcome emails skipped.'); process.exit(0); }
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = 'https://harigroup.orgchem.iisc.ac.in/booking.html';
for (const p of fresh) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#263A67">Welcome to Instrument Booking</h2>
  <p>Hello ${esc(p.name)},</p>
  <p>You have been added to the Hari Group instrument booking system and can book ElectraSyn 2.0, PhotoCube and the IKA RCT Screening System.</p>
  <p><b>To start:</b> open the booking page, choose <b>First Time Here? Create Password</b>, use this email address (${esc(p.email)}), and confirm the email we send you.</p>
  <p><a href="${PAGE}" style="display:inline-block;background:#263A67;color:#fff;padding:10px 18px;text-decoration:none;font-weight:bold">Open Instrument Booking</a></p>
  <p style="color:#64748b;font-size:12px">Hari Group, IISc Bangalore</p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [p.email], subject: 'Welcome to Hari Group Instrument Booking', html }) });
  console.log('Welcome email', p.email, r.ok ? 'sent' : 'failed ' + r.status);
}
