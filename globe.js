/* ================================================================
   globe.js — standalone globe scene for world.html
   (Used for direct/deep links and page reloads; the in-page
   button-to-globe zoom on index.html is driven by portal-button.js
   using the same globe-scene.js builder, so it starts at rest here
   at the same distance the zoom lands on.)
   ================================================================ */

import { createGlobeScene, createSurfaceTransition } from './globe-scene.js';
import { createMarkerLayer } from './marker-layer.js';

const canvas = document.getElementById('globe-canvas');

if (canvas) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const REST_Z = 6;
    const DURATION = 1800;

    const scene = createGlobeScene(canvas, { cameraZ: REST_Z, interactive: true });

    function resize() {
        scene.setSize(window.innerWidth, window.innerHeight);
    }

    resize();
    window.addEventListener('resize', resize);

    /* ---- Marker → outpost: fly to the globe's surface in place ----
       Clicking a marker doesn't navigate away, it flies the camera down
       to stand at that spot on the globe while the outpost text
       crossfades in over it. */

    const worldView = document.getElementById('world-view');
    const markersContainer = document.getElementById('globe-markers');
    const locationChrome = document.getElementById('location-chrome');
    const locationBackBtn = document.getElementById('location-back-btn');
    const locationEditBtn = document.getElementById('location-edit-btn');

    if (markersContainer && worldView && locationChrome) {
        const surfaceTransition = createSurfaceTransition(scene, { duration: DURATION, reduceMotion });
        let inLocation = false;
        let busy = false;

        function enterLocation(markerId) {
            if (busy || inLocation) return;
            busy = true;

            locationChrome.hidden = false;
            locationChrome.style.opacity = '0';

            return surfaceTransition.enter(markerId, (t) => {
                worldView.style.opacity = String(1 - t);
                locationChrome.style.opacity = String(t);
            }).then(() => {
                inLocation = true;
                worldView.hidden = true;
                // Explicit, not cleared to '' — clearing falls back to each
                // element's CSS default (.location-chrome is opacity:0),
                // which is wrong for the state we're settling into.
                locationChrome.style.opacity = '1';
                try { history.pushState({ portalLocation: true, markerId }, '', `outpost.html?id=${markerId}`); } catch (err) { /* ignore */ }
                busy = false;
            });
        }

        function exitLocation() {
            if (busy || !inLocation) return;
            busy = true;

            worldView.hidden = false;
            worldView.style.opacity = '0';
            locationChrome.style.opacity = '1';

            return surfaceTransition.exit((t) => {
                worldView.style.opacity = String(t);
                locationChrome.style.opacity = String(1 - t);
            }).then(() => {
                inLocation = false;
                locationChrome.hidden = true;
                worldView.style.opacity = '1';
                busy = false;
            });
        }

        const markerLayer = createMarkerLayer(scene, {
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

        if (locationBackBtn) {
            locationBackBtn.addEventListener('click', () => {
                if (history.state && history.state.portalLocation) {
                    history.back();
                } else {
                    markerLayer.exitMarker();
                }
            });
        }

        window.addEventListener('popstate', () => {
            if (inLocation) markerLayer.exitMarker();
        });
    }
}
