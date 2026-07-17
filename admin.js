/* ================================================================
   admin.js — lightweight in-page CMS.

   How to use:
   1. Create a user in Supabase (Authentication → Users).
   2. Add their user id to the `admins` table (see schema.sql).
   3. On the live site, press Ctrl+Shift+A (or add #admin to the
      URL) to open the sign-in dialog.

   Once signed in as an admin you get:
   - An admin bar (add project / add testimonial / edit text)
   - Edit + delete buttons on every project and testimonial card
   - Inline editing of the hero copy, saved to `site_content`
   ================================================================ */

(function () {
    'use strict';

    if (!window.sbConfigured) return;
    const sb = window.sb;

    let isAdmin = false;
    let bar = null;
    let editingContent = false;

    /* ---------------- Modal helper ---------------- */

    function openModal(title, fields, onSubmit, submitLabel = 'Save') {
        const backdrop = document.createElement('div');
        backdrop.className = 'ab-modal-backdrop';

        const esc = window.escapeHtml;
        const fieldsHtml = fields.map((f) => {
            const val = esc(f.value ?? '');
            const input = f.type === 'textarea'
                ? `<textarea class="contact__input" name="${f.name}" rows="${f.rows || 4}">${val}</textarea>`
                : `<input class="contact__input" type="${f.type || 'text'}" name="${f.name}" value="${val}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
            return `<div class="ab-modal__field"><label>${esc(f.label)}</label>${input}</div>`;
        }).join('');

        backdrop.innerHTML = `
            <form class="ab-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <h3 class="ab-modal__title">${esc(title)}</h3>
                ${fieldsHtml}
                <p class="ab-modal__error" hidden></p>
                <div class="ab-modal__actions">
                    <button type="button" class="ab-btn" data-cancel>Cancel</button>
                    <button type="submit" class="ab-btn ab-btn--primary">${esc(submitLabel)}</button>
                </div>
            </form>`;

        const form = backdrop.querySelector('form');
        const errEl = backdrop.querySelector('.ab-modal__error');

        function close() { backdrop.remove(); }

        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        backdrop.querySelector('[data-cancel]').addEventListener('click', close);
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errEl.hidden = true;
            const values = {};
            fields.forEach((f) => { values[f.name] = form.elements[f.name].value.trim(); });

            const submitBtn = form.querySelector('[type="submit"]');
            submitBtn.disabled = true;

            const err = await onSubmit(values, close);
            if (err) {
                errEl.textContent = err;
                errEl.hidden = false;
                submitBtn.disabled = false;
            }
        });

        document.body.appendChild(backdrop);
        form.querySelector('input, textarea')?.focus();
    }

    /* ---------------- Auth ---------------- */

    function openSignIn() {
        openModal('Admin sign in', [
            { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
            { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }
        ], async (v) => {
            const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
            if (error) return error.message;
            const ok = await checkAdmin();
            if (!ok) {
                await sb.auth.signOut();
                return 'This account is not an admin.';
            }
            enterAdminMode();
            return null;
        }, 'Sign in');
    }

    async function checkAdmin() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return false;
        const { data, error } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
        isAdmin = !error && !!data;
        return isAdmin;
    }

    /* ---------------- Admin bar ---------------- */

    function enterAdminMode() {
        if (bar) return;

        bar = document.createElement('div');
        bar.className = 'ab-bar';
        bar.innerHTML = `
            <span class="ab-bar__label">Admin mode</span>
            <button class="ab-btn" data-act="add-project">+ Project</button>
            <button class="ab-btn" data-act="add-testimonial">+ Testimonial</button>
            <button class="ab-btn" data-act="edit-content">Edit page text</button>
            <button class="ab-btn" data-act="signout">Sign out</button>`;
        document.body.appendChild(bar);

        bar.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'add-project') openProjectModal();
            if (act === 'add-testimonial') openTestimonialModal();
            if (act === 'edit-content') toggleContentEditing(e.target.closest('[data-act]'));
            if (act === 'signout') signOut();
        });

        decorateCards();
        document.addEventListener('projects:rendered', decorateCards);
        document.addEventListener('testimonials:rendered', decorateCards);

        // Lets other admin-feature scripts (e.g. the globe marker layer,
        // which admin.js doesn't know about) add their own buttons to the
        // bar once it exists, instead of building a second floating bar.
        document.dispatchEvent(new CustomEvent('admin:entered'));
    }

    window.adminBar = {
        isAdmin: () => isAdmin,
        addButton(label, onClick) {
            if (!bar) return null;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ab-btn';
            b.textContent = label;
            b.addEventListener('click', onClick);
            bar.insertBefore(b, bar.querySelector('[data-act="signout"]'));
            return b;
        },
    };

    async function signOut() {
        await sb.auth.signOut();
        window.location.reload();
    }

    /* ---------------- Project CRUD ---------------- */

    const PROJECT_FIELDS = (p = {}) => [
        { name: 'title', label: 'Title', value: p.title },
        { name: 'tag', label: 'Tag (e.g. Web design)', value: p.tag },
        { name: 'description', label: 'Description', type: 'textarea', value: p.description },
        { name: 'scope', label: 'Scope (e.g. Design · Build)', value: p.scope },
        { name: 'year', label: 'Year', value: p.year },
        { name: 'image_url', label: 'Image URL (optional)', value: p.image_url },
        { name: 'link', label: 'Project link (optional)', value: p.link }
    ];

    function openProjectModal(existing) {
        openModal(existing ? 'Edit project' : 'New project', PROJECT_FIELDS(existing || {}), async (v, close) => {
            if (!v.title || !v.description) return 'Title and description are required.';
            // projects.js also re-checks this before ever rendering either
            // field as a real href/src, but catching it here means a typo'd
            // or malicious scheme (e.g. javascript:) gets rejected with an
            // actual error instead of just quietly not showing up later.
            if (v.image_url && !window.isSafeUrl(v.image_url)) return 'Image URL must start with http:// or https://.';
            if (v.link && !window.isSafeUrl(v.link)) return 'Project link must start with http:// or https://.';
            const payload = { ...v, published: true };

            const q = existing
                ? sb.from('projects').update(payload).eq('id', existing.id)
                : sb.from('projects').insert(payload);

            const { error } = await q;
            if (error) return error.message;
            close();
            window.reloadProjects?.();
            return null;
        });
    }

    /* ---------------- Testimonial CRUD ---------------- */

    const TESTIMONIAL_FIELDS = (t = {}) => [
        { name: 'quote', label: 'Quote', type: 'textarea', rows: 5, value: t.quote },
        { name: 'author', label: 'Author name', value: t.author },
        { name: 'role', label: 'Role / company', value: t.role }
    ];

    function openTestimonialModal(existing) {
        openModal(existing ? 'Edit testimonial' : 'New testimonial', TESTIMONIAL_FIELDS(existing || {}), async (v, close) => {
            if (!v.quote || !v.author) return 'Quote and author are required.';
            const payload = { ...v, published: true };

            const q = existing
                ? sb.from('testimonials').update(payload).eq('id', existing.id)
                : sb.from('testimonials').insert(payload);

            const { error } = await q;
            if (error) return error.message;
            close();
            window.reloadTestimonials?.();
            return null;
        });
    }

    /* ---------------- Card edit/delete buttons ---------------- */

    function decorateCards() {
        if (!isAdmin) return;

        document.querySelectorAll('[data-project-id]:not([data-ab-decorated])').forEach((card) => {
            card.dataset.abDecorated = '1';
            card.style.position = 'relative';
            card.insertAdjacentHTML('beforeend', `
                <div class="ab-card-controls">
                    <button class="ab-ctrl ab-ctrl--edit" data-ab="edit-project">Edit</button>
                    <button class="ab-ctrl ab-ctrl--delete" data-ab="del-project">Delete</button>
                </div>`);
        });

        document.querySelectorAll('[data-testimonial-id]:not([data-ab-decorated])').forEach((card) => {
            card.dataset.abDecorated = '1';
            card.style.position = 'relative';
            card.insertAdjacentHTML('beforeend', `
                <div class="ab-card-controls">
                    <button class="ab-ctrl ab-ctrl--edit" data-ab="edit-testimonial">Edit</button>
                    <button class="ab-ctrl ab-ctrl--delete" data-ab="del-testimonial">Delete</button>
                </div>`);
        });
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-ab]');
        if (!btn || !isAdmin) return;
        e.preventDefault();
        e.stopPropagation();

        const projectCard = btn.closest('[data-project-id]');
        const testimonialCard = btn.closest('[data-testimonial-id]');

        switch (btn.dataset.ab) {
            case 'edit-project': {
                const id = projectCard.dataset.projectId;
                const { data } = await sb.from('projects').select('*').eq('id', id).single();
                if (data) openProjectModal(data);
                break;
            }
            case 'del-project': {
                if (!confirm('Delete this project?')) return;
                await sb.from('projects').delete().eq('id', projectCard.dataset.projectId);
                window.reloadProjects?.();
                break;
            }
            case 'edit-testimonial': {
                const id = testimonialCard.dataset.testimonialId;
                const { data } = await sb.from('testimonials').select('*').eq('id', id).single();
                if (data) openTestimonialModal(data);
                break;
            }
            case 'del-testimonial': {
                if (!confirm('Delete this testimonial?')) return;
                await sb.from('testimonials').delete().eq('id', testimonialCard.dataset.testimonialId);
                window.reloadTestimonials?.();
                break;
            }
        }
    });

    /* ---------------- Inline page-text editing ---------------- */

    function toggleContentEditing(btn) {
        editingContent = !editingContent;
        const editables = document.querySelectorAll('[data-content-key]');

        if (editingContent) {
            editables.forEach((el) => el.setAttribute('contenteditable', 'true'));
            btn.textContent = 'Save page text';
            btn.classList.add('ab-btn--primary');
        } else {
            btn.disabled = true;
            Promise.all(Array.from(editables).map((el) => {
                el.removeAttribute('contenteditable');
                // Sanitized at save time too (not just on render) so what's
                // actually persisted is already clean — see sanitizeRichHtml
                // in supabase-client.js.
                const clean = window.sanitizeRichHtml(el.innerHTML);
                el.innerHTML = clean;
                return sb.from('site_content').upsert(
                    { key: el.dataset.contentKey, value: clean },
                    { onConflict: 'key' }
                );
            })).then((results) => {
                btn.disabled = false;
                btn.textContent = 'Edit page text';
                btn.classList.remove('ab-btn--primary');
                const failed = results.find((r) => r.error);
                if (failed) alert('Some text failed to save: ' + failed.error.message);
            });
        }
    }

    /* ---------------- Entry points ---------------- */

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            if (!isAdmin) openSignIn();
        }
    });

    (async function boot() {
        if (window.location.hash === '#admin') {
            const ok = await checkAdmin();
            ok ? enterAdminMode() : openSignIn();
            return;
        }
        // Restore session silently on load
        if (await checkAdmin()) enterAdminMode();
    })();
})();
