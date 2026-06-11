'use strict';

/* ============================================================
   NAV — transparent → solid on scroll
   ============================================================ */
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 55);
}, { passive: true });

/* ============================================================
   MOBILE MENU
   ============================================================ */
const burger     = document.getElementById('nav-burger');
const mobileMenu = document.getElementById('mobile-menu');
let menuOpen = false;

function toggleMenu(open) {
  menuOpen = open !== undefined ? open : !menuOpen;
  burger.classList.toggle('open', menuOpen);
  burger.setAttribute('aria-expanded', String(menuOpen));
  mobileMenu.classList.toggle('open', menuOpen);
  mobileMenu.setAttribute('aria-hidden', String(!menuOpen));
  document.body.style.overflow = menuOpen ? 'hidden' : '';
}

burger.addEventListener('click', () => toggleMenu());

mobileMenu.querySelectorAll('.mobile-link, .mobile-cta').forEach(link => {
  link.addEventListener('click', () => toggleMenu(false));
});

/* close on Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) toggleMenu(false);
});

/* ============================================================
   SMOOTH SCROLL — anchor links (prevents default jump)
   ============================================================ */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const id     = link.getAttribute('href');
    const target = id === '#' ? document.body : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const offset = 72; // nav height
    const top    = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ============================================================
   SCROLL REVEAL — IntersectionObserver
   ============================================================ */
function applyStagger(parentSelector, delayStep) {
  document.querySelectorAll(parentSelector).forEach(parent => {
    parent.querySelectorAll('.reveal').forEach((el, i) => {
      el.dataset.revealDelay = i * delayStep;
    });
  });
}

// Set stagger delays before observer fires
applyStagger('.stats-grid',   100);
applyStagger('.services-list', 80);
applyStagger('.booking-inner', 160);
applyStagger('.contacts-grid', 140);

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const delay = Number(entry.target.dataset.revealDelay || 0);
    setTimeout(() => entry.target.classList.add('visible'), delay);
    revealObserver.unobserve(entry.target);
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -48px 0px',
});

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ============================================================
   BOOKING FORM
   ============================================================ */
const form       = document.getElementById('booking-form');
const submitBtn  = document.getElementById('submit-btn');
const btnLabel   = submitBtn.querySelector('.btn-label');
const btnLoading = submitBtn.querySelector('.btn-loading');
const formSuccess = document.getElementById('form-success');

/* Phone formatting (Uzbekistan +998 XX XXX XX XX) */
const phoneInput = document.getElementById('f-phone');
phoneInput.addEventListener('input', (e) => {
  let digits = e.target.value.replace(/\D/g, '');

  // strip leading 998
  if (digits.startsWith('998')) digits = digits.slice(3);
  // cap at 9 digits
  if (digits.length > 9) digits = digits.slice(0, 9);

  let out = '+998';
  if (digits.length > 0) out += ' ' + digits.slice(0, 2);
  if (digits.length > 2) out += ' ' + digits.slice(2, 5);
  if (digits.length > 5) out += ' ' + digits.slice(5, 7);
  if (digits.length > 7) out += ' ' + digits.slice(7, 9);

  e.target.value = out;
});

/* Validation helpers */
function showError(fieldId, msg) {
  const el = document.getElementById(fieldId + '-error');
  if (el) el.textContent = msg;
}
function clearError(fieldId) {
  const el = document.getElementById(fieldId + '-error');
  if (el) el.textContent = '';
}

['f-name', 'f-phone'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => clearError(id));
});

function validateForm() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.replace(/\D/g, '');
  let ok = true;

  if (!name) {
    showError('f-name', 'Введите ваше имя');
    ok = false;
  }
  // +998 + 9 digits = at least 12 digits total; simplified check ≥9
  if (phone.length < 9) {
    showError('f-phone', 'Введите корректный номер телефона');
    ok = false;
  }
  return ok;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  formSuccess.hidden = true;

  if (!validateForm()) {
    // focus first invalid field
    const firstError = form.querySelector('input:invalid, .field-error:not(:empty)');
    if (firstError) firstError.focus();
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  btnLabel.hidden    = true;
  btnLoading.hidden  = false;

  // Simulate async submit (replace with real fetch if backend exists)
  setTimeout(() => {
    form.reset();
    submitBtn.disabled = false;
    btnLabel.hidden    = false;
    btnLoading.hidden  = true;
    formSuccess.hidden = false;

    // Auto-hide success after 6s
    setTimeout(() => { formSuccess.hidden = true; }, 6000);
  }, 1600);
});

/* Date input — min = tomorrow */
const dateInput = document.getElementById('f-date');
if (dateInput) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];
}

/* ============================================================
   CATALOG ITEMS — keyboard accessibility
   ============================================================ */
document.querySelectorAll('.catalog-item').forEach(item => {
  item.setAttribute('tabindex', '0');
  item.setAttribute('role', 'button');
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.click();
    }
  });
});

/* ============================================================
   MARQUEE — pause on reduced-motion
   ============================================================ */
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const marqueeInner = document.querySelector('.marquee-inner');
if (marqueeInner && mq.matches) {
  marqueeInner.style.animationPlayState = 'paused';
}
