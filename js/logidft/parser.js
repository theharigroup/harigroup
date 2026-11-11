/*
 * LogiDFT - log file parser.
 * Extracts energies, thermochemistry, imaginary frequencies (and their normal modes),
 * final Cartesian coordinates and some job metadata from Gaussian / ORCA output text.
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    const DASH_LINE = '---------------------------------------------------------------------';
    const NUMBER_AFTER_EQUALS = /=\s*(-?\d+\.\d+)/;

    // Gaussian thermochemistry labels -> field names on the result object
    const THERMO_FIELDS = [
        ['Zero-point correction=', 'zpeCorr'],
        ['Thermal correction to Energy=', 'thermalEnergyCorr'],
        ['Thermal correction to Enthalpy=', 'thermalEnthalpyCorr'],
        ['Thermal correction to Gibbs Free Energy=', 'thermalGibbsCorr'],
        ['Sum of electronic and zero-point Energies=', 'sumElecZpe'],
        ['Sum of electronic and thermal Energies=', 'sumElecThermalE'],
        ['Sum of electronic and thermal Enthalpies=', 'sumElecThermalH'],
        ['Sum of electronic and thermal Free Energies=', 'sumElecThermalG']
    ];

    function detectProgram(text) {
        if (text.includes('Entering Gaussian System') || text.includes('SCF Done:') || text.includes('Standard orientation:')) {
            return 'Gaussian';
        }
        if (text.includes('FINAL SINGLE POINT ENERGY') || /O\s+R\s+C\s+A/.test(text.slice(0, 20000))) {
            return 'ORCA';
        }
        return 'Unknown';
    }

    function parseElectronicEnergy(lines) {
        // Search backwards: the last energy in the file belongs to the final geometry
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (line.includes('SCF Done:')) {
                const m = line.match(/=\s*(-?\d+\.\d+)/);
                if (m) return parseFloat(m[1]);
            } else if (line.includes('FINAL SINGLE POINT ENERGY')) {
                const m = line.match(/FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)/);
                if (m) return parseFloat(m[1]);
            }
        }
        return null;
    }

    function parseThermochemistry(lines) {
        const out = {};
        THERMO_FIELDS.forEach(([, field]) => { out[field] = null; });
        let remaining = THERMO_FIELDS.length;

        // Backwards, keeping the LAST occurrence of each quantity
        for (let i = lines.length - 1; i >= 0 && remaining > 0; i--) {
            const line = lines[i];
            for (let k = 0; k < THERMO_FIELDS.length; k++) {
                const [label, field] = THERMO_FIELDS[k];
                if (out[field] === null && line.includes(label)) {
                    const m = line.match(NUMBER_AFTER_EQUALS);
                    if (m) { out[field] = parseFloat(m[1]); remaining--; }
                    break;
                }
            }
        }
        return out;
    }

    /** Index of the last "Harmonic frequencies" header (start of the final frequency job), or 0. */
    function findFrequencySectionStart(lines) {
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('Harmonic frequencies')) return i;
        }
        return 0;
    }

    function parseImaginaryFrequencies(lines, startIdx) {
        const freqs = [];
        for (let i = startIdx; i < lines.length; i++) {
            if (lines[i].includes('Frequencies --')) {
                lines[i].replace('Frequencies --', '').trim().split(/\s+/).forEach(val => {
                    const f = parseFloat(val);
                    if (!isNaN(f) && f < 0) freqs.push(f);
                });
            }
        }
        return freqs;
    }

    /**
     * Reads the Gaussian normal-mode displacement table for imaginary modes.
     * Returns [{ freq, disp: [[dx,dy,dz], ...] }] (at most `maxModes`).
     * Silently returns [] for layouts it does not understand (e.g. freq=HPModes).
     */
    function parseImaginaryModes(lines, startIdx, nAtoms, maxModes) {
        const modes = [];
        if (!nAtoms) return modes;

        for (let i = startIdx; i < lines.length && modes.length < maxModes; i++) {
            if (!lines[i].includes('Frequencies --')) continue;

            const freqs = lines[i].replace('Frequencies --', '').trim().split(/\s+/).map(parseFloat).filter(v => !isNaN(v));
            if (!freqs.some(f => f < 0)) continue;

            let header = -1;
            for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
                if (/^\s*Atom\s+AN\s+X\s+Y\s+Z/.test(lines[j])) { header = j; break; }
            }
            if (header < 0) continue;

            const perMode = freqs.map(() => []);
            let ok = true;
            for (let a = 0; a < nAtoms && ok; a++) {
                const row = lines[header + 1 + a];
                if (!row) { ok = false; break; }
                const nums = row.trim().split(/\s+/).slice(2).map(parseFloat);
                if (nums.length !== 3 * freqs.length || nums.some(isNaN)) { ok = false; break; }
                freqs.forEach((_, m) => perMode[m].push([nums[3 * m], nums[3 * m + 1], nums[3 * m + 2]]));
            }
            if (!ok) continue;

            freqs.forEach((f, m) => {
                if (f < 0 && modes.length < maxModes) modes.push({ freq: f, disp: perMode[m] });
            });
        }
        return modes;
    }

    function parseCoordinates(lines) {
        const { ELEMENT_MAP, SYMBOL_TO_NUM } = NS;
        const atoms = [];

        // Gaussian: last "Standard orientation" / "Input orientation" table
        let coordStartIdx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('Standard orientation:') || lines[i].includes('Input orientation:')) {
                coordStartIdx = i;
                break;
            }
        }

        if (coordStartIdx !== -1) {
            let lineIdx = coordStartIdx + 1;
            let dashCount = 0;
            while (lineIdx < lines.length && dashCount < 2) {
                if (lines[lineIdx].includes(DASH_LINE)) dashCount++;
                lineIdx++;
            }
            while (lineIdx < lines.length) {
                const currentLine = lines[lineIdx];
                if (currentLine.includes(DASH_LINE)) break;
                const tokens = currentLine.trim().split(/\s+/);
                if (tokens.length >= 6) {
                    const atomicNum = parseInt(tokens[1], 10);
                    const x = parseFloat(tokens[3]);
                    const y = parseFloat(tokens[4]);
                    const z = parseFloat(tokens[5]);
                    if (!isNaN(atomicNum) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
                        atoms.push({ atomicNum, symbol: ELEMENT_MAP[atomicNum] || 'X', x, y, z });
                    }
                }
                lineIdx++;
            }
            return atoms;
        }

        // ORCA: last "CARTESIAN COORDINATES (ANGSTROEM)" block (the A.U. block has other columns/units)
        for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i].includes('CARTESIAN COORDINATES (ANGSTROEM)')) continue;
            let lineIdx = i + 2;
            while (lineIdx < lines.length && lines[lineIdx].trim() !== '') {
                const tokens = lines[lineIdx].trim().split(/\s+/);
                if (tokens.length >= 4) {
                    const raw = tokens[0].replace(/[^A-Za-z]/g, '');
                    const sym = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
                    const x = parseFloat(tokens[1]);
                    const y = parseFloat(tokens[2]);
                    const z = parseFloat(tokens[3]);
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                        const atomicNum = SYMBOL_TO_NUM[sym] || 0;
                        atoms.push({ atomicNum, symbol: atomicNum ? sym : 'X', x, y, z });
                    }
                }
                lineIdx++;
            }
            break;
        }
        return atoms;
    }

    function parseRoute(lines, program) {
        const limit = Math.min(lines.length, 4000);
        if (program === 'Gaussian') {
            for (let i = 0; i < limit; i++) {
                if (/^\s*#[pPnNtT]?\s+\S/.test(lines[i])) {
                    const parts = [lines[i].trim()];
                    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                        const next = lines[j].trim();
                        if (next === '' || next.startsWith('---')) break;
                        parts.push(next);
                    }
                    return parts.join(' ').replace(/^#[pPnNtT]?\s*/, '');
                }
            }
        } else if (program === 'ORCA') {
            const parts = [];
            for (let i = 0; i < limit; i++) {
                const m = lines[i].match(/^\|\s*\d+>\s*!\s*(.+)$/);
                if (m) parts.push(m[1].trim());
                else if (parts.length) break;
            }
            if (parts.length) return parts.join(' ');
        }
        return null;
    }

    function parseChargeMultiplicity(lines, program) {
        const limit = Math.min(lines.length, 6000);
        let charge = null;
        let multiplicity = null;
        for (let i = 0; i < limit; i++) {
            if (program === 'Gaussian') {
                const m = lines[i].match(/Charge\s*=\s*(-?\d+)\s+Multiplicity\s*=\s*(\d+)/);
                if (m) return { charge: parseInt(m[1], 10), multiplicity: parseInt(m[2], 10) };
            } else if (program === 'ORCA') {
                const c = lines[i].match(/^\s*Total Charge\s+Charge\s+\.+\s+(-?\d+)/);
                if (c) charge = parseInt(c[1], 10);
                const mu = lines[i].match(/^\s*Multiplicity\s+Mult\s+\.+\s+(\d+)/);
                if (mu) multiplicity = parseInt(mu[1], 10);
                if (charge !== null && multiplicity !== null) break;
            }
        }
        return { charge, multiplicity };
    }

    function checkTermination(text, program) {
        if (program === 'Gaussian') return text.includes('Normal termination of Gaussian');
        if (program === 'ORCA') return text.includes('ORCA TERMINATED NORMALLY');
        return null;
    }

    /**
     * Parses a Gaussian or ORCA log file.
     * @param {string} fileName
     * @param {string} text
     */
    function parseDFTLog(fileName, text) {
        const defaultTitle = fileName.replace(/\.[^/.]+$/, '');
        const lines = text.split(/\r?\n/);
        const program = detectProgram(text);

        const elecEnergy = parseElectronicEnergy(lines);
        const thermo = parseThermochemistry(lines);

        // Fallback: derive the sums from the corrections if only those were printed
        if (elecEnergy !== null) {
            if (thermo.sumElecZpe === null && thermo.zpeCorr !== null) thermo.sumElecZpe = elecEnergy + thermo.zpeCorr;
            if (thermo.sumElecThermalE === null && thermo.thermalEnergyCorr !== null) thermo.sumElecThermalE = elecEnergy + thermo.thermalEnergyCorr;
            if (thermo.sumElecThermalH === null && thermo.thermalEnthalpyCorr !== null) thermo.sumElecThermalH = elecEnergy + thermo.thermalEnthalpyCorr;
            if (thermo.sumElecThermalG === null && thermo.thermalGibbsCorr !== null) thermo.sumElecThermalG = elecEnergy + thermo.thermalGibbsCorr;
        }

        const freqStart = findFrequencySectionStart(lines);
        const imaginaryFreqs = parseImaginaryFrequencies(lines, freqStart);
        const atoms = parseCoordinates(lines);
        const imaginaryModes = (program === 'Gaussian' && imaginaryFreqs.length > 0)
            ? parseImaginaryModes(lines, freqStart, atoms.length, 2)
            : [];

        const { charge, multiplicity } = parseChargeMultiplicity(lines, program);
        const terminatedNormally = checkTermination(text, program);

        const warnings = [];
        if (program === 'Unknown') warnings.push('Unrecognised log format (expected Gaussian or ORCA output)');
        if (elecEnergy === null) warnings.push('No electronic energy found');
        if (thermo.sumElecThermalG === null) warnings.push('No thermochemistry found (was a frequency calculation run?)');
        if (atoms.length === 0) warnings.push('No Cartesian coordinates found');
        if (terminatedNormally === false) warnings.push('No normal-termination message found (job may be incomplete)');

        return Object.assign({
            id: 'file_' + Math.random().toString(36).slice(2, 11),
            title: defaultTitle,
            fileName: fileName,
            program: program,
            route: parseRoute(lines, program),
            charge: charge,
            multiplicity: multiplicity,
            terminatedNormally: terminatedNormally,
            warnings: warnings,
            imaginaryFreqCount: imaginaryFreqs.length,
            imaginaryFreqs: imaginaryFreqs,
            imaginaryModes: imaginaryModes,
            elecEnergy: elecEnergy,
            atoms: atoms
        }, thermo);
    }

    NS.parseDFTLog = parseDFTLog;
})(typeof window !== 'undefined' ? window : globalThis);
