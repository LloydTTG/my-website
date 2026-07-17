/* ================================================================
   marker-layer.js — loads globe_markers from Supabase and renders
   each one as a dot+label pinned to the globe (via globe-scene.js's
   marker anchors + followMarker). Shared by index.html/portal-button.js
   and world.html/globe.js so both pages support any number of markers
   with the same admin affordances:

   - Click a marker           -> fly to its spot on the surface
   - "+ Marker" (admin)        -> click the globe to drop a new marker there
   - Drag a dot (admin)        -> move that marker
   - "x" on a marker (admin)   -> delete it
   - "Edit location text"      -> reveals a freeform canvas (canvas-editor.js)
     (admin, inside a location)  where the eyebrow/title stay simple fields
                                  but the description becomes independent
                                  drag/resize-able text and image boxes,
                                  saved directly to the marker's row.

   The north-pole tree is a nested special case of the same content model
   (still globe_markers rows, still the same rich-text editor) but with
   three levels instead of one flat marker -> content hop:

     tree (own eyebrow/title/body, like any marker)
       -> click a branch hotspot -> branch (no content of its own, just
          shows that branch's row of leaf dots + prev/next arrows to
          switch which branch is framed)
            -> click a leaf dot -> leaf (its own eyebrow/title/body)

   Tree/leaf rows are told apart from normal surface markers by
   tree_branch/tree_slot being non-null (see schema.sql); the tree itself
   is the sentinel tree_branch = -1, tree_slot = 0. Leaf slots without a
   saved row yet still get a dot (positions come from the tree's fixed
   geometry, not the database), using placeholder text until an admin
   edits and saves it for the first time — at which point it's an insert
   instead of an update, since there was no row to update.
   ================================================================ */

import { followMarker } from './globe-scene.js';
import { createCanvasEditor, parseCanvasBody } from './canvas-editor.js';

// getMarkerSurfaceView's default pitchDown (~0.18 rad) is tuned for a
// marker sitting flush on the globe's surface — "stand here, look mostly
// along the horizon". Viewed from further back (like leaf framing below),
// that shallow angle points the camera out past the object into empty
// space instead of down at it, so this needs a much steeper pitch. Neither
// the tree's own overview nor a branch's use this at all — see
// getTreeOverviewView/getBranchView — since both need a view actually
// aimed at their target that a trunk-aligned anchor can't produce.
const LEAF_EYE_RADIUS = 2.4;
const LEAF_PITCH = 0.4;

const TREE_KEY = 'tree:-1:0';

