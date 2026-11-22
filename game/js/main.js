// main.js — GRAND CITY 6 boot + game loop: third-person player, chase camera,
// car enter/exit, punch, collisions, save/load, mission wiring, debug API.
// GRAND CITY 6 — original code, written for this entry.

import { clamp, lerp, angleToward, angleDiff, dist2d, resolveCircleBox, mulberry32, TAU } from './util.js';
import { CITY, LOCATIONS, buildCity, circuitWaypoints } from './city.js';
import { makeCar, driveCar, collideCars, setCarNight } from './vehicles.js';
import { makeRico, makeMara, animateWalk } from './people.js';
import { TrafficManager } from './traffic.js';
import { PoliceManager } from './police.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { World } from './world.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';

const SAVE_KEY = 'gc6-save-v1';

class Game {
  constructor() {
    this.state = 'title'; // title | playing | paused | ended
    this.cash = 500;
    this.rep = 0;
    this.rng = mulberry32(99);
    this.errors = [];
    this.ready = false;
    this.marker = null;
    this.markerPos = null;
    this.missionCars = [];
    this.punchCooldown = 0;
    this.punchT = 0;
    this.jumpY = 0;
    this.jumpV = 0;
    this.camYaw = 0;
    this.camPitch = 0.34;
    this.camDist = 7;
    this.camDistTarget = 7;
    this.time = 0;
  }

  init() {
    window.addEventListener('error', (e) => this.errors.push(String(e.message || e.error)));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d9);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    this.world = new World(this.scene, this.renderer);
    this.city = buildCity(this.scene);
    this.colliders = this.city.colliders;
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.input = new Input(this.renderer.domElement);
    this.traffic = new TrafficManager(this.scene, this.colliders);
    this.police = new PoliceManager(this.scene, this.colliders, this.audio);
    this.police.onBusted = () => this.onBusted();

    // Rico + Mara.
    this.rico = makeRico(this.scene, -100, 84, 0);
    this.mara = makeMara(this.scene, LOCATIONS.pierCafe.x, LOCATIONS.pierCafe.z + 3, Math.PI);
    this.player = {
      person: this.rico,
      x: -100, z: 84, heading: 0,
      vx: 0, vz: 0, speed: 0,
      inCar: false, car: null,
      health: 100,
    };

