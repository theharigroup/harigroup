/* Instrument booking portal. Talks to Supabase; every rule is enforced by the database (docs/booking-setup.sql).
   The page only shows and requests things. Times are Indian Standard Time (no daylight saving). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const CFG = window.BOOKING_CONFIG || {};
  const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const LATE_MS = 30 * 60000;   // last minutes of a started slot that can no longer be booked
  const FAIR_SLOTS = 2;   // more than this in a row is allowed, with a courtesy reminder
  const IDLE_MS = 30 * 60 * 1000;
  const MIN = 60000, DAY = 86400000, IST = 330 * MIN;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 3) || '?').toUpperCase();
  const optList = i => (Array.isArray(i.options) ? i.options : []).filter(o => o && o.label && Array.isArray(o.choices) && o.choices.length);
  const choiceText = b => Object.values((b && b.choices) || {}).join(' · ');
  const who = n => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? p[0] + ' (' + initials(n) + ')' : ''; };

  // ---------- time helpers (IST) ----------
  const istDate = ms => new Date(ms + IST);                          // read with getUTC*
  const dateStr = ms => { const d = istDate(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const dmy = ds => ds.slice(8, 10) + '-' + ds.slice(5, 7) + '-' + ds.slice(0, 4);
  const midnightMs = ds => Date.parse(ds + 'T00:00:00+05:30');
  const fmtMin = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + (mm ? '.' + pad(mm) : '') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  const slotLabel = (a, b) => fmtMin(a) + ' - ' + fmtMin(b);
  const mondayOf = ms => { const d = istDate(ms), dow = d.getUTCDay(); return ms - ((dow + 6) % 7) * DAY - ((d.getUTCHours() * 60 + d.getUTCMinutes()) * MIN) - d.getUTCSeconds() * 1000 - d.getUTCMilliseconds(); };

  function slotsFor(i) {
    const a = [];
    for (let s = i.day_start; s + i.slot_minutes <= i.day_end; s += i.slot_minutes) a.push({ s, e: s + i.slot_minutes });
    if (i.overnight) a.push({ s: i.day_end, e: 1440 + i.day_start, night: true });
    return a.map(x => ({ ...x, label: slotLabel(x.s, x.e) }));
  }
  const lenText = i => (i.slot_minutes % 60 === 0 ? (i.slot_minutes / 60) + '-hour' : i.slot_minutes + '-minute') + ' slots';
  const hoursText = i => fmtMin(i.day_start) + ' to ' + fmtMin(i.day_end) + (i.overnight ? ' + overnight' : '');

  // ---------- state ----------
  let client = null, session = null, me = null;
  let instruments = [], myAccess = new Set(), cur = null, weekMs = mondayOf(Date.now());
  let weekBookings = [], dlgState = null, idleTimer = null, view = 'out', pane = 'inst';
  let allMembers = [], allAccess = [], editingInst = null, editingMember = null, formPhoto = undefined;
  let facilities = [], firstDone = false;
  let iDays = [0, 1, 2, 3, 4, 5, 6], iOv = false, iAct = true;

  // ---------- messages ----------
  function say(id, text, kind) { const el = $(id); if (!el) return; el.className = 'bk-msg' + (text ? ' ' + (kind || 'err') : ''); el.textContent = text || ''; }
  const errText = e => (e && e.message) ? e.message : 'Something went wrong. Please try again.';

  // ---------- boot ----------
  if (!CFG.url || !CFG.anonKey || !window.supabase) {
    $('cfg-warn').hidden = false;
    if (CFG.url && CFG.anonKey && !window.supabase) $('cfg-warn').innerHTML = '<b>The sign-in service could not be loaded.</b><br>Check your internet connection and reload the page.';
    return;
  }
  const FIRST_TIME = /type=(signup|invite)/.test(location.hash);   // arrived from the confirmation email
  client = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  client.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === 'PASSWORD_RECOVERY') { showOut('newpw'); return; }
    if (event === 'SIGNED_OUT') { me = null; showOut('login'); return; }
    if (event === 'SIGNED_IN' && view === 'out' && !$('f-newpw').hidden) return;
    if (FIRST_TIME && s && !firstDone) { firstDone = true; showOut('newpw'); say('msg', 'Email confirmed. Please choose your password to finish.', 'ok'); return; }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(enter, 0);
  });

  // ---------- sign in / out ----------
  function showOut(mode) {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    view = 'out'; stopIdle();
    ['v-in', 'v-adm'].forEach(x => { $(x).hidden = true; });
    $('v-out').hidden = false; $('acts').hidden = true;
    ['login', 'forgot', 'newpw'].forEach(m => { $('f-' + m).hidden = m !== mode; });
    $('lt').textContent = { login: 'Portal Access Required', forgot: 'Forgot Password', newpw: 'Set New Password' }[mode];
    $('ls').textContent = { login: 'Please log in with your lab credentials to access the instrument booking system', forgot: 'We will email you a link to choose a new password', newpw: 'Choose a new password for your account' }[mode];
    say('msg', '');
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => showOut(b.dataset.mode)));

  $('f-login').addEventListener('submit', async e => {
    e.preventDefault(); say('msg', ''); const btn = $('l-btn'); btn.disabled = true;
    const { error } = await client.auth.signInWithPassword({ email: $('l-email').value.trim().toLowerCase(), password: $('l-pass').value });
    btn.disabled = false; $('l-pass').value = '';
    if (error) say('msg', 'Invalid email or password.');                      // same text for every failure
  });
  $('f-forgot').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('f-btn'); btn.disabled = true;
    await client.auth.resetPasswordForEmail($('f-email').value.trim().toLowerCase(), { redirectTo: location.origin + location.pathname });
    btn.disabled = false;
    say('msg', 'If that email has an account, a reset link is on its way.', 'ok');
  });
  $('f-newpw').addEventListener('submit', async e => {
    e.preventDefault(); const p = $('n-pass').value;
    if (p.length < 10) return say('msg', 'Use at least 10 characters for your password.');
    if (p !== $('n-pass2').value) return say('msg', 'The two passwords do not match.');
    const { error } = await client.auth.updateUser({ password: p });
    if (error) return say('msg', errText(error));
    $('n-pass').value = ''; $('n-pass2').value = '';
    history.replaceState(null, '', location.pathname);
    say('msg', 'Password saved.', 'ok'); setTimeout(enter, 600);
  });
  async function signOut(msg) { await client.auth.signOut(); me = null; showOut('login'); if (msg) say('msg', msg, 'ok'); }

  // idle timeout
  function bumpIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => signOut('You were signed out after 30 minutes of inactivity.'), IDLE_MS); }
  function startIdle() { ['click', 'keydown', 'pointerdown', 'scroll'].forEach(ev => addEventListener(ev, bumpIdle, { passive: true })); bumpIdle(); }
  function stopIdle() { clearTimeout(idleTimer); }
  let idleOn = false;

  // ---------- after sign-in ----------
  async function enter() {
    const { data } = await client.auth.getSession(); session = data.session;
    if (!session) return showOut('login');
    const email = String(session.user.email || '').toLowerCase();
    const r = await client.from('booking_members').select('*').eq('email', email).maybeSingle();
    if (r.error || !r.data || r.data.status !== 'active') {
      // stay signed in: the same login is shared with the invoice portal, so do not sign out here
      showOut('login');
      return say('msg', 'This account is not approved for booking. Please ask the group admin.');
    }
    me = r.data;
    if (!idleOn) { idleOn = true; startIdle(); } else bumpIdle();
    await loadInstruments();
    $('v-out').hidden = true;
    setView('in');
  }

  async function loadInstruments() {
    const ri = await client.from('booking_instruments').select('*').order('sort_order').order('name');
    instruments = ri.data || [];
    const ra = await client.from('booking_access').select('instrument_id').eq('email', me.email);
    myAccess = new Set((ra.data || []).map(x => x.instrument_id));
    const bookable = bookableList();
    const hm = decodeURIComponent((location.hash.match(/inst=([^&]+)/) || [])[1] || '').toLowerCase();
    const hit = hm && bookable.find(i => i.name.toLowerCase() === hm); if (hit) { cur = hit.id; history.replaceState(null, '', location.pathname); }
    if (!cur || !bookable.some(i => i.id === cur)) cur = bookable[0] ? bookable[0].id : null;
  }
  const bookableList = () => instruments.filter(i => i.active && (me.role === 'admin' || myAccess.has(i.id)));
  const curInst = () => instruments.find(i => i.id === cur);

  // ---------- views ----------
  function chip() {
    return '<div class="bk-chip"><div class="av">' + esc(initials(me.name).slice(0, 2)) + '</div><div class="txt" style="padding-right:4px"><div class="nm">' + esc(me.name) + '</div><div class="rl">' + (me.role === 'admin' ? 'Admin' : 'Member') + '</div></div>' +
      '<button class="out" id="out" title="Sign out" aria-label="Sign out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg></button></div>';
  }
  function setView(v) {
    view = v;
    const adm = v === 'adm';
    $('v-in').hidden = adm; $('v-adm').hidden = !adm;
    const acts = $('acts'); acts.hidden = false;
    acts.innerHTML = (adm ? '<button class="bk-go ghost" id="go-back" type="button">&larr; Back to Booking</button>' : (me.role === 'admin' ? '<button class="bk-go" id="go-adm" type="button">Admin Panel</button>' : '')) + chip();
    $('out').addEventListener('click', () => signOut());
    if (adm) { $('go-back').addEventListener('click', () => setView('in')); showPane(pane); }
    else { if ($('go-adm')) $('go-adm').addEventListener('click', () => setView('adm')); renderTabs(); refreshWeek(); }
  }

  // ---------- booking view ----------
  function renderTabs() {
    const list = bookableList();
    $('tabs').innerHTML = list.length ? list.map(i =>
      '<button class="bk-tab' + (i.id === cur ? ' on' : '') + '" type="button" data-id="' + esc(i.id) + '">' + (i.photo_url ? '<img src="' + esc(i.photo_url) + '" alt="">' : '<div class="ph"></div>') +
      '<div><h3>' + esc(i.name) + '</h3><span>' + esc(i.sub || i.location || '') + '</span></div></button>').join('')
      : '<div class="bk-card bk-empty" style="grid-column:1/-1">You have not been given access to any instrument yet. Please ask the group admin.</div>';
    $('tabs').querySelectorAll('.bk-tab').forEach(b => b.addEventListener('click', () => { cur = b.dataset.id; renderTabs(); refreshWeek(); }));
  }

  async function refreshWeek() {
    const inst = curInst();
    if (!inst) { $('tbl').innerHTML = ''; $('wk-name').textContent = ''; $('wk-range').textContent = ''; $('rules').innerHTML = ''; await loadMine(); await loadPast(); return; }
    const from = new Date(weekMs).toISOString(), to = new Date(weekMs + 7 * DAY).toISOString();
    const r = await client.from('bookings').select('*')
      .eq('instrument_id', inst.id).is('cancelled_at', null).lt('starts_at', to).gt('ends_at', from);
    weekBookings = (r.data || []).map(b => ({ ...b, s: Date.parse(b.starts_at), e: Date.parse(b.ends_at) }));
    renderWeek(); await loadMine(); await loadPast();
  }

  function stateOf(inst, dow, s, e, now) {
    if (!inst.days.includes(dow)) return { k: 'closed' };
    const b = weekBookings.find(x => x.s < e && x.e > s);
    if (b) {
      if (b.kind === 'maintenance') return { k: 'mnt', label: b.note ? b.note : 'Maintenance', bid: b.id };
      if (b.member_email === me.email) return { k: 'mine', label: 'You', note: b.note, was: b.e <= now, bid: b.id, ch: choiceText(b) };
      return { k: 'oth', label: who(b.member_name), note: b.note, was: b.e <= now, bid: b.id, ch: choiceText(b) };
    }
    if (e <= now) return { k: 'past' };
    if (s <= now && e - now < LATE_MS) return { k: 'live' };   // a started slot stays bookable until 30 minutes before it ends
    if (s > now + inst.book_ahead_days * DAY) return { k: 'later' };
    return { k: 'free' };
  }

  function renderWeek() {
    const inst = curInst(), SL = slotsFor(inst), now = Date.now(), todayS = dateStr(now);
    $('wk-name').textContent = inst.name;
    const a = dateStr(weekMs), z = dateStr(weekMs + 6 * DAY);
    $('wk-range').textContent = 'Week of ' + a.slice(8) + ' - ' + dmy(z).slice(0, 2) + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+z.slice(5, 7) - 1] + ' ' + z.slice(0, 4);
    $('rules').innerHTML = '<span><b>Slots:</b> ' + lenText(inst) + '</span><span><b>Hours:</b> ' + esc(hoursText(inst)) + '</span><span><b>Book up to:</b> ' + inst.book_ahead_days + ' days ahead</span><span><b>Slots in a row:</b> up to ' + inst.max_consecutive + '</span><span><b>Started slot:</b> bookable until 30 min before it ends</span><span><b>Cancel:</b> any time</span>';
    let h = '<thead><tr><th>Date</th>' + SL.map(s => '<th>' + esc(s.label) + '</th>').join('') + '</tr></thead><tbody>';
    for (let d = 0; d < 7; d++) {
      const ms = weekMs + d * DAY, ds = dateStr(ms), dow = istDate(ms).getUTCDay(), isT = ds === todayS;
      h += '<tr><td class="t' + (isT ? ' today' : '') + '">' + dmy(ds) + '<small>' + DAYN[dow] + (isT ? ' · today' : '') + '</small></td>';
      const stAt = i => stateOf(inst, dow, midnightMs(ds) + SL[i].s * MIN, midnightMs(ds) + SL[i].e * MIN, now);
      for (let idx = 0; idx < SL.length; idx++) {
        const sl = SL[idx], st = stAt(idx);
        let span = 1;                                            // slots of one booking show as one merged cell
        if (st.bid) while (idx + span < SL.length && stAt(idx + span).bid === st.bid) span++;
        const hrs = ((SL[idx + span - 1].e - sl.s) / 60) + ' h';
        let c;
        if (st.k === 'free') c = '<button type="button" class="bk-slot free" data-ds="' + ds + '" data-i="' + idx + '" aria-label="Book ' + esc(dmy(ds) + ' ' + sl.label) + '"></button>';
        else if (st.k === 'mine' || st.k === 'oth') c = '<div class="bk-slot ' + st.k + (st.was ? ' was' : '') + '" title="' + esc([st.ch, st.note].filter(Boolean).join(' | ')) + '"><span>' + esc(st.label) + '<br><small>' + hrs + (st.ch ? ' · ' + esc(st.ch) : '') + '</small>' + (st.note ? '<br><small class="nt">' + esc(st.note) + '</small>' : '') + '</span></div>';
        else if (st.k === 'mnt') c = '<div class="bk-slot mnt">' + esc(st.label) + '</div>';
        else if (st.k === 'live') c = '<div class="bk-slot live">in progress</div>';
        else if (st.k === 'closed') c = '<div class="bk-slot closed">closed</div>';
        else if (st.k === 'later') c = '<div class="bk-slot later">not open yet</div>';
        else c = '<div class="bk-slot past"></div>';
        h += '<td data-t="' + esc(span > 1 ? sl.label.split(/\s*[-\u2013]\s*/)[0] + ' \u2013 ' + SL[idx + span - 1].label.split(/\s*[-\u2013]\s*/).pop() : sl.label) + '"' + (span > 1 ? ' colspan="' + span + '" class="w"' : '') + '>' + c + '</td>';
        idx += span - 1;
      }
      h += '</tr>';
    }
    $('tbl').innerHTML = h + '</tbody>';
    $('tbl').querySelectorAll('.bk-slot.free').forEach(b => b.addEventListener('click', () => openDialog(b.dataset.ds, +b.dataset.i)));
  }
  $('wk-prev').addEventListener('click', () => { weekMs -= 7 * DAY; refreshWeek(); });
  $('wk-next').addEventListener('click', () => { weekMs += 7 * DAY; refreshWeek(); });
  $('wk-now').addEventListener('click', () => { weekMs = mondayOf(Date.now()); refreshWeek(); });

  async function loadMine() {
    const r = await client.from('bookings').select('*').eq('member_email', me.email).eq('kind', 'booking')
      .is('cancelled_at', null).gt('ends_at', new Date().toISOString()).order('starts_at').limit(30);
    const rows = r.data || [];
    $('mine').innerHTML = rows.length ? rows.map(b => {
      const inst = instruments.find(i => i.id === b.instrument_id), s = Date.parse(b.starts_at), e = Date.parse(b.ends_at), ds = dateStr(s), dow = istDate(s).getUTCDay();
      const sm = Math.round((s - midnightMs(ds)) / MIN), em = sm + Math.round((e - s) / MIN);
      const started = s <= Date.now();
      return '<div class="bk-item"><b>' + esc(inst ? inst.name : 'Instrument') + '</b><span>' + dmy(ds) + ' (' + DAYN[dow] + ')<br>' + esc(slotLabel(sm, em)) + (choiceText(b) ? '<br>' + esc(choiceText(b)) : '') + '</span><div class="row"><span class="bk-tag">' + (started ? 'In progress' : 'Confirmed') + '</span>' +
        '<button class="bk-btn line sm" type="button" data-cancel="' + esc(b.id) + '">Cancel</button>' + '</div></div>';
    }).join('') : '<div class="bk-empty">You have no upcoming bookings. Click a free slot in the table to book.</div>';
    $('mine').querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => cancelBooking(b.dataset.cancel)));
  }
  async function loadPast() {
    const r = await client.from('bookings').select('*').eq('member_email', me.email).eq('kind', 'booking')
      .is('cancelled_at', null).lte('ends_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(15);
    const rows = r.data || [];
    $('mine-past').innerHTML = rows.length ? rows.map(b => {
      const inst = instruments.find(i => i.id === b.instrument_id), s = Date.parse(b.starts_at), e = Date.parse(b.ends_at), ds = dateStr(s), dow = istDate(s).getUTCDay();
      const sm = Math.round((s - midnightMs(ds)) / MIN), em = sm + Math.round((e - s) / MIN);
      return '<div class="bk-item"><b>' + esc(inst ? inst.name : 'Instrument') + '</b><span>' + dmy(ds) + ' (' + DAYN[dow] + ')<br>' + esc(slotLabel(sm, em)) + (choiceText(b) ? '<br>' + esc(choiceText(b)) : '') + (b.note ? '<br>' + esc(b.note) : '') + '</span></div>';
    }).join('') : '<div class="bk-empty">No past bookings yet.</div>';
  }
  async function cancelBooking(id) {
    if (!confirm('Cancel this booking?')) return;
    const r = await client.from('bookings').update({ cancelled_at: new Date().toISOString() }).eq('id', id);
    if (r.error) alert(errText(r.error));
    refreshWeek();
  }

  // ---------- booking dialog ----------
  function openDialog(ds, idx) {
    const inst = curInst(), SL = slotsFor(inst), now = Date.now(), dow = istDate(midnightMs(ds)).getUTCDay();
    // how many consecutive free slots start here (never across the overnight slot)
    let maxN = 0;
    for (let k = idx; k < SL.length && maxN < inst.max_consecutive; k++) {
      if (SL[k].night && k !== idx) break;
      const s = midnightMs(ds) + SL[k].s * MIN, e = midnightMs(ds) + SL[k].e * MIN;
      if (stateOf(inst, dow, s, e, now).k !== 'free') break;
      maxN++; if (SL[k].night) break;
    }
    dlgState = { ds, idx, inst, SL, maxN: Math.max(1, maxN) };
    $('d-img').innerHTML = inst.photo_url ? '<img src="' + esc(inst.photo_url) + '" alt="">' : '<div class="ph"></div>';
    $('d-name').textContent = inst.name;
    $('d-date').textContent = dmy(ds) + ' (' + DAYFULL[dow] + ')';
    $('d-n').innerHTML = Array.from({ length: dlgState.maxN }, (_, k) => '<option value="' + (k + 1) + '">' + (k + 1) + ' slot' + (k ? 's' : '') + ' (' + (((SL[idx].e - SL[idx].s) * (k + 1)) / 60) + ' h)</option>').join('');
    $('d-n').disabled = SL[idx].night;
    $('d-opts').innerHTML = optList(inst).map((o, k) => '<label class="bk-field">' + esc(o.label) + '<select data-opt="' + k + '" required><option value="">Choose...</option>' + o.choices.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label>').join('');
    $('d-note').value = ''; say('d-msg', ''); updateDialogSlot();
    $('d-mnt-w').hidden = me.role !== 'admin'; $('d-mnt').checked = false;
    updateDialogSlot();
    $('dlg').classList.add('on'); $('d-ok').disabled = false; $('d-ok').focus();
  }
  function updateDialogSlot() {
    const { idx, SL } = dlgState, n = +$('d-n').value || 1;
    $('d-slot').innerHTML = '<option>' + esc(slotLabel(SL[idx].s, SL[idx + n - 1].e)) + '</option>';
    $('d-warn').hidden = n <= FAIR_SLOTS;
  }
  $('d-n').addEventListener('change', updateDialogSlot);
  $('d-cancel').addEventListener('click', () => $('dlg').classList.remove('on'));
  $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').classList.remove('on'); });
  addEventListener('keydown', e => { if (e.key === 'Escape') $('dlg').classList.remove('on'); });
  $('d-form').addEventListener('submit', async e => {
    e.preventDefault(); const { ds, idx, inst, SL } = dlgState, n = +$('d-n').value || 1;
    const s = midnightMs(ds) + SL[idx].s * MIN, en = midnightMs(ds) + SL[idx + n - 1].e * MIN;
    const mnt = me.role === 'admin' && $('d-mnt').checked;
    const choices = {}; if (!mnt) { const ol = optList(inst); for (let k = 0; k < ol.length; k++) { const v = ($('d-opts').querySelector('[data-opt="' + k + '"]') || {}).value; if (!v) return say('d-msg', 'Please choose ' + ol[k].label + '.'); choices[ol[k].label] = v; } }
    const note = $('d-note').value.trim().slice(0, 200);
    $('d-ok').disabled = true; say('d-msg', '');
    const r = await client.from('bookings').insert({ instrument_id: inst.id, kind: mnt ? 'maintenance' : 'booking', starts_at: new Date(s).toISOString(), ends_at: new Date(en).toISOString(), note: note || null, ...(Object.keys(choices).length ? { choices } : {}) });
    if (r.error) {
      $('d-ok').disabled = false;
      say('d-msg', r.error.code === '23P01' ? 'Sorry, someone just took that slot. Please pick another one.' : errText(r.error));
      if (r.error.code === '23P01') refreshWeek();
      return;
    }
    $('dlg').classList.remove('on'); refreshWeek();
  });

  // ================= ADMIN =================
  document.querySelectorAll('.bk-admbar button').forEach(b => b.addEventListener('click', () => showPane(b.dataset.pane)));
  async function showPane(p) {
    pane = p;
    document.querySelectorAll('.bk-admbar button').forEach(b => b.classList.toggle('on', b.dataset.pane === p));
    document.querySelectorAll('[data-p]').forEach(x => { x.hidden = x.dataset.p !== p; });
    if (p === 'inst') { await Promise.all([loadInstruments(), loadFacilities()]); renderInstList(); if (editingInst === null) resetInstForm(); }
    if (p === 'mem') { await loadMembers(); renderMembers(); resetMemberForm(); }
    if (p === 'mnt') renderMaintenance();
    if (p === 'exp') initExport();
  }

  // --- instruments ---
  const parseOpts = t => { const out = []; for (const ln of t.split('\n').map(x => x.trim()).filter(Boolean)) { const m = ln.match(/^([^:]{1,40}):\s*(.+)$/); const ch = m ? m[2].split(',').map(x => x.trim()).filter(Boolean) : []; if (!ch.length) return null; out.push({ label: m[1].trim(), choices: ch }); } return out; };
  const optsToText = i => optList(i).map(o => o.label + ': ' + o.choices.join(', ')).join('\n');
  async function loadFacilities() {
    if (facilities.length) return;
    try {
      const html = await (await fetch('facilities.html', { cache: 'no-cache' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      facilities = [...doc.querySelectorAll('.fc-card')].map(c => {
        const img = c.querySelector('.fc-ph img');
        return { name: (c.querySelector('.fc-name') || {}).textContent.trim(), sub: ((c.querySelector('.fc-tag') || {}).textContent || '').trim(), photo: img ? img.getAttribute('src') : null };
      }).filter(x => x.name);
    } catch (_) { facilities = []; }
  }
  function fillFacilityPick(selected) {
    const taken = new Set(instruments.map(i => i.name));
    const opts = selected ? [selected] : facilities.map(x => x.name).filter(n => !taken.has(n));
    $('i-name').innerHTML = opts.length ? (selected ? '' : '<option value="">Choose An Instrument...</option>') + opts.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('')
      : '<option value="">All Facilities Instruments Are Already Added</option>';
    $('i-name').disabled = !!selected || !opts.length; if (selected) $('i-name').value = selected;
    pickPhoto();
  }
  function pickPhoto() {
    const f = facilities.find(x => x.name === $('i-name').value);
    $('i-drop').querySelectorAll('img').forEach(x => x.remove());
    if (f && f.photo) $('i-drop').insertAdjacentHTML('afterbegin', '<img src="' + esc(f.photo) + '" alt="">');
    $('i-dtxt').textContent = 'Photo is taken from the Facilities page';
  }
  const LEN_OPTS = [[30, '30 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [360, '6 hours'], [0, 'Custom...']];
  function timeOpts(sel, from, to, selected) {
    let h = ''; for (let m = from; m <= to; m += 15) h += '<option value="' + m + '"' + (m === selected ? ' selected' : '') + '>' + fmtMin(m === 1440 ? 0 : m) + (m === 1440 ? ' (midnight)' : '') + '</option>';
    sel.innerHTML = h;
  }
  function renderInstList() {
    $('ilist').innerHTML = instruments.length ? instruments.map(i =>
      '<div class="it">' + (i.photo_url ? '<img src="' + esc(i.photo_url) + '" alt="">' : '<div class="ph"></div>') + '<div class="gr"><h3>' + esc(i.name) + '</h3><span>' + esc(lenText(i)) + ' · ' + esc(hoursText(i)) + '</span><span>' + slotsFor(i).length + ' slots per day · own weekly table</span></div>' +
      '<span class="bk-pill' + (i.active ? '' : ' d') + '">' + (i.active ? 'ACTIVE' : 'INACTIVE') + '</span><button class="bk-btn line sm" type="button" data-edit="' + esc(i.id) + '">Edit</button></div>').join('')
      : '<div class="bk-empty">No instruments yet. Add the first one.</div>';
    $('ilist').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editInst(b.dataset.edit)));
  }
  function buildInstFormStatic() {
    $('i-len').innerHTML = LEN_OPTS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('');
    $('i-max').innerHTML = [2, 3, 4, 6, 8, 12].map(v => '<option value="' + v + '">' + v + '</option>').join('');
    timeOpts($('i-st'), 0, 1380, 540); timeOpts($('i-en'), 15, 1440, 1260);
    $('i-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => '<button type="button" data-d="' + d + '">' + DAYN[d] + '</button>').join('');
    $('i-days').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const d = +b.dataset.d; iDays = iDays.includes(d) ? iDays.filter(x => x !== d) : iDays.concat(d); syncInst(); }));
    ['i-len', 'i-st', 'i-en', 'i-custom'].forEach(id => $(id).addEventListener('input', syncInst));
    $('i-ov').addEventListener('click', () => { iOv = !iOv; syncInst(); });
    $('i-act').addEventListener('click', () => { iAct = !iAct; syncInst(); });
  }
  const instLen = () => (+$('i-len').value === 0 ? Math.max(15, +$('i-custom').value || 60) : +$('i-len').value);
  function syncInst() {
    $('i-custom-w').hidden = +$('i-len').value !== 0;
    $('i-ov').classList.toggle('on', iOv); $('i-act').classList.toggle('on', iAct);
    $('i-days').querySelectorAll('button').forEach(b => b.classList.toggle('on', iDays.includes(+b.dataset.d)));
    const draft = { day_start: +$('i-st').value, day_end: +$('i-en').value, slot_minutes: instLen(), overnight: iOv };
    $('i-prev').innerHTML = draft.day_end > draft.day_start ? slotsFor(draft).map(s => '<span class="' + (s.night ? 'n' : '') + '">' + esc(s.label) + '</span>').join('') : '<span>Last slot must end after the first slot starts</span>';
  }
  function resetInstForm() {
    editingInst = null; formPhoto = undefined; iDays = [0, 1, 2, 3, 4, 5, 6]; iOv = false; iAct = true;
    $('i-title').textContent = 'Add New Instrument'; $('i-mode').textContent = 'NEW'; $('i-mode').className = 'bk-pill d';
    $('i-opts').value = ''; fillFacilityPick(null); $('i-loc').value = 'Hari Group Lab'; $('i-len').value = '120'; $('i-ahead').value = '2'; $('i-max').value = '12';
    $('i-st').value = '540'; $('i-en').value = '1260'; $('i-who').value = 'all'; $('i-who-w').hidden = false; $('i-act-w').hidden = true;
    say('i-msg', '');
    syncInst();
  }
  function editInst(id) {
    const i = instruments.find(x => x.id === id); if (!i) return;
    editingInst = id; formPhoto = undefined;
    $('i-title').textContent = 'Edit Instrument'; $('i-mode').textContent = 'EDITING'; $('i-mode').className = 'bk-pill';
    $('i-opts').value = optsToText(i); fillFacilityPick(i.name); $('i-loc').value = i.location || '';
    const known = LEN_OPTS.some(([v]) => v === i.slot_minutes);
    $('i-len').value = known ? String(i.slot_minutes) : '0'; $('i-custom').value = i.slot_minutes;
    $('i-ahead').value = String(i.book_ahead_days); if (![...$('i-ahead').options].some(o => +o.value === i.book_ahead_days)) $('i-ahead').insertAdjacentHTML('beforeend', '<option value="' + i.book_ahead_days + '">' + i.book_ahead_days + ' days ahead</option>'), $('i-ahead').value = String(i.book_ahead_days);
    $('i-max').value = String(i.max_consecutive); if (![...$('i-max').options].some(o => +o.value === i.max_consecutive)) $('i-max').insertAdjacentHTML('beforeend', '<option value="' + i.max_consecutive + '">' + i.max_consecutive + '</option>'), $('i-max').value = String(i.max_consecutive);
    timeOpts($('i-st'), 0, 1380, i.day_start); timeOpts($('i-en'), 15, 1440, i.day_end);
    if (![...$('i-st').options].some(o => +o.value === i.day_start)) { $('i-st').insertAdjacentHTML('beforeend', '<option value="' + i.day_start + '">' + fmtMin(i.day_start) + '</option>'); $('i-st').value = String(i.day_start); }
    if (![...$('i-en').options].some(o => +o.value === i.day_end)) { $('i-en').insertAdjacentHTML('beforeend', '<option value="' + i.day_end + '">' + fmtMin(i.day_end) + '</option>'); $('i-en').value = String(i.day_end); }
    iDays = i.days.slice(); iOv = !!i.overnight; iAct = !!i.active;
    $('i-who-w').hidden = true; $('i-act-w').hidden = false;
    say('i-msg', '');
    syncInst(); $('i-form').scrollIntoView({ block: 'nearest' });
  }
  $('i-new').addEventListener('click', resetInstForm);
  $('i-cancel').addEventListener('click', resetInstForm);
  $('i-name').addEventListener('change', pickPhoto);
  $('i-form').addEventListener('submit', async e => {
    e.preventDefault(); say('i-msg', '');
    const name = $('i-name').value.trim(), fac = facilities.find(x => x.name === name), slot = instLen(), st = +$('i-st').value, en = +$('i-en').value;
    if (!name || !fac) return say('i-msg', 'Please choose an instrument from the Facilities page list.');
    if (en <= st) return say('i-msg', 'The last slot must end after the first slot starts.');
    if ((en - st) % slot !== 0) return say('i-msg', 'The hours must be a whole number of slots. Change the slot length or the times.');
    if (!iDays.length) return say('i-msg', 'Choose at least one day.');
    const optsText = $('i-opts').value.trim(), optsParsed = parseOpts(optsText);
    if (optsParsed === null) return say('i-msg', 'Booking choices: use one line per group, like  Vial Size: 4 mL, 30 mL');
    const row = { name, sub: fac.sub || null, photo_url: fac.photo, location: $('i-loc').value.trim() || null, slot_minutes: slot, day_start: st, day_end: en, overnight: iOv, days: iDays.slice().sort(), book_ahead_days: +$('i-ahead').value, max_consecutive: +$('i-max').value };
    $('i-save').disabled = true;
    let r;
    if (optsText || (editingInst && (instruments.find(x => x.id === editingInst) || {}).options !== undefined)) row.options = optsParsed;
    if (editingInst) { row.active = iAct; r = await client.from('booking_instruments').update(row).eq('id', editingInst).select().single(); }
    else { row.sort_order = instruments.length + 1; r = await client.from('booking_instruments').insert(row).select().single(); }
    $('i-save').disabled = false;
    if (r.error) return say('i-msg', errText(r.error));
    if (!editingInst && $('i-who').value === 'all') {                       // give every active member access
      const m = await client.from('booking_members').select('email').eq('status', 'active');
      const rows = (m.data || []).map(x => ({ email: x.email, instrument_id: r.data.id }));
      if (rows.length) await client.from('booking_access').upsert(rows);
    }
    resetInstForm(); await loadInstruments(); renderInstList();
    say('i-msg', 'Instrument saved.', 'ok');
  });

  // --- members ---
  async function loadMembers() {
    const [m, a] = await Promise.all([client.from('booking_members').select('*').order('name'), client.from('booking_access').select('email,instrument_id')]);
    allMembers = m.data || []; allAccess = a.data || [];
  }
  function renderMembers() {
    const q = $('m-q').value.trim().toLowerCase();
    const rows = allMembers.filter(m => !q || m.name.toLowerCase().includes(q) || m.email.includes(q));
    $('m-count').innerHTML = 'Members <span style="font-weight:600;color:#64748b;font-size:13px">· ' + allMembers.filter(m => m.status === 'active').length + ' active</span>';
    $('mem').innerHTML = rows.map(m => {
      const ids = allAccess.filter(a => a.email === m.email).map(a => a.instrument_id);
      const chips = m.role === 'admin' ? '<span class="bk-mini">All instruments (admin)</span>' : (ids.map(id => { const i = instruments.find(x => x.id === id); return i ? '<span class="bk-mini">' + esc(i.name) + '</span>' : ''; }).join('') || '<span style="color:#94a3b8">None</span>');
      return '<tr><td><b>' + esc(m.name) + '</b><small>' + esc(m.email) + '</small></td><td>' + (m.role === 'admin' ? 'Admin' : 'Member') + '</td><td>' + chips + '</td><td><span class="bk-pill' + (m.status === 'active' ? '' : ' d') + '">' + m.status.toUpperCase() + '</span></td><td style="text-align:right"><button class="bk-btn line sm" type="button" data-minv="' + esc(m.email) + '" title="Email a link to set or reset the password">Send Link</button> <button class="bk-btn line sm" type="button" data-medit="' + esc(m.email) + '">Edit</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="bk-empty">No members found.</td></tr>';
    $('mem').querySelectorAll('[data-minv]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; const r = await inviteMember(b.dataset.minv); b.disabled = false; say('m-msg', r.ok ? 'Password link sent to ' + b.dataset.minv + '.' : r.msg, r.ok ? 'ok' : 'err'); }));
    $('mem').querySelectorAll('[data-medit]').forEach(b => b.addEventListener('click', () => editMember(b.dataset.medit)));
  }
  $('m-q').addEventListener('input', renderMembers);
  // Asks the booking-invite function to email a "set your password" link (new account) or a reset link (existing account).
  async function inviteMember(email) {
    try {
      const r = await client.functions.invoke('portal-invite', { body: { email, app: 'booking' } });
      if (r.error) { let m = 'The link could not be sent.'; try { const j = await r.error.context.json(); if (j && j.error) m = j.error; } catch (_) {} return { ok: false, msg: m }; }
      return { ok: true };
    } catch (_) { return { ok: false, msg: 'The link could not be sent.' }; }
  }
  function memberInstBoxes(checked) {
    const adm = $('m-role').value === 'admin';
    $('m-inst').innerHTML = instruments.map(i => '<label><input type="checkbox" value="' + esc(i.id) + '"' + (adm || checked.includes(i.id) ? ' checked' : '') + (adm ? ' disabled' : '') + '>' + esc(i.name) + '</label>').join('') || '<div class="bk-hint">Add an instrument first.</div>';
    $('m-inst-note').hidden = !adm;
  }
  // changing the role re-draws the boxes: an admin can always book every instrument, so those boxes are locked
  $('m-role').addEventListener('change', () => memberInstBoxes([...$('m-inst').querySelectorAll('input:checked')].map(x => x.value)));
  function resetMemberForm() {
    editingMember = null; $('m-title').textContent = 'Add New Member'; $('m-name').value = ''; $('m-email').value = ''; $('m-email').readOnly = false;
    $('m-role').value = 'member'; $('m-status').value = 'active'; $('m-save').textContent = 'Approve Member'; memberInstBoxes([]); say('m-msg', '');
  }
  function editMember(email) {
    const m = allMembers.find(x => x.email === email); if (!m) return;
    editingMember = email; $('m-title').textContent = 'Edit Member'; $('m-name').value = m.name; $('m-email').value = m.email; $('m-email').readOnly = true;
    $('m-role').value = m.role; $('m-status').value = m.status; $('m-save').textContent = 'Save Changes';
    memberInstBoxes(allAccess.filter(a => a.email === email).map(a => a.instrument_id)); say('m-msg', '');
    $('m-form').scrollIntoView({ block: 'nearest' });
  }
  $('m-new').addEventListener('click', resetMemberForm);
  $('m-cancel').addEventListener('click', resetMemberForm);
  $('m-form').addEventListener('submit', async e => {
    e.preventDefault(); say('m-msg', '');
    const email = $('m-email').value.trim().toLowerCase(), name = $('m-name').value.trim(), role = $('m-role').value, status = $('m-status').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('m-msg', 'Please enter a valid email address.');
    if (!name) return say('m-msg', 'Please enter the full name.');
    if (email === me.email && (role !== 'admin' || status !== 'active')) return say('m-msg', 'You cannot remove your own admin access or disable yourself.');
    $('m-save').disabled = true;
    const r = await client.from('booking_members').upsert({ email, name, role, status });
    if (r.error) { $('m-save').disabled = false; return say('m-msg', errText(r.error)); }
    const ids = role === 'admin' ? instruments.map(i => i.id) : [...$('m-inst').querySelectorAll('input:checked')].map(x => x.value);
    const d = await client.from('booking_access').delete().eq('email', email);
    if (d.error) { $('m-save').disabled = false; return say('m-msg', errText(d.error)); }
    if (ids.length) { const a = await client.from('booking_access').insert(ids.map(id => ({ email, instrument_id: id }))); if (a.error) { $('m-save').disabled = false; return say('m-msg', errText(a.error)); } }
    $('m-save').disabled = false;
    const wasNew = !editingMember; let note = 'Changes saved.';
    if (wasNew && status === 'active') { const iv = await inviteMember(email); note = iv.ok ? 'Member added. An email with a link to set their password has been sent.' : 'Member added, but the email could not be sent (' + iv.msg + '). Use Send Link to try again.'; }
    await loadMembers(); renderMembers(); resetMemberForm(); say('m-msg', note, 'ok');
  });

  // --- maintenance + export ---
  async function renderMaintenance() {
    const r = await client.from('bookings').select('id,instrument_id,starts_at,ends_at,note').eq('kind', 'maintenance').is('cancelled_at', null).gt('ends_at', new Date().toISOString()).order('starts_at');
    const rows = r.data || [];
    $('mnt').innerHTML = rows.length ? rows.map(b => {
      const inst = instruments.find(i => i.id === b.instrument_id), s = Date.parse(b.starts_at), e = Date.parse(b.ends_at), ds = dateStr(s), sm = Math.round((s - midnightMs(ds)) / MIN);
      return '<div class="bk-item"><b>' + esc(inst ? inst.name : 'Instrument') + '</b><span>' + dmy(ds) + ' · ' + esc(slotLabel(sm, sm + Math.round((e - s) / MIN))) + (b.note ? '<br>' + esc(b.note) : '') + '</span><div class="row"><span class="bk-tag">Maintenance</span><button class="bk-btn line sm" type="button" data-rm="' + esc(b.id) + '">Remove</button></div></div>';
    }).join('') : '<div class="bk-empty">No upcoming maintenance blocks.</div>';
    $('mnt').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => { await client.from('bookings').update({ cancelled_at: new Date().toISOString() }).eq('id', b.dataset.rm); renderMaintenance(); }));
  }
  function initExport() {
    const t = dateStr(Date.now()); if (!$('x-to').value) { $('x-to').value = t; $('x-from').value = dateStr(Date.now() - 30 * DAY); }
    $('x-inst').innerHTML = '<option value="">All instruments</option>' + instruments.map(i => '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>').join('');
  }
  const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  $('x-go').addEventListener('click', async () => {
    say('x-msg', ''); const from = $('x-from').value, to = $('x-to').value; if (!from || !to) return say('x-msg', 'Choose both dates.');
    let q = client.from('bookings').select('*')
      .gte('starts_at', new Date(midnightMs(from)).toISOString()).lt('starts_at', new Date(midnightMs(to) + DAY).toISOString()).order('starts_at').limit(5000);
    if ($('x-inst').value) q = q.eq('instrument_id', $('x-inst').value);
    const r = await q; if (r.error) return say('x-msg', errText(r.error));
    const head = ['Instrument', 'Member', 'Email', 'Type', 'Date', 'From', 'To', 'Options', 'Note', 'Status'];
    const lines = [head.map(csvCell).join(',')].concat((r.data || []).map(b => {
      const inst = instruments.find(i => i.id === b.instrument_id), s = Date.parse(b.starts_at), e = Date.parse(b.ends_at), ds = dateStr(s), sm = Math.round((s - midnightMs(ds)) / MIN);
      return [inst ? inst.name : '', b.member_name, b.member_email, b.kind, dmy(ds), fmtMin(sm), fmtMin(sm + Math.round((e - s) / MIN)), choiceText(b), b.note || '', b.cancelled_at ? 'Cancelled' : 'Confirmed'].map(csvCell).join(',');
    }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })); a.download = 'instrument-usage-' + from + '-to-' + to + '.csv'; a.click(); URL.revokeObjectURL(a.href);
    say('x-msg', (r.data || []).length + ' rows exported.', 'ok');
  });

  // keep the table fresh
  setInterval(() => { if (view === 'in' && !document.hidden && me) refreshWeek(); }, 60000);
  addEventListener('focus', () => { if (view === 'in' && me) refreshWeek(); });

  buildInstFormStatic(); resetInstForm();
  showOut('login');
})();
