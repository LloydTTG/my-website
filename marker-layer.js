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
   ================================================================ */

import { followMarker } from './globe-scene.js';
import { createCanvasEditor, parseCanvasBody } from './canvas-editor.js';

export function createMarkerLayer(globeScene, config) {
    const {
        container,
        locationFields, // { eyebrow, title, canvas } elements — canvas hosts the freeform blocks
        editLocationBtn, // optional button inside location-chrome
        editorToolbar,   // optional toolbar for the canvas editor
        scrollContainer, // optional scrollable element (location-chrome) for the scroll parallax below
        onEnter,         // (markerId) => Promise, caller's crossfade/history
        onExit,          // () => Promise, caller's crossfade/history
    } = config;

    const canvasEditor = createCanvasEditor(locationFields.canvas, editorToolbar);

    const sb = window.sb;
    const markers = new Map(); // id -> { data, el, dotEl, labelEl, deleteEl, stopFollow }
    let currentMarkerId = null;
    let placing = false;
    let suppressNextClick = false;
    let editing = false;

    function isAdmin() {
        return !!(window.adminBar && window.adminBar.isAdmin());
    }

    function buildMarkerEl(marker) {
        const el = document.createElement('div');
        el.className = 'globe-marker';
        el.dataset.markerId = marker.id;
        el.innerHTML = `
            <button type="button" class="globe-marker__dot" aria-label="Explore this location">
                <span class="globe-marker__pulse" aria-hidden="true"></span>
            </button>
            <span class="globe-marker__label"></span>
            <button type="button" class="globe-marker__delete" aria-label="Delete this location" hidden>&times;</button>
        `;
        el.querySelector('.globe-marker__label').textContent = marker.title;
        container.appendChild(el);
        return el;
    }

    function addMarkerRuntime(marker) {
        globeScene.addMarker(marker.id, marker.lat, marker.lon);
        const el = buildMarkerEl(marker);
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
            m.deleteEl.hidden = !admin;
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

    async function enterMarker(id) {
        const m = markers.get(id);
        if (!m || currentMarkerId) return;
        currentMarkerId = id;
        locationFields.eyebrow.textContent = m.data.eyebrow;
        locationFields.title.textContent = m.data.title;
        canvasEditor.load(parseCanvasBody(m.data.body));
        refreshAdminAffordances();
        await onEnter(id);
        parallaxBase = { position: globeScene.camera.position.clone(), up: globeScene.camera.up.clone() };
    }

    async function exitMarker() {
        if (!currentMarkerId) return;
        parallaxBase = null;
        if (scrollContainer) scrollContainer.scrollTop = 0;
        if (editing) await stopEditing(false);
        await onExit();
        currentMarkerId = null;
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
        const { error } = await sb.from('globe_markers').update(payload).eq('id', currentMarkerId);
        if (error) alert('Some location text failed to save: ' + error.message);
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

    async function load() {
        if (!window.sbConfigured) return;
        const { data, error } = await sb.from('globe_markers').select('*');
        if (error || !data) return;
        data.forEach(addMarkerRuntime);
    }
    load();

    return {
        enterMarker,
        exitMarker,
        isLocationOpen: () => currentMarkerId !== null,
    };
}
