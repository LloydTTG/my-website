/* ================================================================
   supabase-client.js
   Creates the shared Supabase client used by every other script.

   SETUP: replace the two constants below with your project's
   values (Supabase dashboard → Settings → API). The anon key is
   safe to expose in the browser — access is controlled by RLS.
   ================================================================ */

const SUPABASE_URL = 'https://blmuzscdxkonhctupsvm.supabase.co/';
const SUPABASE_ANON_KEY = 'sb_publishable_RRFckIovUQL9EbHZhpzQoA_ASseYFAH';

window.sb = null;
window.sbConfigured = false;

(function initSupabase() {
    if (!window.supabase) {
        console.warn('[meridian] supabase-js failed to load from CDN.');
        return;
    }
    if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
        console.warn('[meridian] Supabase not configured yet — using fallback content. Edit supabase-client.js.');
        return;
    }
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sbConfigured = true;
})();

/* Small shared helper: escape text before injecting into innerHTML */
window.escapeHtml = function (str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
};

/* Shared helper: true for plain http(s) URLs only — rejects javascript:,
   data:, and anything else a <a href> or <img src> shouldn't be allowed to
   carry, since escapeHtml alone doesn't stop a URL *scheme* from running
   script on click (HTML-escaping a javascript: URL still leaves it a
   javascript: URL). Used for any admin-authored URL field rendered as a
   real href/src — not just inside sanitizeRichHtml below. */
window.isSafeUrl = function (url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
        return false;
    }
};

/* ----------------------------------------------------------------
   Shared helper: sanitize admin-authored rich-text HTML before it's
   rendered with innerHTML (site-content.js) or saved back to the
   database (admin.js). Only a small, fixed allowlist of tags/attributes
   an inline contenteditable field can legitimately produce is kept —
   everything else (script, event-handler attributes, javascript: links,
   embedded iframes...) is stripped, since execCommand/contenteditable and
   browser paste handling can carry in far more than intended even when
   only a trusted admin is typing. Runs at both boundaries (save and
   render) so stored content stays defused even if it somehow got in some
   other way — e.g. a row edited directly in the Supabase table editor.
   canvas-editor.js needs the same behavior for its richer block model and
   keeps its own copy (it's a module, loaded separately from this plain
   script) rather than depending on this global — if the allowlist below
   ever changes, update both.
   ---------------------------------------------------------------- */
(function () {
    const ALLOWED_TAGS = new Set([
        'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3',
        'UL', 'OL', 'LI', 'A', 'IMG', 'SPAN', 'DIV', 'BLOCKQUOTE', 'CODE', 'PRE',
    ]);
    const ALLOWED_ATTRS = { A: ['href', 'target', 'rel'], IMG: ['src', 'alt'] };

    window.sanitizeRichHtml = function (html) {
        // Never inserted into the live page, so nothing in it executes
        // (scripts are inert, event handlers never fire) while it's being
        // picked apart below.
        const doc = document.implementation.createHTMLDocument('');
        doc.body.innerHTML = String(html ?? '');

        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
        const disallowed = [];
        let node = walker.nextNode();
        while (node) {
            if (!ALLOWED_TAGS.has(node.tagName)) {
                disallowed.push(node);
            } else {
                const keep = ALLOWED_ATTRS[node.tagName] || [];
                Array.from(node.attributes).forEach((attr) => {
                    if (!keep.includes(attr.name)) { node.removeAttribute(attr.name); return; }
                    if ((attr.name === 'href' || attr.name === 'src') && !window.isSafeUrl(attr.value)) {
                        node.removeAttribute(attr.name);
                    }
                });
                if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
                    node.setAttribute('rel', 'noopener noreferrer');
                }
            }
            node = walker.nextNode();
        }
        // Drop disallowed elements entirely — their content (if any, e.g. a
        // pasted <script>'s text) isn't meaningful to keep.
        disallowed.forEach((el) => el.remove());

        return doc.body.innerHTML;
    };
})();
