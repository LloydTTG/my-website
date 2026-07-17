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

    /* ---- Globe core — a real deformed mesh, not a lighting trick. Each
       vertex is pushed outward along its own radial direction by however
       close it is to one of many fixed "peak" points, using a smoothstep
       falloff (flat derivative at both the center and the base) rather than
       a linear one — that's what gives the tops a rounded dome shape instead
       of a sharp cone point, and lets overlapping peaks blend into each
       other smoothly instead of meeting in a sharp crease. Smooth (not
       flat) shading matches that rounded-hill look. ---- */

    const GLOBE_RADIUS = 1.6;
    const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 160, 160);

    // A small seeded PRNG (mulberry32) rather than Math.random() — the
    // scatter of peaks should look random, but stay the same shape across
    // reloads instead of reshuffling every visit.
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const rand = mulberry32(1337);

    // The tree's position — declared up front (rather than down by the tree
    // construction code below) because the outlier peak placement loop also
    // needs it, to keep sharp peaks from spawning on top of the tree.
    const NORTH_DIR = new THREE.Vector3(0, 1, 0);

    // A few fixed "plains" zones are deliberately left free of peaks —
    // everywhere else, peak footprints are sized to overlap their lattice
    // neighbors so bumps chain into one another with (almost) no untouched
    // sphere showing through, instead of reading as isolated pimples.
    const PLAINS = [];
    for (let i = 0; i < 3; i++) {
        const y = rand() * 2 - 1;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = rand() * Math.PI * 2;
        PLAINS.push({
            dir: new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r),
            radius: 0.45 + rand() * 0.25,
        });
    }
    function inPlains(dir) {
        for (let i = 0; i < PLAINS.length; i++) {
            if (dir.angleTo(PLAINS[i].dir) < PLAINS[i].radius) return true;
        }
        return false;
    }

    // Kept clear of outlier peaks so the tree planted at the pole never ends
    // up with a sharp mountain spawned right on top of or beside it. Wide
    // enough to clear even the largest sharp-peak footprint (base radius up
    // to ~0.26) beyond the tree's own canopy radius (~0.19).
    const TREE_EXCLUSION_RADIUS = 0.5;
    function nearTree(dir) {
        return dir.angleTo(NORTH_DIR) < TREE_EXCLUSION_RADIUS;
    }

    // Base positions come from a dense Fibonacci sphere lattice for even
    // coverage (no clustering on one side), then each gets jittered off its
    // lattice point so the result reads as scattered/organic rather than a
    // visibly manufactured grid. Heights are biased toward small via
    // rand()**2.4 — most peaks stay low bumps, with only occasional taller
    // ones standing out.
    const LATTICE_COUNT = 260;
    const MAX_PEAK_HEIGHT = 0.096;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    const peakDirs = [];
    const peakHeights = [];
    const peakBaseRadii = [];
    for (let i = 0; i < LATTICE_COUNT; i++) {
        const y = (i + 0.5) / LATTICE_COUNT * 2 - 1;
        const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = i * goldenAngle;
        const dir = new THREE.Vector3(Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY);
        dir.x += (rand() - 0.5) * 0.22;
        dir.y += (rand() - 0.5) * 0.22;
        dir.z += (rand() - 0.5) * 0.22;
        dir.normalize();

        if (inPlains(dir)) continue;

        peakDirs.push(dir);
        peakHeights.push(0.015 + MAX_PEAK_HEIGHT * Math.pow(rand(), 2.4));
        // Deliberately wider than the lattice's own average spacing so
        // neighboring footprints overlap rather than leaving gaps.
        peakBaseRadii.push(0.17 + rand() * 0.11);
    }
    const PEAK_COUNT = peakDirs.length;

    // A handful of tall, sharp outlier mountains standing out above the
    // rounded bumps — a linear (cone) falloff instead of smoothPeak's
    // smoothstep, so these come to an actual point rather than a dome.
    // Also kept out of the plains zones and away from the tree, so those
    // stay genuinely flat and the tree never ends up buried under one.
    const SHARP_PEAK_COUNT = 6;
    const sharpPeakDirs = [];
    const sharpPeakHeights = [];
    const sharpPeakBaseRadii = [];
    for (let i = 0; i < SHARP_PEAK_COUNT; i++) {
        let dir;
        do {
            const y = rand() * 2 - 1;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = rand() * Math.PI * 2;
            dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
        } while (inPlains(dir) || nearTree(dir));
        sharpPeakDirs.push(dir);
        sharpPeakHeights.push(0.33 + rand() * 0.21);
        sharpPeakBaseRadii.push(0.16 + rand() * 0.1);
    }

    // Smoothstep: 0 at the base (t=0), 1 at the peak's center (t=1), with
    // zero slope at both ends — a rounded dome that also tapers into
    // neighboring terrain without a crease, instead of a linear cone
    // tapering to a sharp point.
    function smoothPeak(t) {
        return t * t * (3 - 2 * t);
    }

    // Shared by the vertex-displacement loop below and by anything that
    // needs to know the actual terrain height at a specific point (e.g. the
    // north-pole tree, which should plant its roots wherever the ground
    // there really ends up, not at the plain base sphere radius).
    function getTerrainHeightAt(dir) {
        let height = 0;
        for (let p = 0; p < PEAK_COUNT; p++) {
            const baseRadius = peakBaseRadii[p];
            const angle = dir.angleTo(peakDirs[p]);
            if (angle < baseRadius) {
                const h = peakHeights[p] * smoothPeak(1 - angle / baseRadius);
                if (h > height) height = h;
            }
        }
        for (let s = 0; s < SHARP_PEAK_COUNT; s++) {
            const baseRadius = sharpPeakBaseRadii[s];
            const angle = dir.angleTo(sharpPeakDirs[s]);
            if (angle < baseRadius) {
                const h = sharpPeakHeights[s] * (1 - angle / baseRadius);
                if (h > height) height = h;
            }
        }
        return height;
    }

    {
        const posAttr = globeGeometry.attributes.position;
        const vertex = new THREE.Vector3();
        const dir = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            dir.copy(vertex).normalize();
            vertex.copy(dir).multiplyScalar(GLOBE_RADIUS + getTerrainHeightAt(dir));
            posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        posAttr.needsUpdate = true;
        globeGeometry.computeVertexNormals();
    }

    const globe = new THREE.Mesh(
        globeGeometry,
        new THREE.MeshStandardMaterial({
            color: 0x6d3fc9,
            emissive: 0x2c1157,
            emissiveIntensity: 0.5,
            roughness: 0.6,
            metalness: 0.15,
        })
    );
    scene.add(globe);

    /* ---- North-pole tree — a small mystical landmark. Parented to `globe`
       (like the marker anchors below) so it rotates along with it, and
       planted at whatever height the terrain actually reaches at the pole
       rather than the plain base radius, so it doesn't float or sink if a
       peak or plains zone happens to land there. lat=π/2 always resolves to
       the same (0,1,0) direction regardless of lon, so no orientation math
       is needed — the tree's local +Y already points straight out from the
       surface there. ---- */

    const treeGroundRadius = GLOBE_RADIUS + getTerrainHeightAt(NORTH_DIR);

    const treeGroup = new THREE.Group();
    treeGroup.position.copy(NORTH_DIR).multiplyScalar(treeGroundRadius);

    const barkMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f0ff,
        emissive: 0xe8ddff,
        emissiveIntensity: 0.2,
        roughness: 0.55,
        metalness: 0.05,
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0xa06bff,
        emissive: 0x9b5cff,
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.1,
    });

    const TRUNK_HEIGHT = 0.62;
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.05, TRUNK_HEIGHT, 8),
        barkMaterial
    );
    trunk.position.y = TRUNK_HEIGHT / 2;
    treeGroup.add(trunk);

    // Several small, individually shaped/rotated leaves scattered around a
    // point, instead of one big blob mesh standing in for "a cluster of
    // leaves".
    function addLeafCluster(center, scale, count = 6) {
        const leaves = [];
        for (let i = 0; i < count; i++) {
            const offset = new THREE.Vector3(
                (rand() - 0.5) * 0.2,
                (rand() - 0.5) * 0.2,
                (rand() - 0.5) * 0.2
            ).multiplyScalar(scale);
            const leafSize = (0.05 + rand() * 0.025) * scale;
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(leafSize, 0), leafMaterial);
            leaf.position.copy(center).add(offset);
            leaf.scale.set(1, 0.55, 1.7);
            leaf.rotation.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
            treeGroup.add(leaf);
            leaves.push(leaf);
        }
        return leaves;
    }

    // Tracked per branch so the tree/branch/leaf navigation UI (built in
    // marker-layer.js) can look up "where is leaf N of branch M" and "which
    // way is branch M facing" without knowing anything about how the tree
    // itself is built.
    const BRANCH_COUNT = 5;
    const branchLeaves = []; // branchLeaves[branchIndex][slotIndex] -> THREE.Mesh
    const branchTips = [];   // branchTips[branchIndex] -> Vector3 (tree-local)

    for (let i = 0; i < BRANCH_COUNT; i++) {
        const branchAngle = (i / BRANCH_COUNT) * Math.PI * 2 + rand() * 0.4;
        const branchTilt = 0.55 + rand() * 0.25;
        const branchLength = 0.24 + rand() * 0.12;
        const startY = TRUNK_HEIGHT * (0.55 + rand() * 0.2);

        const dirOut = new THREE.Vector3(Math.cos(branchAngle), branchTilt, Math.sin(branchAngle)).normalize();
        const branchBase = new THREE.Vector3(0, startY, 0);
        const branchTip = branchBase.clone().addScaledVector(dirOut, branchLength);

        const branch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.01, 0.02, branchLength, 6),
            barkMaterial
        );
        branch.position.copy(branchBase).addScaledVector(dirOut, branchLength / 2);
        branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirOut);
        treeGroup.add(branch);

        branchTips.push(branchTip);
        branchLeaves.push(addLeafCluster(branchTip, 0.9 + rand() * 0.5));
    }

    // Crown cluster at the very top, plus the light that gives the whole
    // canopy a soft magical glow (both on the leaves and cast onto the
    // globe's own surface just beneath it). Not part of any branch, so not
    // pushed into branchLeaves — just decorative.
    const TREE_TOP = new THREE.Vector3(0, TRUNK_HEIGHT + 0.06, 0);
    addLeafCluster(TREE_TOP, 1.3);

    const treeGlow = new THREE.PointLight(0xa06bff, 4, 2.4);
    treeGlow.position.set(0, TRUNK_HEIGHT + 0.15, 0);
    treeGroup.add(treeGlow);

    globe.add(treeGroup);

    // Positions below are all "globe-local" (i.e. in the same space as
    // marker anchors, which are parented directly to `globe`) — treeGroup
    // only ever has a position offset from `globe`, never its own rotation,
    // so combining the two is a plain vector add, no matrix math needed.
    function getTreeLocalPosition() {
        return treeGroup.position.clone().add(new THREE.Vector3(0, TRUNK_HEIGHT * 0.55, 0));
    }

    function getBranchLeafCount(branchIndex) {
        const leaves = branchLeaves[branchIndex];
        return leaves ? leaves.length : 0;
    }

    function getLeafLocalPosition(branchIndex, slotIndex) {
        const leaf = branchLeaves[branchIndex] && branchLeaves[branchIndex][slotIndex];
        if (!leaf) return null;
        return treeGroup.position.clone().add(leaf.position);
    }

    // A stand-in "camera should look roughly here" point for a branch —
    // its first leaf's position, which is already fed through the exact
    // same getMarkerSurfaceView() used to fly to any other marker, so
    // switching branches reuses that one camera-framing function rather
    // than needing a whole separate one for "look at a branch".
    function getBranchLocalPosition(branchIndex) {
        return getLeafLocalPosition(branchIndex, 0) || treeGroup.position.clone().add(branchTips[branchIndex]);
    }

    // A dedicated side-on framing for the tree overview. getMarkerSurfaceView
    // always looks straight down at its target from directly above it along
    // the same radial line — correct for "stand on the surface, look at the
    // horizon", but the tree sits exactly on that same radial line itself
    // (it's planted at the pole), so that approach can only ever look down
    // the tree's own trunk, never across it. This instead places the camera
    // out to the side at roughly the tree's own mid-height, so the whole
    // thing — trunk to leaves — sits in frame at once.
    //
    // The eye position is tipped sideways from the pole by sideAngle rather
    // than pulled straight back along world Z: a raw Z-offset floats the
    // camera far off the globe's surface in open space (nothing nearby to
    // fill the frame), which makes the globe's own curved silhouette read as
    // a hard circular edge with black background all around it — like the
    // tree is sitting inside a dark ring. Tipping sideways at close to the
    // same radius normal marker views use instead keeps the camera hugging
    // nearby ground, the way standing a short distance from the tree would,
    // so there's globe surface filling the lower frame instead of void.
    // The tree sits exactly on the globe's spin axis, so combining NORTH_DIR
    // with a fixed tangent direction is safe regardless of the globe's
    // current rotation (spinning around an axis doesn't move points already
    // on it, or the fixed world-space directions used to look at them from).
    function getTreeOverviewView(sideAngle = 0.85, eyeRadius = 2.5) {
        const treeHeight = TRUNK_HEIGHT + 0.35; // roughly base to the top of the crown
        const lookAt = treeGroup.position.clone().add(new THREE.Vector3(0, treeHeight * 0.5, 0));
        const tangent = new THREE.Vector3(0, 0, 1);
        const eyeDir = NORTH_DIR.clone().multiplyScalar(Math.cos(sideAngle))
            .addScaledVector(tangent, Math.sin(sideAngle))
            .normalize();
        const eyePos = eyeDir.multiplyScalar(eyeRadius);
        const up = new THREE.Vector3(0, 1, 0);
        const m = new THREE.Matrix4().lookAt(eyePos, lookAt, up);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
        return { position: eyePos, quaternion, up };
    }

    // A dedicated framing for a single branch, same reasoning as
    // getTreeOverviewView: getMarkerSurfaceView's "stand on the surface,
    // look at the horizon" math was never actually aimed at the branch's
    // own leaves, just its first leaf's bare position with a generic
    // tangent-based look direction — close enough to be misleading (the
    // branch was roughly in frame) but not centered, which is exactly what
    // made the overshoot and made leaves hard to click. This instead looks
    // straight at the centroid of the branch's own leaf cluster. Unlike the
    // tree, a branch is *not* on the globe's spin axis — it's offset out to
    // the side of the trunk — so its world position genuinely does change
    // as the globe spins, and localToWorld() (using the current, possibly
    // stale-by-one-frame matrixWorld — the same caveat every other
    // anchor-based lookup here already carries) is needed to place it
    // correctly, unlike the tree's fixed local-equals-world shortcut.
    function getBranchView(branchIndex, viewDistance = 1.1) {
        const leaves = branchLeaves[branchIndex];
        if (!leaves || !leaves.length) return null;

        const centroidLocal = new THREE.Vector3();
        leaves.forEach((leaf) => centroidLocal.add(leaf.position));
        centroidLocal.divideScalar(leaves.length).add(treeGroup.position);

        const lookAt = globe.localToWorld(centroidLocal.clone());
        const treeBaseWorld = globe.localToWorld(treeGroup.position.clone());
        const outDir = lookAt.clone().sub(treeBaseWorld).normalize();
        const eyePos = lookAt.clone().addScaledVector(outDir, viewDistance);

        const worldUp = new THREE.Vector3(0, 1, 0);
        const up = Math.abs(outDir.dot(worldUp)) > 0.98 ? new THREE.Vector3(1, 0, 0) : worldUp;
        const m = new THREE.Matrix4().lookAt(eyePos, lookAt, up);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
        return { position: eyePos, quaternion, up };
    }

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

    /* ---- Marker anchors — points pinned to the globe's surface ----
       Each is an Object3D parented to `globe` so it rotates along with it;
       getMarkerScreenPosition(id) projects it to screen space each frame
       for an HTML dot/label to follow. Markers are managed by id (matching
       their `globe_markers` row) so any number can exist at once, added/
       removed/moved at runtime by the admin marker layer. */

    const MARKER_RADIUS = 1.65;
    const MARKER_SCREEN_LIFT = 16;
    const markerAnchors = new Map();
    // Anchors placed via an explicit localPosition (tree/branch/leaf) rather
    // than lat/lon — see getMarkerScreenPosition for why these skip the
    // surface-facing visibility check.
    const offSurfaceAnchors = new Set();

    function latLonToLocalPosition(lat, lon, target = new THREE.Vector3()) {
        // lon 0 points toward +Z (the camera starts at +Z looking toward the
        // origin), so lon=0 sits on the near side, not the far side.
        return target.set(
            MARKER_RADIUS * Math.cos(lat) * Math.sin(lon),
            MARKER_RADIUS * Math.sin(lat),
            MARKER_RADIUS * Math.cos(lat) * Math.cos(lon)
        );
    }

    // localPosition (a THREE.Vector3, in globe-local space) lets a caller
    // place an anchor somewhere that isn't a point on the sphere's own
    // surface — used for the tree and its leaves, which sit above the
    // surface on the tree's own geometry rather than at a lat/lon on it.
    // When omitted, behaves exactly as before.
    function addMarker(id, lat, lon, localPosition) {
        const anchor = new THREE.Object3D();
        if (localPosition) {
            anchor.position.copy(localPosition);
            offSurfaceAnchors.add(id);
        } else {
            latLonToLocalPosition(lat, lon, anchor.position);
        }
        globe.add(anchor);
        markerAnchors.set(id, anchor);
        return anchor;
    }

    function removeMarker(id) {
        const anchor = markerAnchors.get(id);
        if (!anchor) return;
        globe.remove(anchor);
        markerAnchors.delete(id);
        offSurfaceAnchors.delete(id);
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
        const projected = markerWorldPos.clone().project(camera);
        renderer.getSize(rendererSize);
        const x = (projected.x * 0.5 + 0.5) * rendererSize.width;
        // Nudged up a bit from the exact projected point, like a map pin
        // floating slightly above where it's planted rather than centered
        // dead-on it.
        const y = (-projected.y * 0.5 + 0.5) * rendererSize.height - MARKER_SCREEN_LIFT;

        // Tree/branch/leaf hotspots sit above the surface on the tree's own
        // geometry rather than flat against the sphere, so "facing away
        // from the outward surface normal at this point" isn't a meaningful
        // visibility test for them the way it is for a marker planted
        // directly on the globe — e.g. viewed side-on (the tree overview),
        // their own outward-from-origin direction is nearly perpendicular
        // to the camera's viewing direction even though they're plainly on
        // screen. Their on/off visibility is already controlled explicitly
        // (the .hidden toggles in marker-layer.js's tree nav), so just the
        // in-frustum check applies here.
        if (offSurfaceAnchors.has(id)) {
            return { x, y, visible: projected.z < 1 };
        }

        // globe is centered on the origin, so a surface marker's world
        // position doubles as its outward surface normal.
        markerNormal.copy(markerWorldPos).normalize();
        camToMarker.copy(camera.position).sub(markerWorldPos).normalize();
        const facingCamera = markerNormal.dot(camToMarker) > 0.12;

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
        BRANCH_COUNT, getTreeLocalPosition, getBranchLeafCount, getLeafLocalPosition, getBranchLocalPosition,
        getTreeOverviewView, getBranchView,
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

    // markerId can be a marker id (string, looked up via getMarkerSurfaceView
    // as usual) or an already-built { position, quaternion, up } view object
    // — the tree overview needs a camera pose getMarkerSurfaceView can't
    // produce (see getTreeOverviewView's comment), so it passes one straight
    // through instead of naming an anchor.
    function resolveView(markerId, eyeRadius, pitchDown) {
        return typeof markerId === 'string'
            ? globeScene.getMarkerSurfaceView(markerId, eyeRadius, pitchDown)
            : markerId;
    }

    async function enter(markerId, onProgress, eyeRadius, pitchDown) {
        if (busy) return;
        busy = true;
        globeScene.controls.autoRotate = false;
        globeScene.setInteractive(false);
        globeScene.setSpinning(false);
        globeScene.setCustomCamera(true);

        savedState = captureCameraState();
        const target = resolveView(markerId, eyeRadius, pitchDown);

        await Promise.all([
            animateCamera(savedState, target),
            onProgress ? animateValue(0, 1, dur, onProgress) : Promise.resolve(),
        ]);
        busy = false;
    }

    // Re-frames the camera on a different marker/anchor without touching
    // savedState — used to switch between the tree's branches while still
    // "inside" it, so exit() still returns all the way out to wherever the
    // globe view was before the tree was ever entered, not just to the
    // most-recently-viewed branch.
    async function moveTo(id, onProgress, eyeRadius, pitchDown) {
        if (busy) return;
        busy = true;
        const current = captureCameraState();
        const target = resolveView(id, eyeRadius, pitchDown);

        await Promise.all([
            animateCamera(current, target),
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

    return { enter, exit, moveTo, get busy() { return busy; } };
}
