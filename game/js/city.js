// city.js — builds coastal city "Solmar": 7x7 street grid, ~69 buildings with
// lit windows and shopfronts, beach, pier, sea, central park and a real race
// circuit with grandstands and a pit lane. All textures are drawn on canvas.
// GRAND CITY 6 — original code, written for this entry.

import { mulberry32, rand, randInt, pick, canvasTexture, clamp, TAU } from './util.js';

export const CITY = {
  half: 140,
  pitch: 40,
  roadWidth: 10,
  beachZ: 140,
  seaZ: 168,
  streets: [-120, -80, -40, 0, 40, 80, 120],
  blocks: [-100, -60, -20, 20, 60, 100],
  bounds: { minX: -150, maxX: 305, minZ: -150, maxZ: 212 },
};

export const LOCATIONS = {
  pierCafe: { x: 20, z: 147, name: 'Pier Cafe' },
  market: { x: 100, z: -92, name: 'Solmar Market' },
  clubNeon: { x: 60, z: 86, name: 'Club Neon' },
  safehouse: { x: -100, z: 92, name: 'Rico Safehouse' },
  bank: { x: -60, z: -44, name: 'Banco Solmar' },
  garage: { x: -100, z: -84, name: 'Garage' },
  marina: { x: 20, z: 158, name: 'Marina' },
  hospital: { x: 100, z: 52, name: 'Hospital' },
  policeHQ: { x: 20, z: -92, name: 'Police HQ' },
  circuitGate: { x: 148, z: 0, name: 'Circuit Gate' },
  raceStart: { x: 215, z: 45, name: 'Start / Finish' },
  park: { x: 0, z: 10, name: 'Central Park' },
  plaza: { x: 0, z: -100, name: 'Plaza' },
};

const SHOP_NAMES = [
  'CAFÉ MARINA', 'TACO SOL', 'PIZZA NOVA', 'BAR NEON', 'MARKET SOL',
  'CLUB NEON', 'HOTEL SOLMAR', 'BANCO SOLMAR', 'DONUT KING', 'SURF SHOP',
  'GYM POWER', 'PHARMA VIDA', 'BURGER BAY', 'RAMEN HOUSE', 'FLOWER CO',
];

const FACADE_COLORS = ['#c9b18c', '#8fa3b8', '#b87f5e', '#a8b89a', '#b8a89a', '#7d94a8'];

// ---- procedural textures -------------------------------------------------

function facadeTextures(rng, base) {
  const cols = 8, rows = 14;
  const day = canvasTexture(256, 448, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical shading
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // windows
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.25;
        g.fillStyle = lit ? '#ffe9a8' : '#2c3540';
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.12);
      }
    }
    // ground floor: darker shop band
    g.fillStyle = 'rgba(30,28,26,0.85)';
    g.fillRect(0, h - ch * 1.4, w, ch * 1.4);
  });
  const night = canvasTexture(256, 448, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.38) {
          g.fillStyle = pick(rng, ['#ffd27a', '#ffb84d', '#fff2c0']);
          g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
        }
      }
    }
  });
  return { day, night };
}

function signTexture(name, bg, fg) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, w / 2, h / 2 + 2);
  });
}

function roadTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 200; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#d8c95a';
    g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = '#e8e8e8';
    for (let y = 0; y < h; y += 64) g.fillRect(18, y + 8, 5, 34);
    for (let y = 0; y < h; y += 64) g.fillRect(w - 23, y + 8, 5, 34);
  });
}

function checkeredTexture() {
  return canvasTexture(128, 32, (g, w, h) => {
    const s = 16;
    for (let x = 0; x < w / s; x++) for (let y = 0; y < h / s; y++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#111' : '#f5f5f5';
      g.fillRect(x * s, y * s, s, s);
    }
  });
}

// ---- race circuit geometry ----------------------------------------------

const CIRCUIT = { cx: 215, cz: 0, a: 70, b: 45, r: 25, width: 12 };

