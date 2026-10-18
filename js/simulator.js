// Reaction pathway simulator.
// Reaction Simulator Logic
        const reactions = {
            propellane: {
                title: 'Pathway: [1.1.1]Propellane Expansion',
                energy: '65 kcal/mol Released',
                barWidth: '85%',
                stepTitle: 'Step 1: SET Radical Activation',
                stepDesc: 'Visible light excites photocatalyst to induce single electron transfer, breaking strain central bond to form BCP intermediates.',
                product: '1,3-Disubstituted BCP Isostere'
            },
            diazo: {
                title: 'Pathway: Carbene N2 Extrusion',
                energy: 'Nitrogen Gas Extrusion',
                barWidth: '70%',
                stepTitle: 'Step 1: N2 Loss & Activation',
                stepDesc: 'Photo/electro activation prompts rapid nitrogen loss to yield transient carbenes for selective insertions.',
                product: 'Functionalized Privileged Heterocycle'
            }
        };

        let currentSubstrate = 'propellane';

        function selectReaction(type) {
            currentSubstrate = type;
            const data = reactions[type];
            document.querySelectorAll('.sim-btn').forEach(btn => {
                btn.classList.remove('border-amber-400', 'bg-amber-400/10');
                btn.classList.add('border-slate-800', 'bg-navy-900');
            });
            document.getElementById(`btn-${type}`).classList.add('border-amber-400', 'bg-amber-400/10');
            document.getElementById('sim-title-tag').textContent = data.title;
            document.getElementById('sim-energy-val').textContent = data.energy;
            document.getElementById('sim-energy-bar').style.width = data.barWidth;
            document.getElementById('sim-step-title').textContent = data.stepTitle;
            document.getElementById('sim-step-desc').textContent = data.stepDesc;
            document.getElementById('sim-product-name').textContent = data.product;
        }

        function triggerSimulate() {
            const bar = document.getElementById('sim-energy-bar');
            bar.style.width = '0%';
            setTimeout(() => {
                bar.style.width = reactions[currentSubstrate].barWidth;
            }, 100);
            showToast('Transformation Simulation Executed!');
        }
