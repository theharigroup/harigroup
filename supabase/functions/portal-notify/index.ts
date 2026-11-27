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
const LOGO = SITE + 'harigroup_logo.png';
const shell = (title: string, body: string) =>
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;padding:24px 12px"><tr><td align="center">' +
  '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#1e293b">' +
  '<tr><td style="background:#f1f5f9;padding:16px 24px;border-bottom:3px solid #facc15"><img src="' + LOGO + '" alt="Hari Group" height="48" style="display:block;height:48px;width:auto;border:0"></td></tr>' +
  '<tr><td style="padding:24px"><h2 style="color:#263A67;margin:0 0 14px;font-size:20px">' + title + '</h2>' + body + '</td></tr>' +
  '<tr><td style="background:#f1f5f9;padding:14px 24px;color:#64748b;font-size:12px;line-height:1.5">Hari Group, Department of Organic Chemistry, IISc Bangalore<br>This is an automatic message, please do not reply.</td></tr>' +
  '</table></td></tr></table>';

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
