/* ================================================================
   outpost.js — standalone fallback for outpost.html (a direct visit
   or reload, no 3D scene involved). Loads one marker's content by its
   id from the URL (?id=...) and lets an admin edit it in place,
   mirroring marker-layer.js's in-page editor but without any of the
   globe/raycasting machinery this page doesn't have.
   ================================================================ */

import { createCanvasEditor, parseCanvasBody } from './canvas-editor.js';

(function () {
    'use strict';

    const markerId = new URLSearchParams(window.location.search).get('id');

    const eyebrowEl = document.getElementById('outpost-eyebrow');
    const titleEl = document.getElementById('outpost-title');
    const canvasEl = document.getElementById('location-canvas');
    const editBtn = document.getElementById('location-edit-btn');
    const toolbarEl = document.getElementById('location-editor-toolbar');

    const canvasEditor = createCanvasEditor(canvasEl, toolbarEl);

    let marker = null;
    let editing = false;

    function refreshEditButton() {
        if (!editBtn) return;
        const admin = !!(window.adminBar && window.adminBar.isAdmin());
        editBtn.hidden = !(admin && marker);
    }

    async function load() {
        if (!markerId || !window.sbConfigured) return;
        const { data, error } = await window.sb.from('globe_markers').select('*').eq('id', markerId).maybeSingle();
        if (error || !data) return;
        marker = data;
        eyebrowEl.textContent = data.eyebrow;
        titleEl.textContent = data.title;
        canvasEditor.load(parseCanvasBody(data.body));
        refreshEditButton();
    }

    async function stopEditing(save) {
        editing = false;
        eyebrowEl.removeAttribute('contenteditable');
        titleEl.removeAttribute('contenteditable');
        canvasEditor.stopEditing();
        if (toolbarEl) toolbarEl.hidden = true;
        editBtn.textContent = 'Edit location text';
        editBtn.classList.remove('ab-btn--primary');

        if (!save || !marker) return;
        const payload = {
            eyebrow: eyebrowEl.textContent.trim(),
            title: titleEl.textContent.trim(),
            body: JSON.stringify(canvasEditor.serialize()),
        };
        const { error } = await window.sb.from('globe_markers').update(payload).eq('id', marker.id);
        if (error) alert('Failed to save: ' + error.message);
    }

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (editing) { stopEditing(true); return; }
            editing = true;
            eyebrowEl.setAttribute('contenteditable', 'true');
            titleEl.setAttribute('contenteditable', 'true');
            canvasEditor.startEditing();
            if (toolbarEl) toolbarEl.hidden = false;
            editBtn.textContent = 'Save location text';
            editBtn.classList.add('ab-btn--primary');
        });
    }

    document.addEventListener('admin:entered', refreshEditButton);

    // supabase-client.js runs first (defer order), so sb is ready here.
    load();
})();
