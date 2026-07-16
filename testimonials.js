/* ================================================================
   testimonials.js — loads testimonials from the `testimonials`
   table and drives the two-up carousel. Falls back to examples
   when Supabase isn't configured.
   ================================================================ */

(function () {
    'use strict';

    const track = document.getElementById('testimonials-track');
    const prevBtn = document.getElementById('testimonial-prev');
    const nextBtn = document.getElementById('testimonial-next');
    const dotsWrap = document.getElementById('testimonial-dots');
    if (!track || !prevBtn || !nextBtn || !dotsWrap) return;

    const FALLBACK = [
        {
            id: null,
            quote: 'The scope document alone was worth the fee. Everything landed exactly when the timeline said it would — I have never had that from a contractor before.',
            author: 'Sarah Lim',
            role: 'Partner, Harbourline Legal'
        },
        {
            id: null,
            quote: 'My son went from dreading computer science to teaching his friends. The weekly progress notes meant we always knew exactly where he stood.',
            author: 'Devi Nair',
            role: 'Parent, A-Level tutoring'
        },
        {
            id: null,
            quote: 'We handed over a mess of spreadsheets and got back a system that just works. Six hours of admin a week, gone.',
            author: 'Marcus Chen',
            role: 'Director, Brewline Group'
        },
        {
            id: null,
            quote: 'Fast, honest, and completely unflappable. When the payment provider changed their API a week before launch, it was handled before we even noticed.',
            author: 'Amira Hassan',
            role: 'Founder, Kiln & Co.'
        }
    ];

    let items = [];
    let page = 0;

    function perPage() {
        return window.matchMedia('(min-width: 47.5rem)').matches ? 2 : 1;
    }

    function pageCount() {
        return Math.max(1, Math.ceil(items.length / perPage()));
    }

    function initials(name) {
        return String(name || '?')
            .split(/\s+/)
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    function render() {
        const esc = window.escapeHtml;
        track.innerHTML = items.map((t) => `
            <figure class="testimonial"${t.id ? ` data-testimonial-id="${esc(t.id)}"` : ''}>
                <blockquote class="testimonial__quote">${esc(t.quote)}</blockquote>
                <figcaption class="testimonial__footer">
                    <span class="testimonial__avatar" aria-hidden="true">${esc(initials(t.author))}</span>
                    <span>
                        <span class="testimonial__name">${esc(t.author)}</span><br>
                        <span class="testimonial__role">${esc(t.role)}</span>
                    </span>
                </figcaption>
            </figure>
        `).join('');

        renderDots();
        update();
        document.dispatchEvent(new CustomEvent('testimonials:rendered'));
    }

    function renderDots() {
        const n = pageCount();
        dotsWrap.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const dot = document.createElement('button');
            dot.className = 'testimonials__dot';
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-label', `Testimonial page ${i + 1}`);
            dot.addEventListener('click', () => { page = i; update(); });
            dotsWrap.appendChild(dot);
        }
    }

    function update() {
        const n = pageCount();
        page = Math.min(page, n - 1);

        const card = track.querySelector('.testimonial');
        if (card) {
            const gap = 26;
            const step = (card.offsetWidth + gap) * perPage();
            track.style.transform = `translateX(-${page * step}px)`;
        }

        prevBtn.disabled = page === 0;
        nextBtn.disabled = page >= n - 1;

        dotsWrap.querySelectorAll('.testimonials__dot').forEach((d, i) => {
            d.classList.toggle('is-active', i === page);
            d.setAttribute('aria-selected', String(i === page));
        });
    }

    prevBtn.addEventListener('click', () => { page = Math.max(0, page - 1); update(); });
    nextBtn.addEventListener('click', () => { page = Math.min(pageCount() - 1, page + 1); update(); });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { renderDots(); update(); }, 150);
    });

    async function loadTestimonials() {
        if (!window.sbConfigured) {
            items = FALLBACK;
            render();
            return;
        }

        const { data, error } = await window.sb
            .from('testimonials')
            .select('*')
            .eq('published', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[meridian] Could not load testimonials:', error.message);
            items = FALLBACK;
        } else {
            items = data && data.length ? data : FALLBACK;
        }
        render();
    }

    window.reloadTestimonials = loadTestimonials; // used by admin.js
    loadTestimonials();
})();