export function createMarkerLayer(globeScene, config) {
    const {
        container,
        // Branch/leaf hotspots need to stay interactive while location-chrome
        // itself is showing (you're "inside" the tree at that point) — unlike
        // `container` above, which lives inside the world view and gets
        // hidden the moment any location is entered. Falls back to
        // `container` if not given (better than crashing, though the tree
        // nav won't be clickable once inside a location without it).
        treeContainer,
        locationFields, // { eyebrow, title, canvas } elements — canvas hosts the freeform blocks
        editLocationBtn, // optional button inside location-chrome
        editorToolbar,   // optional toolbar for the canvas editor
        scrollContainer, // optional scrollable element (location-chrome) for the scroll parallax below
        branchNav,       // optional { root, label } showing which branch is in view
        onEnter,         // (markerId, eyeRadius) => Promise, caller's crossfade/history
        onExit,          // () => Promise, caller's crossfade/history
        onMoveTo,        // (markerId, eyeRadius) => Promise, camera-only reframe (no crossfade)
    } = config;

    const canvasEditor = createCanvasEditor(locationFields.canvas, editorToolbar);

    const sb = window.sb;
    const markers = new Map(); // id -> { data, el, dotEl, labelEl, deleteEl, stopFollow }
    let currentMarkerId = null;
    let placing = false;
    let suppressNextClick = false;
    let editing = false;

    // Tree nav state. viewLevel mirrors currentMarkerId's "depth" so
    // exitMarker()/back-navigation knows whether to step up one level or
    // leave the tree entirely. branchHotspots/leafSlots are populated once
    // in setupTree() and don't change after; which of them is visible does.
    let viewLevel = null; // null | 'tree' | 'branch' | 'leaf'
    let activeBranch = 0;
    let navBusy = false; // guards enterTree/enterBranch/switchBranch/enterLeaf/back* against
                         // overlapping calls — without it, rapid-firing the arrows would update
                         // activeBranch/visible dots faster than the camera can animate between
                         // them (surfaceTransition's own busy flag silently drops the extra
                         // moveTo calls), leaving the dots pointing at a branch the camera never
                         // actually reached.
    const branchHotspots = []; // branchHotspots[branchIndex] -> marker id
    const leafSlots = [];      // leafSlots[branchIndex] -> [marker id, ...]

    function isAdmin() {
        return !!(window.adminBar && window.adminBar.isAdmin());
    }

    // `id` is the key this marker is looked up by (markers Map, globeScene
    // anchors) — for a plain surface marker that's the same as marker.id
    // (the database row's uuid), but for tree/branch/leaf virtual markers
    // it's a synthetic string (see TREE_KEY/branchId/leafId below) since
    // those can exist before any database row does.
    function buildMarkerEl(id, marker, { deletable = true, parent = container } = {}) {
        const el = document.createElement('div');
        el.className = 'globe-marker';
        el.dataset.markerId = id;
        el.innerHTML = `
            <button type="button" class="globe-marker__dot" aria-label="Explore this location">
                <span class="globe-marker__pulse" aria-hidden="true"></span>
            </button>
            <span class="globe-marker__label"></span>
            ${deletable ? '<button type="button" class="globe-marker__delete" aria-label="Delete this location" hidden>&times;</button>' : ''}
        `;
        el.querySelector('.globe-marker__label').textContent = marker.title;
        parent.appendChild(el);
        return el;
    }

    function addMarkerRuntime(marker) {
        globeScene.addMarker(marker.id, marker.lat, marker.lon);
        const el = buildMarkerEl(marker.id, marker);
        const stopFollow = followMarker(globeScene, marker.id, el);
        const dotEl = el.querySelector('.globe-marker__dot');
        const labelEl = el.querySelector('.globe-marker__label');
        const deleteEl = el.querySelector('.globe-marker__delete');
        const record = { data: marker, el, dotEl, labelEl, deleteEl, stopFollow };
        markers.set(marker.id, record);

        el.addEventListener('click', (e) => {
            if (suppressNextClick) { suppressNextClick = false; return; }
            if (e.target === deleteEl) return;
            e.preventDefault();
            enterMarker(marker.id);
        });

        deleteEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm(`Delete "${record.data.title}"?`)) return;
            await sb.from('globe_markers').delete().eq('id', marker.id);
            removeMarkerRuntime(marker.id);
        });

        // Admin drag-to-move: track pointer movement past a small threshold
        // before treating it as a reposition rather than a click-through
        // to enterMarker (which would otherwise fly into the location).
        dotEl.addEventListener('pointerdown', (e) => {
            if (!isAdmin() || placing) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            let moved = false;

            function onMove(ev) {
                if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true;
                if (!moved) return;
                const hit = globeScene.pickLatLon(ev.clientX, ev.clientY);
                if (hit) {
                    globeScene.setMarkerPosition(marker.id, hit.lat, hit.lon);
                    record.data.lat = hit.lat;
                    record.data.lon = hit.lon;
                }
            }
            function onUp() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (moved) {
                    suppressNextClick = true;
                    sb.from('globe_markers')
                        .update({ lat: record.data.lat, lon: record.data.lon })
                        .eq('id', marker.id);
                }
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });

        refreshAdminAffordances();
    }

    function removeMarkerRuntime(id) {
        const m = markers.get(id);
        if (!m) return;
        m.stopFollow();
        m.el.remove();
        globeScene.removeMarker(id);
        markers.delete(id);
        if (currentMarkerId === id) currentMarkerId = null;
    }

    function refreshAdminAffordances() {
        const admin = isAdmin();
        markers.forEach((m) => {
            m.el.classList.toggle('is-admin', admin);
            if (m.deleteEl) m.deleteEl.hidden = !admin;
        });
        if (editLocationBtn) editLocationBtn.hidden = !(admin && currentMarkerId);
    }

    // Scrolling the location's content sinks the camera a bit further below
    // the surface it's standing on — the ground/horizon rise slightly in
    // frame, like an elevator descending, echoing the fact that you're
    // reading further "into" this point on the globe.
    const SCROLL_PARALLAX_RANGE = 600; // px of scroll for the full effect
    const SCROLL_PARALLAX_DEPTH = 0.35; // three.js units at full effect
    let parallaxBase = null; // { position, up } captured once settled in

    function onLocationScroll() {
        if (!parallaxBase || !scrollContainer) return;
        const t = Math.min(scrollContainer.scrollTop / SCROLL_PARALLAX_RANGE, 1);
        globeScene.camera.position
            .copy(parallaxBase.position)
            .addScaledVector(parallaxBase.up, -t * SCROLL_PARALLAX_DEPTH);
    }

    if (scrollContainer) scrollContainer.addEventListener('scroll', onLocationScroll);

    function populateContentFields(id) {
        const m = markers.get(id);
        if (!m) return;
        locationFields.eyebrow.textContent = m.data.eyebrow;
        locationFields.title.textContent = m.data.title;
        canvasEditor.load(parseCanvasBody(m.data.body));
    }

    async function enterMarker(id) {
        const m = markers.get(id);
        if (!m || currentMarkerId) return;
        currentMarkerId = id;
        viewLevel = null; // a plain surface marker, not part of the tree's nav stack
        populateContentFields(id);
        refreshAdminAffordances();
        await onEnter(id);
        parallaxBase = { position: globeScene.camera.position.clone(), up: globeScene.camera.up.clone() };
    }

    // force=true skips the step-up-one-level behavior below and always
    // fully exits — used when responding to a real popstate (browser back
    // button), where the location's whole history entry is already gone by
    // the time the event fires, so the visible state has to jump straight to
    // "fully exited" to match rather than stepping up and leaving the two
    // out of sync. The in-app back button instead calls this without force,
    // stepping up (see isAtLocationRoot's caller), so that only its final
    // step-up-from-the-root press ever touches history.
    async function exitMarker(force = false) {
        if (!currentMarkerId || navBusy) return;

        // Tree nav: back steps up one level instead of leaving entirely,
        // except from the tree's own top level, which does leave.
        if (!force && viewLevel === 'leaf') { await backToBranch(); return; }
        if (!force && viewLevel === 'branch') { await backToTree(); return; }

        parallaxBase = null;
        if (scrollContainer) scrollContainer.scrollTop = 0;
        if (editing) await stopEditing(false);
        hideBranchHotspots();
        hideLeafRow();
        if (branchNav && branchNav.root) branchNav.root.hidden = true;
        await onExit();
        currentMarkerId = null;
        viewLevel = null;
        refreshAdminAffordances();
    }

    /* ---- Admin: edit the currently open location's text in place ---- */

    function startEditing() {
        editing = true;
        locationFields.eyebrow.setAttribute('contenteditable', 'true');
        locationFields.title.setAttribute('contenteditable', 'true');
        canvasEditor.startEditing();
        if (editorToolbar) editorToolbar.hidden = false;
        editLocationBtn.textContent = 'Save location text';
        editLocationBtn.classList.add('ab-btn--primary');
    }

    async function stopEditing(save) {
        editing = false;
        locationFields.eyebrow.removeAttribute('contenteditable');
        locationFields.title.removeAttribute('contenteditable');
        canvasEditor.stopEditing();
        if (editorToolbar) editorToolbar.hidden = true;
        editLocationBtn.textContent = 'Edit location text';
        editLocationBtn.classList.remove('ab-btn--primary');

        if (!save || !currentMarkerId) return;
        const m = markers.get(currentMarkerId);
        if (!m) return;
        const payload = {
            eyebrow: locationFields.eyebrow.textContent.trim(),
            title: locationFields.title.textContent.trim(),
            body: JSON.stringify(canvasEditor.serialize()),
        };
        Object.assign(m.data, payload);
        m.labelEl.textContent = payload.title;

        if (m.data.id) {
            const { error } = await sb.from('globe_markers').update(payload).eq('id', m.data.id);
            if (error) alert('Some location text failed to save: ' + error.message);
            return;
        }

        // First-ever save for a tree/leaf placeholder slot — no row exists
        // yet, so this is an insert (tagged with whichever tree_branch/
        // tree_slot this marker occupies), not an update.
        const { data, error } = await sb.from('globe_markers').insert({
            ...payload,
            lat: 0, lon: 0,
            tree_branch: m.data.tree_branch,
            tree_slot: m.data.tree_slot,
        }).select().single();
        if (error) { alert('Some location text failed to save: ' + error.message); return; }
        m.data.id = data.id;
    }

    if (editLocationBtn) {
        editLocationBtn.addEventListener('click', () => {
            if (editing) stopEditing(true);
            else startEditing();
        });
    }

    /* ---- Admin: add a marker by clicking a spot on the globe ---- */

    function startPlacing() {
        placing = true;
        globeScene.renderer.domElement.style.cursor = 'crosshair';
    }

    function cancelPlacing() {
        placing = false;
        globeScene.renderer.domElement.style.cursor = '';
    }

    document.addEventListener('keydown', (e) => {
        if (placing && e.key === 'Escape') cancelPlacing();
    });

    globeScene.renderer.domElement.addEventListener('click', async (e) => {
        if (!placing) return;
        cancelPlacing();
        const hit = globeScene.pickLatLon(e.clientX, e.clientY);
        if (!hit) return;
        const { data, error } = await sb.from('globe_markers').insert({
            lat: hit.lat, lon: hit.lon,
            title: 'New location', eyebrow: 'A point of interest', body: '',
        }).select().single();
        if (error) { alert('Failed to create marker: ' + error.message); return; }
        addMarkerRuntime(data);
    });

    document.addEventListener('admin:entered', () => {
        window.adminBar.addButton('+ Marker', startPlacing);
        refreshAdminAffordances();
    });

    /* ---- Tree / branch / leaf navigation ---- */

    function addVirtualMarkerRuntime(id, data, { label, parent } = {}) {
        globeScene.addMarker(id, 0, 0, data.localPosition);
        const el = buildMarkerEl(id, data, { deletable: false, parent });
        if (label) el.querySelector('.globe-marker__label').textContent = label;
        el.hidden = true;
        const stopFollow = followMarker(globeScene, id, el);
        const dotEl = el.querySelector('.globe-marker__dot');
        const labelEl = el.querySelector('.globe-marker__label');
        const record = { data, el, dotEl, labelEl, deleteEl: null, stopFollow };
        markers.set(id, record);
        return record;
    }

    function hideBranchHotspots() {
        branchHotspots.forEach((id) => { const m = markers.get(id); if (m) m.el.hidden = true; });
    }

    function showBranchHotspots() {
        branchHotspots.forEach((id) => { const m = markers.get(id); if (m) m.el.hidden = false; });
    }

    function hideLeafRow() {
        leafSlots.forEach((slots) => slots.forEach((id) => { const m = markers.get(id); if (m) m.el.hidden = true; }));
    }

    function showLeafRow(branchIndex) {
        (leafSlots[branchIndex] || []).forEach((id) => { const m = markers.get(id); if (m) m.el.hidden = false; });
    }

    function updateBranchNavLabel() {
        if (branchNav && branchNav.label) {
            branchNav.label.textContent = `Branch ${activeBranch + 1} / ${globeScene.BRANCH_COUNT}`;
        }
    }

    async function enterTree() {
        const treeMarker = markers.get(TREE_KEY);
        if (!treeMarker || currentMarkerId || navBusy) return;
        navBusy = true;
        currentMarkerId = TREE_KEY;
        viewLevel = 'tree';
        populateContentFields(TREE_KEY);
        showBranchHotspots();
        refreshAdminAffordances();
        await onEnter(TREE_KEY, undefined, undefined, globeScene.getTreeOverviewView());
        parallaxBase = { position: globeScene.camera.position.clone(), up: globeScene.camera.up.clone() };
        navBusy = false;
    }

    async function enterBranch(branchIndex) {
        if (viewLevel !== 'tree' || navBusy) return;
        navBusy = true;
        activeBranch = branchIndex;
        viewLevel = 'branch';
        hideBranchHotspots();
        showLeafRow(branchIndex);
        if (branchNav && branchNav.root) branchNav.root.hidden = false;
        updateBranchNavLabel();
        await onMoveTo(branchHotspots[branchIndex], undefined, undefined, globeScene.getBranchView(branchIndex));
        navBusy = false;
    }

    async function enterLeaf(id) {
        if (viewLevel !== 'branch' || navBusy) return;
        navBusy = true;
        currentMarkerId = id;
        viewLevel = 'leaf';
        populateContentFields(id);
        if (branchNav && branchNav.root) branchNav.root.hidden = true;
        hideLeafRow();
        refreshAdminAffordances();
        await onMoveTo(id, LEAF_EYE_RADIUS, LEAF_PITCH);
        navBusy = false;
    }

    async function backToBranch() {
        if (navBusy) return;
        navBusy = true;
        if (editing) await stopEditing(false);
        currentMarkerId = TREE_KEY;
        viewLevel = 'branch';
        populateContentFields(TREE_KEY);
        showLeafRow(activeBranch);
        if (branchNav && branchNav.root) branchNav.root.hidden = false;
        updateBranchNavLabel();
        refreshAdminAffordances();
        await onMoveTo(branchHotspots[activeBranch], undefined, undefined, globeScene.getBranchView(activeBranch));
        navBusy = false;
    }

    async function backToTree() {
        if (navBusy) return;
        navBusy = true;
        hideLeafRow();
        if (branchNav && branchNav.root) branchNav.root.hidden = true;
        currentMarkerId = TREE_KEY;
        viewLevel = 'tree';
        populateContentFields(TREE_KEY);
        showBranchHotspots();
        refreshAdminAffordances();
        await onMoveTo(TREE_KEY, undefined, undefined, globeScene.getTreeOverviewView());
        navBusy = false;
    }

    function setupTree(leafRowsByKey, treeRow) {
        if (!globeScene.BRANCH_COUNT) return;

        const treeData = treeRow || {
            id: null, tree_branch: -1, tree_slot: 0,
            title: 'The old tree', eyebrow: 'A point of interest', body: '',
        };
        treeData.localPosition = globeScene.getTreeLocalPosition();
        const treeMarker = addVirtualMarkerRuntime(TREE_KEY, treeData, { label: treeData.title });
        treeMarker.el.hidden = false; // the tree's own hotspot is always visible from outside
        treeMarker.el.addEventListener('click', (e) => {
            if (suppressNextClick) { suppressNextClick = false; return; }
            e.preventDefault();
            enterTree();
        });

        for (let b = 0; b < globeScene.BRANCH_COUNT; b++) {
            const branchId = `branch:${b}`;
            const branchData = { id: null, localPosition: globeScene.getBranchLocalPosition(b) };
            const branchMarker = addVirtualMarkerRuntime(branchId, branchData, { label: `Branch ${b + 1}`, parent: treeContainer });
            branchHotspots[b] = branchId;
            branchMarker.el.addEventListener('click', (e) => {
                if (suppressNextClick) { suppressNextClick = false; return; }
                e.preventDefault();
                enterBranch(b);
            });

            const count = globeScene.getBranchLeafCount(b);
            leafSlots[b] = [];
            for (let s = 0; s < count; s++) {
                const key = `${b}:${s}`;
                const leafId = `leaf:${key}`;
                const row = leafRowsByKey.get(key) || {
                    id: null, tree_branch: b, tree_slot: s,
                    title: 'New leaf', eyebrow: 'A point of interest', body: '',
                };
                row.localPosition = globeScene.getLeafLocalPosition(b, s);
                const leafMarker = addVirtualMarkerRuntime(leafId, row, { label: row.title, parent: treeContainer });
                leafSlots[b].push(leafId);
                leafMarker.el.addEventListener('click', (e) => {
                    if (suppressNextClick) { suppressNextClick = false; return; }
                    e.preventDefault();
                    enterLeaf(leafId);
                });
            }
        }
    }

    async function load() {
        // The tree mesh itself always renders (globe-scene.js builds it
        // unconditionally), so its hotspot/branches/leaves need to exist
        // client-side too even with no backend configured — only the
        // *content* each one shows depends on Supabase; falls back to
        // placeholder text the same way the rest of the site does.
        let rows = [];
        if (window.sbConfigured) {
            const { data, error } = await sb.from('globe_markers').select('*');
            if (!error && data) rows = data;
        }

        const surfaceRows = rows.filter((m) => m.tree_branch == null);
        surfaceRows.forEach(addMarkerRuntime);

        const treeRows = rows.filter((m) => m.tree_branch != null);
        const leafRowsByKey = new Map();
        let treeRow = null;
        treeRows.forEach((row) => {
            if (row.tree_branch === -1) treeRow = row;
            else leafRowsByKey.set(`${row.tree_branch}:${row.tree_slot}`, row);
        });
        setupTree(leafRowsByKey, treeRow);
    }
    load();

    return {
        enterMarker,
        exitMarker,
        isLocationOpen: () => currentMarkerId !== null,
        // False while inside the tree's branch/leaf nav — the in-app back
        // button uses this to step up one level locally (no history touched)
        // instead of immediately deferring to history.back(), which would
        // pop the tree's one-and-only location history entry in a single
        // click no matter how deep the branch/leaf nav currently is.
        isAtLocationRoot: () => viewLevel !== 'branch' && viewLevel !== 'leaf',
    };
}