function roundedRectPoints(cx, cz, a, b, r, n) {
  const pts = [];
  const corners = [
    { x: cx + a - r, z: cz - b + r, a0: -Math.PI / 2, a1: 0 },       // top-right
    { x: cx + a - r, z: cz + b - r, a0: 0, a1: Math.PI / 2 },        // bottom-right
    { x: cx - a + r, z: cz + b - r, a0: Math.PI / 2, a1: Math.PI },  // bottom-left
    { x: cx - a + r, z: cz - b + r, a0: Math.PI, a1: Math.PI * 1.5 },// top-left
  ];
  const per = Math.max(2, Math.floor(n / 4));
  for (const c of corners) {
    for (let i = 0; i < per; i++) {
      const t = c.a0 + (c.a1 - c.a0) * (i / per);
      pts.push({ x: c.x + Math.cos(t) * r, z: c.z + Math.sin(t) * r });
    }
  }
  return pts;
}

/** Point + heading at loop parameter t in [0,1). */
export function circuitPoint(t) {
  const pts = roundedRectPoints(CIRCUIT.cx, CIRCUIT.cz, CIRCUIT.a, CIRCUIT.b, CIRCUIT.r, 64);
  const n = pts.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const fr = f - Math.floor(f);
  const x = pts[i0].x + (pts[i1].x - pts[i0].x) * fr;
  const z = pts[i0].z + (pts[i1].z - pts[i0].z) * fr;
  // Heading for the car's forward convention (fx = sin h, fz = -cos h):
  // h = atan2(dx, -dz), NOT atan2(-dz, dx) (that is 90 deg off).
  const angle = Math.atan2(pts[i1].x - pts[i0].x, -(pts[i1].z - pts[i0].z));
  return { x, z, angle };
}

export function circuitWaypoints(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(circuitPoint(i / n));
  return out;
}

/** Rectangle loop around a block (for traffic / pedestrians). */
export function blockLoop(bx, bz, offset, clockwise) {
  const pts = [
    { x: bx - offset, z: bz - offset },
    { x: bx + offset, z: bz - offset },
    { x: bx + offset, z: bz + offset },
    { x: bx - offset, z: bz + offset },
  ];
  return clockwise ? pts : pts.reverse();
}

// ---- city build ----------------------------------------------------------

