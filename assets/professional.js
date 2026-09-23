/* ============================================================
   index.html — the professional page.

   Reads: profile, projects, skills, experience, education,
          academics, milestones, contact_links.
   ============================================================ */

/* ---------------- hero ---------------- */

function renderHero(result) {
    const row = result.rows[0] || {};
    const name = row.display_name || FALLBACK.name;

    applyIdentity(name);
    document.title = 'Work';

    /* The surname carries the only italic accent on the page, so the
       name has to be split rather than dropped in whole. */
    const heading = byId('hero-name');
    clear(heading);
    const parts = name.trim().split(/\s+/);
    heading.appendChild(document.createTextNode(parts[0]));
    if (parts.length > 1) {
        heading.appendChild(document.createTextNode(' '));
        heading.appendChild(el('em', null, parts.slice(1).join(' ')));
    }

    const status = byId('hero-status');
    const dot = byId('hero-dot');
    if (row.status) {
        status.textContent = row.status;
    } else {
        status.textContent = row.available === false ? 'Heads down' : 'Open to work';
    }
    if (row.available === false) dot.classList.add('dot--idle');

    const location = byId('hero-location');
    if (row.location) {
        location.textContent = '· ' + row.location;
        location.hidden = false;
    }

    const role = byId('hero-role');
    if (row.role) { role.textContent = row.role; role.hidden = false; }

    const intro = byId('hero-intro');
    const text = row.intro || row.tagline || '';
    if (text) { intro.textContent = text; intro.hidden = false; }

    setImage(byId('hero-portrait'), byId('hero-photo'), row.avatar_url, name);

    const resume = safeUrl(row.resume_url);
    if (resume) {
        const button = byId('hero-resume');
        button.href = resume;
        button.target = '_blank';
        button.hidden = false;
    }

    setState('sec-hero', 'content');
}

/* ---------------- social row ----------------
   Brand marks, so the row reads at a glance the way a header photo
   usually does. Anything unrecognised still gets a button, with the
   generic outbound glyph and its label on the tooltip. */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
    github: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    instagram: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06L12 2.16zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.846-10.405a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
    x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z',
    youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
    link: 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z',
};

const SOCIAL_HOSTS = [
    ['github.com', 'github'],
    ['linkedin.com', 'linkedin'],
    ['instagram.com', 'instagram'],
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
    ['twitter.com', 'x'],
    ['x.com', 'x'],
];

/* The host decides the mark, not the label, because a row could be
   titled anything. The label is only consulted as a fallback. */
function socialIconKey(label, href) {
    let host = '';
    try {
        host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
    } catch (err) {
        host = '';
    }
    for (let i = 0; i < SOCIAL_HOSTS.length; i++) {
        const needle = SOCIAL_HOSTS[i][0];
        if (host === needle || host.slice(-(needle.length + 1)) === '.' + needle) {
            return SOCIAL_HOSTS[i][1];
        }
    }
    if (href.toLowerCase().indexOf('mailto:') === 0) return 'mail';

    const name = String(label || '').trim().toLowerCase();
    if (name === 'twitter') return 'x';
    if (name === 'email' || name === 'mail') return 'mail';
    return ICONS[name] ? name : 'link';
}

function svgIcon(d) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
}

function renderSocials(result) {
    if (!result.ok) { setState('sec-socials', 'empty'); return; }

    const row = byId('social-row');
    clear(row);
    let shown = 0;

    result.rows.forEach((item) => {
        const href = safeLink(item.url);
        if (!href) return;

        const link = el('a', 'social');
        link.href = href;
        if (href.indexOf('http') === 0) {
            link.target = '_blank';
            link.rel = 'me noopener';
        }

        // The mark alone carries no name, so the label has to reach
        // assistive tech some other way.
        const label = item.label || 'Link';
        const full = item.handle ? label + ' · ' + item.handle : label;
        link.setAttribute('aria-label', full);
        link.title = full;

        link.appendChild(svgIcon(ICONS[socialIconKey(label, href)]));
        row.appendChild(link);
        shown += 1;
    });

    setState('sec-socials', shown ? 'content' : 'empty');
}

