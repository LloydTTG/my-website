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
            contentEl.src = data.src;
            contentEl.alt = '';
            contentEl.draggable = false;
        } else {
            contentEl = document.createElement('div');
            contentEl.className = 'canvas-block__text';
            contentEl.innerHTML = data.html || '<p>New text</p>';
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
            if (b.data.type === 'text') b.data.html = b.contentEl.innerHTML;
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
                if (url) addImageBlock(url);
            });
        }
    }

    window.addEventListener('resize', updateHeight);

    return { load, serialize, startEditing, stopEditing };
}
