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

    // Runs once: after a short pause the "you made it through" text fades
    // in, holds, then fades everything but the title back out — the title
    // fades back in afterward at its new spot (a small permanent corner
    // label, see .world-hero__title.is-collapsed in styles.css), the rest
    // stays gone for good. See the matching function in portal-button.js
    // for why repositioning happens while the title is already invisible
    // (only opacity ever needs to animate that way, not position or
    // font-size). world.html shows its world view immediately on load (no
    // button-click gate), so this just fires right away rather than
    // waiting for an enter transition.
    (function playWorldIntro() {
        const title = document.querySelector('.world-hero__title');
        if (!title) return;
        const introEls = document.querySelectorAll('.world-hero__eyebrow, .world-hero__title, .world-hero__desc');
        const fadeEls = document.querySelectorAll('.world-hero__eyebrow, .world-hero__desc, .world-hint');

        setTimeout(() => {
            introEls.forEach((el) => el.classList.add('is-visible'));

            setTimeout(() => {
                fadeEls.forEach((el) => el.classList.add('is-fading-out'));

                if (reduceMotion) { title.classList.add('is-collapsed'); return; }

                title.classList.add('is-fading-out');
                setTimeout(() => {
                    title.classList.add('is-collapsed');
                    title.classList.remove('is-fading-out');
                }, 500); // matches the opacity transition duration above
            }, 1300);
        }, 500);
    })();

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

        // customView, when given, is used for the camera instead of looking
        // markerId up as an anchor (see getTreeOverviewView) — markerId
        // itself is still what goes into the URL/history, since that's what
        // identifies the location regardless of how its camera pose was
        // computed.
        function enterLocation(markerId, eyeRadius, pitchDown, customView) {
            if (busy || inLocation) return;
            busy = true;

            locationChrome.hidden = false;
            locationChrome.style.opacity = '0';

            return surfaceTransition.enter(customView || markerId, (t) => {
                worldView.style.opacity = String(1 - t);
                locationChrome.style.opacity = String(t);
            }, eyeRadius, pitchDown).then(() => {
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

        // Re-frames the camera on a different anchor while already inside a
        // location — used by the tree's branch switcher/leaf picker.
        function moveToLocation(markerId, eyeRadius, pitchDown, customView) {
            return surfaceTransition.moveTo(customView || markerId, undefined, eyeRadius, pitchDown);
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
            treeContainer: document.getElementById('tree-nav-markers'),
            locationFields: {
                eyebrow: document.getElementById('outpost-eyebrow'),
                title: document.getElementById('outpost-title'),
                canvas: document.getElementById('location-canvas'),
            },
            editLocationBtn: locationEditBtn,
            editorToolbar: document.getElementById('location-editor-toolbar'),
            scrollContainer: locationChrome,
            branchNav: {
                root: document.getElementById('tree-branch-nav'),
                label: document.getElementById('tree-branch-label'),
            },
            onEnter: enterLocation,
            onExit: exitLocation,
            onMoveTo: moveToLocation,
        });

        if (locationBackBtn) {
            locationBackBtn.addEventListener('click', () => {
                // Stepping up out of the tree's branch/leaf nav is purely
                // local (no history entry per level), so only defer to
                // history.back() once that stepping is done and this press
                // would actually leave the location.
                if (!markerLayer.isAtLocationRoot()) {
                    markerLayer.exitMarker();
                } else if (history.state && history.state.portalLocation) {
                    history.back();
                } else {
                    markerLayer.exitMarker();
                }
            });
        }

        window.addEventListener('popstate', () => {
            // force=true: by the time a real popstate fires, the browser has
            // already popped the location's history entry regardless of how
            // deep the tree's branch/leaf nav was, so the visible state has
            // to jump straight to "fully exited" to match it.
            if (inLocation) markerLayer.exitMarker(true);
        });
    }
}
