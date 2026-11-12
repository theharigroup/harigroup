/*
 * LogiDFT - formatting helpers: Supporting-Information text, XYZ, CSV/TSV, relative energies
 * and small geometry utilities. Pure functions (no DOM access) so they are easy to test.
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Builds the Supporting-Information text block for one structure.
     * @param {object} file parsed log
     * @param {{energyFormat:'HF'|'E_DFT'|'PLAIN', coordFormat:'atomic'|'symbol'}} opts
     */
    function generateSITextBlock(file, opts) {
        const energyFormat = (opts && opts.energyFormat) || 'HF';
        const coordFormat = (opts && opts.coordFormat) || 'atomic';
        const lines = [];

        // 1. Imaginary frequencies count
        let imagLine = `Number of imaginary frequencies: ${file.imaginaryFreqCount}`;
        if (file.imaginaryFreqCount > 0 && file.imaginaryFreqs.length > 0) {
            const freqsFormatted = file.imaginaryFreqs.map(f => `${f.toFixed(2)} cm⁻¹`).join(', ');
            imagLine += ` (${freqsFormatted})`;
        }
        lines.push(imagLine);
        lines.push('');

        // 2. Electronic energy
        const elecVal = file.elecEnergy !== null ? file.elecEnergy.toFixed(6) : 'N/A';
        if (energyFormat === 'HF') {
            lines.push(`Electronic energy:   HF=${elecVal}`);
        } else if (energyFormat === 'E_DFT') {
            lines.push(`Electronic energy:   E(DFT)=${elecVal}`);
        } else {
            lines.push(`Electronic energy:   ${elecVal}`);
        }

        // 3. Corrections
        const formatPad = (val, extra = '') => {
            if (val === null) return 'N/A';
            return val.toFixed(6).padStart(16) + extra;
        };

        lines.push(`Zero-point correction=${formatPad(file.zpeCorr, ' (Hartree/Particle)')}`);
        lines.push(`Thermal correction to Energy=${formatPad(file.thermalEnergyCorr)}`);
        lines.push(`Thermal correction to Enthalpy=${formatPad(file.thermalEnthalpyCorr)}`);
        lines.push(`Thermal correction to Gibbs Free Energy=${formatPad(file.thermalGibbsCorr)}`);

        {
            const e = file.elecEnergy, g = file.thermalGibbsCorr, tot = file.sumElecThermalG;
            const f6 = v => v.toFixed(6);
            const first = file.energySource === 'sp' ? 'HF (single-point)' : 'HF (frequency job; no sp log paired)';
            lines.push(e !== null && g !== null && tot !== null
                ? `Final energies = ${first} + Thermal correction to Gibbs (frequency) = ${f6(e)} + ${f6(g)} = ${f6(tot)}`
                : `Final energies = ${first} + Thermal correction to Gibbs (frequency) = N/A (thermal correction or electronic energy missing)`);
        }

        // 4. Sums
        lines.push(`Sum of electronic and zero-point Energies=${formatPad(file.sumElecZpe)}`);
        lines.push(`Sum of electronic and thermal Energies=${formatPad(file.sumElecThermalE)}`);
        lines.push(`Sum of electronic and thermal Enthalpies=${formatPad(file.sumElecThermalH)}`);
        lines.push(`Sum of electronic and thermal Free Energies=${formatPad(file.sumElecThermalG)}`);

        // 5. Separator & Cartesian coordinates
        lines.push('...................................................');
        lines.push('              Cartesian Coordinates');
        lines.push('...................................................');

        if (file.atoms && file.atoms.length > 0) {
            file.atoms.forEach(atom => {
                const label = coordFormat === 'symbol'
                    ? atom.symbol.padStart(4)
                    : atom.atomicNum.toString().padStart(4);
                const xStr = atom.x.toFixed(6).padStart(12);
                const yStr = atom.y.toFixed(6).padStart(12);
                const zStr = atom.z.toFixed(6).padStart(12);
                lines.push(` ${label}   ${xStr} ${yStr} ${zStr}`);
            });
        } else {
            lines.push(' No Cartesian coordinates extracted.');
        }

        return lines.join('\n');
    }

    /** Text for "Copy Text" on a single card. */
    function singleSIText(file, opts) {
        return `\t\t\t\t${file.title}\n` + generateSITextBlock(file, opts);
    }

    /** Concatenated SI text for several structures. `bar` is the separator character. */
    function allSIText(files, opts, bar) {
        const rule = bar.repeat(51);
        return files.map(file =>
            `${rule}\n\t\t\t\t${file.title}\n${rule}\n` + generateSITextBlock(file, opts)
        ).join('\n\n\n');
    }

    /** XYZ file content for a structure. */
    function toXYZ(file) {
        const header = `${file.atoms.length}\n${file.title}\n`;
        return header + file.atoms.map(a =>
            `${a.symbol.padEnd(2)} ${a.x.toFixed(6).padStart(12)} ${a.y.toFixed(6).padStart(12)} ${a.z.toFixed(6).padStart(12)}`
        ).join('\n') + '\n';
    }

    /** Hill-system molecular formula, e.g. "C6H6O". */
    function hillFormula(atoms) {
        if (!atoms || atoms.length === 0) return '';
        const counts = {};
        atoms.forEach(a => { counts[a.symbol] = (counts[a.symbol] || 0) + 1; });
        const symbols = Object.keys(counts);
        let ordered;
        if (counts.C) {
            ordered = ['C'].concat(counts.H ? ['H'] : [], symbols.filter(s => s !== 'C' && s !== 'H').sort());
        } else {
            ordered = symbols.sort();
        }
        return ordered.map(s => s + (counts[s] > 1 ? counts[s] : '')).join('');
    }

    /** Energy of `file` relative to `ref` for the given field, converted to `unit` (key of NS.UNITS). */
    function relValue(file, ref, key, unit) {
        if (!file || !ref) return null;
        const a = file[key];
        const b = ref[key];
        if (a === null || a === undefined || b === null || b === undefined) return null;
        return (a - b) * NS.UNITS[unit].factor;
    }

    function formatRel(value, unit, withSign) {
        if (value === null || value === undefined) return 'N/A';
        const txt = value.toFixed(NS.UNITS[unit].digits);
        return (withSign && value >= 0 ? '+' : '') + txt;
    }

    function csvCell(value) {
        const s = String(value === null || value === undefined ? '' : value);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    const fix6 = v => (v !== null && v !== undefined ? v.toFixed(6) : '');

    /** Stage object (from NS.buildProfile) that holds `species`, or null. */
    function stageOf(profile, species) {
        return profile ? (profile.stages.find(st => st.members.includes(species)) || null) : null;
    }

    function tableRows(files, profile, unit, symbol) {
        const u = NS.UNITS[unit].label;
        const sym = symbol || 'ΔG';
        const header = ['Structure Title', 'Files (freq + sp)', 'Stage', 'N_Imag', 'E_elec HF from sp (Ha)', 'ZPE (Ha)', 'H_corr (Ha)',
            'G_corr (Ha)', 'E+ZPE (Ha)', 'H_total (Ha)', 'G_total = E_sp + G_corr (Ha)',
            'Balancing species added to stage', `Balanced stage energy (Ha)`, `Rel ${sym} (${u})`];
        const rows = files.map(f => {
            const st = stageOf(profile, f);
            const ok = st && st.status === 'ok' && st.rel !== null;
            return [f.title, f.fileName, st ? st.label : '(balancing species)', f.imaginaryFreqCount, fix6(f.elecEnergy), fix6(f.zpeCorr),
                fix6(f.thermalEnthalpyCorr), fix6(f.thermalGibbsCorr), fix6(f.sumElecZpe),
                fix6(f.sumElecThermalH), fix6(f.sumElecThermalG),
                st && st.balance ? NS.balanceText(st.balance) : '', ok ? fix6(st.value) : '',
                ok ? (st.rel * NS.UNITS[unit].factor).toFixed(NS.UNITS[unit].digits) : 'N/A'];
        });
        return [header].concat(rows);
    }

    function buildCSV(files, profile, unit, symbol) {
        return tableRows(files, profile, unit, symbol).map(r => r.map(csvCell).join(',')).join('\n');
    }

    function buildTSV(files, profile, unit, symbol) {
        return tableRows(files, profile, unit, symbol).map(r => r.join('\t')).join('\n');
    }

    // ---- geometry (Å and degrees) ----
    const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const norm = u => Math.sqrt(dot(u, u));
    const deg = rad => rad * 180 / Math.PI;

    const geom = {
        distance(a, b) { return norm(sub(a, b)); },
        angle(a, b, c) {              // angle at b
            const u = sub(a, b), v = sub(c, b);
            const cos = dot(u, v) / (norm(u) * norm(v));
            return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
        },
        dihedral(a, b, c, d) {        // a-b-c-d, range (-180, 180]
            const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
            const n1 = cross(b1, b2), n2 = cross(b2, b3);
            const m1 = cross(n1, [b2[0] / norm(b2), b2[1] / norm(b2), b2[2] / norm(b2)]);
            return deg(Math.atan2(dot(m1, n2), dot(n1, n2)));
        }
    };

    NS.escapeHtml = escapeHtml;
    NS.generateSITextBlock = generateSITextBlock;
    NS.singleSIText = singleSIText;
    NS.allSIText = allSIText;
    NS.toXYZ = toXYZ;
    NS.hillFormula = hillFormula;
    NS.relValue = relValue;
    NS.stageOf = stageOf;
    NS.formatRel = formatRel;
    NS.csvCell = csvCell;
    NS.buildCSV = buildCSV;
    NS.buildTSV = buildTSV;
    NS.geom = geom;
})(typeof window !== 'undefined' ? window : globalThis);
