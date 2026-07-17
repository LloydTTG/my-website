/* ================================================================
   canvas-editor.js — a freeform canvas of independently placed text
   and image boxes, replacing the single flowing rich-text body.
   Each block remembers its own position/size (x/width as a % of the
   canvas so it scales with viewport width, y in px since vertical
   space is just scroll — there's no hard limit on it) so an admin
   can lay things out exactly where they want and everyone else sees
   that same layout. Shared by marker-layer.js (index.html/world.html)
   and outpost.js (the standalone fallback page).
   ================================================================ */

function uid() {
    return 'b' + Math.random().toString(36).slice(2, 9);
}

/* ----------------------------------------------------------------
   Rich-text blocks are rendered with innerHTML (that's the whole point —
   admin-authored formatting, not just plain text), so the HTML has to be
   sanitized rather than trusted outright. This isn't just paranoia about
   a hostile admin: the same html round-trips through the browser's own
   execCommand/contenteditable and paste handling, which can carry in far
   more than the toolbar's four buttons ever intended (pasted <script>,
   event-handler attributes, javascript: links, embedded iframes...). An
   allowlist (keep only tags/attributes a rich-text editor legitimately
   produces) is used instead of a blocklist, since a blocklist only ever
   guards against the specific tricks its author thought of. Runs both at
   save time (serialize, below) and at render time (renderBlock) so stored
   content is defused even if it somehow got in some other way — e.g. a
   row edited directly in the Supabase table editor.
   ---------------------------------------------------------------- */
const RICH_TEXT_ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3',
    'UL', 'OL', 'LI', 'A', 'IMG', 'SPAN', 'DIV', 'BLOCKQUOTE', 'CODE', 'PRE',
]);
const RICH_TEXT_ALLOWED_ATTRS = { A: ['href', 'target', 'rel'], IMG: ['src', 'alt'] };

function isSafeRichTextUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

function sanitizeRichHtml(html) {
    // A document created this way is never inserted into the live page, so
    // nothing in it executes (scripts are inert, event handlers never
    // fire) while it's being picked apart below.
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = String(html || '');

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    const disallowed = [];
    let node = walker.nextNode();
    while (node) {
        if (!RICH_TEXT_ALLOWED_TAGS.has(node.tagName)) {
            disallowed.push(node);
        } else {
            const keep = RICH_TEXT_ALLOWED_ATTRS[node.tagName] || [];
            Array.from(node.attributes).forEach((attr) => {
                if (!keep.includes(attr.name)) { node.removeAttribute(attr.name); return; }
                if ((attr.name === 'href' || attr.name === 'src') && !isSafeRichTextUrl(attr.value)) {
                    node.removeAttribute(attr.name);
                }
            });
            // A stripped `target` still leaves a same-tab link with no rel,
            // which is fine; only force rel when target="_blank" survived,
            // so the opened page can't reach back via window.opener.
            if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
                node.setAttribute('rel', 'noopener noreferrer');
            }
        }
        node = walker.nextNode();
    }
    // Drop disallowed elements entirely (not just unwrapped) — their
    // content (if any, e.g. a pasted <script>'s text) isn't meaningful to
    // keep, and dropping the whole subtree avoids having to reason about
    // what nested disallowed-inside-disallowed structure might resurface.
    disallowed.forEach((el) => el.remove());

    return doc.body.innerHTML;
}

// A location's `body` used to be a plain HTML string (the old single
// flowing rich-text field). Rather than a schema migration, older rows
// are adopted in place as a single starting text block the admin can
// then reposition or split up.
export function parseCanvasBody(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (err) {
        // Not JSON — a legacy plain-HTML body, adopted below.
    }
    return [{ id: uid(), type: 'text', xPct: 6, yPx: 0, widthPct: 88, html: raw }];
}

