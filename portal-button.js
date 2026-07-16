/* ================================================================
   portal-button.js — the hero button IS a tiny live view of the
   globe scene. Clicking reveals that exact canvas at full viewport
   size/aspect immediately (so the 3D framing never has to change
   mid-transition) and grows a circular clip-path mask over it while
   the camera keeps dollying in — one continuous zoom, never a cut
   or a resize jump. Reversible via the in-page "Back" control, with
   real history entries so the browser back button and a direct
   /world.html visit both work as fallbacks.
   ================================================================ */

import { createGlobeScene, createSurfaceTransition } from './globe-scene.js';
import { createMarkerLayer } from './marker-layer.js';

const btn = document.getElementById('portal-btn');
const canvas = document.getElementById('portal-btn-canvas');
const siteContent = document.getElementById('site-content');
const worldChrome = document.getElementById('world-chrome');
const backBtn = document.getElementById('world-back-btn');
const markersContainer = document.getElementById('globe-markers');
const locationChrome = document.getElementById('location-chrome');
const locationBackBtn = document.getElementById('location-back-btn');
const locationEditBtn = document.getElementById('location-edit-btn');

if (btn && canvas && siteContent && worldChrome) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const PREVIEW_Z = 24;
    const REST_Z = 6;
    const DURATION = reduceMotion ? 0 : 1800;
    const EASE = 'cubic-bezier(0.6, 0, 0.35, 1)';

    const globeScene = createGlobeScene(canvas, { cameraZ: PREVIEW_Z, interactive: false });
    const surfaceTransition = createSurfaceTransition(globeScene, { duration: DURATION, reduceMotion });

    let busy = false;

    function sizeToPreview() {
        const rect = canvas.getBoundingClientRect();
        // .portal-btn is always a perfect circle (aspect-ratio: 1 in CSS),
        // so force a square render size instead of trusting width/height
        // as independent measurements — if the button briefly measured 0
        // right after the canvas was reattached (a real race that used to
        // happen after "Back"), globeScene.setSize's own guard would
        // silently skip updating the camera, leaving the previous
        // fullscreen (non-square) aspect ratio applied and stretching the
        // globe vertically once squeezed into the small circular button.
        // Retrying next frame instead of giving up avoids that permanently
        // wrong state.
        const size = Math.max(rect.width, rect.height);
        if (size <= 0) { requestAnimationFrame(sizeToPreview); return; }
        globeScene.setSize(size, size);
    }
    sizeToPreview();

    window.addEventListener('resize', () => {
        if (document.body.classList.contains('is-world')) {
            globeScene.setSize(window.innerWidth, window.innerHeight);
        } else if (!busy) {
            sizeToPreview();
        }
    });

    function animateValue(from, to, duration, onUpdate) {
        return new Promise((resolve) => {
            if (duration === 0) { onUpdate(to); resolve(); return; }
            const start = performance.now();
            function step(now) {
                const t = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - t, 3);
                onUpdate(from + (to - from) * eased);
                if (t < 1) requestAnimationFrame(step);
                else resolve();
            }
            requestAnimationFrame(step);
        });
    }

    // Radius a circle centered at (cx, cy) needs to fully cover the viewport.
    function coverRadius(cx, cy) {
        const dx = Math.max(cx, window.innerWidth - cx);
        const dy = Math.max(cy, window.innerHeight - cy);
        return Math.ceil(Math.hypot(dx, dy)) * 1.05;
    }

    // Detach the canvas to <body> and give it the exact viewport size/aspect
    // it will have once fully "in the world" — the camera's projection never
    // has to change mid-transition, so there's no readjustment snap. The
    // grow/shrink itself is purely a clip-path circle, which is cheap to
    // animate and never distorts the render.
    //
    // A position:fixed element is positioned relative to the viewport only
    // if no ancestor establishes a containing block — but any ancestor with
    // a non-"none" transform/translate/scale/filter does (including
    // .portal-btn's own :hover translateY, active while the cursor that
    // just clicked it is still sitting on top of it). Detaching sidesteps
    // that regardless of what any ancestor's styles happen to be.
    function goFixed() {
        if (canvas.parentElement !== document.body) document.body.appendChild(canvas);
        canvas.style.position = 'fixed';
        canvas.style.inset = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        // Above the topnav (z-index 100) so it fully covers the page while
        // growing, but below .world-chrome (600) so the revealed text
        // crossfades in on top of the globe instead of hiding behind it.
        canvas.style.zIndex = '500';
        globeScene.setSize(window.innerWidth, window.innerHeight);
    }

    function resetToPreview() {
        canvas.style.position = '';
        canvas.style.inset = '';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.clipPath = '';
        canvas.style.transition = '';
        canvas.style.zIndex = '';
        btn.insertBefore(canvas, btn.firstChild);
        sizeToPreview();
    }

    function enterWorld() {
        if (busy || document.body.classList.contains('is-world')) return;
        busy = true;
        globeScene.controls.autoRotate = false;

        const rect = canvas.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;
        const startRadius = rect.width / 2;

        goFixed();

        // Going fullscreen re-centers the camera's projection on the
        // viewport's true center — but the button usually isn't there, so
        // without correction the globe would suddenly render off-center
        // inside its own small clip circle, looking "unlinked" from the
        // preview. setViewOffset shifts the camera's optical center to the
        // button's screen position so frame one still matches the preview
        // exactly; animating the shift back to zero alongside the growing
        // clip-path is what makes it read as one continuous globe.
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const shiftX = vw / 2 - originX;
        const shiftY = vh / 2 - originY;
        globeScene.camera.setViewOffset(vw, vh, shiftX, shiftY, vw, vh);

        canvas.style.clipPath = `circle(${startRadius}px at ${originX}px ${originY}px)`;
        void canvas.offsetWidth; // force reflow before animating

        canvas.style.transition = reduceMotion ? 'none' : `clip-path ${DURATION}ms ${EASE}`;
        requestAnimationFrame(() => {
            canvas.style.clipPath = `circle(${coverRadius(originX, originY)}px at ${originX}px ${originY}px)`;
        });

        // World chrome needs to be in the layout (not [hidden]) before it can
        // fade in; site content stays in the layout until the very end so it
        // can fade out in place instead of vanishing the instant it's covered.
        worldChrome.hidden = false;
        worldChrome.style.opacity = '0';

        animateValue(PREVIEW_Z, REST_Z, DURATION, (z) => globeScene.camera.position.setZ(z));
        animateValue(0, 1, DURATION, (t) => {
            globeScene.camera.setViewOffset(vw, vh, shiftX * (1 - t), shiftY * (1 - t), vw, vh);
        });
        animateValue(0, 1, DURATION, (t) => {
            siteContent.style.opacity = String(1 - t);
            worldChrome.style.opacity = String(t);
        });

        window.setTimeout(() => {
            globeScene.camera.clearViewOffset();
            canvas.style.clipPath = '';
            canvas.style.transition = '';
            document.body.classList.add('is-world');
            siteContent.hidden = true;
            // Explicit, not cleared to '' — clearing falls back to each
            // element's CSS default (opacity:0 for .world-chrome), which
            // raced against this same-duration animation's own last-frame
            // update in the old setTimeout-based version and only "worked"
            // by accident. Setting the resting value directly is correct
            // regardless of which finishes last.
            worldChrome.style.opacity = '1';
            globeScene.setInteractive(true);
            globeScene.controls.autoRotate = !reduceMotion;
            try { history.pushState({ portalWorld: true }, '', 'world.html'); } catch (err) { /* ignore */ }
            busy = false;
        }, DURATION);
    }

    function exitWorld() {
        if (busy || !document.body.classList.contains('is-world')) return;
        busy = true;
        globeScene.controls.autoRotate = false;

        globeScene.setInteractive(false);
        siteContent.hidden = false;
        siteContent.style.opacity = '0';
        worldChrome.style.opacity = '1';

        const target = btn.getBoundingClientRect();
        const targetX = target.left + target.width / 2;
        const targetY = target.top + target.height / 2;
        const targetRadius = target.width / 2;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const shiftX = vw / 2 - targetX;
        const shiftY = vh / 2 - targetY;

        canvas.style.clipPath = `circle(${coverRadius(targetX, targetY)}px at ${targetX}px ${targetY}px)`;
        void canvas.offsetWidth;

        canvas.style.transition = reduceMotion ? 'none' : `clip-path ${DURATION}ms ${EASE}`;
        requestAnimationFrame(() => {
            canvas.style.clipPath = `circle(${targetRadius}px at ${targetX}px ${targetY}px)`;
        });

        animateValue(REST_Z, PREVIEW_Z, DURATION, (z) => globeScene.camera.position.setZ(z));
        animateValue(0, 1, DURATION, (t) => {
            globeScene.camera.setViewOffset(vw, vh, shiftX * t, shiftY * t, vw, vh);
        });
        animateValue(0, 1, DURATION, (t) => {
            siteContent.style.opacity = String(t);
            worldChrome.style.opacity = String(1 - t);
        });

        window.setTimeout(() => {
            globeScene.camera.clearViewOffset();
            resetToPreview();
            document.body.classList.remove('is-world');
            worldChrome.hidden = true;
            siteContent.style.opacity = '1';
            globeScene.controls.autoRotate = !reduceMotion;
            busy = false;
        }, DURATION);
    }

    // Marker → location: fly the camera down to stand right at the marker's
    // spot on the globe's surface, oriented parallel to the local horizon —
    // so the globe reads as a "floor" curving away beneath you with the
    // starfield as "sky" above, rather than swapping to a flat page.
    function enterLocation(markerId) {
        if (busy || !document.body.classList.contains('is-world') || document.body.classList.contains('is-location')) return;
        busy = true;

        locationChrome.hidden = false;
        locationChrome.style.opacity = '0';

        return surfaceTransition.enter(markerId, (t) => {
            worldChrome.style.opacity = String(1 - t);
            locationChrome.style.opacity = String(t);
        }).then(() => {
            document.body.classList.add('is-location');
            worldChrome.hidden = true;
            locationChrome.style.opacity = '1';
            try { history.pushState({ portalWorld: true, portalLocation: true, markerId }, '', `outpost.html?id=${markerId}`); } catch (err) { /* ignore */ }
            busy = false;
        });
    }

    function exitLocation() {
        if (busy || !document.body.classList.contains('is-location')) return;
        busy = true;

        worldChrome.hidden = false;
        worldChrome.style.opacity = '0';
        locationChrome.style.opacity = '1';

        return surfaceTransition.exit((t) => {
            worldChrome.style.opacity = String(t);
            locationChrome.style.opacity = String(1 - t);
        }).then(() => {
            document.body.classList.remove('is-location');
            locationChrome.hidden = true;
            worldChrome.style.opacity = '1';
            busy = false;
        });
    }

    let markerLayer = null;
    if (markersContainer) {
        markerLayer = createMarkerLayer(globeScene, {
            container: markersContainer,
            locationFields: {
                eyebrow: document.getElementById('outpost-eyebrow'),
                title: document.getElementById('outpost-title'),
                canvas: document.getElementById('location-canvas'),
            },
            editLocationBtn: locationEditBtn,
            editorToolbar: document.getElementById('location-editor-toolbar'),
            scrollContainer: locationChrome,
            onEnter: enterLocation,
            onExit: exitLocation,
        });
    }

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        enterWorld();
    });

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (history.state && history.state.portalWorld && !history.state.portalLocation) {
                history.back();
            } else {
                exitWorld();
            }
        });
    }

    if (locationBackBtn) {
        locationBackBtn.addEventListener('click', () => {
            if (history.state && history.state.portalLocation) {
                history.back();
            } else if (markerLayer) {
                markerLayer.exitMarker();
            }
        });
    }

    window.addEventListener('popstate', () => {
        if (document.body.classList.contains('is-location')) {
            if (markerLayer) markerLayer.exitMarker();
        } else if (document.body.classList.contains('is-world')) {
            exitWorld();
        }
    });
}
