/* ================================================================
   supabase-client.js
   Creates the shared Supabase client used by every other script.

   SETUP: replace the two constants below with your project's
   values (Supabase dashboard → Settings → API). The anon key is
   safe to expose in the browser — access is controlled by RLS.
   ================================================================ */

const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

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
