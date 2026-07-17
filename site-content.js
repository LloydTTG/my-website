/* ================================================================
   site-content.js — loads admin-edited text into any [data-content-key]
   element on the current page. Shared by index.html, world.html, and
   outpost.html so edits made from any one of them show up everywhere.
   ================================================================ */

(function () {
    'use strict';

    async function loadSiteContent() {
        if (!window.sbConfigured) return;

        const { data, error } = await window.sb
            .from('site_content')
            .select('key, value');

        if (error || !data) return;

        data.forEach(({ key, value }) => {
            const el = document.querySelector(`[data-content-key="${key}"]`);
            // stored HTML is admin-authored, but sanitized before it's ever
            // rendered — see the sanitizeRichHtml comment in supabase-client.js.
            if (el && value) el.innerHTML = window.sanitizeRichHtml(value);
        });
    }

    // supabase-client.js runs first (defer order), so sb is ready here.
    loadSiteContent();
})();
