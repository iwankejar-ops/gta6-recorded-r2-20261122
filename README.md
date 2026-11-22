# GRAND CITY 6

[![Make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/iwankejar-ops/gta6-recorded-r2-20261122/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/iwankejar-ops/gta6-recorded-r2-20261122/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/c/gta6-01). It runs offline in a
desktop browser from its own static files — no build step, no network request.

## The game

Rico Vega is back in Solmar after five years away — broke, wanted, and ready
to take the coastal city back from the man who ran him out. Explore a living
7×7-block city on foot and by car: traffic, pedestrians, a wanted system with
police pursuit and roadblocks, 8 story missions with Mara Solis, 3 side jobs,
a real race circuit with grandstands, day–night cycles, weather, and three
synthesized radio stations.

## Play it

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome, or run `node serve.ts` if present. Everything the game loads
is a file under `game/` (three.js r160 is vendored as `game/vendor/three.min.js`).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag | Look around (orbit camera) |
| SHIFT | Run |
| SPACE | Jump / brake (in car) |
| E | Enter / exit car |
| F | Punch |
| R | Radio on / next station |
| H | Horn |
| M | Mute |
| ESC | Pause, missions & side jobs |

## Features

- Third-person on-foot + chase-cam driving, race cars with spoilers and stripes
- Living city: 14 traffic cars, 26 pedestrians, parked cars to steal, shops
- Wanted 0–5: police pursuit cars, foot officers, roadblocks at 4+
- 8 story missions + taxi, courier and street-race side jobs
- Real race circuit: closed loop, hairpin, curbs, grandstands, pit lane
- Day–night cycle, clear / overcast / rain weather, lit windows at night
- HUD with minimap, cash, reputation, wanted stars and objectives
- Save / continue via localStorage
- All music and sound synthesized live with WebAudio — no audio files

## Structure

- `game/index.html` — page + HUD styles
- `game/js/main.js` — boot, game loop, player, camera, save/load
- `game/js/city.js` — Solmar: streets, buildings, beach, pier, circuit
- `game/js/vehicles.js` — car factory + arcade driving physics
- `game/js/people.js` — Rico, Mara, police, pedestrians
- `game/js/traffic.js` — traffic + pedestrian AI
- `game/js/police.js` — wanted system, pursuit, roadblocks
- `game/js/missions.js` — story missions + side jobs
- `game/js/world.js` — sky, day/night, weather, rain
- `game/js/audio.js` — synthesized SFX + 3 radio stations
- `game/js/hud.js` — HUD, minimap, menus
- `game/js/input.js` — keyboard + mouse
- `game/js/util.js` — RNG, math, canvas textures
- `main.ts` — entry program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

## License

MIT — see [LICENSE](LICENSE).
