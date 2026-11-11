/*
 * LogiDFT - static reference data (periodic table, unit conversions, energy types).
 * All modules attach themselves to the shared `LogiDFT` namespace so the app works
 * from a plain <script> tag (no bundler, no ES-module/CORS issues when opened from disk).
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    // Atomic number -> element symbol
    NS.ELEMENT_MAP = {
        1: "H", 2: "He", 3: "Li", 4: "Be", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 10: "Ne",
        11: "Na", 12: "Mg", 13: "Al", 14: "Si", 15: "P", 16: "S", 17: "Cl", 18: "Ar", 19: "K", 20: "Ca",
        21: "Sc", 22: "Ti", 23: "V", 24: "Cr", 25: "Mn", 26: "Fe", 27: "Co", 28: "Ni", 29: "Cu", 30: "Zn",
        31: "Ga", 32: "Ge", 33: "As", 34: "Se", 35: "Br", 36: "Kr", 37: "Rb", 38: "Sr", 39: "Y", 40: "Zr",
        41: "Nb", 42: "Mo", 43: "Tc", 44: "Ru", 45: "Rh", 46: "Pd", 47: "Ag", 48: "Cd", 49: "In", 50: "Sn",
        51: "Sb", 52: "Te", 53: "I", 54: "Xe", 55: "Cs", 56: "Ba", 57: "La", 58: "Ce", 59: "Pr", 60: "Nd",
        61: "Pm", 62: "Sm", 63: "Eu", 64: "Gd", 65: "Tb", 66: "Dy", 67: "Ho", 68: "Er", 69: "Tm", 70: "Yb",
        71: "Lu", 72: "Hf", 73: "Ta", 74: "W", 75: "Re", 76: "Os", 77: "Ir", 78: "Pt", 79: "Au", 80: "Hg",
        81: "Tl", 82: "Pb", 83: "Bi", 84: "Po", 85: "At", 86: "Rn", 87: "Fr", 88: "Ra", 89: "Ac", 90: "Th",
        91: "Pa", 92: "U", 93: "Np", 94: "Pu", 95: "Am", 96: "Cm", 97: "Bk", 98: "Cf", 99: "Es", 100: "Fm",
        101: "Md", 102: "No", 103: "Lr", 104: "Rf", 105: "Db", 106: "Sg", 107: "Bh", 108: "Hs", 109: "Mt", 110: "Ds",
        111: "Rg", 112: "Cn", 113: "Nh", 114: "Fl", 115: "Mc", 116: "Lv", 117: "Ts", 118: "Og"
    };

    // Element symbol -> atomic number
    NS.SYMBOL_TO_NUM = Object.fromEntries(
        Object.entries(NS.ELEMENT_MAP).map(([num, sym]) => [sym, parseInt(num, 10)])
    );

    // Hartree -> other energy units
    NS.UNITS = {
        kcal: { label: 'kcal/mol', factor: 627.5095, digits: 2 },
        kj:   { label: 'kJ/mol',   factor: 2625.4996, digits: 1 },
        ev:   { label: 'eV',       factor: 27.211386, digits: 3 }
    };

    // Energy quantities that can be plotted / tabulated (key = field on the parsed file object)
    NS.ENERGY_TYPES = {
        G:  { key: 'sumElecThermalG', symbol: 'ΔG',  label: 'Gibbs free energy (G)' },
        H:  { key: 'sumElecThermalH', symbol: 'ΔH',  label: 'Enthalpy (H)' },
        E0: { key: 'sumElecZpe',      symbol: 'ΔE₀', label: 'Electronic + ZPE (E₀)' },
        E:  { key: 'elecEnergy',      symbol: 'ΔE',  label: 'Electronic energy (E)' }
    };
})(typeof window !== 'undefined' ? window : globalThis);
