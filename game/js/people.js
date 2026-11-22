// people.js — humanoid factory: Rico, Mara, police and pedestrians.
// Figures are built from spheres and cylinders (rounded head with real
// features, tapered torso with shoulders, cylinder limbs) so they read as
// people from the low chase camera instead of Minecraft boxes. Limb pivots
// and the returned object shape are unchanged, so walk/punch animation and
// traffic/police code work exactly as before.
// GRAND CITY 6 — original code, written for this entry.

import { clamp } from './util.js';

const SKIN_TONES = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf0c8a0, 0x6e4426];
const SHIRTS = [0x3a6fd2, 0xd23a5a, 0x3ad27a, 0xe8d44a, 0x8a4ad2, 0xe8e8e8, 0x2a2a2a, 0xd27a2a];
const PANTS = [0x23283e, 0x3a3a3a, 0x5a4a3a, 0x2e4a3a, 0x6a6a72];
const HAIR_COLORS = [0x201510, 0x4a2a10, 0x0a0a0a, 0x6a6a6a, 0x8a5a2a];
const HAIR_STYLES = ['short', 'long', 'buzz', 'ponytail', 'afro', 'cap'];

// Shared geometry: one copy per shape, reused by every figure.
const headGeo = new THREE.SphereGeometry(0.19, 12, 10);
const eyeGeo = new THREE.SphereGeometry(0.028, 8, 6);
const noseGeo = new THREE.BoxGeometry(0.05, 0.07, 0.06);
const mouthGeo = new THREE.BoxGeometry(0.09, 0.018, 0.02);
const neckGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8);
const hairCapGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
const hairBuzzGeo = new THREE.SphereGeometry(0.195, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
const hairAfroGeo = new THREE.SphereGeometry(0.23, 12, 8);
const hairBackGeo = new THREE.SphereGeometry(0.19, 10, 8);
const ponytailGeo = new THREE.SphereGeometry(0.09, 8, 6);
const ponytailTailGeo = new THREE.CylinderGeometry(0.05, 0.035, 0.35, 6);
const torsoGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.62, 10);
const dressGeo = new THREE.CylinderGeometry(0.23, 0.36, 0.85, 10);
const shoulderGeo = new THREE.SphereGeometry(0.115, 10, 8);
const beltGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10);
const armGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.62, 8);
const handGeo = new THREE.SphereGeometry(0.07, 8, 6);
const legGeo = new THREE.CylinderGeometry(0.1, 0.085, 0.78, 8);
const shoeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const teeGeo = new THREE.CylinderGeometry(0.295, 0.295, 0.5, 10, 1, true, Math.PI - 0.55, 1.1);
const policeCapGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12);
const brimGeo = new THREE.BoxGeometry(0.36, 0.04, 0.16);
const badgeGeo = new THREE.BoxGeometry(0.08, 0.1, 0.02);
const ballCapGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12);

const eyeMat = new THREE.MeshLambertMaterial({ color: 0x201510 });
const mouthMat = new THREE.MeshLambertMaterial({ color: 0x7a3a2a });