export function createCanvasEditor(canvasEl, toolbarEl) {
    const blocks = new Map(); // id -> { data, el, handleEl, contentEl, resizeEl }
    let editing = false;
    let focusedTextEl = null;

    function updateHeight() {
        let maxBottom = 240;
        const canvasTop = canvasEl.getBoundingClientRect().top;
        blocks.forEach((b) => {
            const bottom = b.el.getBoundingClientRect().bottom - canvasTop;
            if (bottom > maxBottom) maxBottom = bottom;
        });
        canvasEl.style.height = Math.ceil(maxBottom + 32) + 'px';
    }

    function applyPosition(b) {
        b.el.style.left = b.data.xPct + '%';
        b.el.style.top = b.data.yPx + 'px';
        b.el.style.width = b.data.widthPct + '%';
    }

    function wireDrag(b) {
        b.handleEl.addEventListener('pointerdown', (e) => {
            if (!editing || e.target.closest('.canvas-block__delete')) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const canvasRect = canvasEl.getBoundingClientRect();
            const startXPct = b.data.xPct;
            const startYPx = b.data.yPx;

            function onMove(ev) {
                const dxPct = ((ev.clientX - startX) / canvasRect.width) * 100;
                const dyPx = ev.clientY - startY;
                b.data.xPct = Math.max(0, Math.min(100 - b.data.widthPct, startXPct + dxPct));
                b.data.yPx = Math.max(0, startYPx + dyPx);
                applyPosition(b);
            }
            function onUp() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                updateHeight();
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function wireResize(b) {
        b.resizeEl.addEventListener('pointerdown', (e) => {
            if (!editing) return;
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const canvasRect = canvasEl.getBoundingClientRect();
            const startWidthPct = b.data.widthPct;

            function onMove(ev) {
                const dPct = ((ev.clientX - startX) / canvasRect.width) * 100;
                b.data.widthPct = Math.max(10, Math.min(100 - b.data.xPct, startWidthPct + dPct));
                applyPosition(b);
            }
            function onUp() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                updateHeight();
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function setBlockEditable(b, on) {
        if (b.data.type !== 'text') return;
        if (on) b.contentEl.setAttribute('contenteditable', 'true');
        else b.contentEl.removeAttribute('contenteditable');
    }

    function removeBlock(id) {
        const b = blocks.get(id);
        if (!b) return;
        if (focusedTextEl === b.contentEl) focusedTextEl = null;
        b.el.remove();
        blocks.delete(id);
        updateHeight();
    }

    function renderBlock(data) {
        const el = document.createElement('div');
        el.className = 'canvas-block canvas-block--' + data.type;
        el.dataset.blockId = data.id;

        const handle = document.createElement('div');
        handle.className = 'canvas-block__handle';
        handle.innerHTML = '<span class="canvas-block__grip" aria-hidden="true">⠿⠿</span>' +
            '<button type="button" class="canvas-block__delete" aria-label="Delete this box">&times;</button>';
        el.appendChild(handle);

        let contentEl;
        if (data.type === 'image') {
            contentEl = document.createElement('img');
            contentEl.src = isSafeRichTextUrl(data.src) ? data.src : '';
            contentEl.alt = '';
            contentEl.draggable = false;
        } else {
            contentEl = document.createElement('div');
            contentEl.className = 'canvas-block__text';
            contentEl.innerHTML = sanitizeRichHtml(data.html || '<p>New text</p>');
            contentEl.addEventListener('focusin', () => { focusedTextEl = contentEl; });
            contentEl.addEventListener('focusout', () => {
                if (focusedTextEl === contentEl) focusedTextEl = null;
            });
        }
        el.appendChild(contentEl);

        const resizeHandle = document.createElement('span');
        resizeHandle.className = 'canvas-block__resize';
        el.appendChild(resizeHandle);

        canvasEl.appendChild(el);

        const b = { data, el, handleEl: handle, contentEl, resizeEl: resizeHandle };
        applyPosition(b);
        wireDrag(b);
        wireResize(b);
        setBlockEditable(b, editing);

        handle.querySelector('.canvas-block__delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this box?')) removeBlock(data.id);
        });

        blocks.set(data.id, b);
        return b;
    }

    function load(blockList) {
        canvasEl.innerHTML = '';
        blocks.clear();
        focusedTextEl = null;
        (blockList || []).forEach(renderBlock);
        canvasEl.classList.toggle('is-editing', editing);
        updateHeight();
    }

    function serialize() {
        return Array.from(blocks.values()).map((b) => {
            if (b.data.type === 'text') b.data.html = sanitizeRichHtml(b.contentEl.innerHTML);
            return { ...b.data };
        });
    }

    function addTextBlock() {
        const n = blocks.size;
        renderBlock({ id: uid(), type: 'text', xPct: 8, yPx: 16 + n * 24, widthPct: 40, html: '<p>New text</p>' });
        updateHeight();
    }

    function addImageBlock(src) {
        const n = blocks.size;
        renderBlock({ id: uid(), type: 'image', xPct: 8, yPx: 16 + n * 24, widthPct: 32, src });
        updateHeight();
    }

    function startEditing() {
        editing = true;
        canvasEl.classList.add('is-editing');
        blocks.forEach((b) => setBlockEditable(b, true));
    }

    function stopEditing() {
        editing = false;
        focusedTextEl = null;
        canvasEl.classList.remove('is-editing');
        blocks.forEach((b) => setBlockEditable(b, false));
    }

    if (toolbarEl) {
        toolbarEl.querySelectorAll('[data-cmd]').forEach((btn) => {
            // Preserve whatever's currently selected in the focused text
            // block through the click — the button would otherwise steal
            // focus on mousedown before execCommand ever runs.
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                if (!focusedTextEl) return;
                document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
            });
        });

        const addTextBtn = toolbarEl.querySelector('[data-act="add-text"]');
        if (addTextBtn) addTextBtn.addEventListener('click', addTextBlock);

        const addImageBtn = toolbarEl.querySelector('[data-act="add-image"]');
        if (addImageBtn) {
            addImageBtn.addEventListener('click', () => {
                const url = prompt('Image URL:');
                if (!url) return;
                // renderBlock re-checks this anyway (defense-in-depth against
                // a row edited outside this UI), but rejecting here too gives
                // the admin an actual error instead of a silently blank image.
                if (!isSafeRichTextUrl(url)) {
                    alert('That doesn\'t look like a valid image URL — it needs to start with http:// or https://.');
                    return;
                }
                addImageBlock(url);
            });
        }
    }

    window.addEventListener('resize', updateHeight);

    return { load, serialize, startEditing, stopEditing };
}
