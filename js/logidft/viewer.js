/*
 * LogiDFT - 3D structure viewer (wrapper around 3Dmol.js).
 *
 * Features: display styles (ball & stick / stick / spacefill / wireframe), atom labels
 * (symbol, number or both), hide hydrogens, background themes, auto-spin, click-to-measure
 * (distance / angle / dihedral), animation of the imaginary vibrational mode of a transition
 * state, PNG export and fullscreen.
 */
(function (root) {
    'use strict';
    const NS = (root.LogiDFT = root.LogiDFT || {});

    const BACKGROUNDS = {
        dark:  { color: '0x020617', fg: '#e2e8f0', labelBg: '#0f172a' },
        light: { color: '0xe2e8f0', fg: '#0f172a', labelBg: '#f8fafc' },
        white: { color: '0xffffff', fg: '#0f172a', labelBg: '#f1f5f9' }
    };

    // Publication-style element colours (match the reference ball-and-stick figures).
    const ELEMENT_COLORS = {
        H: '#ffffff', C: '#8f8f8f', N: '#2f54eb', O: '#e5261f', B: '#f4a3b8', Ni: '#3cb043',
        F: '#7ed957', Cl: '#2fbf2f', Br: '#a62929', I: '#7a1fa2', S: '#f2d02c', P: '#ff8c1a',
        Si: '#e0b48c', Fe: '#e06633', Co: '#f090a0', Cu: '#c88033', Zn: '#7d80b0', Pd: '#006985', Pt: '#d0d0e0', Li: '#b27cf5'
    };
    // Ball radii (Å) – small H, mid C/N/O/B, large metals.
    const BALL_RADIUS = { H: 0.22, C: 0.32, N: 0.34, O: 0.34, B: 0.34, Ni: 0.48, default: 0.4 };
    const BOND_COLOR = '#2b2b2b';
    const BOND_RADIUS = 0.13;

    const STYLE_NAMES = ['ballstick', 'stick', 'sphere', 'wire'];

    function elementStyle(style, el) {
        const color = ELEMENT_COLORS[el];
        const col = color ? { color: color } : { colorscheme: 'Jmol' };
        const r = BALL_RADIUS[el] || BALL_RADIUS.default;
        if (style === 'stick') return { stick: Object.assign({ radius: 0.2 }, col) };
        if (style === 'sphere') return { sphere: Object.assign({ scale: 0.8 }, col) };
        if (style === 'wire') return { line: Object.assign({ linewidth: 2 }, col) };
        return { stick: { radius: BOND_RADIUS, color: BOND_COLOR }, sphere: Object.assign({ radius: r }, col) };
    }

    const MAX_LABELS = 400;
    const VIBRATION_FRAMES = 24;
    const VIBRATION_MAX_SHIFT = 0.6; // Å, largest atomic displacement at the peak of the vibration

    const HIGHLIGHT = '#facc15';

    function xyzFor(atoms, title, positions) {
        let s = `${atoms.length}\n${title}\n`;
        atoms.forEach((a, i) => {
            const p = positions ? positions[i] : a;
            s += `${a.symbol} ${p.x} ${p.y} ${p.z}\n`;
        });
        return s;
    }

    class MolViewer {
        /**
         * @param {object} file parsed log (needs atoms, title, imaginaryModes)
         * @param {HTMLElement} container element the canvas is created in
         * @param {object} state shared, mutable view state {style, labels, hideH, bg, spin, measure}
         * @param {{onReadout?:Function, onVibrationChange?:Function}} hooks
         */
        constructor(file, container, state, hooks) {
            this.file = file;
            this.container = container;
            this.state = state;
            this.hooks = hooks || {};
            this.picks = [];
            this.shapes = [];
            this.labelObjs = [];
            this.vibrating = false;

            this.viewer = root.$3Dmol.createViewer(container, {
                backgroundColor: BACKGROUNDS[state.bg].color,
                antialias: true
            });
            this.rebuild(true);
        }

        // ---- model & appearance -------------------------------------------------

        /** (Re)creates the static model and re-applies the current view state. */
        rebuild(fresh) {
            const v = this.viewer;
            this.stopAnimation();
            v.removeAllModels();
            this.clearLabels();
            this.clearMeasureShapes();
            v.addModel(xyzFor(this.file.atoms, this.file.title), 'xyz');
            this.applyBackground();
            this.applyStyle();
            this.applyLabels();
            this.applyMeasureMode();
            if (fresh) v.zoomTo();
            v.spin(this.state.spin ? 'y' : false, 1);
            v.render();
        }

        applyBackground() {
            this.viewer.setBackgroundColor(BACKGROUNDS[this.state.bg].color);
        }

        applyStyle() {
            const v = this.viewer;
            const style = STYLE_NAMES.includes(this.state.style) ? this.state.style : 'ballstick';
            const elements = Array.from(new Set(this.file.atoms.map(a => a.symbol)));
            elements.forEach(el => v.setStyle({ elem: el }, elementStyle(style, el)));
            if (this.state.hideH) v.setStyle({ elem: 'H' }, {});
            // depth cue: atoms and bonds in the back fade towards the background, to roughly 70% opacity at the very back
            try { v.enableFog({ fogStart: 0.3, fogEnd: 2.5 }); } catch (e) { /* older 3Dmol builds */ }
        }

        clearLabels() {
            this.labelObjs.forEach(l => { try { this.viewer.removeLabel(l); } catch (e) { /* ignore */ } });
            this.labelObjs = [];
        }

        applyLabels() {
            this.clearLabels();
            const mode = this.state.labels;
            if (mode === 'none' || this.vibrating) return;
            const bg = BACKGROUNDS[this.state.bg];
            let count = 0;
            this.file.atoms.forEach((a, i) => {
                if (this.state.hideH && a.symbol === 'H') return;
                if (count++ >= MAX_LABELS) return;
                const text = mode === 'symbol' ? a.symbol : mode === 'number' ? String(i + 1) : `${a.symbol}${i + 1}`;
                this.labelObjs.push(this.viewer.addLabel(text, {
                    position: { x: a.x, y: a.y, z: a.z },
                    fontSize: 12,
                    fontColor: bg.fg,
                    backgroundColor: bg.labelBg,
                    backgroundOpacity: 0.6,
                    borderThickness: 0,
                    showBackground: true,
                    inFront: true,
                    alignment: 'center'
                }));
            });
        }

        set(prop, value) {
            this.state[prop] = value;
            switch (prop) {
                case 'style':
                case 'hideH':
                    this.applyStyle();
                    this.applyLabels();
                    break;
                case 'labels':
                    this.applyLabels();
                    break;
                case 'bg':
                    this.applyBackground();
                    this.applyLabels();
                    break;
                case 'spin':
                    this.viewer.spin(value ? 'y' : false, 1);
                    break;
                case 'measure':
                    this.picks = [];
                    this.clearMeasureShapes();
                    this.applyMeasureMode();
                    break;
                default:
                    break;
            }
            this.viewer.render();
        }

        resetView() {
            this.viewer.zoomTo();
            this.viewer.render();
        }

        resize() {
            try { this.viewer.resize(); this.viewer.render(); } catch (e) { /* ignore */ }
        }

        pngDataURL() {
            this.viewer.render();
            return this.viewer.pngURI();
        }

        // ---- measuring ---------------------------------------------------------

        applyMeasureMode() {
            const v = this.viewer;
            if (this.state.measure && !this.vibrating) {
                v.setClickable({}, true, atom => this.onPick(atom));
                this.report('Click atoms to measure: 2 → distance, 3 → angle, 4 → dihedral');
            } else {
                v.setClickable({}, false, () => {});
                this.report('');
            }
        }

        report(text) {
            if (this.hooks.onReadout) this.hooks.onReadout(text);
        }

        /** Maps a 3Dmol atom back to an index in file.atoms (matching on coordinates). */
        matchAtom(atom) {
            const atoms = this.file.atoms;
            const close = (a, b) => Math.abs(a - b) < 1e-3;
            const idx = atom.index;
            if (Number.isInteger(idx) && atoms[idx] && close(atoms[idx].x, atom.x) && close(atoms[idx].y, atom.y) && close(atoms[idx].z, atom.z)) {
                return idx;
            }
            return atoms.findIndex(a => close(a.x, atom.x) && close(a.y, atom.y) && close(a.z, atom.z));
        }

        onPick(atom) {
            const idx = this.matchAtom(atom);
            if (idx < 0) return;
            if (this.picks.length >= 4) this.picks = [];
            const existing = this.picks.indexOf(idx);
            if (existing >= 0) this.picks.splice(existing, 1);
            else this.picks.push(idx);
            this.drawMeasurement();
        }

        clearMeasureShapes() {
            this.shapes.forEach(s => { try { this.viewer.removeShape(s); } catch (e) { /* ignore */ } });
            this.shapes = [];
            if (this.measureLabel) {
                try { this.viewer.removeLabel(this.measureLabel); } catch (e) { /* ignore */ }
                this.measureLabel = null;
            }
        }

        drawMeasurement() {
            const v = this.viewer;
            const atoms = this.file.atoms;
            const pts = this.picks.map(i => atoms[i]);
            const names = this.picks.map(i => `${atoms[i].symbol}${i + 1}`);
            this.clearMeasureShapes();

            pts.forEach(p => {
                this.shapes.push(v.addSphere({ center: { x: p.x, y: p.y, z: p.z }, radius: 0.42, color: HIGHLIGHT, alpha: 0.5 }));
            });
            for (let i = 0; i < pts.length - 1; i++) {
                this.shapes.push(v.addCylinder({
                    start: { x: pts[i].x, y: pts[i].y, z: pts[i].z },
                    end: { x: pts[i + 1].x, y: pts[i + 1].y, z: pts[i + 1].z },
                    radius: 0.04, color: HIGHLIGHT, fromCap: 1, toCap: 1
                }));
            }

            let text = '';
            const G = NS.geom;
            if (pts.length === 2) text = `d(${names[0]}–${names[1]}) = ${G.distance(pts[0], pts[1]).toFixed(3)} Å`;
            else if (pts.length === 3) text = `∠(${names.join('–')}) = ${G.angle(pts[0], pts[1], pts[2]).toFixed(1)}°`;
            else if (pts.length === 4) text = `τ(${names.join('–')}) = ${G.dihedral(pts[0], pts[1], pts[2], pts[3]).toFixed(1)}°`;
            else if (pts.length === 1) text = `Selected ${names[0]} — pick more atoms`;

            if (pts.length >= 2) {
                const mid = pts.length === 2
                    ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, z: (pts[0].z + pts[1].z) / 2 }
                    : { x: pts[1].x, y: pts[1].y, z: pts[1].z };
                this.measureLabel = v.addLabel(text.split(' = ')[1], {
                    position: mid, fontSize: 13, fontColor: '#111827', backgroundColor: HIGHLIGHT,
                    backgroundOpacity: 0.95, borderThickness: 0, showBackground: true, inFront: true, alignment: 'center'
                });
            }
            this.report(text);
            v.render();
        }

        // ---- vibration animation ------------------------------------------------

        hasVibration() {
            return !!(this.file.imaginaryModes && this.file.imaginaryModes.length);
        }

        stopAnimation() {
            if (!this.vibrating) return;
            try { this.viewer.stopAnimate(); } catch (e) { /* ignore */ }
            this.vibrating = false;
        }

        /** Starts/stops animating the first imaginary mode. Returns true while animating. */
        toggleVibration() {
            if (this.vibrating) {
                this.vibrating = false;
                try { this.viewer.stopAnimate(); } catch (e) { /* ignore */ }
                this.rebuild(false);
                if (this.hooks.onVibrationChange) this.hooks.onVibrationChange(false);
                return false;
            }
            if (!this.hasVibration()) return false;

            const mode = this.file.imaginaryModes[0];
            const atoms = this.file.atoms;
            let maxNorm = 0;
            mode.disp.forEach(d => { maxNorm = Math.max(maxNorm, Math.hypot(d[0], d[1], d[2])); });
            const scale = maxNorm > 0 ? VIBRATION_MAX_SHIFT / maxNorm : 0;

            const frames = [];
            for (let f = 0; f < VIBRATION_FRAMES; f++) {
                const t = Math.sin(2 * Math.PI * f / VIBRATION_FRAMES);
                const pos = atoms.map((a, i) => ({
                    x: a.x + t * scale * mode.disp[i][0],
                    y: a.y + t * scale * mode.disp[i][1],
                    z: a.z + t * scale * mode.disp[i][2]
                }));
                frames.push(xyzFor(atoms, `${this.file.title} frame ${f + 1}`, pos));
            }

            const v = this.viewer;
            this.clearLabels();
            this.clearMeasureShapes();
            this.picks = [];
            v.setClickable({}, false, () => {});
            v.removeAllModels();
            this.vibrating = true;
            v.addModelsAsFrames(frames.join(''), 'xyz');
            this.applyStyle();
            v.animate({ loop: 'forward', reps: 0, interval: 60 });
            v.render();
            this.report(`Imaginary mode ${mode.freq.toFixed(1)} cm⁻¹ (animation)`);
            if (this.hooks.onVibrationChange) this.hooks.onVibrationChange(true);
            return true;
        }

        // ---- lifecycle ---------------------------------------------------------

        destroy() {
            try { this.viewer.spin(false); } catch (e) { /* ignore */ }
            this.stopAnimation();
            try { this.viewer.clear(); } catch (e) { /* ignore */ }
            // Release the WebGL context promptly (browsers allow only ~16 live contexts)
            try {
                const canvas = this.container.querySelector('canvas');
                const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
                const ext = gl && gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
            } catch (e) { /* ignore */ }
            this.container.innerHTML = '';
        }
    }

    NS.MolViewer = MolViewer;
    NS.VIEWER_BACKGROUNDS = BACKGROUNDS;
})(typeof window !== 'undefined' ? window : globalThis);
