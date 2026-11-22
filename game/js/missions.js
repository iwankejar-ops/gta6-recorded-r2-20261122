// missions.js — story engine: 8 missions (Rico Vega + Mara Solis), 3 side jobs,
// step machine, race laps, chases, taxi/courier work, rewards.
// GRAND CITY 6 — original code, written for this entry.

import { LOCATIONS, circuitPoint, circuitWaypoints } from './city.js';
import { makeCar, collideCars } from './vehicles.js';
import { dist2d, rand, pick } from './util.js';

const TAXI_SPOTS = [
  { x: -100, z: -52, name: 'Plaza' },
  { x: 60, z: -52, name: 'Market North' },
  { x: -60, z: 52, name: 'Hotel Row' },
  { x: 100, z: 92, name: 'Beachfront' },
  { x: -20, z: 100, name: 'Cafe Row' },
  { x: 20, z: -52, name: 'Police HQ' },
  { x: -100, z: -12, name: 'West Park' },
  { x: 100, z: -12, name: 'East Park' },
];

export const MISSION_DEFS = [
  {
    id: 1, name: 'Welcome Back', giver: 'Mara Solis',
    brief: 'Rico is back in Solmar after five years away. Mara is waiting at the Pier Cafe.',
    steps: [
      { type: 'goto', x: LOCATIONS.pierCafe.x, z: LOCATIONS.pierCafe.z, r: 4, label: 'Meet Mara at the Pier Cafe' },
      { type: 'talk', npc: 'mara', r: 3.5, label: 'Talk to Mara' },
    ],
    reward: { cash: 200, rep: 10 },
  },
  {
    id: 2, name: 'First Delivery', giver: 'Mara Solis',
    brief: 'Mara needs a package moved across town. Pick it up at the market, drop it at Club Neon.',
    steps: [
      { type: 'pickup', x: LOCATIONS.market.x, z: LOCATIONS.market.z, r: 4, label: 'Pick up the package at Solmar Market' },
      { type: 'goto', x: LOCATIONS.clubNeon.x, z: LOCATIONS.clubNeon.z, r: 4, label: 'Deliver the package to Club Neon' },
    ],
    reward: { cash: 350, rep: 15 },
  },
  {
    id: 3, name: 'Hot Pursuit', giver: 'Mara Solis',
    brief: 'The job went loud. Grab a car, reach the safehouse and lose the heat.',
    steps: [
      { type: 'enterCar', label: 'Get in a car' },
      { type: 'driveTo', x: LOCATIONS.safehouse.x, z: LOCATIONS.safehouse.z, r: 6, label: 'Drive to the safehouse' },
      { type: 'loseWanted', label: 'Lose the police (stay out of sight)' },
    ],
    onStart: (ctx) => ctx.police.addHeat(40),
    reward: { cash: 500, rep: 20 },
  },
  {
    id: 4, name: 'Solmar Grand Prix', giver: 'Mara Solis',
    brief: 'Two laps of the Solmar circuit. Beat the three rivals and the trophy is yours.',
    steps: [
      { type: 'race', laps: 2, label: 'Win the Grand Prix — 2 laps' },
    ],
    reward: { cash: 800, rep: 30 },
  },
  {
    id: 5, name: 'The Gold Getaway', giver: 'Mara Solis',
    brief: 'A gold race car is parked at the marina. Take it to the garage — the police will notice.',
    steps: [
      { type: 'enterCar', car: 'gold', label: 'Steal the gold race car at the marina' },
      { type: 'driveTo', x: LOCATIONS.garage.x, z: LOCATIONS.garage.z, r: 6, label: 'Deliver it to the garage' },
      { type: 'loseWanted', label: 'Lose the police' },
    ],
    onStart: (ctx) => ctx.police.addHeat(55),
    reward: { cash: 900, rep: 30 },
  },
  {
    id: 6, name: 'Night Shift', giver: 'Mara Solis',
    brief: 'Drive a taxi through the night. Three passengers, three fares.',
    steps: [
      { type: 'taxi', count: 3, label: 'Pick up 3 passengers' },
    ],
    onStart: (ctx) => ctx.setTime(21),
    reward: { cash: 600, rep: 20 },
  },
  {
    id: 7, name: 'The Big Score', giver: 'Mara Solis',
    brief: 'Banco Solmar, three seconds, then run. Wanted level 4. Get to the safehouse alive.',
    steps: [
      { type: 'goto', x: LOCATIONS.bank.x, z: LOCATIONS.bank.z, r: 4, label: 'Reach Banco Solmar' },
      { type: 'wait', x: LOCATIONS.bank.x, z: LOCATIONS.bank.z, seconds: 3, label: 'Grabbing the cash...' },
      { type: 'driveTo', x: LOCATIONS.safehouse.x, z: LOCATIONS.safehouse.z, r: 6, label: 'Escape to the safehouse' },
      { type: 'loseWanted', label: 'Lose the police' },
    ],
    onStart: (ctx) => {
      ctx.police.addHeat(75);
      // A fast car is parked by the bank so the escape is actually possible.
      ctx.spawnMissionCar('sport', 0xc22a3a, -52, -40, Math.PI / 2);
    },
    reward: { cash: 2500, rep: 40 },
  },
  {
    id: 8, name: 'King of Solmar', giver: 'Mara Solis',
    brief: 'Vex, the rival who ran you out of town, is racing through Solmar. Ram his car off the road, then meet Mara at the marina.',
    steps: [
      { type: 'chase', label: 'Ram Vex off the road (5 hits)' },
      { type: 'goto', x: LOCATIONS.marina.x, z: LOCATIONS.marina.z, r: 4, label: 'Meet Mara at the marina' },
      { type: 'talk', npc: 'mara', r: 3.5, label: 'Talk to Mara' },
    ],
    reward: { cash: 4000, rep: 50 },
  },
];

