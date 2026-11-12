/*
 * LogiDFT - user interface: state, rendering, event handling.
 * All interaction goes through two delegated listeners (click / change) that dispatch on
 * `data-action` / `data-change` attributes, so there are no inline event handlers in the HTML.
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});
    const doc = root.document;
    const esc = NS.escapeHtml;

    const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
    const $$ = (sel, ctx) => Array.from((ctx || doc).querySelectorAll(sel));

    // ------------------------------------------------------------------ state

    const SETTINGS_KEY = 'logidft.site.settings.v1';
    const DEFAULTS = {
        coordFormat: 'atomic',   // 'atomic' | 'symbol'
        energyFormat: 'HF',      // 'HF' | 'E_DFT' | 'PLAIN'
        unit: 'kcal',            // key of NS.UNITS
        energyType: 'G',         // key of NS.ENERGY_TYPES
        showValues: true,
        theme: 'light',
        tab: 'structures',
        refId: ''                // session only (ids are random per load)
    };
    const PERSISTED = ['coordFormat', 'energyFormat', 'unit', 'energyType', 'showValues', 'theme', 'tab'];
    const VIEW_DEFAULTS = { style: 'ballstick', labels: 'none', hideH: false, bg: 'white', spin: false, measure: false };
    const MAX_OPEN_VIEWERS = 8; // browsers only allow ~16 WebGL contexts per page

    const state = {
        logs: [],             // raw parsed log files
        files: [],            // species built from the logs (freq + sp pairs); everything below renders these
        viewers: new Map(),   // file id -> MolViewer (insertion order = open order)
        settings: loadSettings(),
        toastTimer: null
    };

    function loadSettings() {
        const s = Object.assign({}, DEFAULTS);
        try {
            const stored = JSON.parse(root.localStorage.getItem(SETTINGS_KEY) || '{}');
            PERSISTED.forEach(k => { if (stored[k] !== undefined) s[k] = stored[k]; });
        } catch (e) { /* storage unavailable (private mode / file://) */ }
        if (!NS.UNITS[s.unit]) s.unit = DEFAULTS.unit;
        if (!NS.ENERGY_TYPES[s.energyType]) s.energyType = DEFAULTS.energyType;
        return s;
    }

    function saveSettings() {
        try {
            const out = {};
            PERSISTED.forEach(k => { out[k] = state.settings[k]; });
            root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(out));
        } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------------ helpers

    const getFile = id => state.files.find(f => f.id === id) || null;
    const siOpts = () => ({ energyFormat: state.settings.energyFormat, coordFormat: state.settings.coordFormat });
    const unitInfo = () => NS.UNITS[state.settings.unit];
    const typeInfo = () => NS.ENERGY_TYPES[state.settings.energyType];
    const currentProfile = () => NS.buildProfile(state.files, typeInfo().key, state.settings.refId);
    const stamp = () => new Date().toISOString().slice(0, 10);

    function showToast(message, type) {
        const toast = $('#toast');
        $('#toastMsg').textContent = message;
        const icon = $('#toastIcon');
        const kind = type || 'success';
        icon.className = 'fa-solid ' + (kind === 'success' ? 'fa-circle-check ok' : kind === 'error' ? 'fa-circle-exclamation err' : 'fa-circle-info info');
        toast.classList.add('show');
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    }

    function copyText(text, successMsg) {
        const fallback = () => {
            const ta = doc.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            doc.body.appendChild(ta);
            ta.focus();
            ta.select();
            let ok = false;
            try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
            doc.body.removeChild(ta);
            showToast(ok ? successMsg : 'Copying failed.', ok ? 'success' : 'error');
        };
        if (root.navigator.clipboard && root.isSecureContext) {
            root.navigator.clipboard.writeText(text).then(() => showToast(successMsg, 'success'), fallback);
        } else {
            fallback();
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = filename;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const downloadText = (text, filename, mime) => downloadBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);

    const safeName = s => String(s).replace(/[^\w.\-]+/g, '_');

    // ------------------------------------------------------------------ file loading

    function readFileText(file) {
        if (file.text) return file.text();
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsText(file);
        });
    }

    /** Rebuilds the species list from the raw logs (pairs freq + sp), keeping the user's per-species edits and order. */
    function rebuildSpecies() {
        const prev = new Map(state.files.map(f => [f.key, f]));
        const order = new Map(state.files.map((f, i) => [f.key, i]));
        const fresh = NS.pairLogs(state.logs).map((pair, i) => {
            const sp = NS.makeSpecies(pair);
            sp.logIds = [pair.freq, pair.sp].filter(Boolean).map(l => l.id);
            const old = prev.get(sp.key);
            if (old) {
                sp.title = old.title; sp.role = old.role; sp.stageLabel = old.stageLabel;
                sp.view = old.view; sp.viewerOpen = old.viewerOpen;
            } else {
                sp.view = Object.assign({}, VIEW_DEFAULTS);
                sp.viewerOpen = false;
            }
            sp.formula = NS.hillFormula(sp.atoms);
            sp._ord = order.has(sp.key) ? order.get(sp.key) : 1e6 + i;
            return sp;
        });
        fresh.sort((a, b) => a._ord - b._ord);
        state.files = fresh;
    }

    function setBusy(on, text) {
        $('#dropzone').classList.toggle('is-busy', on);
        if (text) $('#busyText').textContent = text;
    }

    async function handleFiles(fileList) {
        const list = Array.from(fileList || []);
        if (list.length === 0) return;

        setBusy(true, `Parsing ${list.length} file${list.length > 1 ? 's' : ''}…`);
        const added = [];
        const failed = [];
        for (const file of list) {
            try {
                const text = await readFileText(file);
                added.push(NS.parseDFTLog(file.name, text));
            } catch (err) {
                console.error('Could not parse', file.name, err);
                failed.push(file.name);
            }
            await new Promise(r => setTimeout(r, 0)); // keep the page responsive between files
        }
        setBusy(false);

        if (added.length) {
            closeAllViewers();
            state.logs.push(...added);
            rebuildSpecies();
            renderAll();
            const paired = state.files.filter(f => f.freqFileName && f.spFileName).length;
            const withWarnings = state.files.filter(f => f.warnings.length).length;
            let msg = `Processed ${added.length} log file(s) → ${state.files.length} structure(s), ${paired} with freq + sp paired.`;
            if (withWarnings) msg += ` ${withWarnings} with warnings.`;
            showToast(msg, withWarnings ? 'info' : 'success');
        }
        if (failed.length) showToast(`Could not read: ${failed.join(', ')}`, 'error');
    }

    // ------------------------------------------------------------------ rendering

    function renderAll() {
        updateReferenceDropdown();
        renderSummary();
        renderStructures();
        renderTable();
        renderProfile();
    }

    function updateReferenceDropdown() {
        const select = $('#refStructureSelect');
        const key = typeInfo().key;
        const stages = NS.groupStages(state.files);
        select.innerHTML = '';
        stages.forEach(st => {
            const opt = doc.createElement('option');
            const v = st.members.every(m => m[key] !== null) ? st.members.reduce((t, m) => t + m[key], 0) : null;
            opt.value = st.key;
            opt.textContent = `${st.label} (${typeInfo().symbol.slice(1)} = ${v !== null ? v.toFixed(6) : 'N/A'} Hartree)`;
            select.appendChild(opt);
        });
        if (!stages.some(st => st.key === state.settings.refId)) state.settings.refId = stages.length ? stages[0].key : '';
        select.value = state.settings.refId;
    }

    function renderSummary() {
        const files = state.files;
        $('#summaryBanner').classList.toggle('hidden', files.length === 0);
        $('#structuresToolbar').classList.toggle('hidden', files.length === 0);
        $('#statFileCount').textContent = files.length;
        $('#statTSCount').textContent = files.filter(f => f.imaginaryFreqCount > 0).length;

        const withG = files.filter(f => f.sumElecThermalG !== null);
        $('#statLowestG').textContent = withG.length
            ? (() => { const low = withG.reduce((a, b) => (a.sumElecThermalG < b.sumElecThermalG ? a : b)); return `${low.title} (${low.sumElecThermalG.toFixed(6)} Ha)`; })()
            : '--';

        const warned = files.filter(f => f.warnings.length).length;
        const w = $('#statWarnings');
        w.textContent = warned;
        w.className = 'stat-value ' + (warned ? 'text-warn' : 'text-muted');
    }

    function chip(icon, text, cls, title) {
        return `<span class="chip ${cls || ''}"${title ? ` title="${esc(title)}"` : ''}><i class="fa-solid ${icon}"></i><span class="chip-text">${esc(text)}</span></span>`;
    }

    function chipsHTML(file) {
        const c = [];
        if (file.imaginaryFreqCount === 1) {
            c.push(chip('fa-bolt', `Transition state · ν = ${file.imaginaryFreqs[0].toFixed(1)} cm⁻¹`, 'chip-warn'));
        } else if (file.imaginaryFreqCount > 1) {
            c.push(chip('fa-triangle-exclamation', `${file.imaginaryFreqCount} imaginary frequencies (higher-order saddle point)`, 'chip-danger'));
        } else if (file.thermalGibbsCorr !== null) {
            c.push(chip('fa-circle-check', 'Minimum · no imaginary frequencies', 'chip-ok'));
        }
        if (file.energySource === 'sp' && file.freqFileName) c.push(chip('fa-link', 'E = HF(sp) + G corr.(freq)', 'chip-ok', `${file.spFileName} + ${file.freqFileName}`));
        else if (file.energySource === 'freq') c.push(chip('fa-link-slash', 'No sp log paired', 'chip-warn'));
        if (file.role === 'balance') c.push(chip('fa-scale-balanced', 'Balancing species', 'chip-warn'));
        if (file.program && file.program !== 'Unknown') c.push(chip('fa-microchip', file.program));
        if (file.route) c.push(chip('fa-flask', file.route, 'chip-mono', file.route));
        if (file.charge !== null && file.multiplicity !== null) c.push(chip('fa-bolt-lightning', `Charge ${file.charge}, multiplicity ${file.multiplicity}`));
        if (file.atoms.length) c.push(chip('fa-atom', `${file.formula} · ${file.atoms.length} atoms`));
        file.warnings.forEach(w => c.push(chip('fa-triangle-exclamation', w, 'chip-danger')));
        return c.join('');
    }

    function viewerToolbarHTML(file) {
        const styleBtn = (value, label) =>
            `<button type="button" data-action="v-style" data-value="${value}" aria-pressed="false">${label}</button>`;
        const toggle = (prop, icon, label, title) =>
            `<button type="button" class="btn btn-sm" data-action="v-toggle" data-prop="${prop}" aria-pressed="false" title="${title}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
        const vib = file.imaginaryModes && file.imaginaryModes.length
            ? `<button type="button" class="btn btn-sm btn-accent" data-action="v-vib" aria-pressed="false" title="Animate the imaginary vibrational mode (${file.imaginaryModes[0].freq.toFixed(1)} cm⁻¹)"><i class="fa-solid fa-wave-square"></i> <span data-role="vib-label">Animate TS mode</span></button><span class="sep"></span>`
            : '';
        return `
            <div class="viewer-toolbar no-print">
                <div class="seg" role="group" aria-label="Display style">
                    ${styleBtn('ballstick', 'Ball &amp; stick')}${styleBtn('stick', 'Stick')}${styleBtn('sphere', 'Spacefill')}${styleBtn('wire', 'Wire')}
                </div>
                <select data-change="v-labels" aria-label="Atom labels" title="Atom labels">
                    <option value="none">No labels</option><option value="symbol">Symbols</option>
                    <option value="number">Numbers</option><option value="both">Symbol + number</option>
                </select>
                <select data-change="v-bg" aria-label="Background" title="Background">
                    <option value="dark">Dark</option><option value="light">Light</option><option value="white">White</option>
                </select>
                <span class="sep"></span>
                ${toggle('hideH', 'fa-eye-slash', 'Hide H', 'Hide hydrogen atoms')}
                ${toggle('measure', 'fa-ruler-combined', 'Measure', 'Click 2, 3 or 4 atoms to measure a distance, angle or dihedral')}
                ${toggle('spin', 'fa-rotate', 'Spin', 'Auto-rotate')}
                <span class="sep"></span>
                ${vib}
                <button type="button" class="btn btn-sm btn-icon" data-action="v-reset" title="Reset view" aria-label="Reset view"><i class="fa-solid fa-crosshairs"></i></button>
                <button type="button" class="btn btn-sm btn-icon" data-action="v-fullscreen" title="Fullscreen" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                <button type="button" class="btn btn-sm btn-icon" data-action="v-png" title="Save image (PNG)" aria-label="Save image as PNG"><i class="fa-solid fa-camera"></i></button>
                <button type="button" class="btn btn-sm" data-action="xyz-copy" title="Copy coordinates as XYZ"><i class="fa-solid fa-copy"></i> XYZ</button>
                <button type="button" class="btn btn-sm btn-icon" data-action="xyz-download" title="Download .xyz file" aria-label="Download .xyz file"><i class="fa-solid fa-download"></i></button>
            </div>`;
    }

    function cardHTML(file, index) {
        const hasAtoms = file.atoms.length > 0;
        return `
        <article class="card" data-id="${file.id}">
            <header class="card-head">
                <div class="card-id">
                    <span class="index-badge">#${index + 1}</span>
                    <div class="title-block">
                        <input type="text" class="title-input" value="${esc(file.title)}" data-change="title" aria-label="Structure name" title="Click to rename structure">
                        <span class="file-name">${esc(file.fileName)}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <span class="dg-badge hidden" data-role="dg"></span>
                    <button type="button" class="btn btn-accent" data-action="toggle-viewer" ${hasAtoms ? '' : 'disabled title="No coordinates found in this file"'}><i class="fa-solid fa-cube"></i> 3D view</button>
                    <button type="button" class="btn btn-primary" data-action="copy-si"><i class="fa-solid fa-copy"></i> Copy text</button>
                    <button type="button" class="icon-btn" data-action="remove" title="Remove file" aria-label="Remove file"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </header>
            <div class="chips">${chipsHTML(file)}</div>
            <div class="stage-row no-print">
                <label>Role
                    <select data-change="role" aria-label="Role in the reaction profile">
                        <option value="stage"${file.role === 'stage' ? ' selected' : ''}>Profile stage</option>
                        <option value="balance"${file.role === 'balance' ? ' selected' : ''}>Balancing species (reagent / by-product)</option>
                    </select>
                </label>
                <label class="${file.role === 'balance' ? 'hidden' : ''}">Stage
                    <input type="text" data-change="stage" value="${esc(file.stageLabel)}" placeholder="${esc(file.title)}" aria-label="Stage label (same label = same stage)" title="Species with the same stage label are summed into one stage">
                </label>
                <span class="stage-formula" title="Atoms and charge of this species">${esc(NS.formulaText(file.comp))} · ${file.comp.electrons} e⁻</span>
            </div>
            <div class="card-body">
                <section class="viewer-pane hidden" data-role="viewer-pane">
                    ${viewerToolbarHTML(file)}
                    <div class="stage">
                        <div class="mol"></div>
                        <div class="readout">
                            <span class="readout-text" data-role="readout"></span>
                            <span class="readout-hint">Drag: rotate · Scroll: zoom · Right-drag: pan</span>
                        </div>
                    </div>
                </section>
                <section class="si-pane">
                    <div class="si-title" data-role="si-title">${esc(file.title)}</div>
                    <pre class="si-text" data-role="si-text">${esc(NS.generateSITextBlock(file, siOpts()))}</pre>
                </section>
            </div>
        </article>`;
    }

    function renderStructures() {
        disposeViewers();
        const container = $('#resultsContainer');
        const hasFiles = state.files.length > 0;
        $('#emptyState').classList.toggle('hidden', hasFiles);
        container.innerHTML = state.files.map(cardHTML).join('');
        refreshBadges();
        state.files.forEach(f => { if (f.viewerOpen) openViewer(f.id); });
        applyFilter();
    }

    /** Δ badge on each card = relative (balanced) energy of the stage the species belongs to. */
    function refreshBadges() {
        const profile = currentProfile();
        const unit = state.settings.unit;
        const sym = typeInfo().symbol;
        state.files.forEach(file => {
            const badge = $(`.card[data-id="${file.id}"] [data-role="dg"]`);
            if (!badge) return;
            const st = NS.stageOf(profile, file);
            if (!st || st.status !== 'ok' || st.rel === null) { badge.classList.add('hidden'); return; }
            const rel = st.rel * NS.UNITS[unit].factor;
            const rounded = Number(rel.toFixed(NS.UNITS[unit].digits));
            badge.className = 'dg-badge ' + (rounded > 0 ? 'up' : rounded < 0 ? 'down' : '');
            badge.textContent = `${sym} = ${NS.formatRel(rel, unit, true)} ${NS.UNITS[unit].label}`;
            badge.title = `Stage "${st.label}"` + (st.balance && st.balance.length ? ` balanced with ${NS.balanceText(st.balance)}` : '');
        });
    }

    /** Re-renders only the SI text blocks (after a label-format change). */
    function refreshSIText() {
        state.files.forEach(file => {
            const pre = $(`.card[data-id="${file.id}"] [data-role="si-text"]`);
            if (pre) pre.textContent = NS.generateSITextBlock(file, siOpts());
        });
    }

    function applyFilter() {
        const q = ($('#filterInput').value || '').trim().toLowerCase();
        let visible = 0;
        state.files.forEach(f => {
            const card = $(`.card[data-id="${f.id}"]`);
            if (!card) return;
            const match = !q || f.title.toLowerCase().includes(q) || f.fileName.toLowerCase().includes(q);
            card.classList.toggle('hidden', !match);
            if (match) visible++;
        });
        $('#noMatch').classList.toggle('hidden', !(q && state.files.length && visible === 0));
    }

    // ---- energy table ----

    function renderTable() {
        const files = state.files;
        $('#tablePanel').classList.toggle('hidden', files.length === 0);
        $('#tableEmpty').classList.toggle('hidden', files.length !== 0);
        if (!files.length) return;

        const type = typeInfo();
        const unit = state.settings.unit;
        const U = NS.UNITS[unit];
        const profile = currentProfile();
        const withG = files.filter(f => f.sumElecThermalG !== null);
        const lowest = withG.length ? withG.reduce((a, b) => (a.sumElecThermalG < b.sumElecThermalG ? a : b)) : null;
        const n6 = v => (v !== null && v !== undefined ? v.toFixed(6) : '—');

        const head = `<thead><tr>
            <th>#</th><th>Structure</th><th>Type</th><th>N<sub>imag</sub></th>
            <th title="HF / SCF energy of the single-point (sp) log">E<sub>sp</sub> (HF)</th><th>ZPE corr.</th><th>H corr.</th><th>G corr.</th>
            <th>E + ZPE</th><th>H</th><th title="E(sp) + thermal correction to Gibbs free energy">G = E<sub>sp</sub> + G<sub>corr</sub></th>
            <th>Order</th></tr></thead>`;

        const rows = files.map((f, i) => {
            let tag = '<span class="tag tag-na">n/a</span>';
            if (f.imaginaryFreqCount === 1) tag = '<span class="tag tag-ts">TS</span>';
            else if (f.imaginaryFreqCount > 1) tag = `<span class="tag tag-ts">saddle (${f.imaginaryFreqCount})</span>`;
            else if (f.thermalGibbsCorr !== null) tag = '<span class="tag tag-min">min</span>';
            if (f.role === 'balance') tag += ' <span class="tag tag-na">balancing</span>';
            return `<tr data-id="${f.id}" class="${f === lowest ? 'is-lowest' : ''}">
                <td>${i + 1}</td><td>${esc(f.title)}</td><td>${tag}</td><td class="num">${f.imaginaryFreqCount}</td>
                <td class="num">${n6(f.elecEnergy)}</td><td class="num">${n6(f.zpeCorr)}</td>
                <td class="num">${n6(f.thermalEnthalpyCorr)}</td><td class="num">${n6(f.thermalGibbsCorr)}</td>
                <td class="num">${n6(f.sumElecZpe)}</td><td class="num">${n6(f.sumElecThermalH)}</td><td class="num">${n6(f.sumElecThermalG)}</td>
                <td class="row-actions">
                    <button type="button" data-action="move-up" ${i === 0 ? 'disabled' : ''} aria-label="Move up" title="Move up"><i class="fa-solid fa-chevron-up"></i></button>
                    <button type="button" data-action="move-down" ${i === files.length - 1 ? 'disabled' : ''} aria-label="Move down" title="Move down"><i class="fa-solid fa-chevron-down"></i></button>
                </td></tr>`;
        }).join('');
        $('#dataTable').innerHTML = head + `<tbody>${rows}</tbody>`;

        // balanced stage table
        const status = {
            'no-energy': 'missing energy (load the sp and freq logs)',
            'unbalanced': 'cannot be balanced with the available balancing species',
            'balance-no-energy': 'a balancing species has no energy'
        };
        const sHead = `<thead><tr><th>Stage</th><th>Species</th><th>Composition</th>
            <th>Σ ${esc(type.symbol.slice(1))} species (Ha)</th><th>Balancing species added</th><th>Balanced ${esc(type.symbol.slice(1))} (Ha)</th>
            <th>${esc(type.symbol)} (${U.label})</th></tr></thead>`;
        const sRows = profile.stages.map(st => {
            const ok = st.status === 'ok';
            const isRef = profile.ref === st;
            return `<tr class="${isRef ? 'is-lowest' : ''}">
                <td>${esc(st.label)}${st.isTS ? ' <span class="tag tag-ts">TS</span>' : ''}${isRef ? ' <span class="tag tag-min">ref</span>' : ''}</td>
                <td>${st.members.map(m => esc(m.title)).join(' + ')}</td>
                <td>${esc(NS.formulaText(st.comp))} · ${st.comp.electrons} e⁻</td>
                <td class="num">${n6(st.raw)}</td>
                <td>${ok ? esc(NS.balanceText(st.balance)) : `<span class="text-warn">${esc(status[st.status] || '')}</span>`}</td>
                <td class="num">${ok ? n6(st.value) : '—'}</td>
                <td class="num"><strong>${ok ? NS.formatRel(st.rel * U.factor, unit, true) : '—'}</strong></td></tr>`;
        }).join('');
        $('#stageTable').innerHTML = sHead + `<tbody>${sRows}</tbody>`;
    }

    // ---- energy profile ----

    function profileData(palette) {
        const type = typeInfo();
        const unit = state.settings.unit;
        const profile = currentProfile();
        const items = profile.stages.map(st => ({
            label: st.label,
            value: st.status === 'ok' && st.rel !== null ? st.rel * NS.UNITS[unit].factor : null,
            isTS: st.isTS
        }));
        const built = NS.buildProfileSVG(items, {
            palette: palette,
            unit: NS.UNITS[unit].label,
            symbol: type.symbol,
            digits: NS.UNITS[unit].digits,
            showValues: state.settings.showValues
        });
        return { type, profile, built };
    }

    function renderProfile() {
        const hasFiles = state.files.length > 0;
        $('#profilePanel').classList.toggle('hidden', !hasFiles);
        $('#profileEmpty').classList.toggle('hidden', hasFiles);
        if (!hasFiles) return;

        const { type, profile, built } = profileData(state.settings.theme === 'light' ? 'light' : 'dark');
        const chart = $('#profileChart');
        const note = $('#profileNote');

        if (!built.svg) {
            chart.innerHTML = '<div class="empty"><h3>No values to plot</h3><p>No stage has a complete energy. Load each frequency log together with its single-point (sp) log.</p></div>';
            note.innerHTML = '';
            return;
        }
        chart.innerHTML = built.svg;

        let text = `${esc(type.label)} = E(HF, sp) + thermal correction, relative to <strong>${esc(profile.ref.label)}</strong>. `
            + 'Every stage is balanced to the same atoms and electrons as the reference';
        const bal = profile.stages.filter(st => st.status === 'ok' && st.balance && st.balance.length);
        if (bal.length) text += ': ' + bal.map(st => `${esc(st.label)} ${esc(NS.balanceText(st.balance))}`).join('; ');
        text += '.';
        const bad = profile.stages.filter(st => st.status !== 'ok');
        if (bad.length) {
            text += ` <span class="text-warn">Not plotted: ${bad.map(st => esc(st.label)).join(', ')} — missing energy, or no combination of balancing species matches the reference atoms/charge (mark reagents/by-products as “Balancing species”).</span>`;
        }
        note.innerHTML = text;
    }

    // ------------------------------------------------------------------ 3D viewer glue

    function cardFor(id) { return $(`.card[data-id="${id}"]`); }

    function setReadout(card, text) {
        const el = $('[data-role="readout"]', card);
        if (el) el.textContent = text;
    }

    function syncViewerUI(card, file) {
        const v = file.view;
        $$('[data-action="v-style"]', card).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v.style)));
        $$('[data-action="v-toggle"]', card).forEach(b => b.setAttribute('aria-pressed', String(!!v[b.dataset.prop])));
        const labels = $('[data-change="v-labels"]', card);
        const bg = $('[data-change="v-bg"]', card);
        if (labels) labels.value = v.labels;
        if (bg) bg.value = v.bg;
    }

    function updateVibrationButton(card, on) {
        const btn = $('[data-action="v-vib"]', card);
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(on));
        $('[data-role="vib-label"]', btn).textContent = on ? 'Stop animation' : 'Animate TS mode';
    }

    function openViewer(id) {
        const file = getFile(id);
        const card = cardFor(id);
        if (!file || !card || !file.atoms.length) return;

        // keep the number of live WebGL contexts bounded
        while (state.viewers.size >= MAX_OPEN_VIEWERS && !state.viewers.has(id)) {
            const oldest = state.viewers.keys().next().value;
            closeViewer(oldest);
            showToast(`Closed the oldest 3D view (max ${MAX_OPEN_VIEWERS} open at once).`, 'info');
        }

        $('[data-role="viewer-pane"]', card).classList.remove('hidden');
        card.classList.add('has-viewer');
        file.viewerOpen = true;
        const toggleBtn = $('[data-action="toggle-viewer"]', card);
        if (toggleBtn) toggleBtn.classList.add('is-on');
        syncViewerUI(card, file);
        if (state.viewers.has(id)) return;

        const stage = $('.mol', card);
        if (!root.$3Dmol) {
            stage.innerHTML = '<div style="padding:24px;text-align:center;color:#fb7185;font-size:12px">The 3D viewer library could not be loaded. Please check your internet connection and reload.</div>';
            return;
        }
        try {
            const mv = new NS.MolViewer(file, stage, file.view, {
                onReadout: text => setReadout(card, text),
                onVibrationChange: on => updateVibrationButton(card, on)
            });
            state.viewers.set(id, mv);
        } catch (err) {
            console.error('3Dmol rendering error:', err);
            stage.innerHTML = `<div style="padding:24px;text-align:center;color:#fb7185;font-size:12px">Could not load 3D viewer. (${esc(err.message)})</div>`;
        }
    }

    function closeViewer(id) {
        const file = getFile(id);
        const card = cardFor(id);
        const mv = state.viewers.get(id);
        if (mv) { mv.destroy(); state.viewers.delete(id); }
        if (file) { file.viewerOpen = false; file.view.measure = false; file.view.spin = false; }
        if (card) {
            $('[data-role="viewer-pane"]', card).classList.add('hidden');
            card.classList.remove('has-viewer');
            const toggleBtn = $('[data-action="toggle-viewer"]', card);
            if (toggleBtn) toggleBtn.classList.remove('is-on');
            setReadout(card, '');
            updateVibrationButton(card, false);
        }
    }

    /** Frees WebGL contexts without touching `viewerOpen` (used before re-rendering cards). */
    function disposeViewers() {
        state.viewers.forEach(mv => mv.destroy());
        state.viewers.clear();
    }

    function closeAllViewers() {
        state.files.forEach(f => { f.viewerOpen = false; });
        disposeViewers();
    }

    // ------------------------------------------------------------------ settings UI

    function applyTheme() {
        const theme = state.settings.theme;
        const appRoot = $('.logidft-app') || doc.documentElement;
        appRoot.setAttribute('data-theme', theme);
        const icon = $('#themeIcon');
        if (icon) icon.className = 'fa-solid ' + (theme === 'dark' ? 'fa-sun' : 'fa-moon');
    }

    function syncSettingsUI() {
        const s = state.settings;
        $('#optAtomicNum').setAttribute('aria-pressed', String(s.coordFormat === 'atomic'));
        $('#optSymbol').setAttribute('aria-pressed', String(s.coordFormat === 'symbol'));
        $('#energyLabelFormat').value = s.energyFormat;
        $('#unitSelect').value = s.unit;
        $('#profileEnergyType').value = s.energyType;
        $('#showValues').checked = !!s.showValues;
        showTab(s.tab, true);
    }

    function showTab(name, skipSave) {
        if (!['structures', 'profile', 'table'].includes(name)) name = 'structures';
        state.settings.tab = name;
        $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.value === name)));
        ['structures', 'profile', 'table'].forEach(n => $('#tab-' + n).classList.toggle('hidden', n !== name));
        if (name === 'profile') renderProfile();
        if (!skipSave) saveSettings();
    }

    // ------------------------------------------------------------------ actions

    function exportCSV() {
        if (!state.files.length) return;
        const csv = NS.buildCSV(state.files, currentProfile(), state.settings.unit, typeInfo().symbol);
        downloadText('﻿' + csv, `DFT_Energies_Summary_${stamp()}.csv`, 'text/csv');
        showToast('Exported CSV energy table', 'success');
    }

    function moveFile(id, delta) {
        const i = state.files.findIndex(f => f.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= state.files.length) return;
        const tmp = state.files[i];
        state.files[i] = state.files[j];
        state.files[j] = tmp;
        updateReferenceDropdown();
        renderStructures();
        renderTable();
        renderProfile();
    }

    function sortFiles(mode) {
        const byNum = key => (a, b) => (a[key] === null) - (b[key] === null) || (a[key] - b[key]);
        if (mode === 'name') state.files.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
        else if (mode === 'g') state.files.sort(byNum('sumElecThermalG'));
        else if (mode === 'e') state.files.sort(byNum('elecEnergy'));
        else return;
        updateReferenceDropdown();
        renderStructures();
        renderTable();
        renderProfile();
    }

    function removeFile(id) {
        const f = getFile(id);
        closeViewer(id);
        if (f) state.logs = state.logs.filter(l => !f.logIds.includes(l.id));
        rebuildSpecies();
        renderAll();
        showToast('File removed.', 'info');
    }

    function clearAll() {
        if (!state.files.length) return;
        closeAllViewers();
        state.logs = [];
        state.files = [];
        state.settings.refId = '';
        $('#filterInput').value = '';
        renderAll();
        showToast('Cleared all loaded data.', 'info');
    }

    function downloadPNG(url, name) {
        const a = doc.createElement('a');
        a.href = url;
        a.download = name;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
    }

    const ACTIONS = {
        'toggle-theme': () => {
            state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
            saveSettings();
            renderProfile();
        },
        'set-coord': t => {
            state.settings.coordFormat = t.dataset.value;
            syncSettingsUI();
            refreshSIText();
            saveSettings();
        },
        'copy-all': () => {
            if (!state.files.length) { showToast('No files available to copy.', 'error'); return; }
            copyText(NS.allSIText(state.files, siOpts(), '-'), `Copied SI data for all ${state.files.length} structure(s)`);
        },
        'download-all': () => {
            if (!state.files.length) return;
            downloadText(NS.allSIText(state.files, siOpts(), '='), `DFT_Supporting_Information_${stamp()}.txt`);
            showToast('Downloaded Supporting Information .txt file', 'success');
        },
        'export-csv': () => exportCSV(),
        'clear-all': () => clearAll(),
        'tab': t => showTab(t.dataset.value),
        'expand-all': () => {
            const withAtoms = state.files.filter(f => f.atoms.length);
            withAtoms.slice(0, MAX_OPEN_VIEWERS).forEach(f => openViewer(f.id));
            if (withAtoms.length > MAX_OPEN_VIEWERS) showToast(`Opened the first ${MAX_OPEN_VIEWERS} 3D views (browser limit).`, 'info');
        },
        'collapse-all': () => state.files.forEach(f => closeViewer(f.id)),

        // card actions
        'toggle-viewer': (t, id) => { (getFile(id) || {}).viewerOpen ? closeViewer(id) : openViewer(id); },
        'copy-si': (t, id) => {
            const f = getFile(id);
            if (f) copyText(NS.singleSIText(f, siOpts()), `Copied SI data for "${f.title}"`);
        },
        'remove': (t, id) => removeFile(id),

        // table
        'move-up': (t, id) => moveFile(id, -1),
        'move-down': (t, id) => moveFile(id, 1),
        'copy-table': () => {
            if (!state.files.length) return;
            copyText(NS.buildTSV(state.files, currentProfile(), state.settings.unit, typeInfo().symbol), 'Copied energy table (tab-separated — paste into Excel)');
        },

        // profile
        'profile-svg': () => {
            const { built } = profileData('light');
            if (!built.svg) { showToast('Nothing to export yet.', 'error'); return; }
            downloadText(built.svg, `Energy_Profile_${stamp()}.svg`, 'image/svg+xml');
            showToast('Saved energy profile (SVG)', 'success');
        },
        'profile-png': async () => {
            const { built } = profileData('light');
            if (!built.svg) { showToast('Nothing to export yet.', 'error'); return; }
            const blob = await NS.svgToPngBlob(built.svg, 2);
            if (!blob) { showToast('Could not render PNG in this browser.', 'error'); return; }
            downloadBlob(blob, `Energy_Profile_${stamp()}.png`);
            showToast('Saved energy profile (PNG)', 'success');
        },

        // 3D viewer toolbar
        'v-style': (t, id) => {
            const mv = state.viewers.get(id);
            if (!mv) return;
            mv.set('style', t.dataset.value);
            syncViewerUI(cardFor(id), getFile(id));
        },
        'v-toggle': (t, id) => {
            const mv = state.viewers.get(id);
            const f = getFile(id);
            if (!mv || !f) return;
            const prop = t.dataset.prop;
            if (prop === 'measure' && mv.vibrating) mv.toggleVibration();
            mv.set(prop, !f.view[prop]);
            syncViewerUI(cardFor(id), f);
        },
        'v-reset': (t, id) => { const mv = state.viewers.get(id); if (mv) mv.resetView(); },
        'v-fullscreen': (t, id) => {
            const pane = $('[data-role="viewer-pane"]', cardFor(id));
            if (doc.fullscreenElement) doc.exitFullscreen();
            else if (pane && pane.requestFullscreen) pane.requestFullscreen();
            else showToast('Fullscreen is not supported in this browser.', 'error');
        },
        'v-png': (t, id) => {
            const mv = state.viewers.get(id);
            const f = getFile(id);
            if (!mv || !f) return;
            try { downloadPNG(mv.pngDataURL(), `${safeName(f.title)}.png`); showToast('Saved structure image (PNG)', 'success'); }
            catch (err) { showToast('Could not capture the 3D view.', 'error'); }
        },
        'v-vib': (t, id) => {
            const mv = state.viewers.get(id);
            const f = getFile(id);
            if (!mv || !f) return;
            if (!mv.vibrating) { f.view.measure = false; }
            mv.toggleVibration();
            syncViewerUI(cardFor(id), f);
        },
        'xyz-copy': (t, id) => {
            const f = getFile(id);
            if (f) copyText(NS.toXYZ(f), `Copied XYZ coordinates of "${f.title}"`);
        },
        'xyz-download': (t, id) => {
            const f = getFile(id);
            if (f) { downloadText(NS.toXYZ(f), `${safeName(f.title)}.xyz`); showToast('Downloaded .xyz file', 'success'); }
        }
    };

    const CHANGES = {
        'energy-format': t => { state.settings.energyFormat = t.value; refreshSIText(); saveSettings(); },
        'reference': t => {
            state.settings.refId = t.value;
            refreshBadges();
            renderTable();
            renderProfile();
        },
        'unit': t => {
            state.settings.unit = t.value;
            refreshBadges();
            renderTable();
            renderProfile();
            saveSettings();
        },
        'energy-type': t => { state.settings.energyType = t.value; updateReferenceDropdown(); refreshBadges(); renderTable(); renderProfile(); saveSettings(); },
        'role': (t, id) => {
            const f = getFile(id);
            if (!f) return;
            f.role = t.value;
            renderAll();
        },
        'stage': (t, id) => {
            const f = getFile(id);
            if (!f) return;
            f.stageLabel = t.value.trim();
            renderAll();
        },
        'show-values': t => { state.settings.showValues = t.checked; renderProfile(); saveSettings(); },
        'sort': t => { sortFiles(t.value); t.value = ''; },
        'title': (t, id) => {
            const f = getFile(id);
            if (!f) return;
            const oldKey = (f.stageLabel || f.title).toLowerCase();
            f.title = t.value.trim() || f.title;
            t.value = f.title;
            if (!f.stageLabel && state.settings.refId === oldKey) state.settings.refId = f.title.toLowerCase();
            const card = cardFor(id);
            $('[data-role="si-title"]', card).textContent = f.title;
            updateReferenceDropdown();
            renderSummary();
            refreshBadges();
            renderTable();
            renderProfile();
        },
        'v-labels': (t, id) => { const mv = state.viewers.get(id); if (mv) mv.set('labels', t.value); },
        'v-bg': (t, id) => { const mv = state.viewers.get(id); if (mv) mv.set('bg', t.value); }
    };

    function bindEvents() {
        doc.addEventListener('click', e => {
            const t = e.target.closest('[data-action]');
            if (!t || t.disabled) return;
            const holder = t.closest('[data-id]');
            const handler = ACTIONS[t.dataset.action];
            if (handler) handler(t, holder ? holder.dataset.id : null, e);
        });

        doc.addEventListener('change', e => {
            const t = e.target.closest('[data-change]');
            if (!t) return;
            const holder = t.closest('[data-id]');
            const handler = CHANGES[t.dataset.change];
            if (handler) handler(t, holder ? holder.dataset.id : null, e);
        });

        $('#filterInput').addEventListener('input', applyFilter);

        // --- drop zone (click, keyboard, drag & drop anywhere on the page) ---
        const dropzone = $('#dropzone');
        const input = $('#fileInput');
        dropzone.addEventListener('click', () => input.click());
        dropzone.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });

        const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
        let dragDepth = 0;
        root.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; dropzone.classList.add('drag-over'); } });
        root.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
        root.addEventListener('dragleave', e => {
            if (!hasFiles(e)) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) dropzone.classList.remove('drag-over');
        });
        root.addEventListener('drop', e => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth = 0;
            dropzone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        // --- keep 3D canvases sized correctly ---
        let resizeTimer = null;
        const resizeViewers = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => state.viewers.forEach(mv => mv.resize()), 120);
        };
        root.addEventListener('resize', resizeViewers);
        doc.addEventListener('fullscreenchange', resizeViewers);
    }

    function init() {
        applyTheme();
        bindEvents();
        syncSettingsUI();
        renderAll();
    }

    NS.UI = { init, state, handleFiles, renderAll };
})(typeof window !== 'undefined' ? window : globalThis);
