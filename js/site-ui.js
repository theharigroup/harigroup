// Publications modal, contact form feedback, and shared toast.
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
