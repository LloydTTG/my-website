/* ================================================================
   projects.js — loads portfolio projects from the `projects` table.
   Falls back to built-in examples when Supabase isn't configured,
   so the page always looks complete.
   ================================================================ */

(function () {
    'use strict';

    const grid = document.getElementById('work-grid');
    if (!grid) return;

    const FALLBACK_PROJECTS = [
        {
            id: null,
            tag: 'Web design & build',
            title: 'Harbourline Legal',
            description: 'Full redesign and CMS build for a three-partner law firm. Enquiries up 60% in the first quarter after launch.',
            year: '2026',
            scope: 'Design · Build · SEO',
            image_url: '',
            link: ''
        },
        {
            id: null,
            tag: 'E-commerce',
            title: 'Kiln & Co. Ceramics',
            description: 'Storefront with inventory sync and a custom order pipeline for a small-batch ceramics studio.',
            year: '2025',
            scope: 'Build · Payments',
            image_url: '',
            link: ''
        },
        {
            id: null,
            tag: 'Tutoring',
            title: 'A-Level CS cohort',
            description: 'Twelve-week structured programme for eight students. Every one of them beat their predicted grade.',
            year: '2025',
            scope: 'Curriculum · 1-on-1',
            image_url: '',
            link: ''
        },
        {
            id: null,
            tag: 'Web app',
            title: 'Rosterly',
            description: 'Shift-scheduling tool for a 40-person café group — built, deployed, and handed over in six weeks.',
            year: '2025',
            scope: 'Design · Build · Auth',
            image_url: '',
            link: ''
        },
        {
            id: null,
            tag: 'Automation',
            title: 'Invoice pipeline',
            description: 'Replaced a 6-hour weekly manual process with a fully automated invoicing and reconciliation flow.',
            year: '2024',
            scope: 'Scripting · Integration',
            image_url: '',
            link: ''
        },
        {
            id: null,
            tag: 'Web design',
            title: 'Fieldnote Films',
            description: 'Portfolio site for a documentary studio — fast, quiet design that puts the work first.',
            year: '2024',
            scope: 'Design · Build',
            image_url: '',
            link: ''
        }
    ];

    function renderProjects(projects) {
        const esc = window.escapeHtml;
        grid.innerHTML = projects.map((p) => {
            const media = p.image_url
                ? `<div class="project-card__media"><img class="project-card__img" src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"></div>`
                : `<div class="project-card__media project-card__media--placeholder"></div>`;

            const inner = `
                ${media}
                <div class="project-card__body">
                    <p class="project-card__tag">${esc(p.tag)}</p>
                    <h3 class="project-card__title">${esc(p.title)}</h3>
                    <p class="project-card__desc">${esc(p.description)}</p>
                    <div class="project-card__meta">
                        <span>${esc(p.scope)}</span>
                        <span>${esc(p.year)}</span>
                    </div>
                </div>`;

            const dataAttr = p.id ? ` data-project-id="${esc(p.id)}"` : '';

            return p.link
                ? `<a class="project-card reveal is-visible" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer"${dataAttr}>${inner}</a>`
                : `<article class="project-card reveal is-visible"${dataAttr}>${inner}</article>`;
        }).join('');

        document.dispatchEvent(new CustomEvent('projects:rendered'));
    }

    async function loadProjects() {
        if (!window.sbConfigured) {
            renderProjects(FALLBACK_PROJECTS);
            return;
        }

        const { data, error } = await window.sb
            .from('projects')
            .select('*')
            .eq('published', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[meridian] Could not load projects:', error.message);
            renderProjects(FALLBACK_PROJECTS);
            return;
        }

        renderProjects(data && data.length ? data : FALLBACK_PROJECTS);
    }

    window.reloadProjects = loadProjects; // used by admin.js after edits
    loadProjects();
})();