/* ---------------- stat strip ----------------
   Every figure here is counted or derived from rows that are already
   on the page, so the strip can never drift out of step with them. */

function renderStats(projects, academics, experience, education) {
    const strip = byId('stat-strip');
    clear(strip);

    const tiles = [];

    if (projects.ok && projects.rows.length) {
        tiles.push({ value: String(projects.rows.length), unit: '', label: 'Projects shipped' });
    }

    const score = academics.rows[0];
    if (academics.ok && score) {
        const max = Number(score.gpa_max) > 0 ? Number(score.gpa_max) : DEFAULT_SCORE_MAX;
        const isPercent = Math.abs(max - 100) < 0.001;
        tiles.push({
            value: fmtNum(score.gpa, 2),
            unit: isPercent ? '%' : '/ ' + fmtNum(max, 2),
            label: 'Academic standing',
        });
    }

    // Earliest start date anywhere gives an honest "since".
    const starts = []
        .concat(experience.rows.map((r) => r.started_on))
        .concat(education.rows.map((r) => r.started_on))
        .map(parseDay)
        .filter(Boolean)
        .sort((a, b) => a - b);

    if (starts.length) {
        tiles.push({ value: String(starts[0].getUTCFullYear()), unit: '', label: 'Started out' });
    }

    if (!tiles.length) { setState('sec-stats', 'empty'); return; }

    tiles.forEach((tile) => {
        const node = el('div', 'stat');
        const value = el('p', 'stat__value num');
        value.appendChild(document.createTextNode(tile.value));
        if (tile.unit) value.appendChild(el('span', 'stat__unit', tile.unit));
        node.appendChild(value);
        node.appendChild(el('p', 'label stat__label', tile.label));
        strip.appendChild(node);
    });

    setState('sec-stats', 'content');
}

/* ---------------- projects ---------------- */

