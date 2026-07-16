/* ================================================================
   main.js — nav, scroll reveals, stat counters
   ================================================================ */

(function () {
    'use strict';

    /* ---- Mobile nav toggle ---- */

    const toggle = document.querySelector('.topnav__toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    if (toggle && mobileMenu) {
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!open));
            mobileMenu.hidden = open;
        });

        mobileMenu.addEventListener('click', (e) => {
            if (e.target.closest('a')) {
                toggle.setAttribute('aria-expanded', 'false');
                mobileMenu.hidden = true;
            }
        });
    }

    /* ---- Reveal on scroll ---- */

    const revealEls = document.querySelectorAll('.reveal');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-visible'));
    } else {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        revealEls.forEach((el) => io.observe(el));
    }

    /* ---- Animated stat counters ---- */

    const counters = document.querySelectorAll('[data-count]');

    function animateCount(el) {
        const target = parseInt(el.dataset.count, 10);
        if (!Number.isFinite(target)) return;

        if (reduceMotion) {
            el.textContent = String(target);
            return;
        }

        const duration = 1400;
        const start = performance.now();

        function tick(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    if ('IntersectionObserver' in window) {
        const countIo = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    animateCount(entry.target);
                    countIo.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });

        counters.forEach((el) => countIo.observe(el));
    } else {
        counters.forEach(animateCount);
    }

})();
