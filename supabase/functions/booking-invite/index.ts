// Edge Function "booking-invite": an admin asks for a "set your password" email to go to a booking member.
// New person -> Supabase invitation (creates the account). Existing account -> password reset link.
// Only signed-in, active admins listed in booking_members may call it, and only for emails already in booking_members.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://harigroup.orgchem.iisc.ac.in/booking.html';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Please sign in again.' }, 401);

  const db = createClient(url, svc);
  const { data: me } = await db.from('booking_members').select('role,status').eq('email', user.email.toLowerCase()).maybeSingle();
  if (!me || me.role !== 'admin' || me.status !== 'active') return json({ error: 'Only admins can send these links.' }, 403);

  let email = '';
  try { email = String((await req.json()).email ?? '').trim().toLowerCase(); } catch (_) { /* ignore */ }
  const { data: m } = await db.from('booking_members').select('email,status').eq('email', email).maybeSingle();
  if (!m) return json({ error: 'Add this person as a member first.' }, 400);
  if (m.status !== 'active') return json({ error: 'This member is disabled.' }, 400);

  const inv = await db.auth.admin.inviteUserByEmail(email, { redirectTo: SITE });
  if (!inv.error) return json({ ok: true, sent: 'invite' });

  // Already has an account: send a normal password reset link instead.
  const rs = await createClient(url, anon).auth.resetPasswordForEmail(email, { redirectTo: SITE });
  if (rs.error) return json({ error: 'The email service did not accept the request. Try again later.' }, 502);
  return json({ ok: true, sent: 'reset' });
});
