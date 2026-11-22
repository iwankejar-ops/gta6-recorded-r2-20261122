// vehicles.js — car factory (race, sport, sedan, taxi, police, truck) and the
// arcade driving model: acceleration, steering, collisions, wheel spin.
// GRAND CITY 6 — original code, written for this entry.

import { clamp, angleToward, resolveCircleBox, canvasTexture } from './util.js';

export const CAR_TYPES = {
  race:   { length: 4.5, width: 1.95, maxSpeed: 46, accel: 17, steer: 1.9, spoiler: true,  low: true,  rims: 'gold', colors: [0xd21f26, 0xf2a007, 0x1f6fd2, 0xe85d10, 0x18b26b] },
  sport:  { length: 4.4, width: 1.9,  maxSpeed: 42, accel: 15, steer: 1.8, spoiler: true,  low: true,  colors: [0xc22a3a, 0x2a6fc2, 0xeeeeee, 0x222222, 0x7a2ad2] },
  sedan:  { length: 4.3, width: 1.85, maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: false, colors: [0x9aa0a6, 0x3a4a5a, 0x7a3a3a, 0xd8d0c0, 0x2e4a3a] },
  taxi:   { length: 4.3, width: 1.85, maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: false, colors: [0xf2c200] },
  police: { length: 4.4, width: 1.9,  maxSpeed: 40, accel: 14, steer: 1.8, spoiler: false, low: false, colors: [0x1c1e22] },
  truck:  { length: 6.2, width: 2.3,  maxSpeed: 26, accel: 8,  steer: 1.2, spoiler: false, low: false, colors: [0x8a8f94, 0x5a6e8a, 0xa08a5a] },
  van:    { length: 4.8, width: 2.0,  maxSpeed: 30, accel: 9,  steer: 1.4, spoiler: false, low: false, colors: [0xd8d8d8, 0x4a6a8a, 0x8a5a2e] },
  // New visual types (stats copied from sedan, so no behaviour change):
  // a boxy luxury SUV and a gold-trimmed convertible lowrider.
  suv:    { length: 4.6, width: 2.0,  maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: false, suv: true, colors: [0x111111, 0x2a2a2a, 0xe8e8e8, 0x1e3a2a, 0x3a2a1e] },
  lowrider: { length: 4.9, width: 2.0, maxSpeed: 34, accel: 11, steer: 1.6, spoiler: false, low: true, lowrider: true, rims: 'gold', colors: [0x1e8a3a, 0x6a2a8a, 0xd8a800, 0xc22a3a] },
};

function spokeTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8ccd2';
    g.beginPath(); g.arc(w / 2, h / 2, 26, 0, Math.PI * 2); g.fill();
    // 5 spokes on the dark ring.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(a);
      g.fillStyle = '#20242a';
      g.fillRect(-3, -26, 6, 13);
      g.restore();
    }
    g.fillStyle = '#20242a';
    g.beginPath(); g.arc(w / 2, h / 2, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a8f96';
    g.beginPath(); g.arc(w / 2, h / 2, 4, 0, Math.PI * 2); g.fill();
  });
}

const tireGeo = new THREE.TorusGeometry(0.27, 0.11, 10, 18);
const tireGeoBig = new THREE.TorusGeometry(0.31, 0.12, 10, 18);
const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10);
const hubSideMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
const hubCapMat = new THREE.MeshLambertMaterial({ map: spokeTexture() });
const hubCapGoldMat = new THREE.MeshLambertMaterial({ map: spokeTexture(), color: 0xd8a800 });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });

// Pink/blue camo paint (reference: the camo Corvette) — canvas blobs.
function camoTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#7ec8e8'; g.fillRect(0, 0, w, h);
    const cols = ['#e85a9a', '#f2a0c0', '#2a2a3a', '#e85a9a', '#5a8ac8'];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[i % cols.length];
      const x = Math.random() * w, y = Math.random() * h, r = 14 + Math.random() * 30;
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.7);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    }
  });
}

