/* ============================================================
   Shared runtime: config, Supabase client, DOM and formatting
   helpers, and the page-transition curtain.

   Loaded by every page before its own script.
   ============================================================ */

/* The anon key is meant to be public: every table is gated by the
   RLS policies in schema.sql. Never put the service_role key here,
   it bypasses all of them. */
const SUPABASE_URL      = 'https://blmuzscdxkonhctupsvm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RRFckIovUQL9EbHZhpzQoA_ASseYFAH';

/* Used only when the matching database row is missing. */
const FALLBACK = {
    name:    'Randy Ngui',
    role:    '',
    tagline: '',
    email:   'randyngui08@gmail.com',
};

const DEFAULT_SCORE_MAX = 100;   // when academics.gpa_max is absent
const ROLLING_DAYS      = 7;     // window for the bodyweight average
const CHART_POINTS      = 90;    // most recent N points to plot
const BLANK             = '—';   // shown wherever a value is missing

/* Chart colours, kept in step with the custom properties in site.css. */
const C = {
    accent: '#a78bfa',
    hover:  '#c4b5fd',
    faint:  '#6b6779',
    line:   'rgba(167, 139, 250, 0.07)',
    panel:  '#111014',
    border: '#242231',
    muted:  '#9a95a9',
};

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFIGURED = !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_');
const sb = (CONFIGURED && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const OFFLINE_REASON = window.supabase
    ? 'Supabase is not configured for this site yet.'
    : 'Could not reach the data source.';

/* ============================================================
   DOM helpers

   Every node is built with createElement plus textContent, so text
   from the database is never parsed as HTML. No innerHTML anywhere.
   ============================================================ */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function byId(id) {
    return document.getElementById(id);
}

/* Image URLs come from the database and end up in a src attribute.
   Escaping does not defuse a URL *scheme*, so the scheme itself is
   checked: anything that is not plain http(s) is dropped rather than
   rendered. Returns null when the URL is unusable. */
function safeUrl(value) {
    if (!value) return null;
    try {
        const parsed = new URL(String(value), window.location.href);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
    } catch (err) {
        return null;
    }
}

/* Contact rows may legitimately point at mailto: or tel:, which the
   image check above would reject. */
function safeLink(value) {
    if (!value) return null;
    try {
        const parsed = new URL(String(value), window.location.href);
        const ok = ['http:', 'https:', 'mailto:', 'tel:'];
        return ok.indexOf(parsed.protocol) !== -1 ? parsed.href : null;
    } catch (err) {
        return null;
    }
}

function setImage(frame, img, url, alt) {
    const href = safeUrl(url);
    if (!href) { frame.hidden = true; return false; }
    img.alt = String(alt || '');
    img.addEventListener('error', () => { frame.hidden = true; }, { once: true });
    img.src = href;
    frame.hidden = false;
    return true;
}

/* Each section holds one node per state; exactly one is ever shown. */
function setState(sectionId, state, message) {
    const root = byId(sectionId);
    if (!root) return;

    ['skeleton', 'content', 'empty', 'error'].forEach((name) => {
        const node = root.querySelector(':scope > [data-' + name + ']');
        if (node) node.hidden = (name !== state);
    });

    if (state === 'error') {
        const node = root.querySelector(':scope > [data-error]');
        if (node) node.textContent = message || 'Could not load this section.';
    }
    if (state === 'content') {
        const node = root.querySelector(':scope > [data-content]');
        if (node) node.classList.add('fade');
    }
}

/* ============================================================
   Formatting
   ============================================================ */

/* Date columns arrive as 'YYYY-MM-DD'. Parsing that with new Date()
   treats it as UTC midnight, which renders as the previous day for
   anyone west of Greenwich, so build the date explicitly instead. */
function parseDay(value) {
    if (!value) return null;
    const parts = String(value).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function fmtDay(value) {
    const d = parseDay(value);
    if (!d) return BLANK;
    return d.toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
}

function fmtMonth(value) {
    const d = parseDay(value);
    if (!d) return BLANK;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtYear(value) {
    const d = parseDay(value);
    return d ? String(d.getUTCFullYear()) : BLANK;
}

function fmtStamp(value) {
    if (!value) return BLANK;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return BLANK;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* An open-ended range renders as "Jan 2024 — Present". */
function fmtRange(from, to, granularity) {
    const f = granularity === 'year' ? fmtYear : fmtMonth;
    const start = from ? f(from) : BLANK;
    const end = to ? f(to) : 'Present';
    return start + ' — ' + end;
}

function fmtKg(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(1) + ' kg' : BLANK;
}

/* Trims trailing zeros: 87.50 becomes "87.5", 87.00 becomes "87". */
function fmtNum(n, maxDecimals) {
    const v = Number(n);
    if (!Number.isFinite(v)) return BLANK;
    return String(Number(v.toFixed(maxDecimals)));
}

/* ============================================================
   Fetching
   ============================================================ */

/* Postgres and PostgREST codes for "that table is not there".
   A table this file reads but the database has not been migrated for
   is not a failure worth shouting about: it is a section with no rows
   yet, so it renders as empty rather than as a red band. */
const MISSING_RELATION = ['42P01', 'PGRST205', 'PGRST202'];

async function run(query) {
    try {
        const { data, error } = await query;
        if (error) {
            if (MISSING_RELATION.indexOf(error.code) !== -1) {
                return { ok: true, rows: [], missing: true };
            }
            throw new Error(error.message);
        }
        return { ok: true, rows: data || [] };
    } catch (err) {
        return { ok: false, rows: [], message: (err && err.message) || 'Request failed.' };
    }
}

/* The profile row gained columns with the three-page rebuild. Asking
   for one that is not there fails the whole select, which would blank
   the name too, so drop back to the original columns and carry on. */
async function runProfile(extraColumns) {
    const base = 'display_name, tagline, avatar_url';
    const wide = await run(sb.from('profile').select(base + ', ' + extraColumns)
        .order('updated_at', { ascending: false }).limit(1));
    if (wide.ok) return wide;

    return run(sb.from('profile').select(base)
        .order('updated_at', { ascending: false }).limit(1));
}

/* Stands in for run() whenever the client could not be created, so
   callers never have to branch on `sb` themselves. */
function offline() {
    return Promise.resolve({ ok: false, rows: [], message: OFFLINE_REASON });
}

/* ============================================================
   Shared renderers
   ============================================================ */

/* A successful request that came back with nothing. Distinct from a
   failure, which still has to be shown. */
function isEmpty(result) {
    return Boolean(result && result.ok && !result.rows.length);
}

/* An empty section on a public page is a hole, not a section: it is
   taken out of the flow entirely rather than left showing a heading
   above the words "nothing yet". The empty states stay in the markup
   for the cases where a section has other content to sit beside. */
function collapseIfEmpty(sectionId, result) {
    if (isEmpty(result)) hideSection(sectionId);
}

function hideSection(sectionId) {
    const node = byId(sectionId);
    if (node) node.hidden = true;
}

/* Section numbers are counted at render time rather than written into
   the markup, because collapsing an empty section would otherwise
   leave the survivors reading 01, 02, 04. Call it after collapsing. */
function renumberSections() {
    let n = 0;
    document.querySelectorAll('[data-section-label]').forEach((node) => {
        const section = node.closest('section');
        if (section && section.hidden) return;
        n += 1;
        node.textContent = (n < 10 ? '0' + n : String(n)) + ' / ' + node.dataset.sectionLabel;
    });
}

function renderTags(values, accent, extraClass) {
    const wrap = el('div', extraClass ? 'tags ' + extraClass : 'tags');
    (Array.isArray(values) ? values : []).forEach((value) => {
        if (!value) return;
        wrap.appendChild(el('span', accent ? 'tag tag--accent' : 'tag', String(value)));
    });
    return wrap;
}

/* The wordmark and footer name track the profile row so the site
   never disagrees with itself about who it belongs to. */
function applyIdentity(name) {
    const value = name || FALLBACK.name;
    document.querySelectorAll('[data-identity]').forEach((node) => {
        node.textContent = value;
    });
    // The narrow wordmark: first name only, so a long display_name
    // cannot push the nav links off a phone screen.
    const short = value.trim().split(/\s+/)[0];
    document.querySelectorAll('[data-identity-short]').forEach((node) => {
        node.textContent = short;
    });
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach((node) => {
        node.textContent = year;
    });
}

/* ============================================================
   Page transition

   On arrival the curtain is already down (the inline script in each
   <head> adds .nav-in before first paint) and peels away. On an
   internal link click it sweeps back up, then navigation happens.
   ============================================================ */

const CURTAIN_IN_MS  = 820;   // must outlast the .nav-in animations
const CURTAIN_OUT_MS = 760;   // sheet lands at 0.5s; hold so the name reads

function initCurtain() {
    const root = document.documentElement;

    if (REDUCED) {
        root.classList.remove('nav-in');
        return;
    }

    if (root.classList.contains('nav-in')) {
        window.setTimeout(() => root.classList.remove('nav-in'), CURTAIN_IN_MS);
    }

    const nameNode = byId('curtain-name');

    document.addEventListener('click', (event) => {
        // Let the browser handle anything that is not a plain left click.
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!(event.target instanceof Element)) return;

        const link = event.target.closest('a[data-page]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || link.target === '_blank') return;

        // Already here: nothing to transition to.
        const here = window.location.pathname.split('/').pop() || 'index.html';
        if (href === here) { event.preventDefault(); return; }

        event.preventDefault();
        if (nameNode) nameNode.textContent = link.dataset.page;
        root.classList.remove('nav-in');
        root.classList.add('nav-out');
        window.setTimeout(() => { window.location.href = href; }, CURTAIN_OUT_MS);
    });

    /* Coming back through history restores the page from the bfcache
       with .nav-out still applied, which would leave it covered. */
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) root.classList.remove('nav-out', 'nav-in');
    });
}

initCurtain();
