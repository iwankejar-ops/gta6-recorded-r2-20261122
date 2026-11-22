// hud.js — all 2D interface: HUD bars, wanted stars, objective panel,
// minimap canvas, title / pause / busted screens, banners.
// GRAND CITY 6 — original code, written for this entry.

import { moneyString, clockString } from './util.js';

const WORLD = { minX: -155, maxX: 310, minZ: -155, maxZ: 215 };

export class HUD {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    document.body.appendChild(this.root);
    this._buildStatic();
    this._buildMinimap();
    this._buildOverlays();
    this.radioVisible = false;
    this.hintTimer = 0;
  }

  _el(tag, cls, parent, html = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.innerHTML = html;
    (parent || this.root).appendChild(e);
    return e;
  }

  _buildStatic() {
    const top = this._el('div', 'hud-top');
    this.cashEl = this._el('div', 'hud-cash', top, '$0');
    this.repEl = this._el('div', 'hud-rep', top, 'REP 0');
    this.clockEl = this._el('div', 'hud-clock', top, '10:30');
    this.weatherEl = this._el('div', 'hud-weather', top, '☀ CLEAR');
    this.starsEl = this._el('div', 'hud-stars', this.root, '');
    this.bannerEl = this._el('div', 'hud-banner', this.root, '');
    this.bannerTitle = this._el('div', 'hud-banner-title', this.bannerEl, '');
    this.bannerSub = this._el('div', 'hud-banner-sub', this.bannerEl, '');
    this.objectiveEl = this._el('div', 'hud-objective', this.root, '');
    this.speedEl = this._el('div', 'hud-speed', this.root, '');
    this.radioEl = this._el('div', 'hud-radio', this.root, '');
    this.hintEl = this._el('div', 'hud-hint', this.root,
      'WASD move &nbsp;•&nbsp; SHIFT run &nbsp;•&nbsp; SPACE jump &nbsp;•&nbsp; E enter car &nbsp;•&nbsp; F punch &nbsp;•&nbsp; R radio &nbsp;•&nbsp; H horn &nbsp;•&nbsp; ESC pause');
    this.markerArrow = this._el('div', 'hud-arrow', this.root, '▲');
  }

  _buildMinimap() {
    this.mapWrap = this._el('div', 'hud-map-wrap', this.root, '');
    this.mapLabel = this._el('div', 'hud-map-label', this.mapWrap, 'SOLMAR');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 210;
    this.mapCanvas.height = 210;
    this.mapCanvas.className = 'hud-map';
    this.mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
  }

  _buildOverlays() {
    // Title screen.
    this.titleEl = this._el('div', 'overlay overlay-title', this.root, '');
    this.titleEl.innerHTML = `
      <div class="title-inner">
        <div class="title-kicker">A SOLMAR STORY</div>
        <h1>GRAND<br>CITY <span>6</span></h1>
        <p class="title-story">Rico Vega is back in Solmar after five years away — broke, wanted,
        and ready to take the city back from the man who ran him out. Drive, fight, race
        and hustle your way from the pier to the top of the food chain.</p>
        <div class="title-controls">
          <div><b>W A S D</b> move / drive</div><div><b>MOUSE</b> drag to look</div>
          <div><b>SHIFT</b> run</div><div><b>SPACE</b> jump</div>
          <div><b>E</b> enter / exit car</div><div><b>F</b> punch</div>
          <div><b>R</b> radio station</div><div><b>H</b> horn</div>
          <div><b>ESC</b> pause &amp; missions</div><div><b>M</b> mute</div>
        </div>
        <button id="btn-play" class="btn-big">▶ &nbsp;START STORY</button>
        <button id="btn-continue" class="btn-big btn-ghost" style="display:none">CONTINUE SAVED GAME</button>
        <div class="title-foot">GRAND CITY 6 — an original open-world crime game • Solmar is a fictional city • v1.0</div>
      </div>`;
    // Pause menu.
    this.pauseEl = this._el('div', 'overlay overlay-pause', this.root, '');
    this.pauseEl.style.display = 'none';
    this.pauseEl.innerHTML = `
      <div class="panel">
        <h2>PAUSED</h2>
        <div class="pause-stats" id="pause-stats"></div>
        <button id="btn-resume" class="btn">Resume</button>
        <h3>STORY MISSIONS</h3>
        <div id="mission-list" class="list"></div>
        <h3>SIDE JOBS</h3>
        <div class="row">
          <button id="btn-job-taxi" class="btn btn-small">Taxi</button>
          <button id="btn-job-courier" class="btn btn-small">Courier</button>
          <button id="btn-job-race" class="btn btn-small">Street Race</button>
        </div>
        <div class="row">
          <button id="btn-save" class="btn btn-small">Save game</button>
          <button id="btn-sound" class="btn btn-small">Sound: ON</button>
          <button id="btn-quit" class="btn btn-small">Quit to title</button>
        </div>
        <div id="pause-msg" class="pause-msg"></div>
      </div>`;
    // Busted / wasted.
    this.endEl = this._el('div', 'overlay overlay-end', this.root, '');
    this.endEl.style.display = 'none';
    this.endEl.innerHTML = `
      <div class="panel">
        <h2 id="end-title">BUSTED</h2>
        <p id="end-text"></p>
        <button id="btn-respawn" class="btn-big">RESPAWN</button>
      </div>`;
  }

  // ---- live values -------------------------------------------------------

  setCash(n) { this.cashEl.textContent = moneyString(n); }
  setRep(n) { this.repEl.textContent = 'REP ' + Math.round(n); }
  setClock(hours) { this.clockEl.textContent = clockString(hours); }
  setWeather(w) {
    this.weatherEl.textContent = w === 'rain' ? '🌧 RAIN' : w === 'overcast' ? '☁ OVERCAST' : '☀ CLEAR';
  }
  setWanted(n) {
    this.starsEl.textContent = n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
    this.starsEl.style.display = n > 0 ? 'block' : 'none';
  }
  setObjective(text) { this.objectiveEl.textContent = text; }
  setSpeed(kmh) {
    if (kmh === null) { this.speedEl.style.display = 'none'; return; }
    this.speedEl.style.display = 'block';
    this.speedEl.textContent = Math.round(kmh) + ' km/h';
  }
  setRadio(text) {
    if (!text) { this.radioEl.style.display = 'none'; return; }
    this.radioEl.style.display = 'block';
    this.radioEl.textContent = '♪ ' + text;
  }
  showHint(seconds = 18) {
    this.hintEl.style.opacity = '1';
    this.hintTimer = seconds;
  }
  tickHint(dt) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.style.opacity = '0';
    }
  }

  showBanner(title, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), 3600);
  }

  /** Off-screen marker arrow: angle in radians (0 = up), null to hide. */
  setMarkerArrow(angle, dist) {
    if (angle === null) { this.markerArrow.style.display = 'none'; return; }
    this.markerArrow.style.display = 'block';
    const w = window.innerWidth, h = window.innerHeight;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    const x = cx + Math.sin(angle) * r;
    const y = cy - Math.cos(angle) * r;
    this.markerArrow.style.left = x + 'px';
    this.markerArrow.style.top = y + 'px';
    this.markerArrow.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    this.markerArrow.textContent = '▲ ' + Math.round(dist) + 'm';
  }

  // ---- minimap -----------------------------------------------------------

  drawMinimap(s) {
    const g = this.mapCtx;
    const W = 210, H = 210;
    const mx = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * W;
    const mz = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * H;
    g.clearRect(0, 0, W, H);
    // Sea + sand (bottom strip).
    g.fillStyle = '#2a7ab8';
    g.fillRect(0, mz(168), W, H - mz(168));
    g.fillStyle = '#d9c08a';
    g.fillRect(0, mz(140), W, mz(168) - mz(140));
    // Land.
    g.fillStyle = '#5d7050';
    g.fillRect(0, 0, W, mz(140));
    // Blocks.
    g.fillStyle = '#7a7568';
    for (const bx of [-100, -60, -20, 20, 60, 100]) {
      for (const bz of [-100, -60, -20, 20, 60, 100]) {
        if (bx === 0 && bz === 0) continue;
        g.fillRect(mx(bx - 15), mz(bz - 15), mx(bx + 15) - mx(bx - 15), mz(bz + 15) - mz(bz - 15));
      }
    }
    // Park.
    g.fillStyle = '#3f7d33';
    g.beginPath();
    g.arc(mx(0), mz(0), 8, 0, Math.PI * 2);
    g.fill();
    // Roads.
    g.strokeStyle = '#33363b';
    g.lineWidth = 4;
    for (const st of [-120, -80, -40, 0, 40, 80, 120]) {
      g.beginPath(); g.moveTo(mx(st), 0); g.lineTo(mx(st), mz(140)); g.stroke();
      g.beginPath(); g.moveTo(0, mz(st)); g.lineTo(mx(140), mz(st)); g.stroke();
    }
    // Circuit.
    g.strokeStyle = '#c03028';
    g.lineWidth = 5;
    g.beginPath();
    if (s.circuitPts) {
      s.circuitPts.forEach((p, i) => {
        if (i === 0) g.moveTo(mx(p.x), mz(p.z));
        else g.lineTo(mx(p.x), mz(p.z));
      });
      g.closePath();
      g.stroke();
    }
    // Pier.
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(mx(20), mz(140)); g.lineTo(mx(20), mz(205)); g.stroke();
    // Traffic (white), police (blue), officers (light blue).
    g.fillStyle = '#ffffff';
    for (const c of s.trafficCars || []) g.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3);
    g.fillStyle = '#3a6fd2';
    for (const c of s.policeCars || []) {
      g.beginPath(); g.arc(mx(c.x), mz(c.z), 3.4, 0, Math.PI * 2); g.fill();
    }
    // Mission marker (pulsing yellow diamond).
    if (s.marker) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 2;
      g.fillStyle = '#ffd94d';
      g.save();
      g.translate(mx(s.marker.x), mz(s.marker.z));
      g.rotate(Math.PI / 4);
      g.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      g.restore();
    }
    // Player arrow.
    const px = mx(s.playerX), pz = mz(s.playerZ);
    g.save();
    g.translate(px, pz);
    g.rotate(s.playerHeading);
    g.fillStyle = '#ffd94d';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.strokeStyle = '#111';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  // ---- overlays ----------------------------------------------------------

  showTitle(hasSave) {
    this.titleEl.style.display = 'flex';
    this.pauseEl.style.display = 'none';
    this.endEl.style.display = 'none';
    document.getElementById('btn-continue').style.display = hasSave ? 'block' : 'none';
  }
  hideTitle() { this.titleEl.style.display = 'none'; }
  showPause(statsHtml, missionsHtml) {
    this.pauseEl.style.display = 'flex';
    document.getElementById('pause-stats').innerHTML = statsHtml;
    document.getElementById('mission-list').innerHTML = missionsHtml;
  }
  hidePause() { this.pauseEl.style.display = 'none'; }
  showEnd(kind, text) {
    this.endEl.style.display = 'flex';
    document.getElementById('end-title').textContent = kind;
    document.getElementById('end-text').textContent = text;
  }
  hideEnd() { this.endEl.style.display = 'none'; }
  pauseMessage(text) {
    document.getElementById('pause-msg').textContent = text;
  }
}
