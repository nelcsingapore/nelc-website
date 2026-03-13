/* NELC Website — main.js */

// ── LANGUAGE TOGGLE ──────────────────────────────────
const html = document.documentElement;
let currentLang = localStorage.getItem('nelc-lang') || 'en';

function setLang(lang) {
  currentLang = lang;
  html.className = 'lang-' + lang;
  localStorage.setItem('nelc-lang', lang);
  document.querySelectorAll('.lang-btn button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setLang(currentLang);

  document.querySelectorAll('.lang-btn button').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  // ── SCROLLED NAV ───────────────────────────────────
  const nav = document.querySelector('.nav');
  const onScroll = () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── ACTIVE NAV LINK ────────────────────────────────
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  // ── MOBILE NAV TOGGLE ──────────────────────────────
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const open = navLinks.classList.contains('open');
      toggle.children[0].style.transform = open ? 'rotate(45deg) translate(5px,5px)' : '';
      toggle.children[1].style.opacity = open ? '0' : '1';
      toggle.children[2].style.transform = open ? 'rotate(-45deg) translate(5px,-5px)' : '';
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        toggle.children[0].style.transform = '';
        toggle.children[1].style.opacity = '1';
        toggle.children[2].style.transform = '';
      });
    });
  }

  // ── SCROLL REVEAL ──────────────────────────────────
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), entry.target.dataset.delay || 0);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach(el => observer.observe(el));

  // ── CONTACT FORM ───────────────────────────────────
  const form = document.getElementById('contact-form');
  const formSuccess = document.getElementById('form-success');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Simulate submission (replace with real backend / Formspree)
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = '...';
      setTimeout(() => {
        form.reset();
        btn.disabled = false;
        btn.textContent = form.dataset.btnLabel || 'Send Enquiry';
        if (formSuccess) formSuccess.style.display = 'block';
      }, 1000);
    });
  }
});