export function makePerson(scene, opts = {}) {
  const {
    x = 0, z = 0, heading = 0,
    skin = 0xe8b88a, hair = 0x201510, shirt = 0x3a6fd2, pants = 0x23283e,
    scale = 1, isPolice = false, isMara = false, isRico = false,
    hairStyle = 'short',
  } = opts;
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });

  // Legs: cylinders pivoting at the hip (y 0.82), rounded shoes.
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0);
  const legLMesh = new THREE.Mesh(legGeo, pantsMat);
  legLMesh.position.y = -0.39;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.scale.set(1, 0.45, 1.8);
  shoeL.position.set(0, -0.78, -0.05);
  legL.add(shoeL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.82, 0);
  const legRMesh = new THREE.Mesh(legGeo, pantsMat);
  legRMesh.position.y = -0.39;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeR.scale.set(1, 0.45, 1.8);
  shoeR.position.set(0, -0.78, -0.05);
  legR.add(shoeR);
  group.add(legL, legR);

  // Torso: tapered cylinder + shoulder spheres, so the silhouette is a
  // body, not a slab. Mara wears a dress (flared cone).
  const torsoH = isMara ? 0.85 : 0.62;
  const torso = new THREE.Mesh(isMara ? dressGeo : torsoGeo, shirtMat);
  torso.position.y = 0.82 + torsoH / 2;
  torso.castShadow = true;
  group.add(torso);
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeo, shirtMat);
    shoulder.position.set(s * 0.25, 1.4, 0);
    shoulder.castShadow = true;
    group.add(shoulder);
  }
  // Belt.
  const belt = new THREE.Mesh(beltGeo, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  belt.position.y = 0.86;
  group.add(belt);
  // Rico's white tee under the open jacket: a curved chest panel.
  if (isRico) {
    const tee = new THREE.Mesh(teeGeo, new THREE.MeshLambertMaterial({ color: 0xf0ede4, side: THREE.DoubleSide }));
    tee.position.set(0, 1.12, 0);
    group.add(tee);
  }

  // Arms: cylinders pivoting at the shoulder (y 1.42), sphere hands.
  const armL = new THREE.Group();
  armL.position.set(-0.35, 1.42, 0);
  const armLMesh = new THREE.Mesh(armGeo, shirtMat);
  armLMesh.position.y = -0.31;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.y = -0.64;
  armL.add(handL);
  const armR = new THREE.Group();
  armR.position.set(0.35, 1.42, 0);
  const armRMesh = new THREE.Mesh(armGeo, shirtMat);
  armRMesh.position.y = -0.31;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.y = -0.64;
  armR.add(handR);
  group.add(armL, armR);

  // Neck.
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 1.5;
  group.add(neck);

  // Head: a sphere, not a box — with eyes, nose and mouth on the front
  // (-z is the character's forward) and a hair style on top.
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(s * 0.068, 1.7, -0.172);
    group.add(eye);
  }
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, 1.645, -0.185);
  group.add(nose);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 1.575, -0.176);
  group.add(mouth);

  // Hair styles.
  if (hairStyle === 'afro') {
    const afro = new THREE.Mesh(hairAfroGeo, hairMat);
    afro.position.y = 1.74;
    afro.scale.set(1, 0.85, 1);
    afro.castShadow = true;
    group.add(afro);
  } else if (hairStyle === 'buzz') {
    const buzz = new THREE.Mesh(hairBuzzGeo, hairMat);
    buzz.position.y = 1.67;
    group.add(buzz);
  } else if (hairStyle === 'long') {
    const cap = new THREE.Mesh(hairCapGeo, hairMat);
    cap.position.y = 1.67;
    group.add(cap);
    // Hair falling down the back.
    const back = new THREE.Mesh(hairBackGeo, hairMat);
    back.scale.set(0.95, 1.5, 0.5);
    back.position.set(0, 1.45, 0.11);
    back.castShadow = true;
    group.add(back);
  } else if (hairStyle === 'ponytail') {
    const cap = new THREE.Mesh(hairCapGeo, hairMat);
    cap.position.y = 1.67;
    group.add(cap);
    const bun = new THREE.Mesh(ponytailGeo, hairMat);
    bun.position.set(0, 1.66, 0.17);
    group.add(bun);
    const tail = new THREE.Mesh(ponytailTailGeo, hairMat);
    tail.position.set(0, 1.42, 0.2);
    tail.rotation.x = 0.15;
    group.add(tail);
  } else if (hairStyle === 'cap') {
    const cap = new THREE.Mesh(ballCapGeo, shirtMat);
    cap.position.y = 1.83;
    group.add(cap);
    const brim = new THREE.Mesh(brimGeo, shirtMat);
    brim.position.set(0, 1.81, -0.2);
    group.add(brim);
  } else {
    // Short hair: a cap over the top of the head.
    const cap = new THREE.Mesh(hairCapGeo, hairMat);
    cap.position.y = 1.67;
    group.add(cap);
    if (isRico) {
      // Dark fringe across the forehead.
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), hairMat);
      fringe.position.set(0, 1.78, -0.17);
      group.add(fringe);
    }
  }
  if (isMara) {
    // Long hair down the back (Mara always has it, whatever the style).
    const back = new THREE.Mesh(hairBackGeo, hairMat);
    back.scale.set(0.95, 1.5, 0.5);
    back.position.set(0, 1.45, 0.11);
    back.castShadow = true;
    group.add(back);
  }
  if (isPolice) {
    // Peaked cap.
    const cap = new THREE.Mesh(policeCapGeo, new THREE.MeshLambertMaterial({ color: 0x14203a }));
    cap.position.y = 1.88;
    group.add(cap);
    const brim = new THREE.Mesh(brimGeo, new THREE.MeshLambertMaterial({ color: 0x0a0f1e }));
    brim.position.set(0, 1.85, -0.2);
    group.add(brim);
    // Badge.
    const badge = new THREE.Mesh(badgeGeo, new THREE.MeshLambertMaterial({ color: 0xffd94d, emissive: 0x554400, emissiveIntensity: 0.5 }));
    badge.position.set(-0.14, 1.28, -0.26);
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
    scale: 1.04, isRico: true, hairStyle: 'short',
  });
}

export function makeMara(scene, x, z, heading) {
  return makePerson(scene, {
    x, z, heading,
    skin: 0xf0c8a0, hair: 0x4a2a10, shirt: 0x0f7d7a, pants: 0x0f7d7a,
    scale: 0.98, isMara: true, hairStyle: 'long',
  });
}

export function makePolice(scene, x, z, heading) {
  return makePerson(scene, {
    x, z, heading,
    skin: 0xc98a5a, hair: 0x201510, shirt: 0x1a2a4a, pants: 0x1a2a4a,
    scale: 1.02, isPolice: true, hairStyle: 'buzz',
  });
}

export function makePedestrian(scene, rng, x, z, heading) {
  const skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pants = PANTS[Math.floor(rng() * PANTS.length)];
  const hair = HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)];
  const hairStyle = HAIR_STYLES[Math.floor(rng() * HAIR_STYLES.length)];
  return makePerson(scene, {
    x, z, heading,
    skin, hair, shirt, pants,
    scale: 0.94 + rng() * 0.12,
    hairStyle,
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
