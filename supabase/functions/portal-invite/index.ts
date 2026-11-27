// Edge Function "portal-invite": admin actions on one person.
//   { email, app: "invoice" | "booking" }                      -> email a "set your password" link
//   { email, app: "invoice" | "booking", action: "delete" }    -> remove the person from that portal
// New person -> Supabase invitation (creates the account). Existing account -> password reset link.
// invoice: caller must be an active Administrator in `staff`, target must be active staff.
// booking: caller must be an active admin in `booking_members`, target must be an active booking member.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://harigroup.orgchem.iisc.ac.in/';
const PAGE: Record<string, string> = { invoice: SITE + 'invoice.html', booking: SITE + 'booking.html' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });


// Removes one person from one portal's list. Never yourself, never the last active admin.
// Booking: their upcoming bookings are cancelled (history is kept). The login account is deleted only
// when the person is on neither portal's list any more.
async function removePerson(db: any, table: 'staff' | 'booking_members', email: string, me: string) {
  if (!email) return json({ error: 'No email given.' }, 400);
  if (email === me) return json({ error: 'You cannot delete yourself.' }, 400);
  const { data: t } = await db.from(table).select('email').eq('email', email).maybeSingle();
  if (!t) return json({ error: 'This person is not on the list.' }, 404);

  const adminCol = table === 'staff' ? { col: 'role', val: 'Administrator', on: 'active', onVal: true } : { col: 'role', val: 'admin', on: 'status', onVal: 'active' };
  const { data: target } = await db.from(table).select('*').eq('email', email).maybeSingle();
  if (target && target[adminCol.col] === adminCol.val && target[adminCol.on] === adminCol.onVal) {
    const { count } = await db.from(table).select('email', { count: 'exact', head: true }).eq(adminCol.col, adminCol.val).eq(adminCol.on, adminCol.onVal).neq('email', email);
    if (!count) return json({ error: 'At least one active administrator is required.' }, 400);
  }

  if (table === 'booking_members') {
    const c = await db.from('bookings').update({ cancelled_at: new Date().toISOString() })
      .eq('member_email', email).eq('kind', 'booking').is('cancelled_at', null).gt('ends_at', new Date().toISOString());
    if (c.error) return json({ error: 'Could not cancel their upcoming bookings.' }, 500);
  }
  const del = await db.from(table).delete().eq('email', email);
  if (del.error) return json({ error: 'Could not delete this person.' }, 500);

  // delete the login only if no other portal still lists this person
  const other = table === 'staff' ? 'booking_members' : 'staff';
  const { data: still } = await db.from(other).select('email').eq('email', email).maybeSingle();
  let accountDeleted = false;
  if (!still) {
    for (let page = 1; page <= 10 && !accountDeleted; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      const u = (data?.users ?? []).find((x: any) => (x.email ?? '').toLowerCase() === email);
      if (u) { await db.auth.admin.deleteUser(u.id); accountDeleted = true; }
      if (!data?.users?.length || data.users.length < 200) break;
    }
  }
  return json({ ok: true, deleted: true, accountDeleted });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;

  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Please sign in again.' }, 401);
  const me = user.email.toLowerCase();

  let email = '', app = '', action = '';
  try { const b = await req.json(); email = String(b.email ?? '').trim().toLowerCase(); app = String(b.app ?? ''); action = String(b.action ?? ''); } catch (_) { /* ignore */ }
  if (!PAGE[app]) return json({ error: 'Unknown portal.' }, 400);

  const db = createClient(url, svc);
  if (app === 'invoice') {
    const { data: a } = await db.from('staff').select('role,active').eq('email', me).maybeSingle();
    if (!a || a.role !== 'Administrator' || !a.active) return json({ error: 'Only administrators can send these links.' }, 403);
    if (action === 'delete') return await removePerson(db, 'staff', email, me);
    const { data: t } = await db.from('staff').select('active').eq('email', email).maybeSingle();
    if (!t) return json({ error: 'Add this person to the staff list first.' }, 400);
    if (!t.active) return json({ error: 'This person is switched off.' }, 400);
  } else {
    const { data: a } = await db.from('booking_members').select('role,status').eq('email', me).maybeSingle();
    if (!a || a.role !== 'admin' || a.status !== 'active') return json({ error: 'Only admins can send these links.' }, 403);
    if (action === 'delete') return await removePerson(db, 'booking_members', email, me);
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
