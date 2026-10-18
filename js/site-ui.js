// Publications modal, contact form feedback, and shared toast.
// BibTeX Modal Logic
        const bibtexData = {
            kadam2025jacs: `@article{Kadam2025JACS,\n  author = {Kadam, Ganesh A. and Midya, Suparnak and Hari, Durga Prasad},\n  title = {Interrupted Dowd-Beckwith Reaction: Ring-Expansion of Ketones with [1.1.1]Propellane},\n  journal = {Journal of the American Chemical Society},\n  year = {2025}\n}`,
            midya2025natcomm: `@article{Midya2025NatComm,\n  author = {Midya, Suparnak and Ali, Aksar and Hari, Durga Prasad},\n  title = {[2,3]-Sigmatropic Rearrangement with [1.1.1]Propellane},\n  journal = {Nature Communications},\n  year = {2025}\n}`,
            singha2025angew: `@article{Singha2025Angew,\n  author = {Singha, Tushar and Kasu, Jyothirlatha and Hari, Durga Prasad},\n  title = {Electrochemical Interrupted Dowd-Beckwith Reaction},\n  journal = {Angewandte Chemie International Edition},\n  year = {2025}\n}`
        };

        function copyCitation(key) {
            document.getElementById('bibtex-text').value = bibtexData[key] || '';
            document.getElementById('bibtex-modal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('bibtex-modal').classList.add('hidden');
        }

        function copyModalText() {
            const text = document.getElementById('bibtex-text');
            text.select();
            document.execCommand('copy');
            closeModal();
            showToast('BibTeX copied to clipboard!');
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').textContent = message;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        }

        function handleFormSubmit(e) {
            e.preventDefault();
            showToast('Inquiry received! Dr. Hari will get in touch.');
            e.target.reset();
        }
