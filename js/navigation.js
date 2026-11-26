document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  // Mobile menu
  const menuButton = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuIcon = document.getElementById('menu-icon');
  if (menuButton && mobileMenu) {
    menuButton.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('hidden') === false;
      menuButton.setAttribute('aria-expanded', open);
      menuButton.classList.toggle('open', open);
      const bar = document.getElementById('navbar');
      if (bar) bar.classList.toggle('tab-open', open);   // tablet: header links slide in on the right
      if (!open) document.querySelectorAll('.nav-dd.open').forEach(d => d.classList.remove('open'));
    });
  }

  // Tablet touch: first tap on "Members" opens its sub-menu (Alumni), second tap opens the page
  const dd = document.querySelector('.nav-dd'), ddLink = document.getElementById('nav-team');
  if (dd && ddLink) {
    ddLink.addEventListener('click', e => {
      if (matchMedia('(min-width:768px) and (max-width:1279px) and (hover:none)').matches && !dd.classList.contains('open')) {
        e.preventDefault(); dd.classList.add('open');
      }
    });
    document.addEventListener('click', e => { if (!dd.contains(e.target)) dd.classList.remove('open'); });
  }

  // Active page in the menu
  const page = document.body.dataset.page || 'home';
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  const navId = page === 'invoice' ? null : (page === 'alumni' ? 'nav-team' : `nav-${page}`);
  const activeNav = navId ? document.getElementById(navId) : null;
  if (activeNav) activeNav.classList.add('active');

  // Scroll progress bar + glass navbar
  const nav = document.getElementById('navbar');
  const bar = document.getElementById('progress');
  const onScroll = () => {
    const h = document.documentElement;
    if (bar) bar.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
    if (nav) nav.classList.toggle('scrolled', h.scrollTop > 10);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
