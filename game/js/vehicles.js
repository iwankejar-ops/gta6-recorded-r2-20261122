// vehicles.js — car factory (race, sport, sedan, taxi, police, truck) and the
// arcade driving model: acceleration, steering, collisions, wheel spin.
// GRAND CITY 6 — original code, written for this entry.

import { clamp, angleToward, resolveCircleBox, canvasTexture } from './util.js';

export const CAR_TYPES = {
  race:   { length: 4.5, width: 1.95, maxSpeed: 46, accel: 17, steer: 1.9, spoiler: true,  low: true,  colors: [0xd21f26, 0xf2a007, 0x1f6fd2, 0xe85d10, 0x18b26b] },
  sport:  { length: 4.4, width: 1.9,  maxSpeed: 42, accel: 15, steer: 1.8, spoiler: true,  low: true,  colors: [0xc22a3a, 0x2a6fc2, 0xeeeeee, 0x222222, 0x7a2ad2] },
  sedan:  { length: 4.3, width: 1.85, maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: false, colors: [0x9aa0a6, 0x3a4a5a, 0x7a3a3a, 0xd8d0c0, 0x2e4a3a] },
  taxi:   { length: 4.3, width: 1.85, maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: false, colors: [0xf2c200] },
  police: { length: 4.4, width: 1.9,  maxSpeed: 40, accel: 14, steer: 1.8, spoiler: false, low: false, colors: [0x1c1e22] },
  truck:  { length: 6.2, width: 2.3,  maxSpeed: 26, accel: 8,  steer: 1.2, spoiler: false, low: false, colors: [0x8a8f94, 0x5a6e8a, 0xa08a5a] },
  van:    { length: 4.8, width: 2.0,  maxSpeed: 30, accel: 9,  steer: 1.4, spoiler: false, low: false, colors: [0xd8d8d8, 0x4a6a8a, 0x8a5a2e] },
};

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
const wheelGeoBig = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.4 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0x7a1010, emissive: 0xc02020, emissiveIntensity: 0.5 });

function taxiSignTexture() {
  return canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd94d';
    g.font = 'bold 24px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TAXI', w / 2, h / 2 + 1);
  });
}