// Vertical-slat grille for the SUV (G-Wagon face).
function grilleTexture() {
  return canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8ccd2';
    for (let x = 8; x < w; x += 18) g.fillRect(x, 6, 5, h - 12);
  });
}
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
  // Stance: SUV tall and boxy, police low like a supercar, low cars low.
  const bodyY = cfg.suv ? 0.62 : (cfg.low || type === 'police') ? 0.42 : 0.55;
  const bodyH = cfg.suv ? 0.75 : (cfg.low || type === 'police') ? 0.5 : 0.62;
  const group = new THREE.Group();
  const bodyMat = opts.paint === 'camo'
    ? new THREE.MeshLambertMaterial({ map: camoTexture() })
    : new THREE.MeshLambertMaterial({ color });
  const stripeMat = new THREE.MeshLambertMaterial({ color: opts.stripe ?? 0x111111 });
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xd8a800 });

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
  if (cfg.lowrider) {
    // Open-top convertible: interior tub + seats + a low windshield, no roof.
    const tub = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.22, W * 0.8), new THREE.MeshLambertMaterial({ color: 0x181818 }));
    tub.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.08, 0);
    group.add(tub);
    for (const s of [-0.4, 0.4]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
      seat.position.set(-L * 0.12, bodyY + bodyH / 2 + 0.3, s);
      group.add(seat);
    }
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, W * 0.8), glassMat);
    shield.position.set(L * 0.2, bodyY + bodyH / 2 + 0.3, 0);
    shield.rotation.z = -0.25;
    group.add(shield);
  } else {
    // Cabin / glasshouse (taller and boxier on the SUV).
    const cabinH = cfg.suv ? 0.62 : 0.5;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.48, cabinH, W * 0.86), glassMat);
    cabin.position.set(-L * 0.06, bodyY + bodyH / 2 + cabinH / 2 - 0.01, 0);
    cabin.castShadow = true;
    group.add(cabin);
    if (cfg.suv) {
      // Flat roof + roof rails.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.46, 0.08, W * 0.84), bodyMat);
      roof.position.set(-L * 0.06, bodyY + bodyH / 2 + cabinH + 0.02, 0);
      group.add(roof);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.06, 0.08), new THREE.MeshLambertMaterial({ color: 0x161616 }));
        rail.position.set(-L * 0.06, bodyY + bodyH / 2 + cabinH + 0.09, s * W * 0.32);
        group.add(rail);
      }
    } else {
      // Curved roof dome over the glasshouse.
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bodyMat);
      dome.scale.set(L * 0.21, 0.26, W * 0.42);
      dome.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.42, 0);
      dome.castShadow = true;
      group.add(dome);
    }
  }
  // Rounded nose + tail — skipped on the SUV, whose face is flat and upright.
  if (!cfg.suv) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bodyMat);
    nose.scale.set(0.55, 0.32, W * 0.48);
    nose.position.set(L / 2 - 0.15, bodyY, 0);
    nose.castShadow = true;
    group.add(nose);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bodyMat);
    tail.scale.set(0.45, 0.3, W * 0.48);
    tail.position.set(-L / 2 + 0.15, bodyY, 0);
    group.add(tail);
  }
  if (cfg.suv) {
    // Upright slat grille + round headlights (G-Wagon face), side steps,
    // and a spare wheel on the tailgate.
    const slatGrille = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.2), new THREE.MeshLambertMaterial({ map: grilleTexture() }));
    slatGrille.position.set(L / 2 + 0.01, bodyY + 0.05, 0);
    group.add(slatGrille);
    for (const s of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), headMat);
      lamp.rotation.z = Math.PI / 2; // disc faces forward
      lamp.position.set(L / 2 + 0.02, bodyY + 0.1, s);
      group.add(lamp);
    }
    for (const s of [-1, 1]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(L * 0.6, 0.08, 0.22), new THREE.MeshLambertMaterial({ color: 0x161616 }));
      step.position.set(0, 0.2, s * (W / 2 + 0.08));
      group.add(step);
    }
    const spare = new THREE.Mesh(tireGeoBig, tireMat);
    spare.position.set(-L / 2 - 0.12, bodyY + 0.1, 0);
    spare.rotation.y = Math.PI / 2; // torus axle along x (rear-facing)
    group.add(spare);
    const spareHub = new THREE.Mesh(hubGeo, [hubSideMat, hubCapMat, hubCapMat]);
    spareHub.rotation.x = Math.PI / 2;
    spare.add(spareHub);
  }
  // Side mirrors.
  for (const s of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), bodyMat);
    mir.position.set(L * 0.18, bodyY + bodyH / 2 + 0.12, s * (W / 2 + 0.06));
    group.add(mir);
  }

  if (cfg.spoiler || type === 'police') {
    if (cfg.spoiler) {
      // Race cars get the big wing (reference: the orange supercar).
      const bigWing = type === 'race';
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, bigWing ? W * 1.02 : W * 0.92), bodyMat);
      wing.position.set(-L / 2 + 0.12, bodyY + bodyH + (bigWing ? 0.38 : 0.28), 0);
      wing.castShadow = true;
      group.add(wing);
      for (const s of [-0.6, 0.6]) {
        const sup = new THREE.Mesh(new THREE.BoxGeometry(0.1, bigWing ? 0.4 : 0.3, 0.1), bodyMat);
        sup.position.set(-L / 2 + 0.12, bodyY + bodyH + (bigWing ? 0.18 : 0.12), s * W * 0.4);
        group.add(sup);
      }
      // Racing stripe over hood + roof.
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.03, 0.34), stripeMat);
      stripe.position.set(0, bodyY + bodyH / 2 + 0.02, 0);
      group.add(stripe);
      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.03, 0.34), stripeMat);
      stripe2.position.set(-L * 0.06, bodyY + bodyH / 2 + 0.55, 0);
      group.add(stripe2);
    }
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

  // Headlights + taillights (the SUV has its own round lamps above).
  if (!cfg.suv) {
    const headGeo = new THREE.BoxGeometry(0.1, 0.18, 0.42);
    for (const s of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(headGeo, headMat);
      hl.position.set(L / 2 + 0.01, bodyY + 0.08, s);
      group.add(hl);
    }
  }
  // Front grille bar between the headlights — gold on the lowrider.
  if (!cfg.suv) {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.9), cfg.lowrider ? goldMat : new THREE.MeshLambertMaterial({ color: 0x0e0e0e }));
    grille.position.set(L / 2 + 0.01, bodyY + 0.02, 0);
    group.add(grille);
  }
  if (cfg.lowrider) {
    // Gold bumpers front + rear.
    for (const bx of [L / 2 + 0.02, -L / 2 - 0.02]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, W * 0.96), goldMat);
      bumper.position.set(bx, 0.22, 0);
      group.add(bumper);
    }
  }
  const tailGeo = new THREE.BoxGeometry(0.08, 0.14, 0.4);
  const tailL = new THREE.Mesh(tailGeo, tailMat.clone());
  tailL.position.set(-L / 2 - 0.01, bodyY + 0.08, -0.55);
  group.add(tailL);
  const tailR = new THREE.Mesh(tailGeo, tailMat.clone());
  tailR.position.set(-L / 2 - 0.01, bodyY + 0.08, 0.55);
  group.add(tailR);

  // Wheels: torus tires + spoked hubs, so they read as real wheels. The
  // torus axle is already along z (the car's width); spinning rotation.z
  // turns the tire and the hub together (the hub is a child of the tire).
  // SUV, police supercar and low cars ride on the big wheels; race and
  // lowrider get gold rims.
  const bigWheels = cfg.low || cfg.suv || type === 'police';
  const wGeo = bigWheels ? tireGeoBig : tireGeo;
  const wheelY = cfg.suv ? 0.45 : bigWheels ? 0.42 : 0.36;
  const capMat = cfg.rims === 'gold' ? hubCapGoldMat : hubCapMat;
  const wheels = [];
  const wx = L * 0.32, wz = W / 2 - 0.02;
  for (const [x, z, front] of [[wx, -wz, true], [wx, wz, true], [-wx, -wz, false], [-wx, wz, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelY, z);
    const wheel = new THREE.Mesh(wGeo, tireMat);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, [hubSideMat, capMat, capMat]);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push({ pivot, wheel, front });
  }

  // Wheel-arch trim: dark rims above each wheel so the wheels sit in the body.
  const archMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const archY = wheelY + (bigWheels ? 0.43 : 0.38) + 0.02;
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
