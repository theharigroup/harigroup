// Hero globe: one point per publication (coloured by year, newest = yellow, oldest = blue).
// Reads the publication list from publications.html, so new papers appear automatically.
(function () {
  const host = document.getElementById('hero-globe');
  if (!host) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OMEGA = 0.3; // rad/s auto-rotation (half of the first mock-up)

  const mobile = matchMedia('(max-width: 767px)');
  let started = false;
  function init() {
    if (started) return;
    started = true;
    fetch('publications.html', { cache: 'no-cache' })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(html => {
        const s = html.indexOf('const publications = [');
        const e = html.indexOf('\n];', s);
        if (s < 0 || e < 0) throw new Error('publication list not found');
        const list = (new Function('return ' + html.slice(s + 'const publications = '.length, e + 2)))();
        start(list.filter(p => p.image && p.title));
      })
      .catch(err => { host.style.display = 'none'; console.warn('Globe disabled:', err.message); });
  }
  // The globe is not shown (or even loaded) on phones.
  if (!mobile.matches) init();
  else mobile.addEventListener('change', e => { if (!e.matches) init(); });

  function start(papers) {
    if (!papers.length) { host.style.display = 'none'; return; }
    host.innerHTML = '<div class="globe-wrap"><canvas role="img" aria-label="Interactive globe of publications. Drag to rotate, click a point to open its graphical abstract."></canvas><div class="globe-tip"></div></div>';
    const wrap = host.querySelector('.globe-wrap');
    const cv = host.querySelector('canvas');
    const tip = host.querySelector('.globe-tip');
    const ctx = cv.getContext('2d');

    // modal
    const modal = document.createElement('div');
    modal.className = 'globe-modal';
    modal.hidden = true;
    modal.innerHTML = '<div class="globe-modal-box" role="dialog" aria-modal="true"><button type="button" class="globe-modal-close" aria-label="Close">&times;</button><img alt=""><h3></h3><p></p><a target="_blank" rel="noopener noreferrer">View paper <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div>';
    document.body.appendChild(modal);
    const mImg = modal.querySelector('img'), mTitle = modal.querySelector('h3'), mCit = modal.querySelector('p'), mLink = modal.querySelector('a');
    const close = () => { modal.hidden = true; };
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.globe-modal-close')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    function open(p) {
      mImg.src = p.image; mImg.alt = 'Graphical abstract: ' + p.title;
      mTitle.textContent = p.title;
      mCit.textContent = p.citation || '';
      const doi = (p.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
      if (/^10\.\d{4,9}\/\S+$/.test(doi)) { mLink.href = 'https://doi.org/' + encodeURI(doi); mLink.style.display = ''; }
      else mLink.style.display = 'none';
      modal.hidden = false;
    }

    // points on a sphere (Fibonacci lattice), colour by year
    const years = papers.map(p => +p.year);
    const y0 = Math.min(...years), y1 = Math.max(...years);
    const A = [250, 204, 21], B = [37, 99, 235];
    const colour = t => 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
    const pts = papers.map((p, k) => {
      const n = papers.length, h = -1 + 2 * (k + 0.5) / n, r = Math.sqrt(1 - h * h), th = k * 2.399963;
      return { p, v: [r * Math.cos(th), h, r * Math.sin(th)], col: colour((y1 - (+p.year)) / ((y1 - y0) || 1)) };
    });

    // graticule (latitude / longitude lines)
    const lines = [];
    for (let la = -60; la <= 60; la += 30) {
      const L = [], a = la * Math.PI / 180;
      for (let d = 0; d <= 360; d += 6) { const t = d * Math.PI / 180; L.push([Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)]); }
      lines.push(L);
    }
    for (let lo = 0; lo < 180; lo += 30) {
      const L = [], t = lo * Math.PI / 180;
      for (let d = 0; d <= 360; d += 6) { const a = d * Math.PI / 180; L.push([Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)]); }
      lines.push(L);
    }

    // quaternion helpers
    const mul = (a, b) => [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
    const rot = (v, q) => {
      const w = q[0], a = q[1], b = q[2], c = q[3];
      const t = [2 * (b * v[2] - c * v[1]), 2 * (c * v[0] - a * v[2]), 2 * (a * v[1] - b * v[0])];
      return [v[0] + w * t[0] + (b * t[2] - c * t[1]), v[1] + w * t[1] + (c * t[0] - a * t[2]), v[2] + w * t[2] + (a * t[1] - b * t[0])];
    };
    let q = [1, 0, 0, 0];
    let axis = [0.3, 1, 0.2], target = axis.slice();
    let size = 0, R = 0, dpr = 1, proj = [], hover = -1, drag = null, visible = true;

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      size = wrap.clientWidth;
      cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
      R = size * 0.43;
    }
    resize();
    addEventListener('resize', resize);

    function step(dt) {
      const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
      const th = OMEGA * dt / 2, s = Math.sin(th);
      q = mul([Math.cos(th), axis[0] / n * s, axis[1] / n * s, axis[2] / n * s], q);
      const k = Math.min(1, dt * 1.2);
      axis = axis.map((v, i) => v + (target[i] - v) * k * 0.3);
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size / 2, size / 2);
      ctx.globalAlpha = 0.55; ctx.strokeStyle = 'rgba(147,197,253,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
      ctx.lineWidth = 0.8; ctx.strokeStyle = '#93c5fd';
      lines.forEach(L => {
        let prev = null;
        L.forEach(v => {
          const r = rot(v, q), X = r[0] * R, Y = -r[1] * R;
          if (prev) { ctx.globalAlpha = 0.07 + 0.20 * ((r[2] + prev.z) / 2 + 1) / 2; ctx.beginPath(); ctx.moveTo(prev.X, prev.Y); ctx.lineTo(X, Y); ctx.stroke(); }
          prev = { X, Y, z: r[2] };
        });
      });
      proj = pts.map((o, i) => { const v = rot(o.v, q); return { i, X: v[0] * R, Y: -v[1] * R, Z: v[2] }; }).sort((a, b) => a.Z - b.Z);
      const k = size / 520;
      proj.forEach(o => {
        const d = (o.Z + 1) / 2, r = (4 + 7 * d) * k * (o.i === hover ? 1.5 : 1), col = pts[o.i].col;
        ctx.globalAlpha = 0.3 + 0.7 * d; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = o.i === hover ? 18 : 6 * d;
        ctx.beginPath(); ctx.arc(o.X, o.Y, r, 0, 7); ctx.fill();
      });
      ctx.restore();
    }

    function hit(e) {
      const b = cv.getBoundingClientRect();
      const mx = (e.clientX - b.left) / b.width * size - size / 2, my = (e.clientY - b.top) / b.height * size - size / 2;
      const tol = 12 * size / 520;
      for (let j = proj.length - 1; j >= 0; j--) {
        const o = proj[j];
        if (o.Z > -0.2 && Math.hypot(o.X - mx, o.Y - my) < tol) return { i: o.i, x: e.clientX - b.left, y: e.clientY - b.top };
      }
      return null;
    }

    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; cv.setPointerCapture(e.pointerId); cv.classList.add('is-drag'); });
    cv.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, L = Math.hypot(dx, dy);
        if (L > 2) drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        if (L) { const a = L * 0.008; q = mul([Math.cos(a / 2), dy / L * Math.sin(a / 2), dx / L * Math.sin(a / 2), 0], q); }
        tip.classList.remove('on');
      } else {
        const h = hit(e);
        hover = h ? h.i : -1;
        cv.classList.toggle('is-hover', !!h);
        if (h) { tip.textContent = pts[h.i].p.title; tip.style.left = Math.min(h.x + 14, wrap.clientWidth - 250) + 'px'; tip.style.top = (h.y + 14) + 'px'; tip.classList.add('on'); }
        else tip.classList.remove('on');
      }
    });
    cv.addEventListener('pointerup', e => {
      const moved = drag && drag.moved; drag = null; cv.classList.remove('is-drag');
      if (!moved) { const h = hit(e); if (h) open(pts[h.i].p); }
    });
    cv.addEventListener('pointerleave', () => { hover = -1; tip.classList.remove('on'); cv.classList.remove('is-hover'); });

    setInterval(() => { target = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; }, 3500);
    if ('IntersectionObserver' in window) new IntersectionObserver(en => { visible = en[0].isIntersecting; }).observe(wrap);

    let last = performance.now();
    (function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (visible) { if (!reduce && !drag) step(dt); draw(); }
      requestAnimationFrame(frame);
    })(last);
  }
})();
