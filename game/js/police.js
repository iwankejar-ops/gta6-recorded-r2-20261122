// police.js — wanted system: heat, police pursuit cars, foot officers,
// roadblocks at 4+ stars, busted / escape rules.
// GRAND CITY 6 — original code, written for this entry.

import { mulberry32, rand, clamp, angleToward, dist2d } from './util.js';
import { CITY } from './city.js';
import { makeCar, collideCars } from './vehicles.js';
import { makePolice, animateWalk } from './people.js';

export class PoliceManager {
  constructor(scene, colliders, audio) {
    this.scene = scene;
    this.colliders = colliders;
    this.audio = audio;
    this.rng = mulberry32(4242);
    this.heat = 0;          // 0..100
    this.wanted = 0;        // 0..5
    this.policeCars = [];   // {car, stuckT}
    this.officers = [];     // {person, bustT}
    this.roadblock = null;  // {cars:[], x, z, timer}
    this.clearTimer = 0;    // time with no police near
    this.bustedTimer = 0;
    this.flashT = 0;
    this.onBusted = null;   // callback()
  }

  get stars() { return this.wanted; }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.wanted = Math.ceil(this.heat / 20);
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.heat = this.wanted === 0 ? 0 : (this.wanted - 1) * 20 + 10;
  }

  clearWanted() {
    this.heat = 0;
    this.wanted = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const p of this.policeCars) this.scene.remove(p.car.group);
    for (const o of this.officers) this.scene.remove(o.person.group);
    this.policeCars = [];
    this.officers = [];
    if (this.roadblock) {
      for (const c of this.roadblock.cars) this.scene.remove(c.group);
      this.roadblock = null;
    }
    if (this.audio) this.audio.setSiren(false);
  }

  _nearestStreetPoint(x, z) {
    let bx = CITY.streets[0], bz = CITY.streets[0];
    for (const s of CITY.streets) {
      if (Math.abs(s - x) < Math.abs(bx - x)) bx = s;
      if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
    }
    return { x: bx, z: bz };
  }

  _spawnPoliceCar(x, z) {
    const car = makeCar(this.scene, 'police', 0x1c1e22, { x, z, heading: this.rng() * 6.28, driver: 'police' });
    this.policeCars.push({ car, stuckT: 0 });
    return car;
  }

  _spawnOfficer(x, z) {
    const person = makePolice(this.scene, x, z, this.rng() * 6.28);
    this.officers.push({ person, bustT: 0 });
    return person;
  }

  update(dt, player, traffic) {
    const px = player.x, pz = player.z;
    this.flashT += dt;
    const flashOn = Math.floor(this.flashT * 4) % 2 === 0;
    for (const p of this.policeCars) {
      if (p.car.lightBarL) p.car.lightBarL.material.emissiveIntensity = flashOn ? 2.4 : 0.15;
      if (p.car.lightBarR) p.car.lightBarR.material.emissiveIntensity = flashOn ? 0.15 : 2.4;
    }

    // Desired police presence by wanted level.
    const wantCars = this.wanted === 0 ? 0 : Math.min(1 + this.wanted, 5);
    const wantOfficers = this.wanted >= 2 && !player.inCar ? Math.min(this.wanted - 1, 3) : 0;

    // Spawn police cars near the player on streets.
    while (this.policeCars.length < wantCars) {
      const a = this.rng() * Math.PI * 2;
      const sp = this._nearestStreetPoint(px + Math.cos(a) * 55, pz + Math.sin(a) * 55);
      this._spawnPoliceCar(sp.x + rand(this.rng, -4, 4), sp.z + rand(this.rng, -4, 4));
    }
    while (this.policeCars.length > wantCars) {
      const p = this.policeCars.pop();
      this.scene.remove(p.car.group);
    }
    while (this.officers.length < wantOfficers) {
      const a = this.rng() * Math.PI * 2;
      this._spawnOfficer(px + Math.cos(a) * 28, pz + Math.sin(a) * 28);
    }
    while (this.officers.length > wantOfficers) {
      const o = this.officers.pop();
      this.scene.remove(o.person.group);
    }

    // Pursuit: police cars chase the player.
    let nearestPolice = 999;
    for (const p of this.policeCars) {
      const car = p.car;
      const cx = car.group.position.x, cz = car.group.position.z;
      const d = dist2d(cx, cz, px, pz);
      nearestPolice = Math.min(nearestPolice, d);
      // Predict the player's position slightly.
      const tx = px + (player.vx || 0) * 0.4;
      const tz = pz + (player.vz || 0) * 0.4;
      const wantHeading = Math.atan2(-(tz - cz), tx - cx);
      car.heading = angleToward(car.heading, wantHeading, 2.6 * dt);
      const maxSpd = 30 + this.wanted * 1.8;
      car.speed += ((d > 12 ? maxSpd : maxSpd * 0.75) - car.speed) * Math.min(1, dt * 1.2);
      const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
      let nx = cx + fx * car.speed * dt;
      let nz = cz + fz * car.speed * dt;
      // Slide along building colliders instead of stopping dead.
      for (const b of this.colliders) {
        const ccx = Math.max(b.minX, Math.min(nx, b.maxX));
        const ccz = Math.max(b.minZ, Math.min(nz, b.maxZ));
        const dx = nx - ccx, dz = nz - ccz;
        if (dx * dx + dz * dz < 1.7 * 1.7) {
          car.speed *= 0.5;
          nx = cx; nz = cz;
          p.stuckT += dt;
          break;
        }
      }
      if (p.stuckT > 1.5) {
        // Reverse out of a jam.
        car.speed = -8;
        p.stuckT = -1.5;
      }
      car.group.position.x = nx;
      car.group.position.z = nz;
      car.group.rotation.y = -car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.wheel.rotation.z += spin;
      // Ram the player's car.
      if (player.inCar && player.car) {
        if (collideCars(car, player.car)) {
          if (Math.abs(car.speed) > 8 && this.audio) this.audio.crash();
        }
      }
    }

    // Foot officers run at the player; touching one busts the player.
    for (const o of this.officers) {
      const person = o.person;
      const ox = person.group.position.x, oz = person.group.position.z;
      const d = dist2d(ox, oz, px, pz);
      nearestPolice = Math.min(nearestPolice, d);
      const wantHeading = Math.atan2(-(pz - oz), px - ox);
      person.heading = angleToward(person.heading, wantHeading, 4 * dt);
      const spd = 5.2;
      person.group.position.x += Math.sin(person.heading) * spd * dt;
      person.group.position.z += -Math.cos(person.heading) * spd * dt;
      person.group.rotation.y = -person.heading;
      animateWalk(person, spd, dt);
      if (d < 1.7) {
        o.bustT += dt;
        if (o.bustT > 1.1 && this.onBusted) this.onBusted();
      } else {
        o.bustT = Math.max(0, o.bustT - dt);
      }
    }

    // Roadblock at 4+ stars: two police cars across the road ahead of the player.
    if (this.wanted >= 4) {
      if (!this.roadblock) {
        const fx = Math.sin(player.heading || 0), fz = -Math.cos(player.heading || 0);
        const bx = px + fx * 46, bz = pz + fz * 46;
        const perp = (player.heading || 0) + Math.PI / 2;
        const cars = [];
        for (const s of [-4, 4]) {
          const c = makeCar(this.scene, 'police', 0x1c1e22, {
            x: bx + Math.sin(perp) * s, z: bz - Math.cos(perp) * s,
            heading: perp, driver: 'police',
          });
          cars.push(c);
        }
        this.roadblock = { cars, x: bx, z: bz, timer: 0 };
      } else {
        this.roadblock.timer += dt;
        if (this.roadblock.timer > 14) {
          for (const c of this.roadblock.cars) this.scene.remove(c.group);
          this.roadblock = null;
        }
      }
    } else if (this.roadblock) {
      for (const c of this.roadblock.cars) this.scene.remove(c.group);
      this.roadblock = null;
    }

    // Busted while sitting in a car surrounded by police.
    if (player.inCar && player.car && Math.abs(player.car.speed) < 1 && this.wanted > 0) {
      if (nearestPolice < 5) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2.5 && this.onBusted) this.onBusted();
      } else this.bustedTimer = 0;
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt);
    }

    // Wanted decay: escape when no police is near for a while.
    if (this.wanted > 0) {
      if (nearestPolice > 55) {
        this.clearTimer += dt;
        if (this.clearTimer > 8) {
          this.heat = Math.max(0, this.heat - 22 * dt);
          const nw = Math.ceil(this.heat / 20);
          if (nw < this.wanted) this.wanted = nw;
          if (this.heat <= 0) this.clearWanted();
        }
      } else {
        this.clearTimer = 0;
      }
    }

    if (this.audio) this.audio.setSiren(this.wanted > 0 && nearestPolice < 90);
  }
}
