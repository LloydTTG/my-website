/* ================================================================
   globe-scene.js — shared Three.js portal-globe builder
   Used both by the tiny hero-button preview and the full-screen
   world view, so it's the exact same live scene throughout —
   growing/zooming, never swapping to a different render.
   ================================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createGlobeScene(canvas, { cameraZ = 6, interactive = true } = {}) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0714, 0.035);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 0.4, cameraZ);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    /* ---- Lights ---- */

    scene.add(new THREE.AmbientLight(0x33264d, 1.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 3, 5);
    scene.add(keyLight);

    const purpleLight = new THREE.PointLight(0x9b5cff, 6, 14);
    purpleLight.position.set(-3, -1, 3);
    scene.add(purpleLight);

    /* ---- Starfield ---- */

    const starCount = 2400;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const radius = 30 + Math.random() * 60;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.07,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
    }));
    scene.add(stars);

    /* ---- Globe core ---- */

    const globe = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.6, 12),
        new THREE.MeshStandardMaterial({
            color: 0x6d3fc9,
            emissive: 0x2c1157,
            emissiveIntensity: 0.6,
            roughness: 0.45,
            metalness: 0.25,
        })
    );
    scene.add(globe);

    /* ---- Wireframe shell (lat/long look) ---- */

    const wire = new THREE.Mesh(
        new THREE.SphereGeometry(1.63, 36, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.18 })
    );
    scene.add(wire);

    /* ---- Atmosphere glow (fresnel-style) ---- */

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 48, 48),
        new THREE.ShaderMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            uniforms: {
                glowColor: { value: new THREE.Color(0xa06bff) },
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                uniform vec3 glowColor;
                void main() {
                    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
                    gl_FragColor = vec4(glowColor, intensity);
                }
            `,
        })
    );
    scene.add(atmosphere);

    /* ---- Orbiting ring ---- */

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.01, 8, 128),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
    );
    ring.rotation.x = Math.PI / 2.3;
    scene.add(ring);

    /* ---- Marker anchors — points pinned to the globe's surface ----
       Each is an Object3D parented to `globe` so it rotates along with it;
       getMarkerScreenPosition(id) projects it to screen space each frame
       for an HTML dot/label to follow. Markers are managed by id (matching
       their `globe_markers` row) so any number can exist at once, added/
       removed/moved at runtime by the admin marker layer. */

    const MARKER_RADIUS = 1.65;
    const MARKER_SCREEN_LIFT = 16;
    const markerAnchors = new Map();

    function latLonToLocalPosition(lat, lon, target = new THREE.Vector3()) {
        // lon 0 points toward +Z (the camera starts at +Z looking toward the
        // origin), so lon=0 sits on the near side, not the far side.
        return target.set(
            MARKER_RADIUS * Math.cos(lat) * Math.sin(lon),
            MARKER_RADIUS * Math.sin(lat),
            MARKER_RADIUS * Math.cos(lat) * Math.cos(lon)
        );
    }

    function addMarker(id, lat, lon) {
        const anchor = new THREE.Object3D();
        latLonToLocalPosition(lat, lon, anchor.position);
        globe.add(anchor);
        markerAnchors.set(id, anchor);
        return anchor;
    }

    function removeMarker(id) {
        const anchor = markerAnchors.get(id);
        if (!anchor) return;
        globe.remove(anchor);
        markerAnchors.delete(id);
    }

    function setMarkerPosition(id, lat, lon) {
        const anchor = markerAnchors.get(id);
        if (!anchor) return;
        latLonToLocalPosition(lat, lon, anchor.position);
    }

    const markerWorldPos = new THREE.Vector3();
    const markerNormal = new THREE.Vector3();
    const camToMarker = new THREE.Vector3();
    const rendererSize = new THREE.Vector2();

    function getMarkerScreenPosition(id) {
        const anchor = markerAnchors.get(id);
        if (!anchor) return { x: 0, y: 0, visible: false };

        anchor.getWorldPosition(markerWorldPos);
        // globe is centered on the origin, so the marker's world position
        // doubles as its outward surface normal.
        markerNormal.copy(markerWorldPos).normalize();
        camToMarker.copy(camera.position).sub(markerWorldPos).normalize();
        const facingCamera = markerNormal.dot(camToMarker) > 0.12;

        const projected = markerWorldPos.clone().project(camera);
        renderer.getSize(rendererSize);
        const x = (projected.x * 0.5 + 0.5) * rendererSize.width;
        // Nudged up a bit from the exact projected point, like a map pin
        // floating slightly above where it's planted rather than centered
        // dead-on it.
        const y = (-projected.y * 0.5 + 0.5) * rendererSize.height - MARKER_SCREEN_LIFT;

        return { x, y, visible: facingCamera && projected.z < 1 };
    }

    // Raycasts a screen point against the globe's surface and returns the
    // lat/lon (radians, same convention as latLonToLocalPosition) it hit, or
    // null if the ray misses — used for admin "click to place"/"drag to
    // move" marker placement.
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const localHit = new THREE.Vector3();

    function pickLatLon(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        const hits = raycaster.intersectObject(globe, false);
        if (!hits.length) return null;

        globe.worldToLocal(localHit.copy(hits[0].point));
        localHit.normalize();
        const lat = Math.asin(THREE.MathUtils.clamp(localHit.y, -1, 1));
        const lon = Math.atan2(localHit.x, localHit.z);
        return { lat, lon };
    }

    /* ---- Controls ---- */

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 16;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.05;
    controls.enabled = interactive;

    /* ---- Animate ---- */

    const SPIN_SPEED = 0.006;
    const WIRE_SPIN_RATIO = 0.05 / 0.08;
    const RING_SPIN_RATIO = 0.12 / 0.08;

    const clock = new THREE.Clock();
    let lastElapsed = 0;
    let spinAngle = 0;
    let spinning = true;
    let customCamera = false;

    function animate() {
        requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();
        const delta = elapsed - lastElapsed;
        lastElapsed = elapsed;

        if (spinning) spinAngle += delta * SPIN_SPEED;
        globe.rotation.y = spinAngle;
        wire.rotation.y = spinAngle * WIRE_SPIN_RATIO;
        ring.rotation.z = spinAngle * RING_SPIN_RATIO;
        stars.rotation.y = elapsed * 0.01;

        // Skipped while a caller (e.g. the fly-to-surface marker transition)
        // is driving camera.position/quaternion/up directly — OrbitControls'
        // update() unconditionally ends with camera.lookAt(target), which
        // would stomp any custom orientation every frame regardless of
        // `enabled`.
        if (!customCamera) controls.update();
        renderer.render(scene, camera);
    }

    animate();

    /* ---- Public handle ---- */

    function setSize(width, height) {
        if (width <= 0 || height <= 0) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    }

    function setInteractive(value) {
        controls.enabled = value;
    }

    function setSpinning(value) {
        spinning = value;
    }

    function setCustomCamera(value) {
        customCamera = value;
    }

    // The viewpoint for "standing" at the marker's spot on the globe: eye
    // position just above the surface along the marker's outward normal,
    // oriented so `up` matches that normal and looking mostly along the
    // tangent to the surface (parallel to the horizon), pitched down just
    // enough that the globe's curve sits in the lower part of the frame —
    // sky and stars above, the glowing ground curving away below.
    function getMarkerSurfaceView(id, eyeRadius = 2.0, pitchDown = 0.18, lookAheadDistance = 1) {
        const anchor = markerAnchors.get(id);
        const markerDir = new THREE.Vector3();
        anchor.getWorldPosition(markerDir);
        markerDir.normalize();

        const eyePos = markerDir.clone().multiplyScalar(eyeRadius);

        const worldUp = new THREE.Vector3(0, 1, 0);
        let tangent = new THREE.Vector3().crossVectors(worldUp, markerDir);
        if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
        tangent.normalize();

        const lookDir = tangent.clone().multiplyScalar(Math.cos(pitchDown))
            .addScaledVector(markerDir, -Math.sin(pitchDown))
            .normalize();

        const lookAtPoint = eyePos.clone().addScaledVector(lookDir, lookAheadDistance);

        // Object3D.lookAt() swaps its eye/target arguments for non-camera
        // objects (see three.js source), so a throwaway Object3D computes
        // the orientation backwards for our purposes. Matrix4.lookAt()
        // itself uses the camera convention (eye, target, up) directly.
        const m = new THREE.Matrix4().lookAt(eyePos, lookAtPoint, markerDir);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);

        return { position: eyePos, quaternion, up: markerDir.clone() };
    }

    return {
        scene, camera, renderer, controls, setSize, setInteractive, reduceMotion,
        addMarker, removeMarker, setMarkerPosition, getMarkerScreenPosition, pickLatLon,
        setSpinning, setCustomCamera, getMarkerSurfaceView,
    };
}

// Keeps an HTML element visually pinned to a marker's point on the globe,
// hiding it when that point has rotated to the far side. Runs indefinitely —
// cheap (one projection per frame) and harmless while its element is hidden
// behind [hidden]/display:none ancestors. Returns a stop() function so
// callers can tear it down when a marker is deleted.
export function followMarker(globeScene, id, el) {
    let stopped = false;
    function update() {
        if (stopped) return;
        requestAnimationFrame(update);
        const { x, y, visible } = globeScene.getMarkerScreenPosition(id);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.classList.toggle('is-facing-away', !visible);
    }
    update();
    return () => { stopped = true; };
}

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

// Shared "fly the camera to the marker's surface viewpoint and back" driver —
// used by both the in-page transition on index.html and the equivalent one
// on world.html, so the tricky bits (saving/restoring camera state, pausing
// OrbitControls' update() so it doesn't fight the custom orientation) live
// in exactly one place. Callers own their own DOM/opacity/history changes,
// passed in as an onProgress(t) callback for each direction.
export function createSurfaceTransition(globeScene, { duration = 1800, reduceMotion } = {}) {
    const dur = (reduceMotion ?? globeScene.reduceMotion) ? 0 : duration;
    let savedState = null;
    let busy = false;

    function captureCameraState() {
        return {
            position: globeScene.camera.position.clone(),
            quaternion: globeScene.camera.quaternion.clone(),
            up: globeScene.camera.up.clone(),
        };
    }

    function animateCamera(from, to) {
        return animateValue(0, 1, dur, (t) => {
            globeScene.camera.position.lerpVectors(from.position, to.position, t);
            globeScene.camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
            globeScene.camera.up.lerpVectors(from.up, to.up, t).normalize();
        });
    }

    async function enter(markerId, onProgress) {
        if (busy) return;
        busy = true;
        globeScene.controls.autoRotate = false;
        globeScene.setInteractive(false);
        globeScene.setSpinning(false);
        globeScene.setCustomCamera(true);

        savedState = captureCameraState();
        const target = globeScene.getMarkerSurfaceView(markerId);

        await Promise.all([
            animateCamera(savedState, target),
            onProgress ? animateValue(0, 1, dur, onProgress) : Promise.resolve(),
        ]);
        busy = false;
    }

    async function exit(onProgress) {
        if (busy || !savedState) return;
        busy = true;
        const current = captureCameraState();

        await Promise.all([
            animateCamera(current, savedState),
            onProgress ? animateValue(0, 1, dur, onProgress) : Promise.resolve(),
        ]);

        globeScene.setCustomCamera(false);
        globeScene.setInteractive(true);
        globeScene.setSpinning(true);
        globeScene.controls.autoRotate = !(reduceMotion ?? globeScene.reduceMotion);
        busy = false;
    }

    return { enter, exit, get busy() { return busy; } };
}