export function makeCar(scene, type, color, opts = {}) {
  const cfg = CAR_TYPES[type];
  const L = cfg.length, W = cfg.width;
  const bodyY = cfg.low ? 0.42 : 0.55;
  const bodyH = cfg.low ? 0.5 : 0.62;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const stripeMat = new THREE.MeshLambertMaterial({ color: opts.stripe ?? 0x111111 });

  // Main low body + hood shaping.
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, bodyH, W), bodyMat);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);
  // Sloped hood + trunk deck: break the flat slab silhouette so the car
  // reads as a car from a low chase camera instead of a plain box.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, 0.07, W * 0.92), bodyMat);
  hood.position.set(L * 0.32, bodyY + bodyH / 2 + 0.03, 0);
  hood.rotation.z = -0.1;
  hood.castShadow = true;
  group.add(hood);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.22, 0.07, W * 0.92), bodyMat);
  deck.position.set(-L * 0.36, bodyY + bodyH / 2 + 0.03, 0);
  deck.rotation.z = 0.07;
  group.add(deck);
  // Dark lower band: two-tone body, grounded stance.
  const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.99, 0.14, W * 1.01), new THREE.MeshLambertMaterial({ color: 0x181818 }));
  band.position.set(0, 0.16, 0);
  group.add(band);
  // Cabin / glasshouse.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.48, 0.5, W * 0.86), glassMat);
  cabin.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.24, 0);
  cabin.castShadow = true;
  group.add(cabin);
  // Roof panel in body colour (thin, on top of the glasshouse).
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.08, W * 0.8), bodyMat);
  roof.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.5, 0);
  group.add(roof);

  if (cfg.spoiler) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, W * 0.92), bodyMat);
    wing.position.set(-L / 2 + 0.12, bodyY + bodyH + 0.28, 0);
    wing.castShadow = true;
    group.add(wing);
    for (const s of [-0.6, 0.6]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), bodyMat);
      sup.position.set(-L / 2 + 0.12, bodyY + bodyH + 0.12, s * W * 0.4);
      group.add(sup);
    }
    // Racing stripe over hood + roof.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.03, 0.34), stripeMat);
    stripe.position.set(0, bodyY + bodyH / 2 + 0.02, 0);
    group.add(stripe);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.03, 0.34), stripeMat);
    stripe2.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.55, 0);
    group.add(stripe2);
    // Front splitter + side skirts.
    const split = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, W * 0.95), new THREE.MeshLambertMaterial({ color: 0x161616 }));
    split.position.set(L / 2 - 0.05, 0.18, 0);
    group.add(split);
    for (const s of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(L * 0.7, 0.1, 0.08), new THREE.MeshLambertMaterial({ color: 0x161616 }));
      skirt.position.set(0, 0.16, s * (W / 2 - 0.02));
      group.add(skirt);
    }
  }

  // Police livery: white doors band + light bar.
  let lightBarL = null, lightBarR = null;
  if (type === 'police') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, bodyH * 0.7, W + 0.04), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    band.position.set(-L * 0.05, bodyY, 0);
    group.add(band);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 1.1), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    barBase.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.58, 0);
    group.add(barBase);
    const redMat = new THREE.MeshLambertMaterial({ color: 0x880000, emissive: 0xff2020, emissiveIntensity: 0.2 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x000088, emissive: 0x2040ff, emissiveIntensity: 0.2 });
    lightBarL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.5), redMat);
    lightBarL.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.68, -0.28);
    group.add(lightBarL);
    lightBarR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.5), blueMat);
    lightBarR.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.68, 0.28);
    group.add(lightBarR);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ map: taxiSignTexture(), emissiveMap: taxiSignTexture(), emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.4 }),
    );
    sign.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.62, 0);
    group.add(sign);
  }
  if (type === 'truck') {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 1.7, W * 0.96), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    cargo.position.set(-L * 0.22, bodyY + 1.1, 0);
    cargo.castShadow = true;
    group.add(cargo);
  }

  // Headlights + taillights.
  const headGeo = new THREE.BoxGeometry(0.1, 0.18, 0.42);
  for (const s of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(headGeo, headMat);
    hl.position.set(L / 2 + 0.01, bodyY + 0.08, s);
    group.add(hl);
  }
  // Front grille bar between the headlights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.9), new THREE.MeshLambertMaterial({ color: 0x0e0e0e }));
  grille.position.set(L / 2 + 0.01, bodyY + 0.02, 0);
  group.add(grille);
  const tailGeo = new THREE.BoxGeometry(0.08, 0.14, 0.4);
  const tailL = new THREE.Mesh(tailGeo, tailMat.clone());
  tailL.position.set(-L / 2 - 0.01, bodyY + 0.08, -0.55);
  group.add(tailL);
  const tailR = new THREE.Mesh(tailGeo, tailMat.clone());
  tailR.position.set(-L / 2 - 0.01, bodyY + 0.08, 0.55);
  group.add(tailR);

  // Wheels.
  const wGeo = cfg.low ? wheelGeoBig : wheelGeo;
  const wheels = [];
  const wx = L * 0.32, wz = W / 2 - 0.02;
  for (const [x, z, front] of [[wx, -wz, true], [wx, wz, true], [-wx, -wz, false], [-wx, wz, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, cfg.low ? 0.42 : 0.36, z);
    const wheel = new THREE.Mesh(wGeo, tireMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(wheel);
    pivot.add(hub);
    group.add(pivot);
    wheels.push({ pivot, wheel, front });
  }

  // Wheel-arch trim: dark rims above each wheel so the wheels sit in the body.
  const archMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const archY = (cfg.low ? 0.42 : 0.36) + (cfg.low ? 0.42 : 0.36) + 0.02;
  for (const [ax, s] of [[wx, -1], [wx, 1], [-wx, -1], [-wx, 1]]) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.06), archMat);
    arch.position.set(ax, archY, s * (W / 2 + 0.005));
    group.add(arch);
  }

  // Fake headlight cones (visible at night).
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const coneGeo = new THREE.ConeGeometry(1.6, 7, 12, 1, true);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.z = -Math.PI / 2;
  cone.rotation.y = Math.PI / 2;
  cone.position.set(L / 2 + 3.4, 0.5, 0);
  cone.visible = false;
  group.add(cone);

  scene.add(group);
  const car = {
    group, type, color, cfg,
    heading: opts.heading ?? 0,
    speed: 0,
    steer: 0,
    wheels,
    tailL, tailR,
    lightBarL, lightBarR,
    cone, coneMat,
    driver: opts.driver ?? null, // 'player' | 'traffic' | 'police' | null (parked)
    health: 100,
    radius: L / 2,
    braking: false,
    sirenPhase: Math.random() * 10,
  };
  group.position.set(opts.x ?? 0, 0, opts.z ?? 0);
  group.rotation.y = -car.heading;
  return car;
}

