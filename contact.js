/* ================================================================
   contact.js — validates the enquiry form and inserts it into
   the `inquiries` table (public-insert RLS policy).
   ================================================================ */

(function () {
    'use strict';

    const form = document.getElementById('contact-form');
    const errorEl = document.getElementById('contact-error');
    const successEl = document.getElementById('contact-success');
    const submitBtn = document.getElementById('contact-submit');
    if (!form) return;

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;

        const name = form.name.value.trim();
        const email = form.email.value.trim();
        const service = form.service.value;
        const message = form.message.value.trim();

        if (!name || !email || !service || !message) {
            showError('Please fill in every field.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('That email address doesn’t look right.');
            return;
        }
        if (message.length < 10) {
            showError('Tell us a little more — a sentence or two is plenty.');
            return;
        }

        if (!window.sbConfigured) {
            showError('The contact form isn’t connected yet. Email us instead: hello@meridian.studio');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        const { error } = await window.sb
            .from('inquiries')
            .insert({ name, email, service, message });

        if (error) {
            console.warn('[meridian] Enquiry failed:', error.message);
            showError('Something went wrong on our end. Please try again, or email hello@meridian.studio.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send enquiry';
            return;
        }

        // Hide the fields, show the success state
        Array.from(form.children).forEach((child) => {
            if (child !== successEl) child.hidden = true;
        });
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
})();
