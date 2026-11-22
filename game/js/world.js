// world.js — sky, sun and moonlight, day/night cycle, weather machine
// (clear / overcast / rain) and rain particles.
// GRAND CITY 6 — original code, written for this entry.

import { clamp, lerp } from './util.js';

const DAY_SKY = new THREE.Color(0x87b5d9);
const DUSK_SKY = new THREE.Color(0xe89a5a);
const NIGHT_SKY = new THREE.Color(0x0a1226);
const OVERCAST_SKY = new THREE.Color(0x8a949c);

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.timeOfDay = 10.5; // 10:30 in the morning
    this.weather = 'clear';
    this.weatherT = 45; // seconds until the next weather roll
    this.weatherBlend = 0; // 0 clear, 0.5 overcast, 1 rain (lerped)
    this.nightFactor = 0;
    this.clockSpeed = 1 / 30; // one game hour per 30 real seconds

    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -130;
    this.sun.shadow.camera.right = 130;
    this.sun.shadow.camera.top = 130;
    this.sun.shadow.camera.bottom = -130;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.8);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0x87b5d9, 90, 460);

    // Stars (visible at night).
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 420;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    scene.add(this.stars);

    // Rain: 1200 drops in a box that follows the camera.
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(1200 * 3);
    for (let i = 0; i < 1200; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 70;
      rainPos[i * 3 + 1] = Math.random() * 32;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0xaac4d8, size: 0.14, transparent: true, opacity: 0 });
    this.rain = new THREE.Points(rainGeo, this.rainMat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainVel = 30;

    this._tmpColor = new THREE.Color();
  }

  setTime(h) { this.timeOfDay = ((h % 24) + 24) % 24; }
  setWeather(w) {
    this.weather = w;
    this.weatherBlend = w === 'rain' ? 1 : w === 'overcast' ? 0.5 : 0;
    this.weatherT = 300; // hold the forced weather so the machine cannot re-roll it at once
  }

  /** Daylight factor 0..1 (1 at noon, 0 at night). */
  _dayFactor(t) {
    if (t < 5.5 || t > 18.5) return 0;
    if (t < 6.5) return (t - 5.5) / 1;
    if (t > 17.5) return (18.5 - t) / 1;
    return 1;
  }

  update(dt, camera) {
    this.timeOfDay = (this.timeOfDay + dt * this.clockSpeed) % 24;
    const t = this.timeOfDay;
    const df = this._dayFactor(t);
    this.nightFactor = 1 - df;

    // Weather roll.
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 60 + Math.random() * 70;
      const r = Math.random();
      this.weather = r < 0.5 ? 'clear' : r < 0.8 ? 'overcast' : 'rain';
    }
    const targetBlend = this.weather === 'rain' ? 1 : this.weather === 'overcast' ? 0.5 : 0;
    this.weatherBlend += (targetBlend - this.weatherBlend) * Math.min(1, dt * 0.25);
    const wb = this.weatherBlend;

    // Sun position + colour.
    const sunAngle = ((t - 6) / 12) * Math.PI;
    const elev = Math.sin(sunAngle);
    const azim = Math.cos(sunAngle);
    const px = camera.position.x, pz = camera.position.z;
    const sunDist = 180;
    this.sun.position.set(px + azim * sunDist, Math.max(12, elev * sunDist), pz + 60);
    this.sun.target.position.set(px, 0, pz);
    const lowSun = clamp(1 - Math.abs(elev) * 2.2, 0, 1);
    this.sun.color.setHex(0xfff2dd).lerp(new THREE.Color(0xff9a4d), lowSun * 0.8);
    const cloudDim = 1 - wb * 0.55;
    this.sun.intensity = (0.2 + df * 1.7) * cloudDim;
    this.hemi.intensity = 0.3 + df * 0.55;

    // Sky + fog.
    const sky = this._tmpColor.copy(NIGHT_SKY);
    if (df > 0) {
      sky.lerp(df < 0.35 ? DUSK_SKY : DAY_SKY, df);
    }
    sky.lerp(OVERCAST_SKY, wb * 0.55);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    const fogNear = lerp(90, 30, wb);
    const fogFar = lerp(460, 170, wb);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;

    // Stars.
    this.starMat.opacity = this.nightFactor * 0.9;
    this.stars.position.set(px, 0, pz);

    // Rain.
    const raining = wb > 0.55;
    this.rain.visible = raining;
    if (raining) {
      this.rainMat.opacity = clamp((wb - 0.55) * 2.2, 0, 0.75);
      this.rain.position.set(px, 0, pz);
      const pos = this.rain.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < 1200; i++) {
        arr[i * 3 + 1] -= this.rainVel * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 30 + Math.random() * 2;
          arr[i * 3] = (Math.random() - 0.5) * 70;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
        }
      }
      pos.needsUpdate = true;
    }
  }
}
