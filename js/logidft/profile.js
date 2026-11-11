/*
 * LogiDFT - reaction energy profile. Builds a self-contained SVG string (so the very same
 * markup can be shown in the page and exported as SVG / PNG for papers and slides).
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    const PALETTES = {
        dark:  { bg: 'none',    fg: '#e2e8f0', muted: '#94a3b8', grid: '#334155', axis: '#64748b', minimum: '#60a5fa', ts: '#fbbf24', link: '#64748b' },
        light: { bg: '#ffffff', fg: '#0f172a', muted: '#475569', grid: '#e2e8f0', axis: '#475569', minimum: '#1d4ed8', ts: '#b45309', link: '#64748b' }
    };

    const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

    const esc = s => String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /** "Nice" axis ticks covering [lo, hi]. */
    function niceTicks(lo, hi, target) {
        const span = hi - lo || 1;
        const rough = span / target;
        const pow = Math.pow(10, Math.floor(Math.log10(rough)));
        const frac = rough / pow;
        const step = (frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10) * pow;
        const start = Math.floor(lo / step) * step;
        const end = Math.ceil(hi / step) * step;
        const ticks = [];
        for (let t = start; t <= end + step * 1e-6; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
        return { ticks, step, min: start, max: end };
    }

    /**
     * @param {Array<{label:string, value:number|null, isTS:boolean}>} items in plotting order
     * @param {{palette:'dark'|'light', unit:string, symbol:string, digits:number, showValues:boolean}} opts
     * @returns {{svg:string, skipped:string[], plotted:number}}
     */
    function buildProfileSVG(items, opts) {
        const pal = PALETTES[opts.palette] || PALETTES.light;
        const plotted = items.filter(it => it.value !== null && it.value !== undefined && !isNaN(it.value));
        const skipped = items.filter(it => !plotted.includes(it)).map(it => it.label);

        const n = plotted.length;
        if (n === 0) return { svg: '', skipped, plotted: 0 };

        const longest = plotted.reduce((m, it) => Math.max(m, it.label.length), 0);
        const rotate = n > 5 || longest > 11;

        const slot = Math.max(84, Math.min(140, 900 / n));
        const margin = { top: 44, right: 28, bottom: rotate ? 28 + Math.min(longest, 22) * 5.6 : 50, left: 74 };
        const W = Math.round(margin.left + margin.right + slot * n);
        const H = 420 + (rotate ? Math.min(longest, 22) * 4 : 0);
        const plotH = H - margin.top - margin.bottom;

        const values = plotted.map(it => it.value);
        let lo = Math.min(...values, 0);
        let hi = Math.max(...values, 0);
        const pad = Math.max((hi - lo) * 0.12, Math.pow(10, -opts.digits) * 5);
        const axis = niceTicks(lo - pad, hi + pad, 6);
        const y = v => margin.top + plotH * (1 - (v - axis.min) / (axis.max - axis.min));
        const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(axis.step))));
        const fmtTick = t => t.toFixed(decimals);

        const halfBar = Math.min(36, slot * 0.3);
        const cx = i => margin.left + slot * (i + 0.5);

        let g = '';

        // grid + y ticks
        axis.ticks.forEach(t => {
            const yy = y(t).toFixed(1);
            g += `<line x1="${margin.left}" y1="${yy}" x2="${W - margin.right}" y2="${yy}" stroke="${pal.grid}" stroke-width="1"/>`;
            g += `<text x="${margin.left - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${pal.muted}">${fmtTick(t)}</text>`;
        });

        // zero (reference) line
        if (axis.min < 0 && axis.max > 0) {
            g += `<line x1="${margin.left}" y1="${y(0).toFixed(1)}" x2="${W - margin.right}" y2="${y(0).toFixed(1)}" stroke="${pal.axis}" stroke-width="1" stroke-dasharray="5 4"/>`;
        }

        // axes
        g += `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="${pal.axis}" stroke-width="1.5"/>`;
        g += `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${W - margin.right}" y2="${margin.top + plotH}" stroke="${pal.axis}" stroke-width="1.5"/>`;

        // connecting curves
        for (let i = 0; i < n - 1; i++) {
            const x1 = cx(i) + halfBar, x2 = cx(i + 1) - halfBar, xm = (x1 + x2) / 2;
            g += `<path d="M${x1.toFixed(1)} ${y(plotted[i].value).toFixed(1)} C${xm.toFixed(1)} ${y(plotted[i].value).toFixed(1)} ${xm.toFixed(1)} ${y(plotted[i + 1].value).toFixed(1)} ${x2.toFixed(1)} ${y(plotted[i + 1].value).toFixed(1)}" fill="none" stroke="${pal.link}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
        }

        // bars, value labels, structure labels
        plotted.forEach((it, i) => {
            const color = it.isTS ? pal.ts : pal.minimum;
            const yy = y(it.value);
            const unitText = it.value.toFixed(opts.digits);
            g += `<g><title>${esc(it.label)}: ${esc(unitText)} ${esc(opts.unit)}${it.isTS ? ' (transition state)' : ''}</title>`;
            g += `<line x1="${(cx(i) - halfBar).toFixed(1)}" y1="${yy.toFixed(1)}" x2="${(cx(i) + halfBar).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
            if (opts.showValues) {
                const above = it.isTS || (i > 0 && i < n - 1 && it.value >= plotted[i - 1].value && it.value >= plotted[i + 1].value);
                const ty = above ? yy - 10 : yy + 20;
                g += `<text x="${cx(i).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${esc(unitText)}</text>`;
            }
            const lx = cx(i).toFixed(1);
            const ly = (margin.top + plotH + 20).toFixed(1);
            const label = esc(it.label.length > 24 ? it.label.slice(0, 23) + '…' : it.label) + (it.isTS ? ' ‡' : '');
            if (rotate) {
                g += `<text x="${lx}" y="${ly}" text-anchor="end" font-size="12" fill="${pal.fg}" transform="rotate(-35 ${lx} ${ly})">${label}</text>`;
            } else {
                g += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="12.5" fill="${pal.fg}">${label}</text>`;
            }
            g += '</g>';
        });

        // axis title
        const midY = margin.top + plotH / 2;
        g += `<text transform="translate(18 ${midY.toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="13" font-weight="600" fill="${pal.fg}">Relative ${esc(opts.symbol.replace(/^Δ/, ''))} (${esc(opts.unit)})</text>`;

        // legend
        const lgx = W - margin.right - 200;
        g += `<line x1="${lgx}" y1="18" x2="${lgx + 20}" y2="18" stroke="${pal.minimum}" stroke-width="4" stroke-linecap="round"/><text x="${lgx + 26}" y="22" font-size="12" fill="${pal.muted}">minimum</text>`;
        g += `<line x1="${lgx + 92}" y1="18" x2="${lgx + 112}" y2="18" stroke="${pal.ts}" stroke-width="4" stroke-linecap="round"/><text x="${lgx + 118}" y="22" font-size="12" fill="${pal.muted}">TS ‡ (imag. freq.)</text>`;

        const background = pal.bg === 'none' ? '' : `<rect width="${W}" height="${H}" fill="${pal.bg}"/>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="Reaction energy profile">${background}${g}</svg>`;
        return { svg, skipped, plotted: n };
    }

    /** Renders an SVG string to a PNG Blob (2x resolution). Resolves null on failure. */
    function svgToPngBlob(svgString, scale) {
        return new Promise(resolve => {
            const m = svgString.match(/viewBox="0 0 (\d+) (\d+)"/);
            if (!m) { resolve(null); return; }
            const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
            const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = w * scale;
                canvas.height = h * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(b => resolve(b), 'image/png');
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    NS.buildProfileSVG = buildProfileSVG;
    NS.svgToPngBlob = svgToPngBlob;
})(typeof window !== 'undefined' ? window : globalThis);
