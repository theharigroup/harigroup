// LogiDFT module engine and parser.
// ==========================================
        // LOGIDFT MODULE ENGINE & PARSER
        // ==========================================
        let parsedFiles = [];
        let coordFormat = 'atomic';

        const ELEMENT_MAP = {
            1: "H", 2: "He", 3: "Li", 4: "Be", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 10: "Ne",
            11: "Na", 12: "Mg", 13: "Al", 14: "Si", 15: "P", 16: "S", 17: "Cl", 18: "Ar", 19: "K", 20: "Ca",
            21: "Sc", 22: "Ti", 23: "V", 24: "Cr", 25: "Mn", 26: "Fe", 27: "Co", 28: "Ni", 29: "Cu", 30: "Zn",
            31: "Ga", 32: "Ge", 33: "As", 34: "Se", 35: "Br", 36: "Kr", 37: "Rb", 38: "Sr", 39: "Y", 40: "Zr",
            41: "Nb", 42: "Mo", 43: "Tc", 44: "Ru", 45: "Rh", 46: "Pd", 47: "Ag", 48: "Cd", 49: "In", 50: "Sn",
            51: "Sb", 52: "Te", 53: "I", 54: "Xe", 55: "Cs", 56: "Ba", 57: "La", 58: "Ce", 59: "Pr", 60: "Nd",
            61: "Pm", 62: "Sm", 63: "Eu", 64: "Gd", 65: "Tb", 66: "Dy", 67: "Ho", 68: "Er", 69: "Tm", 70: "Yb",
            71: "Lu", 72: "Hf", 73: "Ta", 74: "W", 75: "Re", 76: "Os", 77: "Ir", 78: "Pt", 79: "Au", 80: "Hg",
            81: "Tl", 82: "Pb", 83: "Bi", 84: "Po", 85: "At", 86: "Rn", 87: "Fr", 88: "Ra", 89: "Ac", 90: "Th"
        };
        const SYMBOL_TO_NUM = Object.fromEntries(Object.entries(ELEMENT_MAP).map(([k, v]) => [v, parseInt(k)]));

        // Setup Drag and Drop
        window.addEventListener('DOMContentLoaded', () => {
            const dropzone = document.getElementById('dropzone');
            if (dropzone) {
                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
                });
                ['dragenter', 'dragover'].forEach(eventName => {
                    dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
                });
                ['dragleave', 'drop'].forEach(eventName => {
                    dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
                });
                dropzone.addEventListener('drop', (e) => {
                    handleFiles(e.dataTransfer.files);
                });
            }
        });

        function handleFileSelect(e) { handleFiles(e.target.files); }

        function handleFiles(files) {
            if (!files || files.length === 0) return;
            const fileArray = Array.from(files);
            let readPromises = fileArray.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const parsed = parseDFTLog(file.name, event.target.result);
                        resolve(parsed);
                    };
                    reader.readAsText(file);
                });
            });

            Promise.all(readPromises).then(results => {
                parsedFiles.push(...results);
                updateReferenceDropdown();
                renderAllResults();
                showToast(`Successfully processed ${results.length} DFT log file(s).`);
            });
        }

        function parseDFTLog(fileName, text) {
            const defaultTitle = fileName.replace(/\.[^/.]+$/, "");
            const lines = text.split(/\r?\n/);

            let elecEnergy = null;
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (line.includes("SCF Done:")) {
                    const match = line.match(/=\s*([-\d\.]+)/);
                    if (match) { elecEnergy = parseFloat(match[1]); break; }
                } else if (line.includes("FINAL SINGLE POINT ENERGY")) {
                    const match = line.match(/[-\d\.]+/);
                    if (match) { elecEnergy = parseFloat(match[0]); break; }
                }
            }

            let zpeCorr = null, thermalEnergyCorr = null, thermalEnthalpyCorr = null, thermalGibbsCorr = null;
            let sumElecZpe = null, sumElecThermalE = null, sumElecThermalH = null, sumElecThermalG = null;

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (line.includes("Zero-point correction=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) zpeCorr = parseFloat(m[1]);
                } else if (line.includes("Thermal correction to Energy=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) thermalEnergyCorr = parseFloat(m[1]);
                } else if (line.includes("Thermal correction to Enthalpy=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) thermalEnthalpyCorr = parseFloat(m[1]);
                } else if (line.includes("Thermal correction to Gibbs Free Energy=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) thermalGibbsCorr = parseFloat(m[1]);
                } else if (line.includes("Sum of electronic and zero-point Energies=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) sumElecZpe = parseFloat(m[1]);
                } else if (line.includes("Sum of electronic and thermal Energies=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) sumElecThermalE = parseFloat(m[1]);
                } else if (line.includes("Sum of electronic and thermal Enthalpies=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) sumElecThermalH = parseFloat(m[1]);
                } else if (line.includes("Sum of electronic and thermal Free Energies=")) {
                    const m = line.match(/=\s*([-\d\.]+)/); if (m) sumElecThermalG = parseFloat(m[1]);
                }
                if (sumElecThermalG !== null && zpeCorr !== null) break;
            }

            if (elecEnergy !== null) {
                if (sumElecZpe === null && zpeCorr !== null) sumElecZpe = elecEnergy + zpeCorr;
                if (sumElecThermalE === null && thermalEnergyCorr !== null) sumElecThermalE = elecEnergy + thermalEnergyCorr;
                if (sumElecThermalH === null && thermalEnthalpyCorr !== null) sumElecThermalH = elecEnergy + thermalEnthalpyCorr;
                if (sumElecThermalG === null && thermalGibbsCorr !== null) sumElecThermalG = elecEnergy + thermalGibbsCorr;
            }

            let imaginaryFreqs = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Frequencies --")) {
                    const parts = lines[i].replace("Frequencies --", "").trim().split(/\s+/);
                    parts.forEach(val => {
                        const freq = parseFloat(val);
                        if (!isNaN(freq) && freq < 0) imaginaryFreqs.push(freq);
                    });
                }
            }

            let atoms = [];
            let coordStartIdx = -1;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].includes("Standard orientation:") || lines[i].includes("Input orientation:")) {
                    coordStartIdx = i; break;
                }
            }

            if (coordStartIdx !== -1) {
                let lineIdx = coordStartIdx + 1;
                let dashCount = 0;
                while (lineIdx < lines.length && dashCount < 2) {
                    if (lines[lineIdx].includes("---------------------------------------------------------------------")) dashCount++;
                    lineIdx++;
                }

                while (lineIdx < lines.length) {
                    if (lines[lineIdx].includes("---------------------------------------------------------------------")) break;
                    const tokens = lines[lineIdx].trim().split(/\s+/);
                    if (tokens.length >= 6) {
                        const atomicNum = parseInt(tokens[1]);
                        const x = parseFloat(tokens[3]), y = parseFloat(tokens[4]), z = parseFloat(tokens[5]);
                        if (!isNaN(atomicNum) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            atoms.push({ atomicNum, symbol: ELEMENT_MAP[atomicNum] || "X", x, y, z });
                        }
                    }
                    lineIdx++;
                }
            }

            return {
                id: 'file_' + Math.random().toString(36).substr(2, 9),
                title: defaultTitle,
                fileName: fileName,
                imaginaryFreqCount: imaginaryFreqs.length,
                imaginaryFreqs: imaginaryFreqs,
                elecEnergy: elecEnergy,
                zpeCorr: zpeCorr,
                thermalEnergyCorr: thermalEnergyCorr,
                thermalEnthalpyCorr: thermalEnthalpyCorr,
                thermalGibbsCorr: thermalGibbsCorr,
                sumElecZpe: sumElecZpe,
                sumElecThermalE: sumElecThermalE,
                sumElecThermalH: sumElecThermalH,
                sumElecThermalG: sumElecThermalG,
                atoms: atoms
            };
        }

        function setCoordFormat(format) {
            coordFormat = format;
            document.getElementById('optAtomicNum').className = format === 'atomic' 
                ? 'px-3 py-1.5 rounded-sm border text-center transition font-mono bg-blue-600 border-blue-500 text-white' 
                : 'px-3 py-1.5 rounded-sm border text-center transition font-mono bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-650';

            document.getElementById('optSymbol').className = format === 'symbol' 
                ? 'px-3 py-1.5 rounded-sm border text-center transition font-mono bg-blue-600 border-blue-500 text-white' 
                : 'px-3 py-1.5 rounded-sm border text-center transition font-mono bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-650';

            renderAllResults();
        }

        function updateReferenceDropdown() {
            const select = document.getElementById('refStructureSelect');
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">None (Absolute Hartree only)</option>';
            
            parsedFiles.forEach((file) => {
                const opt = document.createElement('option');
                opt.value = file.id;
                opt.textContent = `${file.title} (G = ${file.sumElecThermalG ? file.sumElecThermalG.toFixed(6) : 'N/A'} Hartree)`;
                select.appendChild(opt);
            });

            if (currentVal && parsedFiles.some(f => f.id === currentVal)) {
                select.value = currentVal;
            }
        }

        function renderAllResults() {
            const container = document.getElementById('resultsContainer');
            const summaryBanner = document.getElementById('summaryBanner');
            if (!container) return;

            if (parsedFiles.length === 0) {
                container.innerHTML = `
                    <div id="emptyState" class="bg-slate-800/40 border border-slate-700/60 rounded-sm p-12 text-center">
                        <div class="w-16 h-16 mx-auto mb-4 rounded-sm bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                            <i class="fa-solid fa-file-lines text-2xl"></i>
                        </div>
                        <h3 class="text-slate-300 font-semibold mb-1">No DFT log files loaded yet</h3>
                        <p class="text-xs text-slate-500 max-w-sm mx-auto">Upload Gaussian or ORCA log files above to parse thermochemistry and Cartesian coordinates.</p>
                    </div>
                `;
                if (summaryBanner) summaryBanner.classList.add('hidden');
                return;
            }

            if (summaryBanner) summaryBanner.classList.remove('hidden');
            document.getElementById('statFileCount').textContent = parsedFiles.length;
            document.getElementById('statTSCount').textContent = parsedFiles.filter(f => f.imaginaryFreqCount > 0).length;

            const validGFiles = parsedFiles.filter(f => f.sumElecThermalG !== null);
            if (validGFiles.length > 0) {
                const lowest = validGFiles.reduce((prev, curr) => prev.sumElecThermalG < curr.sumElecThermalG ? prev : curr);
                document.getElementById('statLowestG').textContent = `${lowest.title} (${lowest.sumElecThermalG.toFixed(6)} Ha)`;
            } else {
                document.getElementById('statLowestG').textContent = '--';
            }

            const refId = document.getElementById('refStructureSelect').value;
            const refFile = parsedFiles.find(f => f.id === refId);
            const refG = refFile ? refFile.sumElecThermalG : null;

            let html = '';
            parsedFiles.forEach((file, index) => {
                const formattedText = generateSITextBlock(file);
                let relGTag = '';
                if (refG !== null && file.sumElecThermalG !== null) {
                    const deltaG = (file.sumElecThermalG - refG) * 627.5095;
                    const sign = deltaG >= 0 ? '+' : '';
                    const colorClass = deltaG === 0 ? 'text-slate-400 bg-slate-700/50' : (deltaG > 0 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30');
                    relGTag = `<span class="px-2.5 py-1 rounded-sm border text-xs font-mono font-semibold ${colorClass}">ΔG = ${sign}${deltaG.toFixed(2)} kcal/mol</span>`;
                }

                html += `
                    <div class="bg-slate-800 border border-slate-700 rounded-sm overflow-hidden shadow-lg transition" id="card_${file.id}">
                        <div class="bg-slate-750 border-b border-slate-700 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div class="flex items-center space-x-3">
                                <span class="w-7 h-7 rounded-sm bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-500/30">
                                    #${index + 1}
                                </span>
                                <div>
                                    <input type="text" value="${escapeHtml(file.title)}" onchange="updateFileTitle('${file.id}', this.value)" 
                                        class="bg-transparent hover:bg-slate-700/50 focus:bg-slate-900 border border-transparent hover:border-slate-600 focus:border-blue-500 rounded-sm px-1.5 py-0.5 text-slate-100 font-bold text-base focus:outline-none transition" title="Click to rename structure">
                                    <span class="text-xs text-slate-400 block">${escapeHtml(file.fileName)}</span>
                                </div>
                            </div>

                            <div class="flex items-center space-x-3">
                                ${relGTag}
                                <button onclick="toggle3DViewer('${file.id}')" class="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-sm text-xs font-semibold flex items-center gap-1.5 transition">
                                    <i class="fa-solid fa-cube text-indigo-400"></i> 3D View
                                </button>
                                <button onclick="copySingleSI('${file.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-xs font-semibold flex items-center gap-1.5 transition shadow-sm">
                                    <i class="fa-solid fa-copy"></i> Copy Text
                                </button>
                                <button onclick="removeFile('${file.id}')" class="text-slate-400 hover:text-rose-400 p-1.5 transition" title="Remove file">
                                    <i class="fa-solid fa-xmark text-lg"></i>
                                </button>
                            </div>
                        </div>

                        <div id="viewer3d_${file.id}" class="hidden bg-slate-950 border-b border-slate-700 p-4 h-80 relative">
                            <div id="molContainer_${file.id}" class="w-full h-full rounded-sm overflow-hidden"></div>
                            <div class="absolute bottom-6 right-6 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-sm border border-slate-700 text-xs text-slate-300 pointer-events-none flex items-center gap-2">
                                <i class="fa-solid fa-hand-pointer text-blue-400"></i> Drag to rotate | Scroll to zoom
                            </div>
                        </div>

                        <div class="p-6 bg-slate-900/60 overflow-x-auto">
                            <div class="bg-blue-100 text-slate-900 font-bold text-center py-1.5 px-4 rounded-t-sm text-sm border border-blue-200">
                                ${escapeHtml(file.title)}
                            </div>
                            <pre id="text_${file.id}" class="font-mono-code text-slate-200 text-sm leading-relaxed p-4 bg-slate-950 border-x border-b border-slate-800 rounded-b-sm whitespace-pre select-all">${formattedText}</pre>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        function generateSITextBlock(file) {
            const energyFormat = document.getElementById('energyLabelFormat').value;
            let lines = [];

            let imagLine = `Number of imaginary frequencies: ${file.imaginaryFreqCount}`;
            if (file.imaginaryFreqCount > 0 && file.imaginaryFreqs.length > 0) {
                const freqsFormatted = file.imaginaryFreqs.map(f => `${f.toFixed(2)} cm⁻¹`).join(', ');
                imagLine += ` (${freqsFormatted})`;
            }
            lines.push(imagLine);
            lines.push('');

            const elecVal = file.elecEnergy !== null ? file.elecEnergy.toFixed(6) : 'N/A';
            if (energyFormat === 'HF') {
                lines.push(`Electronic energy:   HF=${elecVal}`);
            } else if (energyFormat === 'E_DFT') {
                lines.push(`Electronic energy:   E(DFT)=${elecVal}`);
            } else {
                lines.push(`Electronic energy:   ${elecVal}`);
            }

            const formatPad = (val, extra = '') => {
                if (val === null) return 'N/A';
                return val.toFixed(6).padStart(16) + extra;
            };

            lines.push(`Zero-point correction=${formatPad(file.zpeCorr, ' (Hartree/Particle)')}`);
            lines.push(`Thermal correction to Energy=${formatPad(file.thermalEnergyCorr)}`);
            lines.push(`Thermal correction to Enthalpy=${formatPad(file.thermalEnthalpyCorr)}`);
            lines.push(`Thermal correction to Gibbs Free Energy=${formatPad(file.thermalGibbsCorr)}`);

            lines.push(`Sum of electronic and zero-point Energies=${formatPad(file.sumElecZpe)}`);
            lines.push(`Sum of electronic and thermal Energies=${formatPad(file.sumElecThermalE)}`);
            lines.push(`Sum of electronic and thermal Enthalpies=${formatPad(file.sumElecThermalH)}`);
            lines.push(`Sum of electronic and thermal Free Energies=${formatPad(file.sumElecThermalG)}`);

            lines.push('...................................................');
            lines.push('              Cartesian Coordinates');
            lines.push('...................................................');

            if (file.atoms && file.atoms.length > 0) {
                file.atoms.forEach(atom => {
                    const label = coordFormat === 'symbol' 
                        ? atom.symbol.padStart(4) 
                        : atom.atomicNum.toString().padStart(4);
                    lines.push(` ${label}   ${atom.x.toFixed(6).padStart(12)} ${atom.y.toFixed(6).padStart(12)} ${atom.z.toFixed(6).padStart(12)}`);
                });
            } else {
                lines.push(' No Cartesian coordinates extracted.');
            }

            return lines.join('\n');
        }

        function toggle3DViewer(fileId) {
            const viewerDiv = document.getElementById(`viewer3d_${fileId}`);
            if (viewerDiv.classList.contains('hidden')) {
                viewerDiv.classList.remove('hidden');
                render3DMolecule(fileId);
            } else {
                viewerDiv.classList.add('hidden');
            }
        }

        function render3DMolecule(fileId) {
            const file = parsedFiles.find(f => f.id === fileId);
            if (!file || !file.atoms || file.atoms.length === 0) return;

            const container = document.getElementById(`molContainer_${fileId}`);
            container.innerHTML = '';

            let xyzData = `${file.atoms.length}\n${file.title}\n`;
            file.atoms.forEach(a => { xyzData += `${a.symbol} ${a.x} ${a.y} ${a.z}\n`; });

            try {
                if (typeof $3Dmol !== 'undefined') {
                    const viewer = $3Dmol.createViewer(container, { backgroundColor: '0x020617' });
                    viewer.addModel(xyzData, "xyz");
                    viewer.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.25 } });
                    viewer.zoomTo();
                    viewer.render();
                }
            } catch (err) {
                console.error("3Dmol error:", err);
            }
        }

        function copySingleSI(fileId) {
            const file = parsedFiles.find(f => f.id === fileId);
            if (!file) return;
            const fullBlock = `\t\t\t\t${file.title}\n` + generateSITextBlock(file);
            copyToClipboard(fullBlock, `Copied SI data for "${file.title}"`);
        }

        function copyAllSI() {
            if (parsedFiles.length === 0) return;
            const allBlocks = parsedFiles.map(file => {
                return `---------------------------------------------------\n\t\t\t\t${file.title}\n---------------------------------------------------\n` + generateSITextBlock(file);
            }).join('\n\n\n');
            copyToClipboard(allBlocks, `Copied SI data for all ${parsedFiles.length} structure(s)`);
        }

        function copyToClipboard(text, successMsg) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showToast(successMsg);
            } catch (err) {
                showToast('Copy failed.');
            }
            document.body.removeChild(textArea);
        }

        function downloadAllSI() {
            if (parsedFiles.length === 0) return;
            const allBlocks = parsedFiles.map(file => {
                return `===================================================\n\t\t\t\t${file.title}\n===================================================\n` + generateSITextBlock(file);
            }).join('\n\n\n');

            const blob = new Blob([allBlocks], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `DFT_Supporting_Information_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Downloaded Supporting Information .txt file');
        }

        function exportCSV() {
            if (parsedFiles.length === 0) return;
            const refId = document.getElementById('refStructureSelect').value;
            const refFile = parsedFiles.find(f => f.id === refId);
            const refG = refFile ? refFile.sumElecThermalG : null;

            let csvRows = [
                ['Structure Title', 'Filename', 'N_Imag', 'Electronic Energy (Ha)', 'ZPE (Ha)', 'H_corr (Ha)', 'G_corr (Ha)', 'E+ZPE (Ha)', 'H_total (Ha)', 'G_total (Ha)', 'Rel ΔG (kcal/mol)']
            ];

            parsedFiles.forEach(f => {
                let deltaGStr = 'N/A';
                if (refG !== null && f.sumElecThermalG !== null) {
                    deltaGStr = ((f.sumElecThermalG - refG) * 627.5095).toFixed(2);
                }
                csvRows.push([
                    `"${f.title}"`, `"${f.fileName}"`, f.imaginaryFreqCount,
                    f.elecEnergy !== null ? f.elecEnergy.toFixed(6) : '',
                    f.zpeCorr !== null ? f.zpeCorr.toFixed(6) : '',
                    f.thermalEnthalpyCorr !== null ? f.thermalEnthalpyCorr.toFixed(6) : '',
                    f.thermalGibbsCorr !== null ? f.thermalGibbsCorr.toFixed(6) : '',
                    f.sumElecZpe !== null ? f.sumElecZpe.toFixed(6) : '',
                    f.sumElecThermalH !== null ? f.sumElecThermalH.toFixed(6) : '',
                    f.sumElecThermalG !== null ? f.sumElecThermalG.toFixed(6) : '',
                    deltaGStr
                ]);
            });

            const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
            const link = document.createElement("a");
            link.setAttribute("href", encodeURI(csvContent));
            link.setAttribute("download", `DFT_Energies_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Exported CSV energy table');
        }

        function updateFileTitle(fileId, newTitle) {
            const file = parsedFiles.find(f => f.id === fileId);
            if (file) {
                file.title = newTitle;
                updateReferenceDropdown();
                renderAllResults();
            }
        }

        function removeFile(fileId) {
            parsedFiles = parsedFiles.filter(f => f.id !== fileId);
            updateReferenceDropdown();
            renderAllResults();
            showToast('File removed.');
        }

        function clearAllData() {
            if (parsedFiles.length === 0) return;
            parsedFiles = [];
            updateReferenceDropdown();
            renderAllResults();
            showToast('Cleared all loaded data.');
        }

        function expandAllCards(expand) {
            parsedFiles.forEach(f => {
                const viewer = document.getElementById(`viewer3d_${f.id}`);
                if (viewer) {
                    if (expand) viewer.classList.remove('hidden');
                    else viewer.classList.add('hidden');
                }
            });
        }

        function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function loadSampleData() {
            const sample1Text = `
 %chk=Int-I.chk
 # B3LYP/6-31G(d) Opt Freq

 SCF Done:  E(RB3LYP) =  -387.598184000     A.U. after   11 cycles

 Zero-point correction=                 0.190989 (Hartree/Particle)
 Thermal correction to Energy=          0.200771
 Thermal correction to Enthalpy=        0.201715
 Thermal correction to Gibbs Free Energy= 0.156195
 Sum of electronic and zero-point Energies=   -387.407195
 Sum of electronic and thermal Energies=      -387.397413
 Sum of electronic and thermal Enthalpies=    -387.396469
 Sum of electronic and thermal Free Energies=  -387.441989

 Frequencies --   120.45   210.12   305.80

 Standard orientation:
 ---------------------------------------------------------------------
 Center     Atomic      Atomic             Coordinates (Angstroms)
 Number     Number       Type             X           Y           Z
 ---------------------------------------------------------------------
      1          6          0     -1.647929   -1.162909   -0.111088
      2          6          0     -2.113841    0.290889   -0.226723
      3          6          0     -1.132052    1.243658    0.476536
      4          6          0      0.302572    1.048921    0.000418
      5          6          0      0.837525   -0.413761   -0.012972
 ---------------------------------------------------------------------
`;
            const parsed1 = parseDFTLog("Int-I.log", sample1Text);
            parsedFiles = [parsed1];
            updateReferenceDropdown();
            renderAllResults();
            showToast('Loaded demo Gaussian log file!');
        }
