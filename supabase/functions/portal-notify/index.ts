// Edge Function "portal-notify": sends the portal e-mails through Gmail SMTP.
//   booking  -> the person who booked gets "confirmed" / "cancelled" (nobody else)
//   invoice  -> every active Lab Accountant gets "new invoice submitted" (also when a rejected invoice is re-submitted)
// Called only by the database triggers in docs/portal-notify.sql (header x-webhook-secret).
// Deploy with "Verify JWT" OFF (the secret header protects it).
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD, WEBHOOK_SECRET   (SUPABASE_URL / SERVICE_ROLE_KEY are automatic)
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const SITE = 'https://harigroup.orgchem.iisc.ac.in/';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const row = (k: string, v: string) => '<tr><td style="padding:4px 14px 4px 0;color:#64748b">' + k + '</td><td><b>' + v + '</b></td></tr>';
const shell = (title: string, body: string) =>
  '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1e293b"><h2 style="color:#263A67;margin:0 0 12px">' + title + '</h2>' + body +
  '<p style="color:#94a3b8;font-size:12px;margin-top:24px">Hari Group, IISc Bangalore. This is an automatic message.</p></div>';

const mailer = () => nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 465, secure: true,
  auth: { user: Deno.env.get('GMAIL_USER'), pass: Deno.env.get('GMAIL_APP_PASSWORD') },
});

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  const { kind, type, record, old_record } = await req.json();
  if (!record) return new Response('skip');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const from = '"Hari Group Portal" <' + Deno.env.get('GMAIL_USER') + '>';
  let to: string[] = [], subject = '', html = '';

  if (kind === 'booking') {
    if (record.kind !== 'booking') return new Response('skip');
    let action = '';
    if (type === 'INSERT' && !record.cancelled_at) action = 'confirmed';
    else if (type === 'UPDATE' && record.cancelled_at && !old_record?.cancelled_at) action = 'cancelled';
    else return new Response('skip');
    const { data: inst } = await db.from('booking_instruments').select('name').eq('id', record.instrument_id).maybeSingle();
    const name = inst?.name ?? 'Instrument';
    to = [record.member_email];
    subject = 'Booking ' + action + ': ' + name;
    html = shell('Booking ' + action,
      '<p>Hello ' + esc(record.member_name) + ',</p><p>Your booking has been <b>' + action + '</b>.</p><table style="border-collapse:collapse">' +
      row('Instrument', esc(name)) + row('From', esc(when(record.starts_at)) + ' IST') + row('To', esc(when(record.ends_at)) + ' IST') +
      (record.note ? row('Note', esc(record.note)) : '') + '</table>' +
      '<p><a href="' + SITE + 'booking.html" style="color:#263A67">Open the booking portal</a></p>');
  } else if (kind === 'invoice') {
    const submittedNow = (type === 'INSERT' && record.status === 'SUBMITTED') ||
      (type === 'UPDATE' && record.status === 'SUBMITTED' && old_record?.status !== 'SUBMITTED');
    if (!submittedNow) return new Response('skip');
    const { data: acc } = await db.from('staff').select('email').eq('role', 'Lab Accountant').eq('active', true);
    to = (acc ?? []).map((a: { email: string }) => a.email).filter(Boolean);
    if (!to.length) return new Response('no accountants');
    const again = type === 'UPDATE';
    subject = (again ? 'Invoice re-submitted: ' : 'New invoice submitted: ') + (record.vendor ?? '') + ' ' + (record.invoice_number ?? '');
    html = shell(again ? 'Invoice re-submitted' : 'New invoice submitted',
      '<p>An invoice is waiting for your review.</p><table style="border-collapse:collapse">' +
      row('Reference', esc(record.id)) + row('Vendor', esc(record.vendor)) + row('Invoice no.', esc(record.invoice_number)) +
      row('Invoice date', esc(record.invoice_date)) + row('Total', '&#8377; ' + esc(Number(record.total_price ?? 0).toLocaleString('en-IN'))) +
      row('Submitted by', esc(record.created_by)) + '</table>' +
      '<p><a href="' + SITE + 'invoice.html" style="color:#263A67">Open the invoice portal</a></p>');
  } else return new Response('skip');

  try {
    await mailer().sendMail({ from, to: to.join(', '), subject, html });
    return new Response('sent');
  } catch (e) {
    console.error('mail error', e);
    return new Response('mail error', { status: 502 });
  }
});