/** Arcade driving step. input: {throttle -1..1, steer -1..1, brake}. Returns hit info. */
export function driveCar(car, input, dt, colliders, onCrash) {
  const cfg = car.cfg;
  const prevSpeed = car.speed;
  if (input.brake || (input.throttle < 0 && car.speed > 0.5)) {
    car.speed -= 26 * dt * Math.sign(car.speed || 1);
    if (Math.abs(car.speed) < 0.3) car.speed = 0;
    car.braking = true;
  } else {
    car.braking = false;
    car.speed += input.throttle * cfg.accel * dt;
    // drag + rolling resistance
    car.speed -= car.speed * 0.35 * dt;
    if (input.throttle === 0) car.speed -= car.speed * 0.9 * dt;
  }
  const maxRev = 9;
  car.speed = clamp(car.speed, -maxRev, cfg.maxSpeed);
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;

  const steerTarget = input.steer * (1 - Math.min(0.55, Math.abs(car.speed) / cfg.maxSpeed * 0.55));
  car.steer = angleToward(car.steer, steerTarget, 3.2 * dt);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steer * cfg.steer * (Math.abs(car.speed) / cfg.maxSpeed) * dir * dt * 0.9;

  const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
  let nx = car.group.position.x + fx * car.speed * dt;
  let nz = car.group.position.z + fz * car.speed * dt;
  let crashed = false;
  // Two collision circles: front and rear.
  for (const [ox, oz] of [[1.3, 0], [-1.3, 0]]) {
    const cx = nx + fx * ox, cz = nz + fz * oz;
    for (const b of colliders) {
      const r = resolveCircleBox(cx, cz, 1.25, b);
      if (r.hit) {
        const dx = r.x - cx, dz = r.z - cz;
        nx += dx; nz += dz;
        if (Math.abs(prevSpeed) > 6 && onCrash) onCrash(Math.abs(prevSpeed));
        car.speed *= 0.55;
        crashed = true;
        break;
      }
    }
  }
  car.group.position.x = nx;
  car.group.position.z = nz;
  car.group.rotation.y = -car.heading;

  // Wheels: spin + front steer.
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.wheels) {
    w.wheel.rotation.z += spin;
    if (w.front) w.pivot.rotation.y = -car.steer * 0.42;
  }
  // Brake lights.
  const brakeI = car.braking ? 2.2 : 0.5;
  car.tailL.material.emissiveIntensity = brakeI;
  car.tailR.material.emissiveIntensity = brakeI;
  return { crashed };
}

/** Circle-vs-circle push-apart for two cars. Returns true when they touched. */
export function collideCars(a, b) {
  const ax = a.group.position.x, az = a.group.position.z;
  const bx = b.group.position.x, bz = b.group.position.z;
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz);
  const min = 2.1;
  if (d >= min || d < 1e-4) return false;
  const push = (min - d) / 2;
  const nx = dx / d, nz = dz / d;
  a.group.position.x -= nx * push;
  a.group.position.z -= nz * push;
  b.group.position.x += nx * push;
  b.group.position.z += nz * push;
  const tmp = a.speed;
  a.speed = b.speed * 0.5;
  b.speed = tmp * 0.5;
  return true;
}

export function setCarNight(car, nightFactor) {
  car.cone.visible = nightFactor > 0.45;
  car.coneMat.opacity = nightFactor > 0.45 ? 0.10 * nightFactor : 0;
  headMat.emissiveIntensity = 0.4 + nightFactor * 1.4;
}