export function buildCity(scene) {
  const rng = mulberry32(20261122);
  const colliders = [];
  const emissiveMats = [];
  const lampGlows = [];
  const group = new THREE.Group();
  scene.add(group);

  const facadeVariants = FACADE_COLORS.map((c) => facadeTextures(rng, c));
  const roadTex = roadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;

  // Ground: grass base + sand + sea handled below.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6f7f5e });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(80, -0.05, 20);
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: one plane per street, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  for (const s of CITY.streets) {
    const rep = 7;
    const texV = roadTex.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, rep);
    const matV = new THREE.MeshLambertMaterial({ map: texV });
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, 260), matV);
    rv.rotation.x = -Math.PI / 2;
    rv.position.set(s, 0.02, 0);
    rv.receiveShadow = true;
    group.add(rv);
    const texH = roadTex.clone();
    texH.needsUpdate = true;
    texH.repeat.set(1, rep);
    const matH = new THREE.MeshLambertMaterial({ map: texH });
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(260, CITY.roadWidth), matH);
    rh.rotation.x = -Math.PI / 2;
    rh.rotation.z = Math.PI / 2;
    rh.position.set(0, 0.02, s);
    rh.receiveShadow = true;
    group.add(rh);
    // Sidewalks flanking each street.
    for (const off of [-7.5, 7.5]) {
      const swV = new THREE.Mesh(new THREE.PlaneGeometry(4, 260), sidewalkMat);
      swV.rotation.x = -Math.PI / 2;
      swV.position.set(s + off, 0.06, 0);
      swV.receiveShadow = true;
      group.add(swV);
      const swH = new THREE.Mesh(new THREE.PlaneGeometry(260, 4), sidewalkMat);
      swH.rotation.x = -Math.PI / 2;
      swH.position.set(0, 0.06, s + off);
      swH.receiveShadow = true;
      group.add(swH);
    }
  }
  // Crosswalks at the four central intersections.
  const crossMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  for (const [cx, cz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
    for (let i = -2; i <= 2; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 8), crossMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(cx + i * 2, 0.05, cz);
      group.add(stripe);
    }
  }

  // Buildings, block by block.
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  let shopIdx = 0;
  for (const bx of CITY.blocks) {
    for (const bz of CITY.blocks) {
      if (bx === 0 && bz === 0) continue; // central park
      if (bx === 0 && bz === -100) continue; // plaza
      const kind = pick(rng, ['tower', 'twin', 'twin', 'shops', 'shops']);
      const variant = facadeVariants[Math.floor(rng() * facadeVariants.length)];
      const mkBuilding = (x, z, w, d, h, withShop) => {
        const side = new THREE.MeshLambertMaterial({
          map: variant.day, emissiveMap: variant.night,
          emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0,
        });
        emissiveMats.push(side);
        const mats = [side, side, roofMat, roofMat, side, side];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        if (h > 26) {
          // rooftop AC unit + antenna
          const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2.4), roofMat);
          ac.position.set(x + w * 0.2, h + 0.6, z);
          group.add(ac);
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), roofMat);
          ant.position.set(x - w * 0.3, h + 3.5, z - d * 0.25);
          group.add(ant);
        }
        if (withShop) {
          const name = SHOP_NAMES[shopIdx++ % SHOP_NAMES.length];
          const signTex = signTexture(name, pick(rng, ['#10243e', '#3e1020', '#0f3d24', '#4a2c00']), '#ffd94d');
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(9, 1.7),
            new THREE.MeshLambertMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.35 }),
          );
          // Face the nearest street.
          const faceSouth = Math.abs(bz) >= Math.abs(bx);
          sign.position.set(x, 5.6, z + (faceSouth ? d / 2 + 0.15 : -d / 2 - 0.15));
          if (!faceSouth) sign.rotation.y = Math.PI;
          group.add(sign);
          const awn = new THREE.Mesh(
            new THREE.BoxGeometry(9.5, 0.25, 2.2),
            new THREE.MeshLambertMaterial({ color: pick(rng, [0x2e7d6b, 0xa03d2e, 0x2e5da0, 0x8a6d1f]) }),
          );
          awn.position.set(x, 3.6, z + (faceSouth ? d / 2 + 1 : -d / 2 - 1));
          awn.rotation.x = faceSouth ? 0.25 : -0.25;
          group.add(awn);
        }
        return mesh;
      };
      if (kind === 'tower') {
        mkBuilding(bx, bz, 22, 22, rand(rng, 28, 58), false);
      } else if (kind === 'twin') {
        mkBuilding(bx - 7, bz, 12, 20, rand(rng, 14, 26), rng() < 0.5);
        mkBuilding(bx + 7, bz, 12, 20, rand(rng, 14, 26), rng() < 0.5);
      } else {
        mkBuilding(bx - 8, bz - 8, 11, 11, rand(rng, 8, 13), true);
        mkBuilding(bx + 8, bz - 8, 11, 11, rand(rng, 8, 13), rng() < 0.7);
        mkBuilding(bx, bz + 8, 11, 11, rand(rng, 8, 13), rng() < 0.7);
      }
    }
  }

  // Central park: lawn circle, trees, benches, fountain.
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x5d8a4a });
  const park = new THREE.Mesh(new THREE.CircleGeometry(15, 24), parkMat);
  park.rotation.x = -Math.PI / 2;
  park.position.set(0, 0.08, 0);
  park.receiveShadow = true;
  group.add(park);
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1, 16), new THREE.MeshLambertMaterial({ color: 0x9a9a92 }));
  fountainBase.position.set(0, 0.5, 0);
  group.add(fountainBase);
  const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(3, 16), new THREE.MeshLambertMaterial({ color: 0x4db2e8, transparent: true, opacity: 0.85 }));
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(0, 1.02, 0);
  group.add(fountainWater);
  colliders.push({ minX: -3.8, maxX: 3.8, minZ: -3.8, maxZ: 3.8 });

  // Trees: palms along the beachfront, leafy trees in the park and on blocks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d33 });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3.4, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const palmTrunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6);
  const frondGeo = new THREE.ConeGeometry(1.5, 3.2, 4);
  const mkTree = (x, z, palm) => {
    if (palm) {
      const t = new THREE.Mesh(palmTrunkGeo, trunkMat);
      t.position.set(x, 2.75, z);
      t.rotation.z = (rng() - 0.5) * 0.16;
      t.castShadow = true;
      group.add(t);
      const f = new THREE.Mesh(frondGeo, palmMat);
      f.position.set(x, 6.4, z);
      f.scale.set(1.4, 0.7, 1.4);
      group.add(f);
    } else {
      const t = new THREE.Mesh(trunkGeo, trunkMat);
      t.position.set(x, 1.7, z);
      t.castShadow = true;
      group.add(t);
      const c = new THREE.Mesh(crownGeo, leafMat);
      c.position.set(x, 4.4, z);
      c.scale.y = 1.25;
      c.castShadow = true;
      group.add(c);
    }
  };
  for (let x = -130; x <= 130; x += 20) mkTree(x + rand(rng, -3, 3), 146, true);
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, r = rand(rng, 7, 13);
    mkTree(Math.cos(a) * r, Math.sin(a) * r, false);
  }
  for (const bx of CITY.blocks) for (const bz of CITY.blocks) {
    if ((bx === 0 && bz === 0) || (bx === 0 && bz === -100)) continue;
    if (rng() < 0.55) mkTree(bx + rand(rng, -12, 12), bz + rand(rng, -12, 12), false);
  }

  // Street lamps along the avenues.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,220,140,0.9)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  for (const s of [-120, -40, 40, 120]) {
    for (let p = -120; p <= 120; p += 80) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(s + 6.2, 3, p);
      group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(s + 6.2, 6.1, p);
      group.add(bulb);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false }));
      spr.scale.set(4, 4, 1);
      spr.position.set(s + 6.2, 6.1, p);
      group.add(spr);
      lampGlows.push(spr.material);
      const pole2 = new THREE.Mesh(poleGeo, poleMat);
      pole2.position.set(p, 3, s + 6.2);
      group.add(pole2);
      const bulb2 = new THREE.Mesh(bulbGeo, bulbMat);
      bulb2.position.set(p, 6.1, s + 6.2);
      group.add(bulb2);
      const spr2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false }));
      spr2.scale.set(4, 4, 1);
      spr2.position.set(p, 6.1, s + 6.2);
      group.add(spr2);
      lampGlows.push(spr2.material);
    }
  }
  emissiveMats.push(bulbMat);

  // Beach, sea, pier.
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd9c08a });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, 34), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(80, 0.03, CITY.beachZ + 15);
  sand.receiveShadow = true;
  group.add(sand);
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x2a7ab8, transparent: true, opacity: 0.92 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(80, -0.4, CITY.seaZ + 130);
  group.add(sea);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(9, 0.8, 66), pierMat);
  pier.position.set(20, 0.4, 172);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  for (let z = 146; z <= 200; z += 9) {
    for (const px of [16.2, 23.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), pierMat);
      post.position.set(px, -0.8, z);
      group.add(post);
    }
  }
  // Sea walls (keep the player out of the water except on the pier).
  colliders.push({ minX: -400, maxX: 15.5, minZ: CITY.seaZ, maxZ: 400 });
  colliders.push({ minX: 24.5, maxX: 400, minZ: CITY.seaZ, maxZ: 400 });
  colliders.push({ minX: 15.5, maxX: 16.4, minZ: 140, maxZ: 205 });
  colliders.push({ minX: 23.6, maxX: 24.5, minZ: 140, maxZ: 205 });

  // ---- race circuit -----------------------------------------------------
  const trackPts = roundedRectPoints(CIRCUIT.cx, CIRCUIT.cz, CIRCUIT.a, CIRCUIT.b, CIRCUIT.r, 64);
  const shape = new THREE.Shape();
  const outer = roundedRectPoints(CIRCUIT.cx, CIRCUIT.cz, CIRCUIT.a + CIRCUIT.width / 2, CIRCUIT.b + CIRCUIT.width / 2, CIRCUIT.r + CIRCUIT.width / 2, 64);
  const inner = roundedRectPoints(CIRCUIT.cx, CIRCUIT.cz, CIRCUIT.a - CIRCUIT.width / 2, CIRCUIT.b - CIRCUIT.width / 2, CIRCUIT.r - CIRCUIT.width / 2, 64);
  shape.moveTo(outer[0].x, -outer[0].z);
  for (const p of outer) shape.lineTo(p.x, -p.z);
  const hole = new THREE.Path();
  hole.moveTo(inner[0].x, -inner[0].z);
  for (const p of inner) hole.lineTo(p.x, -p.z);
  shape.holes.push(hole);
  const trackGeo = new THREE.ShapeGeometry(shape, 8);
  trackGeo.rotateX(-Math.PI / 2);
  const trackTex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3d42'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    // red-white curbs along the edges
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = (x / 32) % 2 === 0 ? '#c03028' : '#f0f0f0';
      g.fillRect(x, 0, 32, 14); g.fillRect(x, h - 14, 32, 14);
    }
    g.fillStyle = '#e8e8e8';
    for (let x = 0; x < w; x += 48) g.fillRect(x + 8, h / 2 - 3, 24, 6);
  });
  const trackMat = new THREE.MeshLambertMaterial({ map: trackTex });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.position.set(0, 0.04, 0);
  track.receiveShadow = true;
  group.add(track);
  // Start / finish line on the south straight.
  const startTex = checkeredTexture();
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshLambertMaterial({ map: startTex }));
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(CIRCUIT.cx, 0.07, CIRCUIT.cz + CIRCUIT.b);
  group.add(startLine);
  // Grandstands along the main straight + crowd.
  const standMat = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
  for (let s = -1; s <= 1; s++) {
    for (let step = 0; step < 4; step++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 2.4), standMat);
      st.position.set(CIRCUIT.cx + s * 34, 0.6 + step * 1.2, CIRCUIT.cz + CIRCUIT.b + 8 + step * 2.2);
      st.castShadow = true;
      group.add(st);
    }
  }
  colliders.push({ minX: CIRCUIT.cx - 50, maxX: CIRCUIT.cx + 50, minZ: CIRCUIT.cz + CIRCUIT.b + 7, maxZ: CIRCUIT.cz + CIRCUIT.b + 17 });
  const crowdGeo = new THREE.BoxGeometry(0.5, 0.7, 0.5);
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 120);
  const dummy = new THREE.Object3D();
  const crowdColors = [0xd84a4a, 0x4a7dd8, 0x4ad87a, 0xe8d44a, 0xe8e8e8, 0x8a4ad8];
  for (let i = 0; i < 120; i++) {
    const s = (i % 3) - 1;
    dummy.position.set(
      CIRCUIT.cx + s * 34 + rand(rng, -12, 12),
      1.6 + Math.floor(i / 30) * 1.2,
      CIRCUIT.cz + CIRCUIT.b + 8 + (Math.floor(i / 30) % 4) * 2.2,
    );
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    crowd.setColorAt(i, new THREE.Color(pick(rng, crowdColors)));
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);
  // Pit lane boxes.
  const pitMat = new THREE.MeshLambertMaterial({ color: 0x27435e });
  for (let i = 0; i < 4; i++) {
    const pit = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), pitMat);
    pit.position.set(CIRCUIT.cx - 30 + i * 20, 2, CIRCUIT.cz - CIRCUIT.b - 9);
    pit.castShadow = true;
    group.add(pit);
    colliders.push({ minX: pit.position.x - 4, maxX: pit.position.x + 4, minZ: pit.position.z - 3, maxZ: pit.position.z + 3 });
  }
  // Connector road from the city to the circuit gate.
  const connMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const conn = new THREE.Mesh(new THREE.PlaneGeometry(36, 10), connMat);
  conn.rotation.x = -Math.PI / 2;
  conn.position.set(152, 0.02, 0);
  conn.receiveShadow = true;
  group.add(conn);

  // Benches in the park and plaza.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const [bx, bz, ry] of [[-8, 8, 0.6], [8, -8, -0.6], [9, 7, 2.2], [-9, -7, -2.2]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    bench.position.set(bx, 0.5, bz);
    bench.rotation.y = ry;
    group.add(bench);
  }

  let seaPhase = 0;
  return {
    colliders,
    circuit: CIRCUIT,
    trackPoints: trackPts,
    update(dt, nightFactor) {
      for (const m of emissiveMats) m.emissiveIntensity = nightFactor * 0.9;
      for (const g of lampGlows) g.opacity = nightFactor * 0.85;
      seaPhase += dt;
      sea.position.y = -0.4 + Math.sin(seaPhase * 0.7) * 0.08;
      seaMat.opacity = 0.88 + Math.sin(seaPhase * 0.5) * 0.04;
    },
  };
}