function renderProjects(result) {
    if (!result.ok) { setState('sec-projects', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-projects', 'empty'); return; }

    const grid = byId('project-grid');
    clear(grid);

    result.rows.forEach((row) => {
        const href = safeUrl(row.link_url) || safeUrl(row.repo_url);

        // A project without a link is still worth showing; it just is
        // not a link, so the tag has to change with it.
        const card = el(href ? 'a' : 'article', 'project');
        if (href) {
            card.href = href;
            card.target = '_blank';
            card.rel = 'noopener';
        }

        const cover = safeUrl(row.cover_url);
        if (cover) {
            const frame = el('div', 'project__cover');
            const img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => frame.remove(), { once: true });
            img.src = cover;
            frame.appendChild(img);
            card.appendChild(frame);
        }

        const meta = el('div', 'project__meta');
        meta.appendChild(el('span', 'label', row.role || (row.featured ? 'Featured' : 'Project')));
        if (row.year) meta.appendChild(el('span', 'label num', String(row.year)));
        card.appendChild(meta);

        card.appendChild(el('h3', 'project__title', row.title || 'Untitled'));
        if (row.summary) card.appendChild(el('p', 'project__summary', row.summary));

        const foot = el('div', 'project__foot');
        foot.appendChild(renderTags(row.tech, false));
        if (href) {
            foot.appendChild(el('span', 'project__go',
                safeUrl(row.link_url) ? 'Visit' : 'Source'));
        }
        card.appendChild(foot);

        grid.appendChild(card);
    });

    setState('sec-projects', 'content');
}

/* ---------------- skills ---------------- */

function renderSkills(result) {
    if (!result.ok) { setState('sec-skills', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-skills', 'empty'); return; }

    const grid = byId('skill-grid');
    clear(grid);

    result.rows.forEach((row) => {
        const group = el('div', 'skill');
        group.appendChild(el('h3', 'skill__name', row.group_name || 'Other'));
        if (row.blurb) group.appendChild(el('p', 'skill__blurb', row.blurb));
        const list = el('ul', 'skill__list');
        (Array.isArray(row.items) ? row.items : []).forEach((item) => {
            if (item) list.appendChild(el('li', null, String(item)));
        });
        group.appendChild(list);
        grid.appendChild(group);
    });

    setState('sec-skills', 'content');
}

/* ---------------- experience ---------------- */

function renderExperience(result) {
    if (!result.ok) { setState('sec-experience', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-experience', 'empty'); return; }

    const list = byId('experience-list');
    clear(list);

    result.rows.forEach((row) => {
        const entry = el('article', 'entry');

        const when = el('div', 'entry__when');
        when.appendChild(el('p', 'label num', fmtRange(row.started_on, row.ended_on, 'month')));
        if (row.kind) when.appendChild(el('p', 'label entry__kind', row.kind));
        entry.appendChild(when);

        const main = el('div');
        main.appendChild(el('h3', 'entry__title', row.role || 'Role'));

        const org = el('p', 'entry__org');
        org.appendChild(document.createTextNode(row.organisation || ''));
        if (row.location) {
            org.appendChild(el('span', 'sep', '/'));
            org.appendChild(document.createTextNode(row.location));
        }
        main.appendChild(org);

        if (row.summary) main.appendChild(el('p', 'entry__body', row.summary));

        const highlights = Array.isArray(row.highlights) ? row.highlights : [];
        if (highlights.length) {
            const bullets = el('ul', 'bullets');
            highlights.forEach((h) => { if (h) bullets.appendChild(el('li', null, String(h))); });
            main.appendChild(bullets);
        }

        entry.appendChild(main);
        list.appendChild(entry);
    });

    setState('sec-experience', 'content');
}

/* ---------------- education ---------------- */

function renderEducation(result) {
    if (!result.ok) { setState('sec-education', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-education', 'empty'); return; }

    const list = byId('education-list');
    clear(list);

    result.rows.forEach((row) => {
        const entry = el('article', 'entry');

        const when = el('div', 'entry__when');
        when.appendChild(el('p', 'label num', fmtRange(row.started_on, row.ended_on, 'year')));
        if (row.grade) when.appendChild(el('p', 'label label--accent entry__kind', row.grade));
        entry.appendChild(when);

        const main = el('div');
        main.appendChild(el('h3', 'entry__title', row.qualification || 'Qualification'));

        const org = el('p', 'entry__org');
        org.appendChild(document.createTextNode(row.institution || ''));
        if (row.field) {
            org.appendChild(el('span', 'sep', '/'));
            org.appendChild(document.createTextNode(row.field));
        }
        main.appendChild(org);

        if (row.notes) main.appendChild(el('p', 'entry__body', row.notes));

        entry.appendChild(main);
        list.appendChild(entry);
    });

    setState('sec-education', 'content');
}

/* ---------------- academic score ---------------- */

function renderAcademics(result) {
    if (!result.ok) { setState('sec-academics', 'error', result.message); return; }
    const row = result.rows[0];
    if (!row) { setState('sec-academics', 'empty'); return; }

    const max = Number(row.gpa_max) > 0 ? Number(row.gpa_max) : DEFAULT_SCORE_MAX;
    const score = Number(row.gpa);
    const safe = Number.isFinite(score) ? Math.min(Math.max(score, 0), max) : 0;

    // A max of 100 reads as a percentage; anything else keeps the
    // "x / y" form, so a 4.0-scale GPA still displays correctly.
    const isPercent = Math.abs(max - 100) < 0.001;

    byId('score-value').textContent = Number.isFinite(score) ? fmtNum(score, 2) : BLANK;
    byId('score-unit').textContent = isPercent ? '%' : ' / ' + fmtNum(max, 2);
    byId('score-updated').textContent = row.updated_at ? 'As of ' + fmtStamp(row.updated_at) : '';
    byId('score-degree').textContent = row.degree || '';

    setState('sec-academics', 'content');

    const fill = byId('score-fill');
    const width = (safe / max * 100).toFixed(2) + '%';
    if (REDUCED) {
        fill.style.width = width;
    } else {
        requestAnimationFrame(() => { fill.style.width = width; });
    }
}

/* ---------------- milestones ---------------- */

function renderMilestones(result) {
    if (!result.ok) { setState('sec-milestones', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-milestones', 'empty'); return; }

    const list = byId('milestone-list');
    clear(list);

    result.rows.forEach((row) => {
        const item = el('li');
        item.appendChild(document.createTextNode(row.title || 'Untitled'));
        item.appendChild(el('span', 'label num bullets__when', fmtDay(row.achieved_on)));
        list.appendChild(item);
    });

    setState('sec-milestones', 'content');
}

/* ---------------- boot ---------------- */

/* Two sections are missing from this list on purpose. The hero falls
   back to the constants in core.js rather than showing an error, and
   the stat strip has nothing to say without data, so it collapses. */
const PRO_SECTIONS = ['sec-projects', 'sec-skills', 'sec-experience',
                      'sec-education', 'sec-academics', 'sec-milestones'];

async function loadProfessional() {
    if (!sb) {
        renderHero({ ok: false, rows: [] });
        setState('sec-stats', 'empty');
        setState('sec-socials', 'empty');
        PRO_SECTIONS.forEach((id) => setState(id, 'error', OFFLINE_REASON));
        return;
    }

    // All seven requests are in flight before the first one resolves.
    const [profile, projects, skills, experience, education, academics, milestones, socials] = await Promise.all([
        runProfile('role, location, intro, status, available, resume_url'),
        run(sb.from('projects')
              .select('title, summary, role, tech, cover_url, link_url, repo_url, year, featured')
              .eq('published', true)
              .order('featured', { ascending: false })
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: false })),
        run(sb.from('skills').select('group_name, blurb, items')
              .eq('published', true).order('sort_order', { ascending: true })),
        run(sb.from('experience')
              .select('role, organisation, location, kind, started_on, ended_on, summary, highlights')
              .eq('published', true).order('started_on', { ascending: false })),
        run(sb.from('education')
              .select('institution, qualification, field, grade, started_on, ended_on, notes')
              .eq('published', true).order('started_on', { ascending: false })),
        run(sb.from('academics').select('degree, gpa, gpa_max, updated_at')
              .order('updated_at', { ascending: false }).limit(1)),
        run(sb.from('milestones').select('title, achieved_on')
              .order('achieved_on', { ascending: false })),
        run(sb.from('contact_links').select('label, handle, url')
              .eq('published', true).order('sort_order', { ascending: true })),
    ]);

    // Each renderer owns its own section: one failure leaves the rest intact.
    renderHero(profile);
    renderSocials(socials);
    renderStats(projects, academics, experience, education);
    renderProjects(projects);
    renderSkills(skills);
    renderExperience(experience);
    renderEducation(education);
    renderAcademics(academics);
    renderMilestones(milestones);

    /* Collapse whatever came back with nothing, so the page is short
       and true rather than long and mostly headings. Sections that
       failed are left alone: an error still needs saying. */
    collapseIfEmpty('work', projects);
    collapseIfEmpty('toolkit', skills);
    collapseIfEmpty('experience', experience);

    collapseIfEmpty('sec-academics', academics);
    collapseIfEmpty('sec-milestones', milestones);
    collapseIfEmpty('sec-education', education);

    // The education section holds three blocks; it only goes when
    // all three are empty, and the split row when its own two are.
    if (isEmpty(academics) && isEmpty(milestones) && isEmpty(education)) {
        hideSection('education');
    } else if (isEmpty(academics) && isEmpty(milestones)) {
        hideSection('education-head');
    }

    renumberSections();
}

loadProfessional();
