// traffic.js — traffic cars on road loops, pedestrians on sidewalk loops,
// parked cars to steal, and pedestrian flee reactions.
// GRAND CITY 6 — original code, written for this entry.

import { mulberry32, rand, pick, angleToward, dist2d } from './util.js';
import { CITY, blockLoop } from './city.js';
import { makeCar, CAR_TYPES } from './vehicles.js';
import { makePedestrian, animateWalk } from './people.js';

const TRAFFIC_COLORS = ['sedan', 'sedan', 'sedan', 'van', 'van', 'truck', 'sport'];

export class TrafficManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(777);
    this.cars = [];   // {car, loop, idx, speed, targetSpeed, loopDir}
    this.peds = [];   // {person, loop, idx, speed, pauseT, fleeT, fleeX, fleeZ}
    this.parked = []; // enterable cars with driver null
    this._spawnTraffic();
    this._spawnPeds();
    this._spawnParked();
  }

  _randomBlock() {
    const b = CITY.blocks;
    return { bx: b[Math.floor(this.rng() * b.length)], bz: b[Math.floor(this.rng() * b.length)] };
  }

  _spawnTraffic() {
    for (let i = 0; i < 14; i++) {
      let bx, bz, tries = 0;
      do {
        ({ bx, bz } = this._randomBlock());
        tries++;
      } while ((bx === 0 && bz === 0) && tries < 8);
      const clockwise = (bx + bz) % 80 === 0;
      const loop = blockLoop(bx, bz, 17.5, clockwise);
      const idx = Math.floor(this.rng() * loop.length);
      const p = loop[idx];
      const type = pick(this.rng, TRAFFIC_COLORS);
      const colors = CAR_TYPES[type].colors;
      const car = makeCar(this.scene, type, colors[Math.floor(this.rng() * colors.length)], {
        x: p.x, z: p.z, heading: 0, driver: 'traffic',
      });
      this.cars.push({
        car, loop, idx,
        speed: rand(this.rng, 7, 11),
        targetSpeed: rand(this.rng, 8, 13),
        loopDir: clockwise ? 1 : -1,
      });
    }
  }

  _spawnPeds() {
    for (let i = 0; i < 26; i++) {
      let bx, bz, tries = 0;
      do {
        ({ bx, bz } = this._randomBlock());
        tries++;
      } while ((bx === 0 && bz === 0) && tries < 8);
      const clockwise = this.rng() < 0.5;
      const loop = blockLoop(bx, bz, 16.4, clockwise);
      const idx = Math.floor(this.rng() * loop.length);
      const p = loop[idx];
      const person = makePedestrian(this.scene, this.rng, p.x, p.z, 0);
      this.peds.push({
        person, loop, idx,
        speed: rand(this.rng, 1.1, 1.9),
        pauseT: rand(this.rng, 0, 6),
        fleeT: 0, fleeX: 0, fleeZ: 0,
      });
    }
  }

  _spawnParked() {
    // Spots sit on OPEN ground only: streets run at x/z = -120,-80,-40,0,40,80,120
    // and blocks are centred at -100,-60,-20,20,60,100 — a spot at a block centre
    // lands inside a building. Plaza, beach, north grass and east open ground
    // are verified clear of every collider (see locCheck in main.js).
    const spots = [
      { x: 0, z: -92, type: 'sedan', heading: 0 },
      { x: 0, z: -108, type: 'sport', heading: Math.PI },
      { x: -40, z: 150, type: 'van', heading: Math.PI / 2 },
      { x: 60, z: 150, type: 'sedan', heading: Math.PI / 2 },
      { x: -60, z: -145, type: 'sport', heading: Math.PI / 2 },
      { x: 60, z: -145, type: 'sedan', heading: Math.PI / 2 },
      { x: 140, z: -60, type: 'taxi', heading: 0 },
    ];
    for (const s of spots) {
      const colors = CAR_TYPES[s.type].colors;
      const car = makeCar(this.scene, s.type, colors[Math.floor(this.rng() * colors.length)], {
        x: s.x, z: s.z, heading: s.heading, driver: null,
      });
      this.parked.push(car);
    }
  }

  /** Make nearby pedestrians run away from (x, z). */
  scarePeds(x, z, radius) {
    for (const p of this.peds) {
      const px = p.person.group.position.x, pz = p.person.group.position.z;
      if (dist2d(px, pz, x, z) < radius) {
        p.fleeT = 2.5;
        p.fleeX = px - x; p.fleeZ = pz - z;
      }
    }
  }

  /** Eject the driver of a traffic car (for carjacking): driver runs away. */
  ejectDriver(car) {
    const g = car.group.position;
    const ped = makePedestrian(this.scene, this.rng, g.x + 2, g.z + 2, car.heading);
    this.peds.push({
      person: ped, loop: blockLoop(0, 0, 16.4, true), idx: 0,
      speed: 3.4, pauseT: 0, fleeT: 4, fleeX: 2, fleeZ: 2,
    });
    car.driver = null;
  }

  nearestEnterableCar(x, z, maxDist) {
    let best = null, bestD = maxDist;
    const all = [...this.parked, ...this.cars.map((c) => c.car)];
    for (const car of all) {
      if (car.driver === 'player') continue;
      const d = dist2d(x, z, car.group.position.x, car.group.position.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  update(dt, player) {
    // --- traffic cars ---
    for (const t of this.cars) {
      if (t.car.driver === 'player') continue; // player drives it now
      if (t.car.driver === null && !this.parked.includes(t.car)) {
        // stolen and abandoned: cruise slowly on its loop again
        t.car.driver = 'traffic';
      }
      const target = t.loop[t.idx];
      const cx = t.car.group.position.x, cz = t.car.group.position.z;
      const d = dist2d(cx, cz, target.x, target.z);
      if (d < 5) t.idx = (t.idx + 1) % t.loop.length;
      const wantHeading = Math.atan2(-(target.z - cz), target.x - cx);
      t.car.heading = angleToward(t.car.heading, wantHeading, 2.4 * dt);
      // Slow for the car ahead on the same loop.
      let speedTarget = t.targetSpeed;
      for (const o of this.cars) {
        if (o === t || o.car.driver === 'player') continue;
        const od = dist2d(cx, cz, o.car.group.position.x, o.car.group.position.z);
        if (od < 9) {
          const ahead = (o.car.group.position.x - cx) * Math.sin(t.car.heading)
            + (o.car.group.position.z - cz) * -Math.cos(t.car.heading);
          if (ahead > 0) speedTarget = Math.min(speedTarget, 3);
        }
      }
      t.speed += (speedTarget - t.speed) * Math.min(1, dt * 1.5);
      const fx = Math.sin(t.car.heading), fz = -Math.cos(t.car.heading);
      t.car.group.position.x += fx * t.speed * dt;
      t.car.group.position.z += fz * t.speed * dt;
      t.car.group.rotation.y = -t.car.heading;
      const spin = (t.speed * dt) / 0.36;
      for (const w of t.car.wheels) w.wheel.rotation.z += spin;
    }

    // --- pedestrians ---
    for (const p of this.peds) {
      const person = p.person;
      const px = person.group.position.x, pz = person.group.position.z;
      if (p.downT > 0) {
        // Knocked down: lie still, then get up and run.
        p.downT -= dt;
        if (p.downT <= 0) {
          person.group.rotation.x = 0;
          p.fleeT = 3;
          p.fleeX = px - (player && player.x !== undefined ? player.x : px);
          p.fleeZ = pz - (player && player.z !== undefined ? player.z : pz);
        }
        animateWalk(person, 0, dt);
        continue;
      }
      if (p.fleeT > 0) {
        p.fleeT -= dt;
        const len = Math.hypot(p.fleeX, p.fleeZ) || 1;
        const heading = Math.atan2(-(p.fleeZ / len), p.fleeX / len);
        person.heading = angleToward(person.heading, heading, 6 * dt);
        person.group.position.x += Math.sin(person.heading) * 4 * dt;
        person.group.position.z += -Math.cos(person.heading) * 4 * dt;
        person.group.rotation.y = -person.heading;
        animateWalk(person, 4, dt);
        continue;
      }
      if (p.pauseT > 0) {
        p.pauseT -= dt;
        animateWalk(person, 0, dt);
        continue;
      }
      // Flee from a fast nearby player car.
      if (player && player.inCar && player.car) {
        const cd = dist2d(px, pz, player.car.group.position.x, player.car.group.position.z);
        if (cd < 7 && Math.abs(player.car.speed) > 8) {
          p.fleeT = 2;
          p.fleeX = px - player.car.group.position.x;
          p.fleeZ = pz - player.car.group.position.z;
          continue;
        }
      }
      const target = p.loop[p.idx];
      const d = dist2d(px, pz, target.x, target.z);
      if (d < 2.5) {
        p.idx = (p.idx + 1) % p.loop.length;
        if (this.rng() < 0.08) p.pauseT = rand(this.rng, 2, 7);
      }
      const wantHeading = Math.atan2(-(target.z - pz), target.x - px);
      person.heading = angleToward(person.heading, wantHeading, 3 * dt);
      person.group.position.x += Math.sin(person.heading) * p.speed * dt;
      person.group.position.z += -Math.cos(person.heading) * p.speed * dt;
      person.group.rotation.y = -person.heading;
      animateWalk(person, p.speed, dt);
    }
  }
}
