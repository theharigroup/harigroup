/*
 * LogiDFT - species model and stage balancing.
 *
 * A "species" is one chemical structure. Its energy is ALWAYS built as
 *
 *      E_elec (HF / SCF energy of the single-point (sp) log)  +  thermal correction (from the frequency log)
 *
 * so   G = E_sp + G_corr,   H = E_sp + H_corr,   E0 = E_sp + ZPE.
 * Frequency and single-point logs are paired automatically (same base file name, or same geometry).
 *
 * A reaction-profile "stage" is one or more species taken together (same stage label). Every stage in a
 * profile must contain the same atoms and the same total charge (= same number of electrons) as the
 * reference stage; when it does not, the energies of "balancing species" (free reagents / by-products)
 * are added or subtracted with integer coefficients until it does.
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    // ------------------------------------------------------------------ pairing

    const SP_SUFFIX = /[_\-.\s]*(?:sp|spe|spc|single[_\-]?point|sp[_\-]?energy)$/i;
    const FREQ_SUFFIX = /[_\-.\s]*(?:freq|frequency|frq|opt[_\-]?freq|opt|ts[_\-]?freq|thermo|therm)$/i;

    function stem(fileName, isSp) {
        const base = String(fileName).replace(/\.[^.]+$/, '');
        const stripped = base.replace(isSp ? SP_SUFFIX : FREQ_SUFFIX, '');
        return (stripped || base).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    /** True when two geometries have the same atom sequence and the same interatomic distances (rotation-proof). */
    function sameGeometry(a, b, tol) {
        if (!a || !b || a.length === 0 || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i].atomicNum !== b[i].atomicNum) return false;
        const t = tol || 0.02;
        const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        for (let i = 0; i < a.length; i++) {
            for (let j = i + 1; j < a.length; j++) {
                if (Math.abs(d(a[i], a[j]) - d(b[i], b[j])) > t) return false;
            }
        }
        return true;
    }

    /**
     * Pairs logs into {freq, sp}. A log with thermochemistry (or a freq/opt job) is a "freq" log; a log without
     * is a "sp" log. Unpaired logs come back with the other side null. Order follows the order of `logs`.
     */
    function pairLogs(logs) {
        const freqs = logs.filter(l => l.jobType !== 'sp');
        const sps = logs.filter(l => l.jobType === 'sp');
        const partner = new Map();      // freq.id -> sp
        const usedSp = new Set();

        sps.forEach(sp => {
            const key = stem(sp.fileName, true);
            let match = freqs.find(f => !partner.has(f.id) && stem(f.fileName, false) === key);
            if (!match) match = freqs.find(f => !partner.has(f.id) && sameGeometry(f.atoms, sp.atoms));
            if (match) { partner.set(match.id, sp); usedSp.add(sp.id); }
        });

        const pairs = freqs.map(f => ({ freq: f, sp: partner.get(f.id) || null }));
        sps.filter(s => !usedSp.has(s.id)).forEach(s => pairs.push({ freq: null, sp: s }));
        const at = p => Math.min(...[p.freq, p.sp].filter(Boolean).map(l => logs.indexOf(l)));
        return pairs.sort((a, b) => at(a) - at(b));
    }

    // ------------------------------------------------------------------ composition

    /** Element counts, total charge and electron count. */
    function composition(atoms, charge) {
        const counts = {};
        let z = 0;
        (atoms || []).forEach(a => { counts[a.symbol] = (counts[a.symbol] || 0) + 1; z += a.atomicNum || 0; });
        const q = Number.isFinite(charge) ? charge : 0;
        return { counts, charge: q, electrons: z - q };
    }

    function addComp(list) {
        const counts = {};
        let charge = 0, electrons = 0;
        list.forEach(c => {
            Object.entries(c.counts).forEach(([el, n]) => { counts[el] = (counts[el] || 0) + n; });
            charge += c.charge; electrons += c.electrons;
        });
        return { counts, charge, electrons };
    }

    const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
    function formulaText(comp) {
        const syms = Object.keys(comp.counts).filter(s => comp.counts[s] > 0);
        const ordered = comp.counts.C
            ? ['C'].concat(comp.counts.H ? ['H'] : [], syms.filter(s => s !== 'C' && s !== 'H').sort())
            : syms.sort();
        let t = ordered.map(s => s + (comp.counts[s] > 1 ? String(comp.counts[s]).replace(/\d/g, d => SUB[d]) : '')).join('');
        if (comp.charge) t += (comp.charge > 0 ? '⁺' : '⁻') + (Math.abs(comp.charge) > 1 ? Math.abs(comp.charge) : '');
        return t || '—';
    }

    // ------------------------------------------------------------------ species

    /**
     * Builds one species from a {freq, sp} pair.
     * Energy (HF) comes from the sp log; thermal corrections come from the freq log.
     */
    function makeSpecies(pair) {
        const f = pair.freq, s = pair.sp;
        const geomLog = f || s;
        const warnings = [];

        let elecEnergy = null, energySource = null;
        if (s && s.elecEnergy !== null) { elecEnergy = s.elecEnergy; energySource = 'sp'; }
        else if (f && f.elecEnergy !== null) { elecEnergy = f.elecEnergy; energySource = 'freq'; }

        const corr = k => (f && f[k] !== null && f[k] !== undefined ? f[k] : null);
        const zpeCorr = corr('zpeCorr'), tE = corr('thermalEnergyCorr'), tH = corr('thermalEnthalpyCorr'), tG = corr('thermalGibbsCorr');
        const plus = (c) => (elecEnergy !== null && c !== null ? elecEnergy + c : null);

        if (f && !s) warnings.push('No single-point (sp) log paired. E is taken from the frequency job; add the matching sp file (e.g. name_sp.log).');
        if (s && !f) warnings.push('No frequency log paired, so no thermal correction: G, H and E₀ are unavailable (only E).');
        if (f && f.thermalGibbsCorr === null) warnings.push(`${f.fileName}: no thermochemistry found (was a frequency calculation run?)`);
        [f, s].filter(Boolean).forEach(l => { if (l.terminatedNormally === false) warnings.push(`${l.fileName}: no normal-termination message (job may be incomplete)`); });
        if (f && s) {
            if (f.charge !== null && s.charge !== null && (f.charge !== s.charge || f.multiplicity !== s.multiplicity)) {
                warnings.push(`Charge/multiplicity differ between ${f.fileName} (${f.charge}/${f.multiplicity}) and ${s.fileName} (${s.charge}/${s.multiplicity}).`);
            }
            if (!sameGeometry(f.atoms, s.atoms, 0.05)) warnings.push('The geometries of the frequency and single-point logs differ.');
        }
        if (f && f.imaginaryFreqCount > 1) warnings.push(`${f.imaginaryFreqCount} imaginary frequencies (higher-order saddle point).`);

        const atoms = geomLog.atoms;
        const charge = geomLog.charge !== null ? geomLog.charge : (s && s.charge !== null ? s.charge : null);

        return {
            key: (f ? f.id : s.id),
            id: 'sp_' + (f ? f.id : s.id),
            title: geomLog.title,
            fileName: [f && f.fileName, s && s.fileName].filter(Boolean).join(' + '),
            freqFileName: f ? f.fileName : null,
            spFileName: s ? s.fileName : null,
            program: geomLog.program,
            route: s ? s.route : (f ? f.route : null),
            freqRoute: f ? f.route : null,
            charge: charge,
            multiplicity: geomLog.multiplicity,
            warnings: warnings,
            imaginaryFreqCount: f ? f.imaginaryFreqCount : 0,
            imaginaryFreqs: f ? f.imaginaryFreqs : [],
            imaginaryModes: f ? f.imaginaryModes : [],
            terminatedNormally: [f, s].filter(Boolean).every(l => l.terminatedNormally !== false),
            atoms: atoms,
            energySource: energySource,
            elecEnergy: elecEnergy,
            freqLevelEnergy: f ? f.elecEnergy : null,
            zpeCorr: zpeCorr,
            thermalEnergyCorr: tE,
            thermalEnthalpyCorr: tH,
            thermalGibbsCorr: tG,
            sumElecZpe: plus(zpeCorr),
            sumElecThermalE: plus(tE),
            sumElecThermalH: plus(tH),
            sumElecThermalG: plus(tG),
            comp: composition(atoms, charge),
            role: 'stage',
            stageLabel: ''
        };
    }

    // ------------------------------------------------------------------ stages & balancing

    /** Groups non-balancing species by stage label (default: the structure's own name), in list order. */
    function groupStages(species) {
        const stages = [];
        const byKey = new Map();
        species.filter(s => s.role !== 'balance').forEach(s => {
            const label = (s.stageLabel || s.title || '').trim() || s.title;
            const key = label.toLowerCase();
            if (!byKey.has(key)) { const st = { key, label, members: [] }; byKey.set(key, st); stages.push(st); }
            byKey.get(key).members.push(s);
        });
        stages.forEach(st => {
            st.comp = addComp(st.members.map(m => m.comp));
            st.isTS = st.members.some(m => m.imaginaryFreqCount > 0);
        });
        return stages;
    }

    /**
     * Finds integer coefficients c_j for the pool species so that  stage + Σ c_j·pool_j  has the same
     * element counts and charge as `target`. Smallest Σ|c_j| wins. Returns [{species, coef}] or null.
     */
    function solveBalance(stageComp, targetComp, pool) {
        const elements = new Set(Object.keys(stageComp.counts).concat(Object.keys(targetComp.counts)));
        pool.forEach(p => Object.keys(p.comp.counts).forEach(e => elements.add(e)));
        const rows = Array.from(elements);
        const need = rows.map(e => (targetComp.counts[e] || 0) - (stageComp.counts[e] || 0)).concat([targetComp.charge - stageComp.charge]);
        if (need.every(v => v === 0)) return [];

        const m = Math.min(pool.length, 8);
        const range = m <= 4 ? 4 : m <= 6 ? 3 : 2;
        const vec = pool.slice(0, m).map(p => rows.map(e => p.comp.counts[e] || 0).concat([p.comp.charge]));

        let best = null, bestCost = Infinity, bestNonzero = Infinity;
        const coef = new Array(m).fill(0);
        const rem = need.slice();
        (function dfs(j) {
            if (j === m) {
                if (rem.every(v => v === 0)) {
                    const cost = coef.reduce((t, c) => t + Math.abs(c), 0);
                    const nz = coef.filter(c => c !== 0).length;
                    if (cost < bestCost || (cost === bestCost && nz < bestNonzero)) { best = coef.slice(); bestCost = cost; bestNonzero = nz; }
                }
                return;
            }
            for (let c = -range; c <= range; c++) {
                coef[j] = c;
                for (let r = 0; r < rem.length; r++) rem[r] -= c * vec[j][r];
                dfs(j + 1);
                for (let r = 0; r < rem.length; r++) rem[r] += c * vec[j][r];
            }
            coef[j] = 0;
        })(0);

        if (!best) return null;
        return best.map((c, j) => ({ species: pool[j], coef: c })).filter(x => x.coef !== 0);
    }

    /**
     * Builds the balanced profile.
     * @param {object[]} species all loaded species
     * @param {string} energyKey field on the species (e.g. 'sumElecThermalG')
     * @param {string} refKey stage key to use as zero (falls back to the first stage with an energy)
     * @returns {{stages:object[], ref:object|null, pool:object[], poolOverflow:boolean}}
     *   each stage: {label,key,members,comp,isTS,balance:[{species,coef}]|null,status,value,rel} (energies in Hartree)
     */
    function buildProfile(species, energyKey, refKey) {
        const stages = groupStages(species);
        const pool = species.filter(s => s.role === 'balance');
        const cache = new Map();

        const raw = st => st.members.reduce((t, m) => (t === null || m[energyKey] === null || m[energyKey] === undefined ? null : t + m[energyKey]), 0);
        stages.forEach(st => { st.raw = raw(st); });

        let ref = stages.find(s => s.key === refKey && s.raw !== null) || stages.find(s => s.raw !== null) || null;
        const target = ref ? ref.comp : null;

        stages.forEach(st => {
            st.balance = null; st.value = null; st.rel = null;
            if (!target) { st.status = 'no-energy'; return; }
            if (st.raw === null) { st.status = 'no-energy'; return; }
            const sig = JSON.stringify([st.comp, target]);
            if (!cache.has(sig)) cache.set(sig, solveBalance(st.comp, target, pool));
            const sol = cache.get(sig);
            if (sol === null) { st.status = 'unbalanced'; return; }
            st.balance = sol;
            const extra = sol.reduce((t, x) => (t === null || x.species[energyKey] === null || x.species[energyKey] === undefined ? null : t + x.coef * x.species[energyKey]), 0);
            if (extra === null) { st.status = 'balance-no-energy'; return; }
            st.value = st.raw + extra;
            st.status = 'ok';
        });

        if (ref && ref.value !== null) stages.forEach(st => { if (st.value !== null) st.rel = st.value - ref.value; });
        return { stages, ref, pool, poolOverflow: pool.length > 8 };
    }

    function balanceText(balance) {
        if (!balance || balance.length === 0) return '—';
        return balance.map(x => `${x.coef > 0 ? '+' : '−'} ${Math.abs(x.coef) === 1 ? '' : Math.abs(x.coef) + ' × '}${x.species.title}`).join(' ');
    }

    NS.pairLogs = pairLogs;
    NS.sameGeometry = sameGeometry;
    NS.composition = composition;
    NS.formulaText = formulaText;
    NS.makeSpecies = makeSpecies;
    NS.groupStages = groupStages;
    NS.solveBalance = solveBalance;
    NS.buildProfile = buildProfile;
    NS.balanceText = balanceText;
})(typeof window !== 'undefined' ? window : globalThis);
