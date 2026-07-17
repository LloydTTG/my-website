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

    const PREVIEW_Z = 6.4;
    const REST_Z = 6;
    const DURATION = reduceMotion ? 0 : 1800;
    const EASE = 'cubic-bezier(0.6, 0, 0.35, 1)';

    // The canvas sits inset from the button's own box by its border width
    // (see .portal-btn in styles.css) so the globe stays fully framed inside
    // that ring instead of poking past it. enterWorld() measures the canvas
    // directly (still in its normal in-place position at that point), so its
    // rect already reflects this — no extra math needed there. exitWorld()
    // has to measure the *button* instead (the canvas is off being
    // fullscreen at that point), so it needs to know the border width to
    // work out what size the canvas will actually end up once reattached.
    // Keep in sync with .portal-btn's border-width in styles.css.
    const BUTTON_BORDER_WIDTH = 10;

    const globeScene = createGlobeScene(canvas, { cameraZ: PREVIEW_Z, interactive: false });
    const surfaceTransition = createSurfaceTransition(globeScene, { duration: DURATION, reduceMotion });

    let busy = false;

    // The button's small square canvas and the fullscreen view share one
    // camera, but switching between their render resolutions changes how
    // many screen pixels a given camera distance maps to. Jumping straight
    // from PREVIEW_Z to REST_Z the instant the canvas resizes (in goFixed())
    // would make the globe's apparent size jump too — a tiny sliver of an
    // already-huge sphere on enter, or the reverse snap on exit — instead of
    // it visibly growing/shrinking. This returns the camera distance that
    // keeps the globe's apparent size unchanged across that resolution
    // swap, so the growing/shrinking clip-path is the only thing that
    // visibly changes on the first frame.
    function handoffZ(buttonSize) {
        return PREVIEW_Z * (window.innerHeight / buttonSize);
    }

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

    // Solves the same cubic bezier as EASE below (Newton-Raphson on x to find
    // t, then evaluates y at that t) so these JS-driven animations move in
    // exact lockstep with the CSS clip-path transition, which is timed with
    // that same curve. They used to use an unrelated plain ease-out here —
    // fast right from frame one — while the clip-path (an ease-in-out
    // bezier) was still barely open, so the camera would already be mostly
    // zoomed in while only a sliver of the growing circle had revealed it:
    // exactly what made the zoom look like it was clipping/skipping instead
    // of growing smoothly.
    function makeBezierEase(x1, y1, x2, y2) {
        const ax = 3 * x1 - 3 * x2 + 1, bx = -6 * x1 + 3 * x2, cx = 3 * x1;
        const ay = 3 * y1 - 3 * y2 + 1, by = -6 * y1 + 3 * y2, cy = 3 * y1;
        const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
        const sampleY = (t) => ((ay * t + by) * t + cy) * t;
        const sampleXDeriv = (t) => (3 * ax * t + 2 * bx) * t + cx;
        return function (x) {
            let t = x;
            for (let i = 0; i < 8; i++) {
                const dx = sampleX(t) - x;
                const deriv = sampleXDeriv(t);
                if (Math.abs(deriv) < 1e-6) break;
                t -= dx / deriv;
            }
            return sampleY(Math.min(Math.max(t, 0), 1));
        };
    }
    const easeValue = makeBezierEase(0.6, 0, 0.35, 1);

    function animateValue(from, to, duration, onUpdate) {
        return new Promise((resolve) => {
            if (duration === 0) { onUpdate(to); resolve(); return; }
            const start = performance.now();
            function step(now) {
                const t = Math.min((now - start) / duration, 1);
                onUpdate(from + (to - from) * easeValue(t));
                if (t < 1) requestAnimationFrame(step);
                else resolve();
            }
            requestAnimationFrame(step);
        });
    }

    // Camera distance can't be tweened linearly like the other values above —
    // a perspective camera's apparent (on-screen) size scales with 1/Z, not
    // Z itself, so linearly interpolating Z makes the globe's own rendered
    // size race ahead of the linearly-growing/shrinking clip-path circle
    // (most of the visible size change happens in the first/last fraction of
    // the tween instead of spreading evenly across it). Interpolating 1/Z
    // instead keeps the globe's apparent size changing at the same steady
    // rate as the clip-path radius, so the two read as one continuous zoom
    // rather than the globe "already being" its final size while the mask
    // is still partway through closing (or opening).
    function animateCameraZ(fromZ, toZ, duration, onUpdate) {
        return animateValue(1 / fromZ, 1 / toZ, duration, (invZ) => onUpdate(1 / invZ));
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

    // Takes the button size the caller already measured before any of this
    // teardown started, instead of re-measuring via getBoundingClientRect()
    // after reattaching — that measurement is what used to race (the button
    // briefly reads 0 right after reattachment), leaving the renderer's old
    // fullscreen (wide) aspect ratio in place for a frame or more while
    // sizeToPreview()'s retry caught up, which is what stretched the globe
    // vertically once squeezed into the small circular button. Fixing the
    // render aspect to a square *before* the CSS display size shrinks to
    // match removes that gap entirely.
    function resetToPreview(size) {
        globeScene.setSize(size, size);
        canvas.style.position = '';
        canvas.style.inset = '';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.clipPath = '';
        canvas.style.transition = '';
        canvas.style.zIndex = '';
        btn.insertBefore(canvas, btn.firstChild);
    }

    // Runs once: after a short pause the "you made it through" text fades
    // in, holds, then fades everything but the title back out — the title
    // fades back in afterward at its new spot (a small permanent corner
    // label, see .world-hero__title.is-collapsed in styles.css), the rest
    // stays gone for good. Repositioning the title while it's already
    // invisible means only opacity ever has to animate, not position or
    // font-size (neither transitions smoothly on its own).
    let worldIntroPlayed = false;
    function playWorldIntro() {
        if (worldIntroPlayed) return;
        worldIntroPlayed = true;
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
            }, 1800);
        }, 500);
    }

    async function enterWorld() {
        if (busy || document.body.classList.contains('is-world')) return;
        busy = true;
        globeScene.controls.autoRotate = false;

        const rect = canvas.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;
        const startRadius = rect.width / 2;
        const enterFromZ = handoffZ(rect.width);

        goFixed();
        globeScene.camera.position.setZ(enterFromZ);

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

        // Awaited together rather than raced against a separately-clocked
        // setTimeout(DURATION): a setTimeout can fire a frame or two before
        // (or after) these rAF-driven tweens each internally reach t=1, and
        // a stale pending step firing after the teardown below would call
        // setViewOffset/setZ with values meant for the *other* render
        // resolution — visibly distorting the globe for a frame. Awaiting
        // the tweens' own resolution guarantees the teardown runs strictly
        // after all three have actually finished.
        await Promise.all([
            animateCameraZ(enterFromZ, REST_Z, DURATION, (z) => globeScene.camera.position.setZ(z)),
            animateValue(0, 1, DURATION, (t) => {
                globeScene.camera.setViewOffset(vw, vh, shiftX * (1 - t), shiftY * (1 - t), vw, vh);
            }),
            animateValue(0, 1, DURATION, (t) => {
                siteContent.style.opacity = String(1 - t);
                worldChrome.style.opacity = String(t);
            }),
        ]);

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
        playWorldIntro();
        busy = false;
    }

    async function exitWorld() {
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
        // getBoundingClientRect() always reports the border box (full outer
        // size) regardless of box-sizing, so the border has to be
        // subtracted to get the canvas's actual inset size.
        const targetCanvasSize = target.width - BUTTON_BORDER_WIDTH * 2;
        const targetRadius = targetCanvasSize / 2;
        const exitToZ = handoffZ(targetCanvasSize);

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

        // See enterWorld's matching comment: awaiting these guarantees the
        // teardown below (which shrinks the renderer back to the small
        // square button resolution) can't race a still-pending tween step
        // that would otherwise reapply a fullscreen view offset into that
        // now-tiny buffer and distort the globe.
        await Promise.all([
            animateCameraZ(REST_Z, exitToZ, DURATION, (z) => globeScene.camera.position.setZ(z)),
            animateValue(0, 1, DURATION, (t) => {
                globeScene.camera.setViewOffset(vw, vh, shiftX * t, shiftY * t, vw, vh);
            }),
            animateValue(0, 1, DURATION, (t) => {
                siteContent.style.opacity = String(t);
                worldChrome.style.opacity = String(1 - t);
            }),
        ]);

        globeScene.camera.clearViewOffset();
        resetToPreview(targetCanvasSize);
        globeScene.camera.position.setZ(PREVIEW_Z);
        document.body.classList.remove('is-world');
        worldChrome.hidden = true;
        siteContent.style.opacity = '1';
        globeScene.controls.autoRotate = !reduceMotion;
        busy = false;
    }

    // Marker → location: fly the camera down to stand right at the marker's
    // spot on the globe's surface, oriented parallel to the local horizon —
    // so the globe reads as a "floor" curving away beneath you with the
    // starfield as "sky" above, rather than swapping to a flat page.
    // customView, when given, is used for the camera instead of looking
    // markerId up as an anchor (see getTreeOverviewView) — markerId itself
    // is still what goes into the URL/history, since that's what identifies
    // the location regardless of how its camera pose was computed.
    function enterLocation(markerId, eyeRadius, pitchDown, customView) {
        if (busy || !document.body.classList.contains('is-world') || document.body.classList.contains('is-location')) return;
        busy = true;

        locationChrome.hidden = false;
        locationChrome.style.opacity = '0';

        return surfaceTransition.enter(customView || markerId, (t) => {
            worldChrome.style.opacity = String(1 - t);
            locationChrome.style.opacity = String(t);
        }, eyeRadius, pitchDown).then(() => {
            document.body.classList.add('is-location');
            worldChrome.hidden = true;
            locationChrome.style.opacity = '1';
            try { history.pushState({ portalWorld: true, portalLocation: true, markerId }, '', `outpost.html?id=${markerId}`); } catch (err) { /* ignore */ }
            busy = false;
        });
    }

    // Re-frames the camera on a different anchor while already inside a
    // location — used by the tree's branch switcher/leaf picker, which
    // move around without the enter/exit crossfade (location-chrome is
    // already showing).
    function moveToLocation(markerId, eyeRadius, pitchDown, customView) {
        return surfaceTransition.moveTo(customView || markerId, undefined, eyeRadius, pitchDown);
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
            // Stepping up out of the tree's branch/leaf nav is purely local
            // (no history entry per level — see isAtLocationRoot's own
            // comment), so only defer to history.back() once that stepping
            // is done and this press would actually leave the location.
            if (markerLayer && !markerLayer.isAtLocationRoot()) {
                markerLayer.exitMarker();
            } else if (history.state && history.state.portalLocation) {
                history.back();
            } else if (markerLayer) {
                markerLayer.exitMarker();
            }
        });
    }

    window.addEventListener('popstate', () => {
        if (document.body.classList.contains('is-location')) {
            // force=true: by the time a real popstate fires, the browser has
            // already popped the location's history entry regardless of how
            // deep the tree's branch/leaf nav was — so the visible state has
            // to jump straight to "fully exited" to match it, not step up
            // one level at a time (see exitMarker's own comment).
            if (markerLayer) markerLayer.exitMarker(true);
        } else if (document.body.classList.contains('is-world')) {
            exitWorld();
        }
    });
}
