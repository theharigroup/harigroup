document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  const menuButton = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuButton && mobileMenu) {
    menuButton.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    mobileMenu.querySelectorAll('button[onclick]').forEach(button => {
      button.addEventListener('click', () => mobileMenu.classList.add('hidden'));
    });
  }

  const page = document.body.dataset.page || 'home';
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active-nav'));
  const navId = page === 'invoice' ? null : `nav-${page}`;
  const activeNav = navId ? document.getElementById(navId) : null;
  if (activeNav) activeNav.classList.add('active-nav');
});
