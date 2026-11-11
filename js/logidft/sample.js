/*
 * LogiDFT - demo data. Builds small synthetic Gaussian-style logs so the "Load demo" button
 * works offline and shows every feature (minima, transition states with an animatable mode,
 * relative energies and an energy profile).
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    const f6 = v => v.toFixed(6);

    const BASE_COORDS = [
        [6, -1.647929, -1.162909, -0.111088],
        [6, -2.113841, 0.290889, -0.226723],
        [6, -1.132052, 1.243658, 0.476536],
        [6, 0.302572, 1.048921, 0.000418],
        [6, 0.837525, -0.413761, -0.012972]
    ];

    // Displacement vectors of the imaginary mode (atoms 4 and 5 move towards each other)
    const TS_MODE = [
        [0.02, 0.01, 0.00], [0.03, -0.02, 0.01], [-0.05, 0.04, 0.02], [-0.45, -0.30, 0.05], [0.52, 0.35, -0.06]
    ];
    const OTHER_MODE = [
        [0.10, 0.00, 0.05], [0.00, 0.12, 0.00], [-0.08, 0.00, 0.10], [0.00, -0.14, 0.00], [0.07, 0.02, -0.09]
    ];

    function vecRow(idx, a, b, c) {
        const cell = v => v.toFixed(2).padStart(7);
        return `${String(idx).padStart(6)}${String(6).padStart(4)}   ${cell(a[0])}${cell(a[1])}${cell(a[2])}     ` +
            `${cell(b[0])}${cell(b[1])}${cell(b[2])}     ${cell(c[0])}${cell(c[1])}${cell(c[2])}`;
    }

    function makeLog(spec) {
        const sumZpe = spec.scf + spec.zpe;
        const sumE = spec.scf + spec.tE;
        const sumH = spec.scf + spec.tH;
        const sumG = spec.scf + spec.tG;
        const first = spec.imag ? -spec.imag : 120.45;
        const modeA = spec.imag ? TS_MODE : OTHER_MODE;

        const coords = BASE_COORDS.map((c, i) => {
            const dx = (spec.shift || 0) * (i % 2 ? 1 : -1);
            return `${String(i + 1).padStart(7)}${String(c[0]).padStart(11)}${'0'.padStart(11)}` +
                `${(c[1] + dx).toFixed(6).padStart(16)}${(c[2] - dx / 2).toFixed(6).padStart(12)}${(c[3] + dx / 3).toFixed(6).padStart(12)}`;
        }).join('\n');

        const modeRows = modeA.map((v, i) => vecRow(i + 1, v, OTHER_MODE[(i + 1) % 5], OTHER_MODE[(i + 2) % 5])).join('\n');

        return ` Entering Gaussian System, Link 0=g16
 %chk=${spec.name}.chk
 ----------------------------------------------------------------------
 # B3LYP/6-31G(d) ${spec.imag ? 'Opt=(TS,NoEigenTest,CalcFreq) Freq' : 'Opt Freq'}
 ----------------------------------------------------------------------
 Charge =  0 Multiplicity = 1

 SCF Done:  E(RB3LYP) =  ${spec.scf.toFixed(9)}     A.U. after   11 cycles

 Harmonic frequencies (cm**-1), IR intensities (KM/Mole), Raman scattering
 activities (A**4/AMU), depolarization ratios for plane and unpolarized
 incident light, reduced masses (AMU), force constants (mDyne/A),
 and normal coordinates:
                      1                      2                      3
                      A                      A                      A
 Frequencies --   ${first.toFixed(4).padStart(9)}               185.3000               290.1000
 Red. masses --      5.1000                 3.2000                 2.9000
 Frc consts  --      0.7000                 0.0700                 0.1400
 IR Inten    --     50.0000                 5.0000                 1.0000
  Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z
${modeRows}

 Zero-point correction=                 ${f6(spec.zpe)} (Hartree/Particle)
 Thermal correction to Energy=          ${f6(spec.tE)}
 Thermal correction to Enthalpy=        ${f6(spec.tH)}
 Thermal correction to Gibbs Free Energy= ${f6(spec.tG)}
 Sum of electronic and zero-point Energies=   ${f6(sumZpe)}
 Sum of electronic and thermal Energies=      ${f6(sumE)}
 Sum of electronic and thermal Enthalpies=    ${f6(sumH)}
 Sum of electronic and thermal Free Energies=  ${f6(sumG)}

 Standard orientation:
 ---------------------------------------------------------------------
 Center     Atomic      Atomic             Coordinates (Angstroms)
 Number     Number       Type             X           Y           Z
 ---------------------------------------------------------------------
${coords}
 ---------------------------------------------------------------------
 Normal termination of Gaussian 16 at Mon Jan  1 00:00:00 2026.
`;
    }

    const SPECS = [
        { name: 'Int-I',   scf: -387.598184, zpe: 0.190989, tE: 0.200771, tH: 0.201715, tG: 0.156195, shift: 0 },
        { name: 'TS-1',    scf: -387.562100, zpe: 0.188500, tE: 0.199100, tH: 0.200044, tG: 0.152100, imag: 482.15, shift: 0.06 },
        { name: 'Int-II',  scf: -387.589000, zpe: 0.190200, tE: 0.200300, tH: 0.201244, tG: 0.155000, shift: 0.12 },
        { name: 'TS-2',    scf: -387.571500, zpe: 0.188900, tE: 0.199400, tH: 0.200344, tG: 0.153400, imag: 395.80, shift: 0.18 },
        { name: 'Product', scf: -387.615000, zpe: 0.192000, tE: 0.201500, tH: 0.202444, tG: 0.158100, shift: 0.24 }
    ];

    NS.buildSampleLogs = function () {
        return SPECS.map(spec => ({ fileName: spec.name + '.log', text: makeLog(spec) }));
    };
})(typeof window !== 'undefined' ? window : globalThis);
