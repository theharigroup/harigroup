// Supabase Edge Function "booking-email": emails ONLY the member who made or cancelled a booking.
// Deploy:  supabase functions deploy booking-email --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=... MAIL_FROM="Hari Group Booking <booking@yourdomain>" WEBHOOK_SECRET=<long random text>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically. Pair with docs/booking-email.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  const { type, record, old_record } = await req.json();
  if (!record || record.kind !== 'booking') return new Response('skip');
  let action = '';
  if (type === 'INSERT' && !record.cancelled_at) action = 'confirmed';
  else if (type === 'UPDATE' && record.cancelled_at && !old_record?.cancelled_at) action = 'cancelled';
  else return new Response('skip');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: inst } = await db.from('booking_instruments').select('name').eq('id', record.instrument_id).single();
  const name = inst?.name ?? 'Instrument';
  const subject = `Booking ${action}: ${name}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#263A67">Booking ${action}</h2>
    <p>Hello ${esc(record.member_name)},</p>
    <p>Your booking has been <b>${action}</b>.</p>
    <table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#64748b">Instrument</td><td><b>${esc(name)}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">From</td><td>${esc(when(record.starts_at))} IST</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">To</td><td>${esc(when(record.ends_at))} IST</td></tr></table>
    <p style="color:#64748b;font-size:12px">Hari Group Instrument Booking, IISc Bangalore</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: [record.member_email], subject, html }),   // only the booker
  });
  return new Response(r.ok ? 'sent' : 'mail error', { status: r.ok ? 200 : 502 });
});