export class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.unlocked = 1;      // highest mission id available
    this.current = null;    // {def, stepIdx, ...runtime}
    this.marker = null;     // THREE.Group beacon (built by main, set here)
    this.race = null;       // race runtime
    this.chase = null;      // chase runtime
    this.taxi = null;       // taxi runtime
    this.courier = null;
    this.sideJob = null;    // active side job {kind, ...}
    this.stepT = 0;
    this.nearT = 0;
    this.completed = [];
  }

  get active() { return this.current !== null || this.sideJob !== null; }

  startMission(id) {
    const def = MISSION_DEFS.find((m) => m.id === id);
    if (!def || this.current) return false;
    this.current = { def, stepIdx: 0 };
    this.stepT = 0;
    this.nearT = 0;
    if (def.onStart) def.onStart(this.ctx);
    if (id === 4) this._setupRace();
    if (id === 5) this._setupGoldCar();
    if (id === 8) this._setupChase();
    this.ctx.hud.showBanner(`MISSION ${def.id}: ${def.name}`, def.brief);
    this.ctx.audio.missionDone();
    this._updateMarker();
    return true;
  }

  _setupRace() {
    const start = circuitPoint(0);
    const raceCar = this.ctx.spawnMissionCar('race', 0xd21f26, start.x, start.z, start.angle);
    this.ctx.teleportPlayerToCar(raceCar);
    const rivals = [];
    const colors = [0x1f6fd2, 0xf2a007, 0x18b26b];
    const wps = circuitWaypoints(64);
    for (let i = 0; i < 3; i++) {
      const p = wps[(62 - i * 2) % 64];
      const c = this.ctx.spawnMissionCar('race', colors[i], p.x, p.z, p.angle);
      rivals.push({ car: c, wp: (62 - i * 2) % 64, speed: 29 + i * 0.7 });
    }
    this.race = { laps: 2, lap: 0, gate: 0, rivals, wps, finished: false, place: 1 };
  }

  _setupGoldCar() {
    const gold = this.ctx.spawnMissionCar('race', 0xd8a800, LOCATIONS.marina.x + 6, LOCATIONS.marina.z, Math.PI / 2);
    gold.group.children.forEach(() => {});
    this.goldCar = gold;
  }

  _setupChase() {
    const c = this.ctx.spawnMissionCar('sport', 0x7a1f8a, 0, -40, 0);
    const wps = [];
    for (const [bx, bz] of [[-60, -60], [60, -60], [60, 60], [-60, 60]]) {
      wps.push({ x: bx, z: bz });
    }
    this.chase = { car: c, wps, wp: 0, health: 100, hits: 0, hitCooldown: 0, speed: 26 };
  }

  _cleanupMissionCars() {
    if (this.race) this.race = null;
    this.goldCar = null;
    this.chase = null;
    this.ctx.clearMissionCars();
  }

  _updateMarker() {
    if (!this.current) { this.ctx.setMarker(null); return; }
    const step = this.current.def.steps[this.current.stepIdx];
    if (!step) { this.ctx.setMarker(null); return; }
    if (step.type === 'goto' || step.type === 'pickup' || step.type === 'driveTo' || step.type === 'wait') {
      this.ctx.setMarker({ x: step.x, z: step.z, label: step.label });
    } else if (step.type === 'talk') {
      const m = this.ctx.maraPos();
      this.ctx.setMarker({ x: m.x, z: m.z, label: step.label });
    } else if (step.type === 'enterCar' && step.car === 'gold' && this.goldCar) {
      const g = this.goldCar.group.position;
      this.ctx.setMarker({ x: g.x, z: g.z, label: step.label });
    } else if (step.type === 'race') {
      this.ctx.setMarker({ x: LOCATIONS.raceStart.x, z: LOCATIONS.raceStart.z, label: step.label });
    } else if (step.type === 'chase' && this.chase) {
      const c = this.chase.car.group.position;
      this.ctx.setMarker({ x: c.x, z: c.z, label: step.label });
    } else if (step.type === 'taxi' && this.taxi && this.taxi.phase === 'pickup') {
      this.ctx.setMarker({ x: this.taxi.spot.x, z: this.taxi.spot.z, label: 'Pick up the passenger' });
    } else if (step.type === 'taxi' && this.taxi) {
      this.ctx.setMarker({ x: this.taxi.dest.x, z: this.taxi.dest.z, label: 'Drop off the passenger' });
    } else {
      this.ctx.setMarker(null);
    }
    this.ctx.setObjective(step.label);
  }

  _advance() {
    const cur = this.current;
    if (!cur) return;
    cur.stepIdx++;
    this.stepT = 0;
    this.nearT = 0;
    this.ctx.audio.pickup();
    if (cur.stepIdx >= cur.def.steps.length) {
      this._completeMission();
    } else {
      this._updateMarker();
    }
  }

  _completeMission() {
    const def = this.current.def;
    this.ctx.addCash(def.reward.cash);
    this.ctx.addRep(def.reward.rep);
    this.completed.push(def.id);
    this.unlocked = Math.max(this.unlocked, Math.min(8, def.id + 1));
    this.ctx.hud.showBanner('MISSION COMPLETE', `${def.name}  •  +$${def.reward.cash}  •  +${def.reward.rep} REP`);
    this.ctx.audio.missionDone();
    this._cleanupMissionCars();
    this.current = null;
    this.ctx.setMarker(null);
    this.ctx.setObjective(this.unlocked <= 8 ? `Next: Mission ${this.unlocked} — open the pause menu (Esc)` : 'Story complete — free roam Solmar!');
    this.ctx.saveGame();
  }

  failMission(reason) {
    if (!this.current) return;
    this.ctx.hud.showBanner('MISSION FAILED', reason);
    this._cleanupMissionCars();
    this.current = null;
    this.ctx.setMarker(null);
    this.ctx.setObjective('Mission failed — open the pause menu (Esc) to retry.');
  }

  // ---- side jobs ---------------------------------------------------------

  startSideJob(kind) {
    if (this.current || this.sideJob) return false;
    if (kind === 'taxi') {
      this.sideJob = { kind, count: 0, total: 3, phase: 'pickup' };
      this._nextTaxiSpot();
      this.ctx.hud.showBanner('SIDE JOB: TAXI', 'Pick up 3 passengers across Solmar.');
    } else if (kind === 'courier') {
      this.sideJob = { kind, count: 0, total: 5, timeLeft: 75 };
      this._nextCourierSpot();
      this.ctx.hud.showBanner('SIDE JOB: COURIER', '5 deliveries — 75 seconds each.');
    } else if (kind === 'streetrace') {
      const start = circuitPoint(0);
      const raceCar = this.ctx.spawnMissionCar('race', 0x1f6fd2, start.x, start.z, start.angle);
      this.ctx.teleportPlayerToCar(raceCar);
      this.sideJob = { kind, lapT: 0, gate: 0, wps: circuitWaypoints(64), car: raceCar, best: null };
      this.ctx.hud.showBanner('SIDE JOB: STREET RACE', 'One lap of the circuit — beat 45 seconds.');
    }
    this.ctx.audio.pickup();
    return true;
  }

  _nextTaxiSpot() {
    const job = this.sideJob;
    job.spot = pick(this.ctx.rng, TAXI_SPOTS);
    job.dest = pick(this.ctx.rng, TAXI_SPOTS.filter((s) => s !== job.spot));
    job.phase = 'pickup';
    this.ctx.setMarker({ x: job.spot.x, z: job.spot.z, label: 'Pick up the passenger' });
    this.ctx.setObjective(`Taxi: pick up the passenger at ${job.spot.name}`);
  }

  _nextCourierSpot() {
    const job = this.sideJob;
    job.spot = pick(this.ctx.rng, TAXI_SPOTS);
    job.timeLeft = 75;
    this.ctx.setMarker({ x: job.spot.x, z: job.spot.z, label: 'Courier delivery' });
    this.ctx.setObjective(`Courier: deliver to ${job.spot.name} — ${Math.ceil(job.timeLeft)}s`);
  }

  _endSideJob(success, text) {
    const job = this.sideJob;
    if (job && job.car) this.ctx.removeMissionCar(job.car);
    this.sideJob = null;
    this.ctx.setMarker(null);
    if (success) {
      const pay = job.kind === 'taxi' ? 450 : job.kind === 'courier' ? 600 : 500;
      this.ctx.addCash(pay);
      this.ctx.addRep(10);
      this.ctx.hud.showBanner('JOB DONE', `${text}  •  +$${pay}`);
      this.ctx.audio.missionDone();
      this.ctx.saveGame();
    } else {
      this.ctx.hud.showBanner('JOB FAILED', text);
    }
    this.ctx.setObjective('Free roam — open the pause menu (Esc) for missions and jobs.');
  }

  // ---- per-frame ---------------------------------------------------------

  update(dt) {
    if (this.current) this._updateMission(dt);
    if (this.sideJob) this._updateSideJob(dt);
    if (this.race) this._updateRace(dt);
    if (this.chase) this._updateChase(dt);
  }

  _playerNear(x, z, r) {
    return dist2d(this.ctx.player.x, this.ctx.player.z, x, z) < r;
  }

  _updateMission(dt) {
    const cur = this.current;
    if (!cur) return;
    const step = cur.def.steps[cur.stepIdx];
    if (!step) return;
    const p = this.ctx.player;
    switch (step.type) {
      case 'goto':
      case 'pickup':
      case 'deliver':
        if (this._playerNear(step.x, step.z, step.r)) this._advance();
        break;
      case 'talk': {
        const m = this.ctx.maraPos();
        if (this._playerNear(m.x, m.z, step.r)) {
          this.nearT += dt;
          if (this.nearT > 1.2) this._advance();
        } else this.nearT = 0;
        break;
      }
      case 'enterCar':
        if (p.inCar && (!step.car || p.car === this.goldCar)) this._advance();
        break;
      case 'driveTo':
        if (p.inCar && this._playerNear(step.x, step.z, step.r)) this._advance();
        break;
      case 'wait': {
        // Near the previous step's spot when the step has no coords of its own.
        const prev = cur.def.steps[cur.stepIdx - 1];
        const tx = step.x ?? prev?.x;
        const tz = step.z ?? prev?.z;
        if (tx !== undefined && this._playerNear(tx, tz, 5)) {
          this.stepT += dt;
          this.ctx.setObjective(`${step.label} ${Math.ceil(step.seconds - this.stepT)}s`);
          if (this.stepT >= step.seconds) this._advance();
        } else this.stepT = 0;
        break;
      }
      case 'loseWanted':
        if (this.ctx.police.wanted === 0) this._advance();
        else this.ctx.setObjective(`${step.label} — wanted: ${'★'.repeat(this.ctx.police.wanted)}`);
        break;
      case 'race':
        if (this.race && this.race.finished) this._advance();
        break;
      case 'chase':
        if (this.chase && this.chase.health <= 0) this._advance();
        break;
      case 'taxi':
        if (!this.taxi) {
          this.taxi = { count: 0, total: step.count, phase: 'pickup' };
          this._nextMissionTaxiSpot();
        }
        this._updateMissionTaxi(dt);
        if (this.taxi.count >= step.count) {
          this.taxi = null;
          this._advance();
        }
        break;
      default:
        break;
    }
  }

  _nextMissionTaxiSpot() {
    const t = this.taxi;
    t.spot = pick(this.ctx.rng, TAXI_SPOTS);
    t.dest = pick(this.ctx.rng, TAXI_SPOTS.filter((s) => s !== t.spot));
    t.phase = 'pickup';
    this.ctx.setMarker({ x: t.spot.x, z: t.spot.z, label: 'Pick up the passenger' });
    this.ctx.setObjective(`Night Shift: pick up the passenger at ${t.spot.name} (${t.count}/${t.total})`);
  }

  _updateMissionTaxi(dt) {
    const t = this.taxi;
    const p = this.ctx.player;
    if (t.phase === 'pickup') {
      if (this._playerNear(t.spot.x, t.spot.z, 4)) {
        t.phase = 'dropoff';
        this.ctx.audio.pickup();
        this.ctx.setMarker({ x: t.dest.x, z: t.dest.z, label: 'Drop off the passenger' });
        this.ctx.setObjective(`Night Shift: drop off at ${t.dest.name} (${t.count}/${t.total})`);
      }
    } else if (this._playerNear(t.dest.x, t.dest.z, 4)) {
      t.count++;
      this.ctx.addCash(120);
      this.ctx.audio.pickup();
      if (t.count < t.total) this._nextMissionTaxiSpot();
      else this.ctx.setMarker(null);
    }
  }

  _updateSideJob(dt) {
    const job = this.sideJob;
    const p = this.ctx.player;
    if (job.kind === 'taxi') {
      if (job.phase === 'pickup' && this._playerNear(job.spot.x, job.spot.z, 4)) {
        job.phase = 'dropoff';
        this.ctx.audio.pickup();
        this.ctx.setMarker({ x: job.dest.x, z: job.dest.z, label: 'Drop off the passenger' });
        this.ctx.setObjective(`Taxi: drop off at ${job.dest.name} (${job.count}/${job.total})`);
      } else if (job.phase === 'dropoff' && this._playerNear(job.dest.x, job.dest.z, 4)) {
        job.count++;
        this.ctx.addCash(120);
        this.ctx.audio.pickup();
        if (job.count >= job.total) this._endSideJob(true, 'All fares delivered.');
        else this._nextTaxiSpot();
      }
    } else if (job.kind === 'courier') {
      job.timeLeft -= dt;
      this.ctx.setObjective(`Courier: deliver to ${job.spot.name} — ${Math.max(0, Math.ceil(job.timeLeft))}s (${job.count}/${job.total})`);
      if (job.timeLeft <= 0) { this._endSideJob(false, 'Out of time.'); return; }
      if (this._playerNear(job.spot.x, job.spot.z, 4)) {
        job.count++;
        this.ctx.addCash(90);
        this.ctx.audio.pickup();
        if (job.count >= job.total) this._endSideJob(true, 'All deliveries done.');
        else this._nextCourierSpot();
      }
    } else if (job.kind === 'streetrace') {
      job.lapT += dt;
      const gate = this._raceGateProgress(job);
      if (gate === 'lap') {
        const t = job.lapT;
        this._endSideJob(true, `Lap done in ${t.toFixed(1)}s${t < 45 ? ' — under 45s!' : ''}.`);
        return;
      }
      this.ctx.setObjective(`Street Race: lap ${job.lapT.toFixed(1)}s — beat 45s`);
      if (job.lapT > 120) this._endSideJob(false, 'Too slow — lap over 120s.');
    }
  }

  /** Progress along the circuit for the player's car; returns 'lap' when a lap completes. */
  _raceGateProgress(job) {
    const p = this.ctx.player;
    if (!p.inCar || !p.car) return null;
    const px = p.car.group.position.x, pz = p.car.group.position.z;
    // Nearest waypoint index.
    let best = 0, bestD = 1e9;
    for (let i = 0; i < job.wps.length; i++) {
      const d = dist2d(px, pz, job.wps[i].x, job.wps[i].z);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > 14) return null;
    const gateIdx = Math.floor(best / (job.wps.length / 4));
    if (gateIdx === job.gate) {
      job.gate = (job.gate + 1) % 4;
      if (job.gate === 0) return 'lap';
    }
    return null;
  }

  _updateRace(dt) {
    const race = this.race;
    if (!race || race.finished) return;
    // Rivals follow the circuit.
    for (const r of race.rivals) {
      const target = race.wps[r.wp];
      const cx = r.car.group.position.x, cz = r.car.group.position.z;
      const d = dist2d(cx, cz, target.x, target.z);
      if (d < 6) r.wp = (r.wp + 1) % race.wps.length;
      const wantHeading = Math.atan2(-(target.z - cz), target.x - cx);
      r.car.heading += (wantHeading - r.car.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const fx = Math.sin(r.car.heading), fz = -Math.cos(r.car.heading);
      r.car.group.position.x += fx * r.speed * dt;
      r.car.group.position.z += fz * r.speed * dt;
      r.car.group.rotation.y = -r.car.heading;
      const spin = (r.speed * dt) / 0.36;
      for (const w of r.car.wheels) w.wheel.rotation.z += spin;
    }
    // Player lap tracking via the same gate logic.
    const job = { wps: race.wps, gate: race.gate };
    if (this._raceGateProgress(job) === 'lap') {
      race.lap++;
      race.gate = 0;
      this.ctx.hud.showBanner(`LAP ${race.lap}/${race.laps}`, race.lap >= race.laps ? 'Final lap!' : 'Keep pushing!');
      if (race.lap >= race.laps) {
        // Player wins if no rival has finished first (rivals are slower, so this holds).
        race.finished = true;
        this.ctx.hud.showBanner('YOU WIN THE GRAND PRIX', 'First across the line!');
      }
    } else {
      race.gate = job.gate;
    }
    // Rival lap counting (they are slower; only matters if the player dawdles).
    for (const r of race.rivals) {
      if (r.wp === 0 && !r.counted) { r.laps = (r.laps || 0) + 1; r.counted = true; }
      if (r.wp !== 0) r.counted = false;
      if ((r.laps || 0) >= race.laps && !race.finished) {
        race.finished = true;
        this.failMission('A rival won the Grand Prix. Retry from the pause menu.');
      }
    }
  }

  _updateChase(dt) {
    const ch = this.chase;
    if (!ch || ch.health <= 0) return;
    ch.hitCooldown = Math.max(0, ch.hitCooldown - dt);
    // Rival drives a city loop.
    const target = ch.wps[ch.wp];
    const cx = ch.car.group.position.x, cz = ch.car.group.position.z;
    const d = dist2d(cx, cz, target.x, target.z);
    if (d < 8) ch.wp = (ch.wp + 1) % ch.wps.length;
    const wantHeading = Math.atan2(-(target.z - cz), target.x - cx);
    ch.car.heading += (wantHeading - ch.car.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    const fx = Math.sin(ch.car.heading), fz = -Math.cos(ch.car.heading);
    ch.car.group.position.x += fx * ch.speed * dt;
    ch.car.group.position.z += fz * ch.speed * dt;
    ch.car.group.rotation.y = -ch.car.heading;
    const spin = (ch.speed * dt) / 0.36;
    for (const w of ch.car.wheels) w.wheel.rotation.z += spin;
    // Player rams the rival: damage.
    const p = this.ctx.player;
    if (p.inCar && p.car && ch.hitCooldown <= 0) {
      if (collideCars(p.car, ch.car) && Math.abs(p.car.speed) > 6) {
        ch.health -= 20;
        ch.hits++;
        ch.hitCooldown = 1;
        this.ctx.audio.crash();
        this.ctx.setObjective(`Ram Vex off the road — hits ${ch.hits}/5`);
        if (ch.health <= 0) {
          ch.car.speed = 0;
          this.ctx.hud.showBanner('VEX IS DONE', 'His car is wrecked. Meet Mara at the marina.');
        }
      }
    }
  }
}
