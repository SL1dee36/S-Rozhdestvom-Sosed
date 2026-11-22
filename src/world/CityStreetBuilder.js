import * as THREE from 'three';
import { GameObject, BoxCollider, RigidBody, ParticleEmitter } from '../../lumina/index.js';
import { buildArticulatedHuman } from './CharacterMeshBuilder.js';

/**
 * Builds the full explorable winter Soviet microdistrict ("Заречное") connecting
 * the player's wide ground-floor Podiezd (#2, X=96, Z=50) through multiple
 * distinct neighborhood districts (courtyard, garages, snowy park alley, main
 * traffic avenue with driving cars & walking pedestrians, and storefront square)
 * to the «Продукты 24» grocery store (X=60, Z=0).
 *
 * Everything is located at X > 30 with category 'store' so Store <-> Apartment
 * zone culling automatically loads/unloads the entire city district as one zone.
 */
export function buildCityStreetAndPodiezd(builder, OX, OY, OZ, halfD) {
    const { scene, engine, materials, tex } = builder;
    const streetLights = [];
    const reg = (obj, name, cat = 'store', extra = {}) => {
        builder._registerEditable(obj, name, { category: cat, extra });
        return obj;
    };

    // Shared street materials
    const extFacadeMat = builder._ps1Mat({ map: materials.concrete.map, color: 0x626872, roughness: 0.94 });
    const darkFacadeMat = builder._ps1Mat({ map: materials.concrete.map, color: 0x454b56, roughness: 0.95 });
    const brickFacadeMat = builder._ps1Mat({ map: materials.concrete.map, color: 0x6b5349, roughness: 0.94 });
    const plinthMat = builder._ps1Mat({ color: 0x383c44, roughness: 0.96 });
    const garageMat = builder._ps1Mat({ map: materials.metal.map, color: 0x4b5652, roughness: 0.85, metalness: 0.35 });
    const garageRustMat = builder._ps1Mat({ map: materials.metal.map, color: 0x5c4236, roughness: 0.88, metalness: 0.3 });
    const woodBenchMat = builder._ps1Mat({ color: 0x523620, roughness: 0.90 });
    const ironDarkMat = builder._ps1Mat({ map: materials.metal.map, color: 0x2a3330, roughness: 0.78, metalness: 0.55 });
    const ironRustMat = builder._ps1Mat({ color: 0x4f3020, roughness: 0.92, metalness: 0.35 });
    const mailboxMat = builder._ps1Mat({ color: 0x2c4b75, roughness: 0.65, metalness: 0.25 });
    const winWarmMat = new THREE.MeshBasicMaterial({ color: 0xdca94f });
    const winTvMat = new THREE.MeshBasicMaterial({ color: 0x5f8ad1 });
    const winDarkMat = new THREE.MeshBasicMaterial({ color: 0x0a0f18 });
    const snowMat = materials.snow;

    // 1. Massive Snowy Ground Slab covering the entire neighborhood (X: 34..116, Z: +6.3..+62)
    const cityGround = builder._addStaticBox('StoreCityGround', 75.0, OY - 0.12, 34.0, 84.0, 0.24, 58.0, snowMat, { castShadow: false });
    if (cityGround?.go?.transform?.userData) {
        cityGround.go.transform.userData.landscape = true;
        cityGround.go.transform.userData.defaultLandscape = true;
    }

    // 1b. Paintable Dirty-Snow Trail Canvas Overlay (covers X: 30..136, Z: -12..80 directly on top of street snow)
    const TRAIL_BOUNDS = { minX: 30, maxX: 136, minZ: -12, maxZ: 80, res: 1024 };
    const trailW = TRAIL_BOUNDS.maxX - TRAIL_BOUNDS.minX;
    const trailD = TRAIL_BOUNDS.maxZ - TRAIL_BOUNDS.minZ;
    const trailCanvas = document.createElement('canvas');
    trailCanvas.width = TRAIL_BOUNDS.res;
    trailCanvas.height = TRAIL_BOUNDS.res;
    const trailCtx = trailCanvas.getContext('2d');
    const trailTex = new THREE.CanvasTexture(trailCanvas);
    trailTex.magFilter = THREE.NearestFilter;
    trailTex.minFilter = THREE.LinearFilter;
    trailTex.generateMipmaps = false;
    trailTex.colorSpace = THREE.SRGBColorSpace;
    const trailMat = builder._ps1Mat({
        map: trailTex,
        transparent: true,
        roughness: 0.94,
        metalness: 0.0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
    });
    const trailOverlay = new THREE.Mesh(new THREE.PlaneGeometry(trailW, trailD, 40, 40), trailMat);
    trailOverlay.rotation.x = -Math.PI / 2;
    trailOverlay.position.set(
        (TRAIL_BOUNDS.minX + TRAIL_BOUNDS.maxX) * 0.5,
        OY + 0.052,
        (TRAIL_BOUNDS.minZ + TRAIL_BOUNDS.maxZ) * 0.5
    );
    trailOverlay.renderOrder = 2;
    trailOverlay.receiveShadow = true;
    trailOverlay.name = 'StoreCityTrailOverlay';
    trailOverlay.userData.category = 'store';
    scene.add(trailOverlay);

    builder.syncTrailOverlayToGround = () => {
        const groundObj = builder._editableByName?.get('StoreCityGround');
        const ld = groundObj?.userData?.landscapeData;
        const pos = trailOverlay.geometry.attributes.position;
        if (!ld || !groundObj) {
            for (let i = 0; i < pos.count; i++) pos.setZ(i, 0);
            pos.needsUpdate = true;
            return;
        }
        const [gw, gh, gd] = groundObj.userData.boxSize || [84, 0.24, 58];
        const gx0 = groundObj.position.x;
        const gz0 = groundObj.position.z;
        const gTopY = groundObj.position.y + gh * 0.5;
        const { segX, segZ, heights } = ld;
        const cols = segX + 1;
        const cx = trailOverlay.position.x;
        const cz = trailOverlay.position.z;
        const baseOverlayY = trailOverlay.position.y;
        for (let i = 0; i < pos.count; i++) {
            const wx = cx + pos.getX(i);
            const wz = cz - pos.getY(i); // PlaneGeometry rotated -PI/2 around X maps local +Y to world -Z
            const lx = wx - gx0;
            const lz = wz - gz0;
            if (Math.abs(lx) <= gw * 0.5 && Math.abs(lz) <= gd * 0.5) {
                const ix = Math.max(0, Math.min(segX, Math.round(((lx + gw * 0.5) / gw) * segX)));
                const iz = Math.max(0, Math.min(segZ, Math.round(((lz + gd * 0.5) / gd) * segZ)));
                const targetWorldY = gTopY + (heights[iz * cols + ix] || 0) + 0.052;
                pos.setZ(i, targetWorldY - baseOverlayY);
            } else {
                pos.setZ(i, 0);
            }
        }
        pos.needsUpdate = true;
    };

    const worldToTrailPx = (wx, wz) => [
        ((wx - TRAIL_BOUNDS.minX) / trailW) * TRAIL_BOUNDS.res,
        ((wz - TRAIL_BOUNDS.minZ) / trailD) * TRAIL_BOUNDS.res
    ];

    const paintDabOnTrail = (wx, wz, radiusM, erase = false) => {
        const [cx, cy] = worldToTrailPx(wx, wz);
        const rx = (radiusM / trailW) * TRAIL_BOUNDS.res;
        const ry = (radiusM / trailD) * TRAIL_BOUNDS.res;
        const r = Math.max(2, (rx + ry) * 0.5);

        trailCtx.save();
        if (erase) {
            trailCtx.globalCompositeOperation = 'destination-out';
            const g = trailCtx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            trailCtx.fillStyle = g;
            trailCtx.beginPath();
            trailCtx.arc(cx, cy, r, 0, Math.PI * 2);
            trailCtx.fill();
            trailCtx.restore();
            return;
        }

        // Soft dirty-snow / slush base dab
        const g = trailCtx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
        g.addColorStop(0, 'rgba(116, 110, 100, 0.92)');
        g.addColorStop(0.65, 'rgba(136, 132, 122, 0.72)');
        g.addColorStop(1, 'rgba(155, 152, 144, 0.0)');
        trailCtx.fillStyle = g;
        trailCtx.beginPath();
        trailCtx.arc(cx, cy, r, 0, Math.PI * 2);
        trailCtx.fill();

        // Deterministic grit, salt & footprint texture inside the dab
        let seed = ((Math.round(wx * 31) * 73856093) ^ (Math.round(wz * 31) * 19349663)) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return (seed & 0xffff) / 65536;
        };
        const specks = Math.min(24, Math.max(6, Math.round(r * 1.4)));
        for (let i = 0; i < specks; i++) {
            const ang = rand() * Math.PI * 2;
            const dist = Math.sqrt(rand()) * r * 0.85;
            const sx = cx + Math.cos(ang) * dist;
            const sy = cy + Math.sin(ang) * dist;
            const pick = i % 3;
            trailCtx.fillStyle = pick === 0
                ? 'rgba(62, 54, 44, 0.42)'
                : (pick === 1 ? 'rgba(92, 82, 68, 0.35)' : 'rgba(196, 200, 206, 0.32)');
            const sz = 1.5 + rand() * 2.2;
            trailCtx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
        }
        trailCtx.restore();
    };

    builder.paintStreetTrailSegment = (x1, z1, x2, z2, radiusM = 0.9, erase = false) => {
        const dist = Math.hypot(x2 - x1, z2 - z1);
        const step = Math.max(0.12, radiusM * 0.32);
        const count = Math.max(1, Math.ceil(dist / step));
        for (let i = 0; i <= count; i++) {
            const t = count === 0 ? 0 : i / count;
            paintDabOnTrail(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, radiusM, erase);
        }
        trailTex.needsUpdate = true;
    };

    builder.redrawStreetTrail = (strokes = []) => {
        trailCtx.clearRect(0, 0, TRAIL_BOUNDS.res, TRAIL_BOUNDS.res);
        if (Array.isArray(strokes)) {
            for (const st of strokes) {
                if (!st || !Array.isArray(st.pts) || st.pts.length === 0) continue;
                const rad = Number(st.r) || 0.9;
                const erase = !!st.erase;
                if (st.pts.length === 1) {
                    paintDabOnTrail(st.pts[0][0], st.pts[0][1], rad, erase);
                } else {
                    for (let i = 1; i < st.pts.length; i++) {
                        const a = st.pts[i - 1];
                        const b = st.pts[i];
                        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
                        const step = Math.max(0.12, rad * 0.32);
                        const count = Math.max(1, Math.ceil(dist / step));
                        for (let k = 0; k <= count; k++) {
                            const t = k / count;
                            paintDabOnTrail(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rad, erase);
                        }
                    }
                }
            }
        }
        trailTex.needsUpdate = true;
    };

    // 2. Main Winter Asphalt Avenue (East-West at Z = 18.0 .. 24.4) with snow-topped curbs & crosswalk
    const aveTex = tex.createAsphaltRoadTexture(18, 1);
    const aveMat = builder._ps1Mat({ map: aveTex, roughness: 0.92 });
    const curbMat = builder._ps1Mat({ map: materials.concrete.map, color: 0x7b828c, roughness: 0.92 });
    builder._addStaticBox('StoreCityAvenue', 75.0, OY + 0.02, 21.2, 82.0, 0.05, 6.2, aveMat, { collide: false, worldUV: false });
    builder._addStaticBox('StoreCityCurbN', 75.0, OY + 0.07, 17.95, 82.0, 0.14, 0.22, curbMat, { collide: false });
    builder._addStaticBox('StoreCityCurbS', 75.0, OY + 0.07, 24.45, 82.0, 0.14, 0.22, curbMat, { collide: false });
    builder._addStaticBox('StoreCityCurbSnowN', 75.0, OY + 0.15, 17.85, 82.0, 0.08, 0.28, snowMat, { collide: false });
    builder._addStaticBox('StoreCityCurbSnowS', 75.0, OY + 0.15, 24.55, 82.0, 0.08, 0.28, snowMat, { collide: false });

    // Faded Soviet pedestrian crosswalk stripes across the avenue at X = 74
    const stripeMat = builder._ps1Mat({ color: 0xc2c8ce, roughness: 0.92 });
    const crosswalkGroup = new THREE.Group();
    crosswalkGroup.position.set(74.0, OY + 0.05, 21.2);
    for (let z = 18.8; z <= 23.6; z += 0.95) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.015, 0.42), stripeMat);
        stripe.position.set(0, 0, z - 21.2);
        crosswalkGroup.add(stripe);
    }
    scene.add(crosswalkGroup);
    reg(crosswalkGroup, 'StoreCityCrosswalk');

    // 3. Connected Network of Cleared Winter Footpaths through the Districts
    const addWalkway = (name, x, z, w, d, repY = 6, rotY = 0) => {
        const wTex = tex.createWalkwayTexture(1, repY);
        const wMat = builder._ps1Mat({ map: wTex, roughness: 0.90 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), wMat);
        mesh.position.set(x, OY + 0.02, z);
        if (rotY) mesh.rotation.y = rotY;
        scene.add(mesh);
        return reg(mesh, name);
    };
    // Path A: From Player's Podiezd (X=96, Z=50) North through Courtyard to Z=34
    addWalkway('StoreWalkway_Podiezd', 96.0, 42.0, 2.5, 16.0, 7);
    // Path B: West through Snowy Park Alley (Z=34, X=74..96)
    addWalkway('StoreWalkway_Alley', 85.0, 34.0, 2.5, 24.0, 10, Math.PI / 2);
    // Path C: North from Alley (X=74, Z=34) across Avenue (Z=21.2) to Storefront Plaza (Z=14)
    addWalkway('StoreWalkway_CrossS', 74.0, 29.2, 2.6, 10.0, 5);
    addWalkway('StoreWalkway_CrossN', 74.0, 14.8, 2.6, 6.8, 4);
    // Path D: Sidewalk along North side of Avenue West to Storefront (Z=14.2, X=56..76)
    addWalkway('StoreWalkway_NorthSidewalk', 65.0, 14.2, 2.6, 22.0, 10, Math.PI / 2);
    // Path E: Into «Продукты 24» entrance steps (X=60, Z=6.3..14.2)
    addWalkway('StoreWalkway_StoreEntry', OX, 10.2, 3.2, 8.2, 4);
    // Path F: Optional West Residential & Garage Loop (X=52..74, Z=34..42)
    addWalkway('StoreWalkway_WestLoop', 62.0, 34.0, 2.2, 22.0, 10, Math.PI / 2);

    // 4. Street Direction Signs (so player can explore & navigate the microdistrict to find the store!)
    const addStreetSign = (name, x, z, rotY, topTxt, botTxt) => {
        const g = new THREE.Group();
        g.position.set(x, OY, z);
        g.rotation.y = rotY;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.75, 6), materials.metal);
        pole.position.y = 1.375;
        const board = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.44, 0.05),
            builder._ps1Mat({ map: tex.createStreetSignTexture(topTxt, botTxt), roughness: 0.74 })
        );
        board.position.set(0, 2.48, 0.04);
        g.add(pole, board);
        scene.add(g);
        return reg(g, name);
    };
    addStreetSign('StoreStreetSign_0', 93.8, 35.6, Math.PI * 0.25, 'УЛ. ЗАРЕЧНАЯ', '← СКВЕР / МАГАЗИН');
    addStreetSign('StoreStreetSign_1', 72.0, 25.8, 0, 'ПР. ЛЕНИНА', '← ПРОДУКТЫ 24');
    addStreetSign('StoreStreetSign_2', 72.0, 15.6, Math.PI, 'ТОРГОВАЯ ПЛ.', 'ПОДЪЕЗД №2 →');

    // =========================================================================
    // 5. WIDE DETAILED GROUND-FLOOR PODIEZD («Подъезд №2», X=96, Z=50..57.4)
    // =========================================================================
    const PX = 96.0;
    const PZ_N = 50.0; // Exterior entrance wall (faces -Z into courtyard)
    const PZ_S = 57.4; // Back wall behind stairs
    const PW = 6.2;    // Wide 6.2m lobby! (X: 92.9 .. 99.1)
    const PH = 3.35;   // Ground-floor lobby ceiling height
    const SHAFT_H = 10.2; // Full 3-story stairwell shaft height so stairs never clip into a ceiling!

    builder._addStaticBox('StorePodiezdFloor', PX, OY - 0.05, (PZ_N + PZ_S) * 0.5, PW + 0.4, 0.14, 7.8, materials.concrete, { castShadow: false });
    // Front lobby ceiling covers only the entrance hall (Z: 50.0 .. 53.55), leaving the stairwell shaft open above the stairs!
    builder._addStaticBox('StorePodiezdCeiling', PX, OY + PH + 0.12, PZ_N + 1.78, PW + 0.6, 0.24, 3.56, materials.ceiling, { castShadow: false });
    // High shaft roof capping the top of the 3-story stairwell
    builder._addStaticBox('StorePodiezdShaftRoof', PX, OY + SHAFT_H + 0.12, PZ_N + 5.0, PW + 0.6, 0.24, 5.2, materials.ceiling, { castShadow: false });
    // Full-height stairwell walls enclosing the ground lobby and all upper flights/landings
    builder._addStaticBox('StorePodiezdWallW', PX - PW * 0.5, OY + SHAFT_H * 0.5, (PZ_N + PZ_S) * 0.5, 0.22, SHAFT_H, 7.6, materials.stairwellWall);
    builder._addStaticBox('StorePodiezdWallE', PX + PW * 0.5, OY + SHAFT_H * 0.5, (PZ_N + PZ_S) * 0.5, 0.22, SHAFT_H, 7.6, materials.stairwellWall);
    builder._addStaticBox('StorePodiezdWallS', PX, OY + SHAFT_H * 0.5, PZ_S, PW + 0.4, SHAFT_H, 0.22, materials.stairwellWall);
    // Upper north wall closing the stairwell shaft above the 1st-floor lobby (at Z = PZ_N + 2.45)
    builder._addStaticBox('StorePodiezdShaftWallN', PX, OY + PH + (SHAFT_H - PH) * 0.5, PZ_N + 2.45, PW + 0.4, SHAFT_H - PH, 0.22, materials.stairwellWall);
    // Front entrance wall with 1.38m wide doorway for the heavy rusted iron door
    builder._addStaticBox('StorePodiezdWallNL', PX - 1.92, OY + PH * 0.5, PZ_N, 2.46, PH, 0.22, materials.stairwellWall);
    builder._addStaticBox('StorePodiezdWallNR', PX + 1.92, OY + PH * 0.5, PZ_N, 2.46, PH, 0.22, materials.stairwellWall);
    builder._addStaticBox('StorePodiezdWallNTop', PX, OY + 2.82, PZ_N, 1.44, 1.06, 0.22, materials.stairwellWall);

    // Tall 5-story Khrushchevka apartment facade rising above the Podiezd
    builder._addStaticBox('StorePodiezdHouseL', PX - 7.8, OY + 6.5, PZ_N + 1.2, 9.8, 13.0, 2.4, extFacadeMat);
    builder._addStaticBox('StorePodiezdHouseR', PX + 7.8, OY + 6.5, PZ_N + 1.2, 9.8, 13.0, 2.4, extFacadeMat);
    builder._addStaticBox('StorePodiezdHouseTop', PX, OY + 8.3, PZ_N + 1.2, 6.4, 9.6, 2.4, extFacadeMat, { collide: false });
    builder._addStaticBox('StorePodiezdPlinth', PX, OY + 0.30, PZ_N - 0.12, 25.4, 0.62, 0.24, plinthMat, { collide: false });
    // Windows on the player's building exterior facade
    const facadeWinXs = [PX - 10.2, PX - 6.8, PX - 3.6, PX + 3.6, PX + 6.8, PX + 10.2];
    for (let fl = 1; fl <= 4; fl++) {
        facadeWinXs.forEach((wx, wIdx) => {
            const wMat = ((fl + Math.abs(Math.round(wx))) % 4 === 0) ? winWarmMat : (((fl * 3 + Math.round(wx)) % 5 === 0) ? winTvMat : winDarkMat);
            const win = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.35), wMat);
            win.position.set(wx, OY + 1.5 + fl * 2.8, PZ_N - 0.04);
            win.rotation.y = Math.PI;
            scene.add(win);
            reg(win, `StorePodiezdFacadeWin_${fl}_${wIdx}`);
        });
    }

    // Porch concrete canopy, steps, intercom (домофон), outdoor bench (скамейка), street urn & MISSING PERSONS NOTICE BOARD!
    const podCanopy = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.20, 1.8), materials.concrete);
    podCanopy.position.set(PX, OY + 2.68, PZ_N - 0.92);
    const podCanopySnow = new THREE.Mesh(new THREE.BoxGeometry(3.74, 0.14, 1.74), snowMat);
    podCanopySnow.position.set(PX, OY + 2.84, PZ_N - 0.92);
    builder._addStaticBox('StorePodPorchStep', PX, OY + 0.02, PZ_N - 0.82, 3.6, 0.12, 1.65, materials.concrete, { castShadow: false });
    // Entrance number plaque above door
    const podSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.36),
        builder._ps1Mat({ map: tex.createStreetSignTexture('ПОДЪЕЗД №2', 'КВ. 25–44'), roughness: 0.74 })
    );
    podSign.position.set(PX, OY + 2.48, PZ_N - 0.14);
    podSign.rotation.y = Math.PI;
    scene.add(podCanopy, podCanopySnow, podSign);
    reg(podCanopy, 'StorePodCanopy');
    reg(podCanopySnow, 'StorePodCanopySnow');
    reg(podSign, 'StorePodSign');

    // Intercom panel (Домофон) on exterior wall beside the iron door (facing -Z)
    const intercomGroup = new THREE.Group();
    intercomGroup.position.set(PX - 0.92, OY + 1.38, PZ_N - 0.14);
    const intercomMat = builder._ps1Mat({ map: tex.createIntercomTexture(), roughness: 0.45, metalness: 0.45 });
    const intercomMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.05), intercomMat);
    const intercomLed = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.015), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    intercomLed.position.set(-0.04, 0.05, -0.03);
    intercomGroup.add(intercomMesh, intercomLed);
    scene.add(intercomGroup);
    reg(intercomGroup, 'StorePodIntercom');

    // Notice board with MISSING PERSONS POSTERS on the exterior wall beside the podiezd entrance!
    const boardMat = builder._ps1Mat({ map: tex.createMissingPostersBoardTexture(), roughness: 0.82 });
    const noticeBoard = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.88, 0.06), boardMat);
    noticeBoard.position.set(PX + 1.85, OY + 1.56, PZ_N - 0.15);
    noticeBoard.rotation.y = Math.PI;
    scene.add(noticeBoard);
    reg(noticeBoard, 'StorePodNoticeBoard');

    // Outdoor wooden bench (скамейка) & metal trash urn (мусорка) outside the podiezd
    const addBench = (name, x, y, z, rotY = 0, withSnow = true) => {
        const bg = new THREE.Group();
        bg.position.set(x, y, z);
        bg.rotation.y = rotY;
        for (const lx of [-0.68, 0.68]) {
            const legF = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, 0.07), ironDarkMat);
            legF.position.set(lx, 0.22, 0.16);
            const legB = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.84, 0.07), ironDarkMat);
            legB.position.set(lx, 0.42, -0.18);
            bg.add(legF, legB);
        }
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.44), woodBenchMat);
        seat.position.set(0, 0.45, 0);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.34, 0.05), woodBenchMat);
        back.position.set(0, 0.74, -0.18);
        back.rotation.x = -0.12;
        bg.add(seat, back);
        if (withSnow) {
            const sn = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 0.38), snowMat);
            sn.position.set(0, 0.51, 0);
            bg.add(sn);
        }
        scene.add(bg);
        return reg(bg, name);
    };
    const addTrashBin = (name, x, y, z) => {
        const tg = new THREE.Group();
        tg.position.set(x, y, z);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.56, 8), ironDarkMat);
        body.position.y = 0.28;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 5, 10), ironRustMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.56;
        // Crumpled flyers & newspaper sticking out of the bin
        const paperMat = builder._ps1Mat({ color: 0xd8d2c0, roughness: 0.92 });
        const p1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), paperMat);
        p1.position.set(-0.04, 0.54, 0.03);
        const p2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), builder._ps1Mat({ color: 0xc4b8a0 }));
        p2.position.set(0.05, 0.52, -0.02);
        tg.add(body, rim, p1, p2);
        scene.add(tg);
        return reg(tg, name);
    };
    addBench('StorePodBench_Out', PX - 2.45, OY, PZ_N - 0.65, 0, true);
    addTrashBin('StorePodTrashBin_Out', PX - 1.32, OY, PZ_N - 0.52);

    // Heavy Rusted Soviet Iron Entrance Door (hinged on left at PX - 0.68)
    const ironDoorGO = new GameObject('StoreStreetIronDoor');
    ironDoorGO.transform.position.set(PX - 0.68, OY + 1.14, PZ_N - 0.02);
    const ironLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.36, 2.28, 0.09), ironDarkMat);
    ironLeaf.position.set(0.68, 0, 0);
    const ironRibTop = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.08, 0.11), ironRustMat);
    ironRibTop.position.set(0.68, 0.84, 0);
    const ironRibBot = ironRibTop.clone();
    ironRibBot.position.y = -0.84;
    const ironHandleIn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.09), materials.metal);
    ironHandleIn.position.set(1.16, -0.04, 0.075);
    const ironHandleOut = ironHandleIn.clone();
    ironHandleOut.position.z = -0.075;
    ironDoorGO.transform.add(ironLeaf, ironRibTop, ironRibBot, ironHandleIn, ironHandleOut);
    const ironDoorCol = ironDoorGO.addComponent(BoxCollider, new THREE.Vector3(1.36, 2.28, 0.16), new THREE.Vector3(0.68, 0, 0));
    ironDoorGO.addComponent(RigidBody, { bodyType: 'static' });
    engine.addGameObject(ironDoorGO);
    reg(ironDoorGO.transform, 'StoreStreetIronDoor', 'doors', { gameObject: ironDoorGO, primaryMesh: ironLeaf });

    // --- INSIDE WIDE PODIEZD: Concierge Room, Mailboxes, Trash Bin, Bench, Full Ascending Staircase ---
    // A. Concierge Room (Комната консьержа) on the East side (X: 96.7 .. 99.0, Z: 50.2 .. 53.6)
    builder._addStaticBox('StoreConciergeWallW_Bot', PX + 0.85, OY + 0.55, PZ_N + 1.85, 0.14, 1.10, 3.4, materials.stairwellWall);
    builder._addStaticBox('StoreConciergeWallW_Top', PX + 0.85, OY + 2.75, PZ_N + 1.85, 0.14, 1.20, 3.4, materials.stairwellWall);
    builder._addStaticBox('StoreConciergeWallW_ColN', PX + 0.85, OY + 1.62, PZ_N + 0.45, 0.14, 1.10, 0.55, materials.stairwellWall);
    builder._addStaticBox('StoreConciergeWallW_ColS', PX + 0.85, OY + 1.62, PZ_N + 3.25, 0.14, 1.10, 0.55, materials.stairwellWall);
    builder._addStaticBox('StoreConciergeWallS', PX + 1.95, OY + PH * 0.5, PZ_N + 3.55, 2.2, PH, 0.14, materials.stairwellWall);
    // Concierge glass window, sill, desk & warm green desk lamp
    builder._addStaticBox('StoreConciergeGlass', PX + 0.85, OY + 1.62, PZ_N + 1.85, 0.04, 1.04, 2.2, materials.glass, { blocker: false, castShadow: false });
    builder._addStaticBox('StoreConciergeSill', PX + 0.80, OY + 1.12, PZ_N + 1.85, 0.34, 0.06, 2.35, materials.woodDark, { collide: false });
    const cDesk = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.76, 1.6), materials.woodDark);
    cDesk.position.set(PX + 1.48, OY + 0.38, PZ_N + 1.85);
    const cLampGroup = new THREE.Group();
    cLampGroup.position.set(PX + 1.42, OY + 0.76, PZ_N + 1.45);
    const cLampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.24, 7), materials.metal);
    cLampBase.position.y = 0.12;
    const cLampShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.12, 8),
        builder._ps1Mat({ color: 0x267a44, emissive: 0x165e2e, emissiveIntensity: 0.9 })
    );
    cLampShade.position.y = 0.28;
    cLampGroup.add(cLampBase, cLampShade);
    const cCurtainL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.38), builder._ps1Mat({ color: 0x8f7a62 }));
    cCurtainL.position.set(PX + 0.94, OY + 1.62, PZ_N + 0.92);
    const cCurtainR = cCurtainL.clone();
    cCurtainR.position.z = PZ_N + 2.78;
    const cSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.82, 0.22),
        builder._ps1Mat({ map: tex.createStoreDeptSignTexture('КОНСЬЕРЖ', '#243a4d', '#f5ebd0'), roughness: 0.72 })
    );
    cSign.position.set(PX + 0.76, OY + 2.30, PZ_N + 1.85);
    cSign.rotation.y = -Math.PI / 2;
    scene.add(cDesk, cLampGroup, cCurtainL, cCurtainR, cSign);
    reg(cDesk, 'StoreConciergeDesk');
    reg(cLampGroup, 'StoreConciergeLamp');
    reg(cCurtainL, 'StoreConciergeCurtainL');
    reg(cCurtainR, 'StoreConciergeCurtainR');
    reg(cSign, 'StoreConciergeSign');

    // B. Two Wide Banks of Soviet Blue Mailboxes + Indoor Trash Bin + Lobby Bench along West Wall
    for (let bank = 0; bank < 2; bank++) {
        const mz = PZ_N + 1.25 + bank * 1.28;
        const mb = builder._addStaticBox(`StorePodMailbox_${bank}`, PX - PW * 0.5 + 0.20, OY + 1.42, mz, 0.18, 0.78, 1.12, mailboxMat);
        for (let s = 0; s < 5; s++) {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.16), materials.darkSilhouette);
            slot.position.set(0.10, 0.23, -0.42 + s * 0.21);
            mb.go.transform.add(slot);
        }
    }
    addTrashBin('StorePodTrashBin_In', PX - PW * 0.5 + 0.42, OY, PZ_N + 1.90);
    addBench('StorePodBench_In', PX + 1.95, OY, PZ_N + 4.35, -Math.PI / 2, false);

    // C. Full Multi-Flight Collidable Concrete Staircase going UP (2 full stories / 4 flights with landings & handrails)
    // Walking up these stairs after buying groceries triggers the smooth fade & teleport to the 3rd-floor stairs!
    const ST_X_UP = PX - 1.15;     // West flight (goes +Z toward back wall)
    const ST_X_RET = PX + 0.75;    // East return flight (goes -Z toward upper floor landing)
    const STEP_RISE = 0.17;
    const STEP_RUN = 0.24;
    const STEPS_PER_FLIGHT = 10;
    const FLIGHT_H = STEP_RISE * STEPS_PER_FLIGHT; // 1.70m per half-flight, 3.40m per full floor

    for (let fl = 0; fl < 2; fl++) {
        const baseY = OY + fl * (FLIGHT_H * 2);

        // Flight A (West, going +Z from floor landing to half-landing)
        for (let s = 0; s < STEPS_PER_FLIGHT; s++) {
            builder._addStaticBox(
                `StorePodStairUp_${fl}_${s}`,
                ST_X_UP,
                baseY + STEP_RISE * 0.5 + s * STEP_RISE,
                PZ_N + 3.92 + s * STEP_RUN,
                1.75,
                STEP_RISE,
                STEP_RUN + 0.04,
                materials.concrete
            );
        }

        // Half-landing at back of stairwell (Z: PZ_S - 1.15 .. PZ_S)
        const halfY = baseY + FLIGHT_H;
        builder._addStaticBox(
            `StorePodStairHalfLanding_${fl}`,
            PX - 0.2,
            halfY - 0.08,
            PZ_S - 0.62,
            3.8,
            0.18,
            1.18,
            materials.concrete
        );

        // Flight B (East, going -Z from half-landing to next floor landing)
        for (let s = 0; s < STEPS_PER_FLIGHT; s++) {
            builder._addStaticBox(
                `StorePodStairReturn_${fl}_${s}`,
                ST_X_RET,
                halfY + STEP_RISE * 0.5 + s * STEP_RISE,
                PZ_S - 1.32 - s * STEP_RUN,
                1.75,
                STEP_RISE,
                STEP_RUN + 0.04,
                materials.concrete
            );
        }

        // Upper floor landing (connects top of Flight B to bottom of next Flight A, sitting above the front lobby)
        const floorLandingY = baseY + FLIGHT_H * 2;
        builder._addStaticBox(
            `StorePodStairFloorLanding_${fl + 1}`,
            PX - 0.2,
            floorLandingY - 0.08,
            PZ_N + 3.15,
            3.8,
            0.18,
            1.36,
            materials.concrete
        );

        // Metal balustrades & sloped handrails along both flights
        const addFlightBalustrade = (name, bx, startY, startZ, dirZ) => {
            const g = new THREE.Group();
            g.position.set(bx, startY, startZ);
            for (let p = 0; p < 5; p++) {
                const t = p / 4;
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.96, 0.04), materials.metal);
                post.position.set(0, 0.48 + t * FLIGHT_H, dirZ * t * (STEPS_PER_FLIGHT * STEP_RUN));
                g.add(post);
            }
            const railLen = Math.hypot(FLIGHT_H, STEPS_PER_FLIGHT * STEP_RUN) + 0.15;
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, railLen), materials.metal);
            rail.position.set(0, 0.96 + FLIGHT_H * 0.5, dirZ * (STEPS_PER_FLIGHT * STEP_RUN) * 0.5);
            rail.rotation.x = -dirZ * Math.atan2(FLIGHT_H, STEPS_PER_FLIGHT * STEP_RUN);
            g.add(rail);
            scene.add(g);
            reg(g, name);
        };
        addFlightBalustrade(`StorePodStairBalustradeUp_${fl}`, ST_X_UP + 0.86, baseY, PZ_N + 3.92, 1);
        addFlightBalustrade(`StorePodStairBalustradeRet_${fl}`, ST_X_RET - 0.86, halfY, PZ_S - 1.32, -1);

        // Guard rail along the open edge of the upper floor landing
        const landGuard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.96, 0.04), materials.metal);
        landGuard.position.set(PX - 0.2, floorLandingY + 0.48, PZ_N + 3.80);
        scene.add(landGuard);
        reg(landGuard, `StorePodLandingGuard_${fl + 1}`);
    }

    // Warm stairwell lights on 2nd and 3rd floor landings so climbing the stairs is well-lit
    const podStairLight2 = new THREE.PointLight(0xffe2a2, 2.2, 9.5, 1.25);
    podStairLight2.position.set(PX - 0.2, OY + FLIGHT_H * 2 + 2.35, PZ_N + 4.4);
    const podStairLight3 = new THREE.PointLight(0xffd894, 1.8, 8.5, 1.3);
    podStairLight3.position.set(PX - 0.2, OY + FLIGHT_H * 4 + 2.2, PZ_N + 4.4);
    scene.add(podStairLight2, podStairLight3);
    builder._registerLight(podStairLight2, 'storePodStairLight2', 'Подъезд №2 (2 этаж)', 'store');
    builder._registerLight(podStairLight3, 'storePodStairLight3', 'Подъезд №2 (3 этаж)', 'store');
    streetLights.push(podStairLight2, podStairLight3);

    // Editable Gameplay Logic Zones: Return-Home Stair Trigger & Podiezd Player Spawn Point
    const returnZoneGO = new GameObject('StorePodiezdReturnZone');
    returnZoneGO.transform.position.set(PX, OY + 1.55, PZ_N + 5.5);
    const returnZoneMesh = new THREE.Mesh(
        new THREE.BoxGeometry(PW, 1.70, 3.8),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0, depthWrite: false })
    );
    returnZoneGO.transform.add(returnZoneMesh);
    engine.addGameObject(returnZoneGO);
    reg(returnZoneGO.transform, 'StorePodiezdReturnZone', 'gameplay', {
        gameObject: returnZoneGO,
        primaryMesh: returnZoneMesh,
        boxSize: [PW, 1.70, 3.8],
        initialBoxSize: [PW, 1.70, 3.8]
    });

    const podSpawnGO = new GameObject('StorePodiezdSpawnPoint');
    podSpawnGO.transform.position.set(PX, OY + 0.05, PZ_N + 2.35);
    const podSpawnMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.0, depthWrite: false })
    );
    podSpawnGO.transform.add(podSpawnMesh);
    engine.addGameObject(podSpawnGO);
    reg(podSpawnGO.transform, 'StorePodiezdSpawnPoint', 'gameplay', {
        gameObject: podSpawnGO,
        primaryMesh: podSpawnMesh
    });

    // Warm lights inside Podiezd, Concierge room, and on Porch (above missing-persons board)
    const podLobbyLight = new THREE.PointLight(0xffe2a2, 2.8, 10.5, 1.2);
    podLobbyLight.position.set(PX - 0.5, OY + PH - 0.25, PZ_N + 2.4);
    const conciergeLight = new THREE.PointLight(0x9affb8, 1.4, 5.5, 1.35);
    conciergeLight.position.set(PX + 1.42, OY + 1.25, PZ_N + 1.45);
    const podPorchLight = new THREE.PointLight(0xffcf82, 3.2, 11.5, 1.2);
    podPorchLight.position.set(PX + 0.4, OY + 2.45, PZ_N - 0.95);
    scene.add(podLobbyLight, conciergeLight, podPorchLight);
    builder._registerLight(podLobbyLight, 'storePodLobbyLight', 'Подъезд №2 (холл)', 'store');
    builder._registerLight(conciergeLight, 'storeConciergeLight', 'Подъезд №2 (консьерж)', 'store');
    builder._registerLight(podPorchLight, 'storePodPorchLight', 'Подъезд №2 (крыльцо)', 'store');
    streetLights.push(podLobbyLight, conciergeLight, podPorchLight);

    // =========================================================================
    // 6. NEIGHBORHOOD DISTRICTS: Apartment Blocks, Garages, Kiosk, Trees, Snowdrifts
    // =========================================================================
    const addCityBlock = (name, x, z, w, h, d, mat, winFace = 'south') => {
        const blk = builder._addStaticBox(name, x, OY + h * 0.5, z, w, h, d, mat);
        const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.28, d + 0.2), snowMat);
        roofSnow.position.set(0, h * 0.5 + 0.12, 0);
        blk.go.transform.add(roofSnow);
        const cols = Math.max(2, Math.floor((winFace === 'east' || winFace === 'west' ? d : w) / 3.4));
        const floors = Math.max(2, Math.floor(h / 3.0));
        for (let f = 0; f < floors; f++) {
            for (let c = 0; c < cols; c++) {
                const wMat = ((f * 5 + c * 3 + Math.round(x)) % 5 === 0)
                    ? winWarmMat
                    : (((f * 2 + c * 7) % 7 === 0) ? winTvMat : winDarkMat);
                const win = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.3), wMat);
                const wy = -h * 0.5 + 2.0 + f * 2.85;
                if (winFace === 'north' || winFace === 'south') {
                    const wx = -w * 0.38 + (c / Math.max(1, cols - 1)) * w * 0.76;
                    win.position.set(wx, wy, winFace === 'south' ? d * 0.5 + 0.05 : -d * 0.5 - 0.05);
                    if (winFace === 'north') win.rotation.y = Math.PI;
                } else {
                    const wz = -d * 0.38 + (c / Math.max(1, cols - 1)) * d * 0.76;
                    win.position.set(winFace === 'east' ? w * 0.5 + 0.05 : -w * 0.5 - 0.05, wy, wz);
                    win.rotation.y = winFace === 'east' ? Math.PI / 2 : -Math.PI / 2;
                }
                blk.go.transform.add(win);
            }
        }
    };

    // Flanking Soviet 5-story apartment blocks framing the microdistrict & bounding the walkable streets
    addCityBlock('StoreCityBlock_East1', 107.0, 37.0, 6.0, 14.5, 22.0, darkFacadeMat, 'west');
    addCityBlock('StoreCityBlock_East2', 105.0, 8.0, 6.0, 14.5, 18.0, brickFacadeMat, 'west');
    addCityBlock('StoreCityBlock_NorthE', 85.0, 6.0, 22.0, 14.5, 6.5, extFacadeMat, 'south');
    addCityBlock('StoreCityBlock_NorthW', 42.0, 6.0, 16.0, 14.5, 6.5, darkFacadeMat, 'south');
    addCityBlock('StoreCityBlock_West1', 41.0, 36.0, 6.0, 14.5, 22.0, brickFacadeMat, 'east');
    addCityBlock('StoreCityBlock_SouthMid', 66.0, 52.0, 26.0, 14.5, 6.0, darkFacadeMat, 'north');

    // Invisible boundary blockers closing avenue ends so player cannot walk off the edge of the world
    builder._addStaticBox('StoreCityBoundW', 45.5, OY + 1.5, 21.2, 0.6, 3.0, 10.0, materials.glass, { blocker: false, castShadow: false }).mesh.visible = false;
    builder._addStaticBox('StoreCityBoundE', 103.0, OY + 1.5, 21.2, 0.6, 3.0, 10.0, materials.glass, { blocker: false, castShadow: false }).mesh.visible = false;

    // District 3: Row of Rusted Soviet Metal Garages («Гаражный кооператив») + Closed Kiosk «СОЮЗПЕЧАТЬ»
    for (let g = 0; g < 4; g++) {
        const gz = 28.0 + g * 4.2;
        const gMat = g % 2 === 0 ? garageMat : garageRustMat;
        const gar = builder._addStaticBox(`StoreCityGarage_${g}`, 48.0, OY + 1.35, gz, 5.2, 2.7, 3.8, gMat);
        const gSnow = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.22, 3.9), snowMat);
        gSnow.position.set(0, 1.45, 0);
        gar.go.transform.add(gSnow);
    }
    // Soviet Kiosk «СОЮЗПЕЧАТЬ» at the park alley corner (X = 79.5, Z = 28.2)
    builder._addStaticBox('StoreCityKiosk', 79.5, OY + 1.30, 28.2, 3.2, 2.6, 2.4, builder._ps1Mat({ color: 0x355c6e, roughness: 0.78 }));
    const kioskWin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 0.08), materials.glass);
    kioskWin.position.set(79.5, OY + 1.52, 26.98);
    const kioskSign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.42),
        builder._ps1Mat({ map: tex.createStoreDeptSignTexture('СОЮЗПЕЧАТЬ', '#7d1e1e', '#fff0c2'), roughness: 0.72 })
    );
    kioskSign.position.set(79.5, OY + 2.38, 26.97);
    kioskSign.rotation.y = Math.PI;
    const kioskSnow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 2.6), snowMat);
    kioskSnow.position.set(79.5, OY + 2.68, 28.2);
    scene.add(kioskWin, kioskSign, kioskSnow);
    reg(kioskWin, 'StoreCityKioskWin');
    reg(kioskSign, 'StoreCityKioskSign');
    reg(kioskSnow, 'StoreCityKioskSnow');

    // Park benches & trash bins along the Snowy Alley (Сквер)
    addBench('StoreParkBench_0', 84.5, OY, 36.2, Math.PI, true);
    addBench('StoreParkBench_1', 89.5, OY, 31.8, 0, true);
    addTrashBin('StoreParkTrashBin_0', 86.0, OY, 36.0);
    addTrashBin('StoreStorefrontTrashBin', 62.4, OY, 7.6);

    // Winter Trees (Spruces & Birches) scattered through courtyard, park alley & plaza
    const cityTrees = [
        { x: 91.5, z: 43.0, t: 'spruce', s: 1.15 },
        { x: 100.5, z: 41.5, t: 'birch', s: 1.1 },
        { x: 90.0, z: 29.0, t: 'spruce', s: 1.25 },
        { x: 84.5, z: 29.2, t: 'birch', s: 1.05 },
        { x: 81.0, z: 39.5, t: 'spruce', s: 1.2 },
        { x: 67.5, z: 30.0, t: 'spruce', s: 1.15 },
        { x: 61.0, z: 39.5, t: 'birch', s: 1.15 },
        { x: 54.5, z: 29.5, t: 'spruce', s: 1.2 },
        { x: 52.0, z: 12.5, t: 'spruce', s: 1.18 },
        { x: 69.0, z: 11.5, t: 'birch', s: 1.08 },
        { x: 82.0, z: 13.0, t: 'spruce', s: 1.22 }
    ];
    cityTrees.forEach((tr, idx) => {
        builder._buildCourtyardTree(`StoreCityTree_${idx}`, tr.x, OY, tr.z, tr.t, tr.s);
    });

    // Sculpted Snowdrifts throughout all districts
    const cityDrifts = [
        [93.2, 46.5, 2.8, 0.8, 2.2], [99.8, 46.2, 3.2, 0.9, 2.4],
        [92.5, 37.5, 3.0, 0.75, 2.1], [86.5, 37.8, 3.4, 0.85, 2.2],
        [78.5, 36.8, 2.8, 0.72, 2.0], [70.2, 36.2, 3.1, 0.82, 2.2],
        [76.8, 26.2, 2.4, 0.65, 1.6], [71.2, 26.2, 2.6, 0.68, 1.7],
        [66.0, 26.4, 3.6, 0.78, 1.8], [56.0, 26.4, 3.4, 0.75, 1.8],
        [66.5, 16.4, 3.2, 0.72, 1.6], [54.2, 16.4, 3.0, 0.70, 1.6],
        [55.4, 8.2, 2.6, 0.75, 1.8], [64.8, 8.2, 2.8, 0.78, 1.8]
    ];
    cityDrifts.forEach(([dx, dz, sx, sy, sz], idx) => {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), snowMat);
        m.scale.set(sx * 0.5, sy * 0.52, sz * 0.5);
        m.position.set(dx, OY + sy * 0.14, dz);
        m.rotation.y = idx * 0.7;
        scene.add(m);
        reg(m, `StoreCityDrift_${idx}`);
    });

    // Parked snow-covered Soviet cars in the courtyard & near the store
    builder._buildLowPolyCar(91.0, OY, 40.5, 0.12, 0x3b4859, 'StoreCityParkedCar_1');
    builder._buildLowPolyCar(54.2, OY, 11.4, -0.35, 0x73322e, 'StoreCityParkedCar_2');

    // Warm Orange Soviet Streetlamps illuminating the route from Podiezd -> Alley -> Avenue -> Store
    const lampCoords = [
        [93.2, 41.5], [85.0, 31.8], [76.2, 25.4],
        [71.6, 16.8], [62.5, 16.8], [55.5, 10.5]
    ];
    lampCoords.forEach(([lx, lz], idx) => {
        const lampGroup = new THREE.Group();
        lampGroup.position.set(lx, OY, lz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 4.9, 6), materials.metal);
        pole.position.y = 2.45;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: 0xffd27d }));
        head.position.y = 4.88;
        lampGroup.add(pole, head);
        scene.add(lampGroup);
        reg(lampGroup, `StoreStreetLamp_${idx}`);

        const sl = new THREE.PointLight(0xffb454, 4.6, 22.0, 1.12);
        sl.position.set(lx, OY + 4.5, lz);
        scene.add(sl);
        builder._registerLight(sl, `storeStreetLamp_${idx}`, `Фонарь улицы #${idx + 1}`, 'store');
        streetLights.push(sl);
    });
    const storefrontLight = new THREE.PointLight(0xffe6b3, 4.2, 14.0, 1.15);
    storefrontLight.position.set(OX, OY + 2.65, OZ + halfD + 1.35);
    scene.add(storefrontLight);
    builder._registerLight(storefrontLight, 'storefrontLight', 'Вывеска «Продукты 24»', 'store');
    streetLights.push(storefrontLight);

    // =========================================================================
    // 7. MOVING CITY TRAFFIC (Rare Soviet Cars with Headlights & Taillights)
    // =========================================================================
    // Soft radial-gradient headlight ground-pool texture for realistic car illumination
    const hlPoolTex = tex.loadGenerated('headlight_pool.svg', 1, 1);
    hlPoolTex.minFilter = THREE.LinearFilter;
    hlPoolTex.magFilter = THREE.LinearFilter;
    const hlPoolMat = new THREE.MeshBasicMaterial({
        map: hlPoolTex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const buildTrafficCar = (idx, color, dirX, laneZ, startX, speed) => {
        const carGO = new GameObject(`StoreTrafficCar_${idx}`);
        const g = carGO.transform;
        g.position.set(startX, OY + 0.05, laneZ);
        g.rotation.y = dirX > 0 ? Math.PI / 2 : -Math.PI / 2;

        const bodyMat = builder._ps1Mat({ map: materials.metal.map, color, roughness: 0.52, metalness: 0.28 });
        const trimDarkMat = builder._ps1Mat({ color: 0x1e2228, roughness: 0.85, metalness: 0.2 });
        const winMat = builder._ps1Mat({ color: 0x1a2634, roughness: 0.18, metalness: 0.45 });
        const tireMat = builder._ps1Mat({ color: 0x14161a, roughness: 0.95 });
        const chromeMat = builder._ps1Mat({ map: materials.metal.map, color: 0xc4ccd6, roughness: 0.28, metalness: 0.8 });
        const plateMat = builder._ps1Mat({ color: 0xe6e4dc, roughness: 0.7 });
        const hlMat = builder._ps1Mat({ color: 0xfff5d0, emissive: 0xffe49c, emissiveIntensity: 1.4, roughness: 0.2 });
        const tlMat = builder._ps1Mat({ color: 0xb81c1c, emissive: 0xcc1818, emissiveIntensity: 0.9, roughness: 0.35 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.58, 3.95), bodyMat);
        body.position.y = 0.56;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.50, 1.92), bodyMat);
        cabin.position.set(0, 1.08, -0.12);
        const glassF = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.36, 0.05), winMat);
        glassF.position.set(0, 1.08, 0.84);
        const glassR = glassF.clone();
        glassR.position.z = -1.08;
        // Side windows, door seams & side mirrors
        for (const sx of [-1, 1]) {
            const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 1.56), winMat);
            sideWin.position.set(sx * 0.71, 1.08, -0.12);
            const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 3.65), chromeMat);
            trimStrip.position.set(sx * 0.835, 0.58, 0);
            const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), trimDarkMat);
            mirror.position.set(sx * 0.86, 0.92, 0.68);
            g.add(sideWin, trimStrip, mirror);
        }
        // Radiator grille + front & rear Soviet license plates
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.24, 0.06), trimDarkMat);
        grille.position.set(0, 0.58, 1.98);
        const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.03), plateMat);
        plateF.position.set(0, 0.35, 2.06);
        const plateR = plateF.clone();
        plateR.position.set(0, 0.48, -2.01);
        const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 1.75), snowMat);
        roofSnow.position.set(0, 1.36, -0.12);
        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.10, 0.12), chromeMat);
        bumperF.position.set(0, 0.34, 2.00);
        const bumperR = bumperF.clone();
        bumperR.position.z = -2.00;
        g.add(body, cabin, glassF, glassR, grille, plateF, plateR, roofSnow, bumperF, bumperR);

        for (const sx of [-0.60, 0.60]) {
            const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.05, 8), hlMat);
            hl.rotation.x = Math.PI / 2;
            hl.position.set(sx, 0.60, 1.99);
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.05), tlMat);
            tl.position.set(sx, 0.62, -1.99);
            g.add(hl, tl);
        }
        // Soft radial headlight ground projection + real warm PointLight illuminating the snowy road ahead
        const hlPool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.6), hlPoolMat);
        hlPool.rotation.x = -Math.PI / 2;
        hlPool.position.set(0, 0.05, 5.5);
        const hlLight = new THREE.PointLight(0xffeec2, 2.6, 12.0, 1.35);
        hlLight.position.set(0, 0.85, 3.8);
        g.add(hlPool, hlLight);
        streetLights.push(hlLight);

        const wheels = [];
        for (const [wx, wz] of [[-0.78, 1.22], [0.78, 1.22], [-0.78, -1.22], [0.78, -1.22]]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.22, 10), tireMat);
            w.rotation.z = Math.PI / 2;
            w.position.set(wx, 0.30, wz);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 8), chromeMat);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(wx, 0.30, wz);
            g.add(w, hub);
            wheels.push(w);
        }
        // Collidable body (rotated 90deg along X axis -> 4.0m along X, 1.35m tall, 1.75m along Z)
        carGO.addComponent(BoxCollider, new THREE.Vector3(4.0, 1.35, 1.75), new THREE.Vector3(0, 0.68, 0));
        const carRB = carGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(carGO);
        return { go: carGO, rb: carRB, group: g, wheels, dirX, laneZ, speed, minX: 34, maxX: 118, pauseTimer: idx * 3.5, hornCooldown: 0, engineTimer: Math.random() * 0.6, tlMat };
    };

    const trafficCars = [
        buildTrafficCar(0, 0x889984, -1, 19.6, 112, 5.8),
        buildTrafficCar(1, 0x3a4a60, 1, 22.8, 38, 5.4)
    ];
    trafficCars.forEach((c, idx) => reg(c.group, `StoreTrafficCar_${idx}`, 'store', { gameObject: c.go }));

    // =========================================================================
    // 8. WALKING CITY PEDESTRIANS (4 Bundled-Up Winter Residents)
    // =========================================================================
    const pedConfigs = [
        {
            coatColor: 0x3b4452, pantsColor: 0x1e222a, hatStyle: 'ushanka', hatColor: 0x453528, scarfColor: 0x8f2c2c,
            speed: 1.05, phase: 0.3,
            waypoints: [new THREE.Vector3(76, OY, 15.2), new THREE.Vector3(56, OY, 15.2), new THREE.Vector3(56, OY, 13.6), new THREE.Vector3(76, OY, 13.6)]
        },
        {
            coatColor: 0x5c363e, pantsColor: 0x262428, hatStyle: 'kerchief', hatColor: 0x8a7254, scarfColor: 0xc2b698,
            speed: 0.92, phase: 1.8,
            waypoints: [new THREE.Vector3(94.5, OY, 35.0), new THREE.Vector3(74.5, OY, 35.0), new THREE.Vector3(74.5, OY, 33.0), new THREE.Vector3(94.5, OY, 33.0)]
        },
        {
            coatColor: 0x34473a, pantsColor: 0x202428, hatStyle: 'beanie', hatColor: 0x2a2f36, scarfColor: 0x526b7a,
            speed: 1.12, phase: 3.1,
            waypoints: [new THREE.Vector3(73.2, OY, 33.5), new THREE.Vector3(73.2, OY, 15.0), new THREE.Vector3(74.8, OY, 15.0), new THREE.Vector3(74.8, OY, 33.5)]
        },
        {
            coatColor: 0x594d3b, pantsColor: 0x22201d, hatStyle: 'ushanka', hatColor: 0x2e2620, scarfColor: null,
            speed: 0.98, phase: 4.7,
            waypoints: [new THREE.Vector3(58, OY, 34.5), new THREE.Vector3(72, OY, 34.5), new THREE.Vector3(72, OY, 33.0), new THREE.Vector3(58, OY, 33.0)]
        }
    ];
    const pedestrians = pedConfigs.map((cfg, idx) => {
        const rig = buildArticulatedHuman({
            coatColor: cfg.coatColor,
            pantsColor: cfg.pantsColor,
            hatStyle: cfg.hatStyle,
            hatColor: cfg.hatColor,
            scarfColor: cfg.scarfColor,
            heightScale: 0.96 + (cfg.phase % 0.12),
            matFactory: (o) => builder._ps1Mat(o)
        });
        rig.root.position.copy(cfg.waypoints[0]);
        scene.add(rig.root);
        reg(rig.root, `StorePedestrian_${idx}`, 'gameplay');
        return {
            rig,
            waypoints: cfg.waypoints,
            wpIdx: 1,
            speed: cfg.speed,
            walkCycle: cfg.phase,
            blinkTimer: 1.5 + Math.random() * 3.0,
            yaw: 0
        };
    });

    // =========================================================================
    // 9. FALLING WINTER SNOW & STARRY NIGHT SKY OVER THE ENTIRE CITY DISTRICT
    // =========================================================================
    const citySnowGO = new GameObject('StoreStreetSnow');
    citySnowGO.transform.position.set(74.0, OY, 32.0);
    citySnowGO.addComponent(ParticleEmitter, {
        mode: 'snow',
        count: 720,
        bounds: new THREE.Vector3(78, 18, 66),
        color: 0xe8f2ff,
        size: 0.018,
        speed: 1.05
    });
    engine.addGameObject(citySnowGO);
    reg(citySnowGO.transform, 'StoreStreetSnow', 'gameplay', { gameObject: citySnowGO });

    // Starry sky dome centered directly above the city district
    const starCount = 320;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    let sSeed = 44219;
    const sRand = () => {
        sSeed = (sSeed * 1664525 + 1013904223) >>> 0;
        return (sSeed % 10000) / 10000;
    };
    for (let i = 0; i < starCount; i++) {
        const theta = sRand() * Math.PI * 2;
        const sinPhi = 0.16 + sRand() * 0.84;
        const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));
        const R = 85;
        starPos[i * 3] = 74.0 + Math.cos(theta) * cosPhi * R;
        starPos[i * 3 + 1] = OY + sinPhi * R;
        starPos[i * 3 + 2] = 30.0 + Math.sin(theta) * cosPhi * R;
        const br = 0.55 + sRand() * 0.45;
        starCol[i * 3] = br;
        starCol[i * 3 + 1] = br * 0.98;
        starCol[i * 3 + 2] = Math.min(1, br * 1.05);
    }
    const cityStarGeo = new THREE.BufferGeometry();
    cityStarGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    cityStarGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const cityStars = new THREE.Points(cityStarGeo, new THREE.PointsMaterial({
        size: 1.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        fog: false,
        sizeAttenuation: false
    }));
    cityStars.name = 'StoreSkyStars';
    scene.add(cityStars);
    reg(cityStars, 'StoreSkyStars', 'gameplay');

    // Per-frame updater for traffic cars & walking pedestrians
    const updateCityLife = (dt, playerPos) => {
        // Update driving Soviet cars (slow down politely if player crosses the avenue right in front of them)
        for (const car of trafficCars) {
            if (car.group.userData?.deleted || !car.group.visible) continue;
            if (car.pauseTimer > 0) {
                car.pauseTimer -= dt;
                continue;
            }
            let blockedByPlayer = false;
            let blockedByCar = false;
            if (playerPos && Math.abs(playerPos.z - car.laneZ) < 1.8) {
                const ahead = (playerPos.x - car.group.position.x) * car.dirX;
                if (ahead > 0.5 && ahead < 6.5) blockedByPlayer = true;
            }
            for (const other of trafficCars) {
                if (other === car || Math.abs(other.laneZ - car.laneZ) > 1.2) continue;
                const aheadCar = (other.group.position.x - car.group.position.x) * car.dirX;
                if (aheadCar > 0 && aheadCar < 8.0) {
                    blockedByCar = true;
                    break;
                }
            }
            if (car.hornCooldown > 0) car.hornCooldown -= dt;
            if (car.tlMat) car.tlMat.emissiveIntensity = (blockedByPlayer || blockedByCar) ? 2.2 : 0.85;

            if (blockedByPlayer) {
                if (car.hornCooldown <= 0) {
                    car.hornCooldown = 2.4 + Math.random() * 0.8;
                    engine.audioSystem?.playSpatialOneShot?.('car_horn', car.group.position, { volume: 0.75 });
                }
            } else if (!blockedByCar) {
                car.group.position.x += car.dirX * car.speed * dt;
                if (car.rb?.position) car.rb.position.copy(car.group.position);
                for (const w of car.wheels) w.rotation.x += dt * car.speed * 2.5;
                if (playerPos && car.group.position.distanceTo(playerPos) < 20) {
                    car.engineTimer -= dt;
                    if (car.engineTimer <= 0) {
                        car.engineTimer = 0.72 + Math.random() * 0.22;
                        engine.audioSystem?.playSpatialOneShot?.('car_engine_pass', car.group.position, { volume: 0.42 });
                    }
                }
                if (car.dirX > 0 && car.group.position.x > car.maxX) {
                    car.group.position.x = car.minX;
                    if (car.rb?.position) car.rb.position.copy(car.group.position);
                    car.pauseTimer = 4.0 + Math.random() * 6.0; // Rare traffic spacing
                } else if (car.dirX < 0 && car.group.position.x < car.minX) {
                    car.group.position.x = car.maxX;
                    if (car.rb?.position) car.rb.position.copy(car.group.position);
                    car.pauseTimer = 4.0 + Math.random() * 6.0;
                }
            }
        }

        // Update walking winter pedestrians with organic, slightly chaotic human gait
        const nowSec = performance.now() * 0.001;
        for (let pIdx = 0; pIdx < pedestrians.length; pIdx++) {
            const ped = pedestrians[pIdx];
            if (ped.rig.root.userData?.deleted || !ped.rig.root.visible) continue;
            const pos = ped.rig.root.position;
            const target = ped.waypoints[ped.wpIdx];
            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.hypot(dx, dz);
            const cadenceDrift = 0.92 + 0.14 * Math.sin(nowSec * 0.55 + pIdx * 1.9);
            const curSpeed = ped.speed * cadenceDrift;
            if (dist < 0.35) {
                ped.wpIdx = (ped.wpIdx + 1) % ped.waypoints.length;
            } else {
                const step = Math.min(dist, curSpeed * dt);
                pos.x += (dx / dist) * step;
                pos.z += (dz / dist) * step;
                const goalYaw = Math.atan2(-dx, -dz);
                let diff = goalYaw - ped.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                ped.yaw += diff * Math.min(1, dt * 6.0);
                ped.rig.root.rotation.y = ped.yaw;
            }
            ped.walkCycle += dt * curSpeed * 5.1;
            const s = Math.sin(ped.walkCycle);
            const c = Math.cos(ped.walkCycle);
            const asym = 0.08 * Math.sin(ped.walkCycle * 0.5 + pIdx * 2.1);

            ped.rig.pelvis.position.y = 0.78 + Math.abs(s) * 0.026;
            ped.rig.pelvis.rotation.z = s * 0.032;
            ped.rig.pelvis.rotation.y = s * 0.055;
            ped.rig.torsoPivot.rotation.x = -0.055 + Math.abs(c) * 0.022;
            ped.rig.torsoPivot.rotation.y = -s * 0.085;
            ped.rig.torsoPivot.rotation.z = -s * 0.025;
            ped.rig.headPivot.rotation.y = Math.sin(nowSec * 0.7 + pIdx * 2.7) * 0.16;
            ped.rig.headPivot.rotation.x = 0.03 + Math.sin(nowSec * 1.3 + pIdx) * 0.04;

            ped.rig.legL.rotation.x = (s + asym) * 0.50;
            ped.rig.kneeL.rotation.x = -Math.max(0, -s) * 0.72 - 0.06;
            ped.rig.legR.rotation.x = (-s + asym) * 0.50;
            ped.rig.kneeR.rotation.x = -Math.max(0, s) * 0.72 - 0.06;
            ped.rig.shoulderL.rotation.x = -s * (0.34 + (pIdx % 2) * 0.08);
            ped.rig.elbowL.rotation.x = 0.22 + Math.max(0, -s) * 0.28;
            ped.rig.shoulderR.rotation.x = s * (0.36 - (pIdx % 2) * 0.06);
            ped.rig.elbowR.rotation.x = 0.24 + Math.max(0, s) * 0.26;
            ped.blinkTimer -= dt;
            let lid = 0.06;
            if (ped.blinkTimer < 0) {
                const b = -ped.blinkTimer;
                lid = THREE.MathUtils.lerp(0.06, 1.15, Math.sin(Math.min(1, b / 0.16) * Math.PI));
                if (b > 0.16) ped.blinkTimer = 2.2 + Math.random() * 3.4;
            }
            if (ped.rig.eyelidL) ped.rig.eyelidL.scale.y = lid;
            if (ped.rig.eyelidR) ped.rig.eyelidR.scale.y = lid;
        }
    };

    const _rzBox = new THREE.Box3();
    return {
        streetLights,
        get streetSpawnPos() { return podSpawnGO.transform.position; },
        get streetSpawnYaw() { return podSpawnGO.transform.rotation.y; },
        ironDoor: ironDoorGO,
        ironDoorCol,
        podiezdBounds: { minX: PX - PW * 0.5, maxX: PX + PW * 0.5, minZ: PZ_N, maxZ: PZ_S },
        isOnPodiezdReturnStairs: (pos) => {
            if (!pos || returnZoneGO.transform.userData?.deleted) return false;
            _rzBox.setFromObject(returnZoneGO.transform);
            return !_rzBox.isEmpty() && _rzBox.containsPoint(pos);
        },
        updateCityLife
    };
}