    // Mission marker beacon.
    this.markerGroup = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 9, 16, 1, true), beamMat);
    beam.position.y = 4.5;
    this.markerGroup.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    this.markerGroup.add(ring);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    gem.position.y = 6;
    this.markerGroup.add(gem);
    this.markerGem = gem;
    this.markerGroup.visible = false;
    this.scene.add(this.markerGroup);

    // Mission manager context.
    const ctx = {
      scene: this.scene,
      player: this.player,
      traffic: this.traffic,
      police: this.police,
      audio: this.audio,
      hud: this.hud,
      rng: this.rng,
      maraPos: () => ({ x: this.mara.group.position.x, z: this.mara.group.position.z }),
      setMarker: (m) => this.setMarker(m),
      setObjective: (t) => this.hud.setObjective(t),
      addCash: (n) => { this.cash += n; this.hud.setCash(this.cash); },
      addRep: (n) => { this.rep += n; this.hud.setRep(this.rep); },
      setTime: (h) => this.world.setTime(h),
      setWeather: (w) => this.world.setWeather(w),
      spawnMissionCar: (type, color, x, z, heading) => this.spawnMissionCar(type, color, x, z, heading),
      removeMissionCar: (car) => this.removeMissionCar(car),
      clearMissionCars: () => { [...this.missionCars].forEach((c) => this.removeMissionCar(c)); },
      teleportPlayerToCar: (car) => this.enterCar(car, true),
      saveGame: () => this.saveGame(),
    };
    this.missions = new MissionManager(ctx);

    this._wireUI();
    this.hud.setCash(this.cash);
    this.hud.setRep(this.rep);
    this.hud.setObjective('Welcome to Solmar — press START STORY to begin.');
    this.hud.showTitle(this.hasSave());

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this._exposeDebug();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- UI wiring ----------------------------------------------------------

  _wireUI() {
    document.getElementById('btn-play').addEventListener('click', () => this.startGame(false));
    document.getElementById('btn-continue').addEventListener('click', () => this.startGame(true));
    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause(false));
    document.getElementById('btn-save').addEventListener('click', () => {
      this.saveGame();
      this.hud.pauseMessage('Game saved.');
    });
    document.getElementById('btn-sound').addEventListener('click', (e) => {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
      e.target.textContent = 'Sound: ' + (this.audio.muted ? 'OFF' : 'ON');
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      this.state = 'title';
      this.hud.hidePause();
      this.hud.showTitle(this.hasSave());
    });
    document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
    document.getElementById('btn-job-taxi').addEventListener('click', () => this._startJob('taxi'));
    document.getElementById('btn-job-courier').addEventListener('click', () => this._startJob('courier'));
    document.getElementById('btn-job-race').addEventListener('click', () => this._startJob('streetrace'));
  }

  _startJob(kind) {
    if (this.missions.startSideJob(kind)) {
      this.togglePause(false);
      this.hud.showBanner('SIDE JOB STARTED', kind.toUpperCase());
    } else {
      this.hud.pauseMessage('Finish or fail the current mission first.');
    }
  }

  startGame(continueSave) {
    this.audio.ensure();
    this.audio.click();
    if (continueSave) this.loadGame();
    this.state = 'playing';
    this.hud.hideTitle();
    this.hud.showHint(18);
    if (!this.missions.active && this.missions.unlocked <= 8 && this.missions.completed.length === 0) {
      this.hud.setObjective('Mission 1: Welcome Back — open the pause menu (Esc) or walk to the pier.');
    }
  }

  togglePause(force) {
    if (this.state === 'playing' && (force === undefined || force === true)) {
      this.state = 'paused';
      const stats = `Cash ${this.cash} • REP ${this.rep} • Missions done: ${this.missions.completed.length}/8 • Wanted ${'★'.repeat(this.police.wanted)}`;
      const list = MISSION_DEFS.map((m) => {
        const done = this.missions.completed.includes(m.id);
        const locked = m.id > this.missions.unlocked;
        const cur = this.missions.current && this.missions.current.def.id === m.id;
        const label = `${done ? '✓' : cur ? '▶' : locked ? '🔒' : '○'} ${m.id}. ${m.name} — ${m.giver}`;
        const dis = done || locked || this.missions.active ? 'disabled' : '';
        return `<button class="btn btn-small mission-btn" data-id="${m.id}" ${dis}>${label}</button>`;
      }).join('');
      this.hud.showPause(stats, list);
      document.querySelectorAll('.mission-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const id = Number(b.dataset.id);
          if (this.missions.startMission(id)) this.togglePause(false);
        });
      });
    } else if (this.state === 'paused' && (force === undefined || force === false)) {
      this.state = 'playing';
      this.hud.hidePause();
    }
  }

  // ---- save / load --------------------------------------------------------

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, rep: this.rep,
        unlocked: this.missions.unlocked,
        completed: this.missions.completed,
        x: this.player.x, z: this.player.z,
        timeOfDay: this.world.timeOfDay,
      }));
    } catch (e) {}
  }

  loadGame() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s) return;
      this.cash = s.cash; this.rep = s.rep;
      this.missions.unlocked = s.unlocked || 1;
      this.missions.completed = s.completed || [];
      this.player.x = s.x ?? -100;
      this.player.z = s.z ?? 84;
      this.world.setTime(s.timeOfDay ?? 10.5);
      this.hud.setCash(this.cash);
      this.hud.setRep(this.rep);
    } catch (e) {}
  }

  // ---- cars ---------------------------------------------------------------

  spawnMissionCar(type, color, x, z, heading) {
    const car = makeCar(this.scene, type, color, { x, z, heading, driver: null });
    this.missionCars.push(car);
    return car;
  }

  removeMissionCar(car) {
    if (!car) return;
    if (this.player.car === car) this.exitCar();
    this.scene.remove(car.group);
    this.missionCars = this.missionCars.filter((c) => c !== car);
  }

  enterCar(car, force = false) {
    if (!car) return false;
    if (car.driver && car.driver !== 'player' && car.driver === 'traffic') {
      this.traffic.ejectDriver(car);
    }
    car.driver = 'player';
    this.player.inCar = true;
    this.player.car = car;
    this.rico.group.visible = false;
    this.player.x = car.group.position.x;
    this.player.z = car.group.position.z;
    this.player.heading = car.heading;
    this.camDistTarget = 10;
    this.audio.click();
    if (!force && this.police.wanted === 0) {
      // Stealing a car nobody owns is fine; stealing a traffic car is a crime.
      if (car._wasTraffic) this.police.addHeat(25);
    }
    return true;
  }

  exitCar() {
    const car = this.player.car;
    if (!car) return;
    car.driver = null;
    this.player.inCar = false;
    this.player.car = null;
    const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
    // Step out on the driver's side.
    this.player.x = car.group.position.x - fz * 1.6;
    this.player.z = car.group.position.z + fx * 1.6;
    this.player.heading = car.heading;
    this.rico.group.visible = true;
    this.rico.group.position.set(this.player.x, 0, this.player.z);
    this.camDistTarget = 7;
    this.audio.click();
  }

  setMarker(m) {
    this.markerPos = m;
    this.markerGroup.visible = !!m;
    if (m) this.markerGroup.position.set(m.x, 0, m.z);
  }

  // ---- busted / wasted ----------------------------------------------------

  onBusted() {
    if (this.state !== 'playing') return;
    if (this.player.inCar) this.exitCar();
    this.state = 'ended';
    this.police.clearWanted();
    this.cash = Math.floor(this.cash * 0.9);
    this.hud.setCash(this.cash);
    this.audio.busted();
    this.hud.showEnd('BUSTED', 'The Solmar PD caught you. You lost 10% of your cash. The city is still yours to take.');
    this.saveGame();
  }

  onWasted() {
    if (this.state !== 'playing') return;
    if (this.player.inCar) this.exitCar();
    this.state = 'ended';
    this.cash = Math.floor(this.cash * 0.9);
    this.hud.setCash(this.cash);
    this.audio.busted();
    this.hud.showEnd('WASTED', 'You wake up at Solmar General. The hospital bill took 10% of your cash.');
    this.saveGame();
  }

  respawn() {
    this.player.health = 100;
    const atHQ = this.state === 'ended' && this.police.wanted === 0;
    const spot = atHQ ? LOCATIONS.policeHQ : LOCATIONS.hospital;
    this.player.x = spot.x;
    this.player.z = spot.z + 4;
    this.player.heading = 0;
    this.rico.group.position.set(this.player.x, 0, this.player.z);
    this.rico.group.visible = true;
    this.hud.hideEnd();
    this.state = 'playing';
    this.hud.setObjective('Back on the streets of Solmar.');
  }

  // ---- per-frame ----------------------------------------------------------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const playing = this.state === 'playing';

    if (playing) {
      this._handleKeys(dt);
      this._updatePlayer(dt);
      this.traffic.update(dt, this.player);
      this.police.update(dt, this.player, this.traffic);
      this.missions.update(dt);
      this._updateMarker(dt);
      this._updateCarPedCollisions();
      this.hud.tickHint(dt);
    }
    this.world.update(dt, this.camera);
    this.city.update(dt, this.world.nightFactor);
    this._updateCamera(dt);
    this._updateHUD();
    this.audio.setRainLevel(this.world.weatherBlend);
    if (this.player.inCar && this.player.car) {
      this.audio.setEngine(Math.abs(this.player.car.speed) / this.player.car.cfg.maxSpeed, playing);
    } else {
      this.audio.setEngine(0, false);
    }

    this.renderer.render(this.scene, this.camera);
    if (!this.ready) {
      this.ready = true;
      this.hud.showBanner('GRAND CITY 6', 'Solmar awaits — WASD to move, E to enter a car.');
    }
  }

  _handleKeys(dt) {
    const inp = this.input;
    if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) this.togglePause();
    if (inp.wasPressed('KeyM')) {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
    }
    if (inp.wasPressed('KeyR')) {
      const on = this.audio.toggleRadio();
      this.hud.setRadio(on ? `${this.audio.stationName()} — ${this.audio.stationTag()}` : null);
      if (on) this.audio.ensure();
    }
    if (inp.wasPressed('KeyH') && this.player.inCar) this.audio.horn();
    if (inp.wasPressed('KeyE')) {
      if (this.player.inCar) this.exitCar();
      else {
        const car = this.traffic.nearestEnterableCar(this.player.x, this.player.z, 3.6)
          || this._nearestMissionCar(3.6);
        if (car) {
          if (car.driver === 'traffic') { car._wasTraffic = true; }
          this.enterCar(car);
          if (this.police.wanted === 0 && car._wasTraffic) this.police.addHeat(25);
        }
      }
    }
    if (inp.wasPressed('KeyF') && !this.player.inCar) this._punch();
    const mouse = inp.consumeMouse();
    this.camYaw -= mouse.yaw;
    this.camPitch = clamp(this.camPitch + mouse.pitch, 0.12, 0.85);
    if (mouse.wheel !== 0) {
      this.camDistTarget = clamp(this.camDistTarget + mouse.wheel * 0.01, 4.5, 13);
    }
  }

  _nearestMissionCar(maxDist) {
    let best = null, bestD = maxDist;
    for (const car of this.missionCars) {
      const d = dist2d(this.player.x, this.player.z, car.group.position.x, car.group.position.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  _punch() {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.5;
    this.rico.punchT = 0.45;
    this.audio.punch();
    const fx = Math.sin(this.player.heading), fz = -Math.cos(this.player.heading);
    let hitPolice = false;
    for (const o of this.police.officers) {
      const ox = o.person.group.position.x, oz = o.person.group.position.z;
      const d = dist2d(this.player.x, this.player.z, ox, oz);
      if (d < 2.2) {
        const dot = ((ox - this.player.x) * fx + (oz - this.player.z) * fz) / (d || 1);
        if (dot > 0.2) { hitPolice = true; }
      }
    }
    let hitPed = false;
    for (const p of this.traffic.peds) {
      const px = p.person.group.position.x, pz = p.person.group.position.z;
      const d = dist2d(this.player.x, this.player.z, px, pz);
      if (d < 2.2) {
        const dot = ((px - this.player.x) * fx + (pz - this.player.z) * fz) / (d || 1);
        if (dot > 0.2) {
          p.downT = 4;
          p.person.group.rotation.x = -Math.PI / 2 + 0.1;
          hitPed = true;
        }
      }
    }
    if (hitPolice) this.police.addHeat(40);
    else if (hitPed) this.police.addHeat(15);
    if (hitPed || hitPolice) this.traffic.scarePeds(this.player.x, this.player.z, 12);
  }

  _updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    if (p.inCar && p.car) {
      const axes = inp.moveAxes();
      const res = driveCar(p.car, {
        throttle: axes.y,
        steer: -axes.x,
        brake: inp.down('Space'),
      }, dt, this.colliders, (impact) => {
        this.audio.crash();
        p.health -= impact * 0.35;
        if (p.health <= 0) this.onWasted();
      });
      p.x = p.car.group.position.x;
      p.z = p.car.group.position.z;
      p.heading = p.car.heading;
      p.speed = p.car.speed;
      p.vx = Math.sin(p.heading) * p.speed;
      p.vz = -Math.cos(p.heading) * p.speed;
      // Camera follows the car's heading.
      this.camYaw = angleToward(this.camYaw, p.heading, 1.6 * dt);
      setCarNight(p.car, this.world.nightFactor);
      return;
    }

    // On foot.
    const axes = inp.moveAxes();
    const running = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const speed = running ? 7 : 4;
    const fwd = { x: Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
    const right = { x: Math.cos(this.camYaw), z: Math.sin(this.camYaw) };
    let mx = fwd.x * axes.y + right.x * axes.x;
    let mz = fwd.z * axes.y + right.z * axes.x;
    const len = Math.hypot(mx, mz);
    let moving = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, -mz);
      p.heading = angleToward(p.heading, targetHeading, 11 * dt);
      moving = speed;
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
    }
    p.speed = moving;
    p.vx = mx * moving;
    p.vz = mz * moving;

    // Jump.
    if (inp.wasPressed('Space') && this.jumpY <= 0) {
      this.jumpV = 8;
    }
    if (this.jumpY > 0 || this.jumpV !== 0) {
      this.jumpY += this.jumpV * dt;
      this.jumpV -= 24 * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.jumpV = 0; }
    }

    // Collisions: buildings + world bounds.
    for (const b of this.colliders) {
      const r = resolveCircleBox(p.x, p.z, 0.5, b);
      if (r.hit) { p.x = r.x; p.z = r.z; }
    }
    p.x = clamp(p.x, CITY.bounds.minX, CITY.bounds.maxX);
    p.z = clamp(p.z, CITY.bounds.minZ, CITY.bounds.maxZ);

    this.rico.group.position.set(p.x, this.jumpY, p.z);
    this.rico.group.rotation.y = -p.heading;
    animateWalk(this.rico, moving, dt);
  }

  _updateCarPedCollisions() {
    if (!this.player.inCar || !this.player.car) return;
    const car = this.player.car;
    if (Math.abs(car.speed) < 3) return;
    const cx = car.group.position.x, cz = car.group.position.z;
    for (const p of this.traffic.peds) {
      if (p.downT > 0) continue;
      const px = p.person.group.position.x, pz = p.person.group.position.z;
      if (dist2d(cx, cz, px, pz) < 2.1) {
        p.downT = 4;
        p.person.group.rotation.x = -Math.PI / 2 + 0.1;
        this.police.addHeat(6);
        this.audio.crash();
      }
    }
    // Player car vs traffic cars.
    for (const t of this.traffic.cars) {
      if (t.car.driver === 'player') continue;
      if (collideCars(car, t.car) && Math.abs(car.speed) > 8) this.audio.crash();
    }
    for (const mc of this.missionCars) {
      if (mc === car) continue;
      collideCars(car, mc);
    }
  }

  _updateMarker(dt) {
    if (!this.markerPos) return;
    this.markerGem.position.y = 6 + Math.sin(this.time * 2.4) * 0.5;
    this.markerGem.rotation.y += dt * 2;
  }

  _updateCamera(dt) {
    const p = this.player;
    this.camDist += (this.camDistTarget - this.camDist) * Math.min(1, dt * 5);
    const target = new THREE.Vector3(p.x, 1.6 + this.jumpY * 0.5, p.z);
    const cp = this.camPitch;
    const off = new THREE.Vector3(
      -Math.sin(this.camYaw) * Math.cos(cp),
      Math.sin(cp),
      Math.cos(this.camYaw) * Math.cos(cp),
    ).multiplyScalar(this.camDist);
    let camPos = target.clone().add(off);
    // Keep the camera out of buildings: pull in if inside a collider.
    for (const b of this.colliders) {
      if (camPos.x > b.minX && camPos.x < b.maxX && camPos.z > b.minZ && camPos.z < b.maxZ) {
        camPos = target.clone().add(off.clone().multiplyScalar(0.45));
        camPos.y = Math.max(camPos.y, 2.2);
        break;
      }
    }
    if (camPos.y < 1.1) camPos.y = 1.1;
    this.camera.position.lerp(camPos, Math.min(1, dt * 10));
    this.camera.lookAt(target);
  }

  _updateHUD() {
    const p = this.player;
    this.hud.setClock(this.world.timeOfDay);
    this.hud.setWeather(this.world.weather);
    this.hud.setWanted(this.police.wanted);
    this.hud.setSpeed(p.inCar && p.car ? Math.abs(p.car.speed) * 3.6 : null);
    // Marker arrow.
    if (this.markerPos && this.state === 'playing') {
      const dx = this.markerPos.x - p.x, dz = this.markerPos.z - p.z;
      const dist = Math.hypot(dx, dz);
      const worldAngle = Math.atan2(dx, -dz);
      const rel = angleDiff(this.camYaw, worldAngle);
      // Project to screen: hide the arrow when the marker is in view.
      const v = new THREE.Vector3(this.markerPos.x, 3, this.markerPos.z).project(this.camera);
      if (v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.8) {
        this.hud.setMarkerArrow(null);
      } else {
        this.hud.setMarkerArrow(rel, dist);
      }
    } else {
      this.hud.setMarkerArrow(null);
    }
    // Minimap.
    this.hud.drawMinimap({
      playerX: p.x, playerZ: p.z, playerHeading: p.heading,
      trafficCars: this.traffic.cars.filter((t) => t.car.driver !== 'player').map((t) => ({ x: t.car.group.position.x, z: t.car.group.position.z })),
      policeCars: this.police.policeCars.map((pc) => ({ x: pc.car.group.position.x, z: pc.car.group.position.z })),
      marker: this.markerPos,
      circuitPts: this.city.trackPoints,
    });
  }

  // ---- debug API (used by the playtest harness) ---------------------------

  _exposeDebug() {
    window.__gc6 = {
      version: '1.0',
      ready: () => this.ready,
      errors: () => this.errors,
      state: () => ({
        state: this.state,
        x: this.player.x, z: this.player.z,
        heading: this.player.heading,
        inCar: this.player.inCar,
        speed: this.player.inCar && this.player.car ? this.player.car.speed : this.player.speed,
        health: this.player.health,
        cash: this.cash, rep: this.rep,
        wanted: this.police.wanted,
        time: this.world.timeOfDay,
        weather: this.world.weather,
        mission: this.missions.current ? { id: this.missions.current.def.id, step: this.missions.current.stepIdx, name: this.missions.current.def.name } : null,
        unlocked: this.missions.unlocked,
        completed: this.missions.completed.slice(),
      }),
      start: () => this.startGame(false),
      teleport: (x, z) => {
        if (this.player.inCar && this.player.car) {
          this.player.car.group.position.set(x, 0, z);
          this.player.x = x; this.player.z = z;
        } else {
          this.player.x = x; this.player.z = z;
          this.rico.group.position.set(x, 0, z);
        }
      },
      setTime: (h) => this.world.setTime(h),
      setWeather: (w) => this.world.setWeather(w),
      setWanted: (n) => this.police.setWanted(n),
      startMission: (id) => this.missions.startMission(id),
      giveCash: (n) => { this.cash += n; this.hud.setCash(this.cash); },
      drive: (throttle, steer, ms) => {
        // Simulate held keys for ms milliseconds (used by the harness).
        const map = { KeyW: throttle > 0, KeyS: throttle < 0, KeyA: steer < 0, KeyD: steer > 0 };
        for (const [code, on] of Object.entries(map)) this.input.keys[code] = on;
        setTimeout(() => {
          for (const code of Object.keys(map)) this.input.keys[code] = false;
        }, ms);
      },
      // Hold drive keys until setDrive(0, 0) (used by the frame-based harness).
      setDrive: (throttle, steer) => {
        const map = { KeyW: throttle > 0, KeyS: throttle < 0, KeyA: steer < 0, KeyD: steer > 0 };
        for (const [code, on] of Object.entries(map)) this.input.keys[code] = on;
      },
      pressKey: (code) => {
        this.input.keys[code] = true;
        this.input.pressed[code] = true;
        setTimeout(() => { this.input.keys[code] = false; }, 120);
      },
      setCamYaw: (yaw) => { this.camYaw = yaw; },
      setHeading: (h) => {
        if (this.player.inCar && this.player.car) {
          this.player.car.heading = h;
          this.player.car.group.rotation.y = -h;
        } else {
          this.player.heading = h;
        }
        this.camYaw = h;
      },
      missionCars: () => this.missionCars.map((c) => ({ type: c.type, x: c.group.position.x, z: c.group.position.z })),
      // Diagnose a stuck car: axes, keys, nearby colliders and cars.
      carDebug: () => {
        const p = this.player;
        const car = p.car;
        if (!car) return { inCar: false };
        const cx = car.group.position.x, cz = car.group.position.z;
        const axes = this.input.moveAxes();
        const nearColliders = this.colliders.filter((b) => {
          const qx = Math.max(b.minX, Math.min(cx, b.maxX));
          const qz = Math.max(b.minZ, Math.min(cz, b.maxZ));
          return Math.hypot(qx - cx, qz - cz) < 8;
        });
        const others = [...this.traffic.parked, ...this.traffic.cars.map((t) => t.car), ...this.missionCars]
          .filter((c) => c !== car)
          .map((c) => ({ type: c.type, driver: c.driver, x: +c.group.position.x.toFixed(2), z: +c.group.position.z.toFixed(2), d: +Math.hypot(c.group.position.x - cx, c.group.position.z - cz).toFixed(2) }))
          .filter((c) => c.d < 12);
        return {
          inCar: true, state: this.state, paused: this._paused,
          x: +cx.toFixed(2), z: +cz.toFixed(2), heading: +car.heading.toFixed(3), speed: +car.speed.toFixed(3),
          axes, keys: { ...this.input.keys },
          nearColliders, nearCars: others,
        };
      },
      // For each named location + candidate point: inside a collider? distance to nearest.
      locCheck: () => {
        const pts = {};
        for (const [name, l] of Object.entries(LOCATIONS)) pts[name] = { x: l.x, z: l.z };
        for (const [name, p] of Object.entries({
          plazaW: { x: -8, z: -100 }, plazaE: { x: 8, z: -100 },
          beachW: { x: -40, z: 150 }, beachE: { x: 60, z: 150 },
          northW: { x: -60, z: -145 }, northE: { x: 60, z: -145 },
          eastOpen: { x: 140, z: -60 },
          safehouseStreet: { x: -100, z: 80 }, bankStreet: { x: -60, z: -40 },
          garageStreet: { x: -100, z: -80 }, marketStreet: { x: 100, z: -80 },
        })) pts[name] = p;
        return Object.entries(pts).map(([name, p]) => {
          const inside = this.colliders.some((b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ);
          let nearest = 1e9;
          for (const b of this.colliders) {
            const qx = Math.max(b.minX, Math.min(p.x, b.maxX));
            const qz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
            nearest = Math.min(nearest, Math.hypot(qx - p.x, qz - p.z));
          }
          return { name, x: p.x, z: p.z, inside, nearest: +nearest.toFixed(1) };
        });
      },
      parked: () => this.traffic.parked.map((c) => ({ type: c.type, x: +c.group.position.x.toFixed(1), z: +c.group.position.z.toFixed(1) })),
      // Closest pursuing police car, for aiming a chase screenshot.
      nearestPolice: () => {
        const p = this.player;
        let best = null, bestD = 1e9;
        for (const pc of this.police.policeCars) {
          const d = Math.hypot(pc.car.group.position.x - p.x, pc.car.group.position.z - p.z);
          if (d < bestD) { bestD = d; best = pc.car; }
        }
        if (!best) return null;
        return { x: +best.group.position.x.toFixed(1), z: +best.group.position.z.toFixed(1), d: +bestD.toFixed(1) };
      },
    };
  }
}

const game = new Game();
game.init();
