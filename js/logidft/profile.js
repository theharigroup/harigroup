/*
 * LogiDFT - reaction energy profile. Builds a self-contained SVG string (so the very same
 * markup can be shown in the page and exported as SVG / PNG for papers and slides).
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    const PALETTES = {
        dark:  { bg: 'none',    fg: '#e2e8f0', muted: '#94a3b8', grid: '#334155', axis: '#64748b', minimum: '#60a5fa', ts: '#fbbf24', link: '#cbd5e1', branch: '#64748b' },
        light: { bg: '#ffffff', fg: '#0f172a', muted: '#475569', grid: '#e2e8f0', axis: '#475569', minimum: '#1d4ed8', ts: '#b45309', link: '#111827', branch: '#9aa5b4' }
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
     * @param {Array<{key?:string, label:string, value:number|null, isTS:boolean, parents?:string[]}>} items in list order.
     *   `parents` = keys of the stages this one comes from (omit it for a simple sequential chain, [] = start).
     * @param {{palette:'dark'|'light', unit:string, symbol:string, digits:number, showValues:boolean, gridLines:boolean, lineStyle:string}} opts
     * @returns {{svg:string, skipped:string[], plotted:number}}
     */
    function buildProfileSVG(items, opts) {
        const pal = PALETTES[opts.palette] || PALETTES.light;
        const plotted = items.filter(it => it.value !== null && it.value !== undefined && !isNaN(it.value));
        const skipped = items.filter(it => !plotted.includes(it)).map(it => it.label);

        const n = plotted.length;
        if (n === 0) return { svg: '', skipped, plotted: 0 };

        // ---- graph: parents of every stage, and the column (number of steps from the start) of each stage
        const idxByKey = new Map(plotted.map((it, i) => [it.key !== undefined ? it.key : it.label, i]));
        const parentsOf = plotted.map((it, i) => {
            const keys = it.parents !== undefined ? it.parents : (i > 0 ? [plotted[i - 1].key !== undefined ? plotted[i - 1].key : plotted[i - 1].label] : []);
            return keys.map(k => idxByKey.get(k)).filter(j => j !== undefined && j !== i);
        });
        const childrenOf = plotted.map(() => []);
        parentsOf.forEach((ps, i) => ps.forEach(j => childrenOf[j].push(i)));
        const col = new Array(n).fill(-1);
        const colOf = (i, stack) => {
            if (col[i] >= 0) return col[i];
            if (stack.has(i)) return 0;
            stack.add(i);
            let c = 0;
            parentsOf[i].forEach(j => { c = Math.max(c, colOf(j, stack) + 1); });
            stack.delete(i);
            col[i] = c;
            return c;
        };
        for (let i = 0; i < n; i++) colOf(i, new Set());
        const ncol = Math.max(...col) + 1;
        const colLabels = [];
        for (let c = 0; c < ncol; c++) {
            colLabels.push(plotted.map((it, i) => (col[i] === c ? it.label + (it.isTS ? ' ‡' : '') : null)).filter(Boolean).join(' / '));
        }

        const longest = colLabels.reduce((m, t) => Math.max(m, t.length), 0);
        const rotate = ncol > 5 || longest > 11;

        const slot = Math.max(84, Math.min(140, 900 / ncol));
        const margin = { top: 44, right: 28, bottom: (rotate ? 28 + Math.min(longest, 28) * 5.6 : 50) + 18, left: 74 };
        const W = Math.round(margin.left + margin.right + slot * ncol);
        const H = 438 + (rotate ? Math.min(longest, 28) * 4 : 0);
        const plotH = H - margin.top - margin.bottom;

        const values = plotted.map(it => it.value);
        let lo = Math.min(...values, 0);
        let hi = Math.max(...values, 0);
        const pad = Math.max((hi - lo) * 0.12, Math.pow(10, -opts.digits) * 5);
        const axis = niceTicks(lo - pad, hi + pad, 6);
        const y = v => margin.top + plotH * (1 - (v - axis.min) / (axis.max - axis.min));
        const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(axis.step))));
        const fmtTick = t => t.toFixed(decimals);

        const dotR = 6.5;
        const grid = opts.gridLines !== false;
        const dash = { solid: '', dotted: ' stroke-dasharray="0.1 6" stroke-linecap="round"', dashed: ' stroke-dasharray="8 5"' }[opts.lineStyle || 'solid'] || '';
        const cx = c => margin.left + slot * (c + 0.5);

        // dots that share a column and would overlap are spread sideways
        const xOff = new Array(n).fill(0);
        for (let c = 0; c < ncol; c++) {
            const members = plotted.map((it, i) => i).filter(i => col[i] === c).sort((a, b) => plotted[a].value - plotted[b].value);
            const close = members.some((m, k) => k > 0 && Math.abs(y(plotted[m].value) - y(plotted[members[k - 1]].value)) < 26);
            if (close) members.forEach((m, k) => { xOff[m] = (k - (members.length - 1) / 2) * 30; });
        }
        const px = i => cx(col[i]) + xOff[i];

        let g = '';

        // grid + y ticks
        axis.ticks.forEach(t => {
            const yy = y(t).toFixed(1);
            if (grid) g += `<line x1="${margin.left}" y1="${yy}" x2="${W - margin.right}" y2="${yy}" stroke="${pal.grid}" stroke-width="1"/>`;
            g += `<text x="${margin.left - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${pal.muted}">${fmtTick(t)}</text>`;
        });

        // zero (reference) line
        if (axis.min < 0 && axis.max > 0) {
            g += `<line x1="${margin.left}" y1="${y(0).toFixed(1)}" x2="${W - margin.right}" y2="${y(0).toFixed(1)}" stroke="${pal.axis}" stroke-width="1" stroke-dasharray="5 4"/>`;
        }

        // axes
        g += `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="${pal.axis}" stroke-width="1.5"/>`;
        g += `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${W - margin.right}" y2="${margin.top + plotH}" stroke="${pal.axis}" stroke-width="1.5"/>`;

        // smooth connecting curves (flat tangent at each stage => rounded peaks and wells).
        // Main path = first connection of each parent/child; other branches are drawn grey underneath.
        const edgePath = (j, i) => {
            const x1 = px(j), x2 = px(i), k = (x2 - x1) * 0.5;
            const y1 = y(plotted[j].value), y2 = y(plotted[i].value);
            return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + k).toFixed(1)} ${y1.toFixed(1)} ${(x2 - k).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        };
        const mainEdges = [], branchEdges = [];
        parentsOf.forEach((ps, i) => ps.forEach((j, pos) => {
            (childrenOf[j][0] === i && pos === 0 ? mainEdges : branchEdges).push(edgePath(j, i));
        }));
        branchEdges.forEach(d => { g += `<path d="${d}" fill="none" stroke="${pal.branch}" stroke-width="2.2"${dash}/>`; });
        mainEdges.forEach(d => { g += `<path d="${d}" fill="none" stroke="${pal.link}" stroke-width="2.2"${dash}/>`; });

        // dots (minima / transition states) and values
        plotted.forEach((it, i) => {
            const color = it.isTS ? pal.ts : pal.minimum;
            const yy = y(it.value);
            const unitText = it.value.toFixed(opts.digits);
            g += `<g><title>${esc(it.label)}: ${esc(unitText)} ${esc(opts.unit)}${it.isTS ? ' (transition state)' : ''}</title>`;
            g += `<circle cx="${px(i).toFixed(1)}" cy="${yy.toFixed(1)}" r="${dotR}" fill="${color}" stroke="${pal.bg === 'none' ? '#0f172a' : '#ffffff'}" stroke-width="1.5"/>`;
            if (opts.showValues) {
                const around = parentsOf[i].concat(childrenOf[i]).map(j => plotted[j].value);
                const above = it.isTS || (around.length > 0 && around.every(v => it.value >= v));
                const ty = above ? yy - 14 : yy + 24;
                g += `<text x="${px(i).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${esc(unitText)}</text>`;
            }
            g += '</g>';
        });

        // stage labels under the axis (one per column)
        colLabels.forEach((txt, c) => {
            const lx = cx(c).toFixed(1);
            const ly = (margin.top + plotH + 20).toFixed(1);
            const label = esc(txt.length > 34 ? txt.slice(0, 33) + '…' : txt);
            if (rotate) {
                g += `<text x="${lx}" y="${ly}" text-anchor="end" font-size="12" fill="${pal.fg}" transform="rotate(-35 ${lx} ${ly})">${label}</text>`;
            } else {
                g += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="12.5" fill="${pal.fg}">${label}</text>`;
            }
        });

        // x axis title
        g += `<text x="${((margin.left + W - margin.right) / 2).toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600" fill="${pal.fg}">Reaction Coordinate</text>`;

        // y axis title
        const midY = margin.top + plotH / 2;
        g += `<text transform="translate(18 ${midY.toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="13" font-weight="600" fill="${pal.fg}">Relative ${esc(opts.symbol.replace(/^Δ/, ''))} (${esc(opts.unit)})</text>`;

        // legend
        const lgx = W - margin.right - 200;
        g += `<circle cx="${lgx + 6}" cy="18" r="5.5" fill="${pal.minimum}"/><text x="${lgx + 18}" y="22" font-size="12" fill="${pal.muted}">minimum</text>`;
        g += `<circle cx="${lgx + 98}" cy="18" r="5.5" fill="${pal.ts}"/><text x="${lgx + 110}" y="22" font-size="12" fill="${pal.muted}">TS ‡ (imag. freq.)</text>`;

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
