// Shared auto sign-out for the invoice and booking portals: 15 minutes without any activity.
// The "last activity" time is kept in localStorage, so both portals (and several tabs) share one clock,
// and a phone that slept or a tab that was left closed is signed out when it comes back.
(function () {
  var LIMIT = 15 * 60 * 1000, KEY = 'hg_last_activity', mem = 0, lastWrite = 0, on = false, cb = null, tick = null;
  function read() { var v = 0; try { v = Number(localStorage.getItem(KEY)) || 0; } catch (e) { /* storage blocked */ } return Math.max(v, mem); }
  function touch() {
    var t = Date.now(); if (t - lastWrite < 2000) return;
    lastWrite = t; mem = t;
    try { localStorage.setItem(KEY, String(t)); } catch (e) { /* storage blocked */ }
  }
  function check() {
    if (!on) return;
    var last = read();
    if (last && Date.now() - last >= LIMIT) { var f = cb; stop(); if (f) f(); }
  }
  function start(fn) { cb = fn; if (on) return; on = true; check(); if (on) tick = setInterval(check, 15000); }
  function stop() { on = false; clearInterval(tick); tick = null; }

  ['click', 'keydown', 'pointerdown', 'mousemove', 'touchstart', 'scroll', 'wheel'].forEach(function (ev) { addEventListener(ev, touch, { passive: true, capture: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  addEventListener('pageshow', check); addEventListener('focus', check);
  // arriving from an e-mail link (invite / password reset) counts as activity
  if (/access_token|type=(invite|recovery|magiclink)|[?&#]code=/.test(location.hash + location.search)) touch();
  window.HariIdle = { start: start, stop: stop, touch: touch, LIMIT: LIMIT };
})();
