// Edge Function "portal-invite": an admin asks for a "set your password" email to go to one person.
//   { email, app: "invoice" | "booking" }
// New person -> Supabase invitation (creates the account). Existing account -> password reset link.
// invoice: caller must be an active Administrator in `staff`, target must be active staff.
// booking: caller must be an active admin in `booking_members`, target must be an active booking member.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://harigroup.orgchem.iisc.ac.in/';
const PAGE: Record<string, string> = { invoice: SITE + 'invoice.html', booking: SITE + 'booking.html' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Please sign in again.' }, 401);
  const me = user.email.toLowerCase();

  let email = '', app = '';
  try { const b = await req.json(); email = String(b.email ?? '').trim().toLowerCase(); app = String(b.app ?? ''); } catch (_) { /* ignore */ }
  if (!PAGE[app]) return json({ error: 'Unknown portal.' }, 400);

  const db = createClient(url, svc);
  if (app === 'invoice') {
    const { data: a } = await db.from('staff').select('role,active').eq('email', me).maybeSingle();
    if (!a || a.role !== 'Administrator' || !a.active) return json({ error: 'Only administrators can send these links.' }, 403);
    const { data: t } = await db.from('staff').select('active').eq('email', email).maybeSingle();
    if (!t) return json({ error: 'Add this person to the staff list first.' }, 400);
    if (!t.active) return json({ error: 'This person is switched off.' }, 400);
  } else {
    const { data: a } = await db.from('booking_members').select('role,status').eq('email', me).maybeSingle();
    if (!a || a.role !== 'admin' || a.status !== 'active') return json({ error: 'Only admins can send these links.' }, 403);
    const { data: t } = await db.from('booking_members').select('status').eq('email', email).maybeSingle();
    if (!t) return json({ error: 'Add this person as a member first.' }, 400);
    if (t.status !== 'active') return json({ error: 'This member is disabled.' }, 400);
  }

  const inv = await db.auth.admin.inviteUserByEmail(email, { redirectTo: PAGE[app] });
  if (!inv.error) return json({ ok: true, sent: 'invite' });

  // Already has an account (maybe from the other portal): send a normal password reset link instead.
  const rs = await createClient(url, anon).auth.resetPasswordForEmail(email, { redirectTo: PAGE[app] });
  if (rs.error) return json({ error: 'The email service did not accept the request. Try again later.' }, 502);
  return json({ ok: true, sent: 'reset' });
});
