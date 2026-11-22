// people.js — humanoid factory: Rico, Mara, police and pedestrians, with real
// proportions, faces, distinct clothes and walk/run limb animation.
// GRAND CITY 6 — original code, written for this entry.

import { canvasTexture, clamp } from './util.js';

const SKIN_TONES = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf0c8a0, 0x6e4426];
const SHIRTS = [0x3a6fd2, 0xd23a5a, 0x3ad27a, 0xe8d44a, 0x8a4ad2, 0xe8e8e8, 0x2a2a2a, 0xd27a2a];
const PANTS = [0x23283e, 0x3a3a3a, 0x5a4a3a, 0x2e4a3a, 0x6a6a72];

function faceTexture(skin, hair) {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    // hair fringe at the top
    g.fillStyle = hair;
    g.fillRect(0, 0, w, 12);
    // eyebrows + eyes
    g.fillStyle = '#201510';
    g.fillRect(12, 26, 12, 3);
    g.fillRect(40, 26, 12, 3);
    g.beginPath(); g.arc(18, 34, 3.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(46, 34, 3.4, 0, Math.PI * 2); g.fill();
    // nose + mouth
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(30, 38, 4, 8);
    g.fillStyle = '#7a3a2a';
    g.fillRect(24, 50, 16, 3);
  });
}

function css(c) { return '#' + c.toString(16).padStart(6, '0'); }

export function makePerson(scene, opts = {}) {
  const {
    x = 0, z = 0, heading = 0,
    skin = 0xe8b88a, hair = 0x201510, shirt = 0x3a6fd2, pants = 0x23283e,
    scale = 1, isPolice = false, isMara = false, isRico = false,
  } = opts;
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(css(skin), css(hair)) });

  // Legs pivot at the hip (y 0.82).
  const legGeo = new THREE.BoxGeometry(0.2, 0.82, 0.24);
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const shoeGeo = new THREE.BoxGeometry(0.22, 0.1, 0.36);
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0);
  const legLMesh = new THREE.Mesh(legGeo, pantsMat);
  legLMesh.position.y = -0.41;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.position.set(0, -0.78, -0.05);
  legL.add(shoeL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.82, 0);
  const legRMesh = new THREE.Mesh(legGeo, pantsMat);
  legRMesh.position.y = -0.41;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeR.position.set(0, -0.78, -0.05);
  legR.add(shoeR);
  group.add(legL, legR);

  // Torso.
  const torsoH = isMara ? 0.85 : 0.62;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, torsoH, 0.3), shirtMat);
  torso.position.y = 0.82 + torsoH / 2;
  torso.castShadow = true;
  group.add(torso);
  // Belt + shoulder pads: break the plain torso box.
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.32), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  belt.position.y = 0.86;
  group.add(belt);
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), shirtMat);
    pad.position.set(s * 0.3, 1.47, 0);
    group.add(pad);
  }
  // Rico's white tee under the open jacket: a pale chest stripe.
  if (isRico) {
    const tee = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.04), new THREE.MeshLambertMaterial({ color: 0xf0ede4 }));
    tee.position.set(0, 1.12, 0.16);
    group.add(tee);
  }

  // Arms pivot at the shoulder (y 1.42).
  const armGeo = new THREE.BoxGeometry(0.15, 0.62, 0.18);
  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.42, 0);
  const armLMesh = new THREE.Mesh(armGeo, shirtMat);
  armLMesh.position.y = -0.31;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.36, 1.42, 0);
  const armRMesh = new THREE.Mesh(armGeo, shirtMat);
  armRMesh.position.y = -0.31;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  // Hands.
  const handGeo = new THREE.BoxGeometry(0.13, 0.14, 0.15);
  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.y = -0.66;
  armL.add(handL);
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.y = -0.66;
  armR.add(handR);
  group.add(armL, armR);

  // Head: face on -z (the character's forward), hair on top.
  const headMats = [skinMat, skinMat, hairMat, skinMat, skinMat, faceMat];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), headMats);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  // Hair cap.
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.14, 0.35), hairMat);
  hairCap.position.y = 1.86;
  group.add(hairCap);
  if (isMara) {
    // Long hair down the back.
    const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.1), hairMat);
    longHair.position.set(0, 1.5, 0.19);
    group.add(longHair);
  }
  if (isPolice) {
    // Peaked cap.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.36), new THREE.MeshLambertMaterial({ color: 0x14203a }));
    cap.position.y = 1.9;
    group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.16), new THREE.MeshLambertMaterial({ color: 0x0a0f1e }));
    brim.position.set(0, 1.87, -0.22);
    group.add(brim);
    // Badge.
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), new THREE.MeshLambertMaterial({ color: 0xffd94d, emissive: 0x554400, emissiveIntensity: 0.5 }));
    badge.position.set(-0.14, 1.28, -0.16);
    group.add(badge);
  }

  group.position.set(x, 0, z);
  group.rotation.y = -heading;
  group.scale.setScalar(scale);
  scene.add(group);

  return {
    group, legL, legR, armL, armR, head, torso,
    heading, walkPhase: Math.random() * 6, speed: 0,
    punchT: 0, isRico, isPolice, isMara,
  };
}

export function makeRico(scene, x, z, heading) {
  return makePerson(scene, {
    x, z, heading,
    skin: 0xe8b88a, hair: 0x14100c, shirt: 0x8a1f1f, pants: 0x23283e,
    scale: 1.04, isRico: true,
  });
}

export function makeMara(scene, x, z, heading) {
  return makePerson(scene, {
    x, z, heading,
    skin: 0xf0c8a0, hair: 0x4a2a10, shirt: 0x0f7d7a, pants: 0x0f7d7a,
    scale: 0.98, isMara: true,
  });
}

export function makePolice(scene, x, z, heading) {
  return makePerson(scene, {
    x, z, heading,
    skin: 0xc98a5a, hair: 0x201510, shirt: 0x1a2a4a, pants: 0x1a2a4a,
    scale: 1.02, isPolice: true,
  });
}

export function makePedestrian(scene, rng, x, z, heading) {
  const skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pants = PANTS[Math.floor(rng() * PANTS.length)];
  const hair = [0x201510, 0x4a2a10, 0x0a0a0a, 0x6a6a6a, 0x8a5a2a][Math.floor(rng() * 5)];
  return makePerson(scene, {
    x, z, heading,
    skin, hair, shirt, pants,
    scale: 0.94 + rng() * 0.12,
  });
}

/** Animate limbs for a walking/running person. speed in m/s. */
export function animateWalk(p, speed, dt) {
  p.speed = speed;
  if (speed > 0.1) {
    p.walkPhase += dt * (3.2 + speed * 1.35);
    const amp = clamp(0.25 + speed * 0.075, 0, 0.85);
    const s = Math.sin(p.walkPhase);
    p.legL.rotation.x = s * amp;
    p.legR.rotation.x = -s * amp;
    p.armL.rotation.x = -s * amp * 0.8;
    p.armR.rotation.x = s * amp * 0.8;
    p.group.position.y = Math.abs(Math.cos(p.walkPhase)) * 0.05;
  } else {
    // Ease back to idle.
    p.legL.rotation.x *= 0.8;
    p.legR.rotation.x *= 0.8;
    p.armL.rotation.x *= 0.8;
    p.armR.rotation.x *= 0.8;
    p.group.position.y *= 0.8;
  }
  // Punch: right arm swings forward fast, then recovers.
  if (p.punchT > 0) {
    p.punchT -= dt;
    const k = 1 - Math.max(0, p.punchT) / 0.45;
    p.armR.rotation.x = -1.9 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5);
  }
}
