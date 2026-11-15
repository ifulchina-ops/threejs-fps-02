# SOLSTICE — a round-based tactical FPS at Array Nine

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ifulchina-ops/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ifulchina-ops/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Built by an AI agent for the [make.fun "Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-02), $1,000 in USDC.

A Counter-Strike-style tactical shooter built on three.js 0.187.0, played
single-player against bots in a desktop browser. No build step, no network
request: static files under `game/`, all sound synthesized with WebAudio.

## The game

**Array Nine** — an original desert solar station at golden hour, 48 × 40 m.
Two teams, **HELIOS** (amber, attackers — you + 4 bots) vs **UMBRA** (teal,
defenders — 5 bots). First to 5 rounds wins the match (max 9 rounds).

- **Rounds**: 100 seconds each, 15-second buy phase before each one. Win by
  eliminating the enemy squad, by planting the **Surge Charge** at site **A
  "Reactor"** or **B "Array"** and letting its 35-second fuse run out, or —
  as UMBRA — by defusing it. If time runs out with no plant, the defenders win.
- **Plant / defuse**: hold `E` for 4 seconds inside a site to plant; defenders
  hold `E` for 6 seconds beside a live charge to defuse it. The carrier drops
  the charge where they fall — the nearest HELIOS bot runs to pick it up, or
  walk over it yourself. Planting pays +$300.
- **Team plans**: every round the HELIOS squad picks a plan — RUSH A, RUSH B,
  SPLIT, SLOW A, SLOW B, or a FAKE A into B — and walks it as a unit, calling
  it out on the radio ("Rushing A — follow me!"). Bots call contacts by area
  ("Contact mid!"), announce plants and rotations, and take post-plant cover
  positions. Defenders hold their sites and rotate when the charge goes down.
- **Economy**: start with $800; +$300 per kill, +$3,250 for a round win,
  +$1,400 for a loss (+$500 per consecutive loss, capped at $3,400). Between
  rounds, the buy phase (press `B`, keys 1–6, or click): VK-9 Sidearm (free),
  K-9 Jackal SMG ($1,250), M590 Breacher shotgun ($1,100), AR-77 Vandal rifle
  ($2,700), LW-50 Longshot sniper ($4,750), Kevlar Vest ($650, 50 armour).
- **Gunplay**: accuracy beats speed — spread grows while moving and shrinks
  when still, crouched, or aiming down sights (right mouse). Headshots deal
  3× (4× with the sniper). Five weapons with distinct fire rates, magazines,
  reload times, and damage falloff. Bots fire in bursts after a reaction delay
  and miss more the further and faster their target moves.
- **HUD**: health + armour bar, money, weapon + ammunition, round timer, team
  scores, alive pips, a live **radar minimap** (teammates, the charge, and
  enemies briefly revealed when they fire), a **radio feed** of squad callouts,
  plant/defuse progress, the bomb fuse bar, killfeed, dynamic crosshair,
  hitmarker, damage flash.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| Right-click | Aim down sights |
| R | Reload |
| E | Plant / defuse the charge (hold) |
| B | Buy menu (buy phase) |
| 1–6 | Buy weapon / armour (buy phase) |
| Ctrl / C | Crouch |
| Space | Jump |
| Enter | Deploy early from the buy phase |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Screenshots

Deterministic staged frames for captures:

```sh
# ?shot=start | buy | play | end, &seed=N
http://localhost:8080/?shot=play&seed=1
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## Layout

- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — the page: import map for three.js, HUD DOM, menus.
- `game/src/main.js` — boot, the fixed-step loop, match state, economy,
  plant/defuse/fuse, screenshot staging.
- `game/src/world.js` — the Array Nine map, the two sites, the waypoint graph.
- `game/src/bots.js` — 5v5 bot AI: team plans, radio callouts, plant/defuse.
- `game/src/player.js` — movement + collision (shared by bots).
- `game/src/weapons.js` — the armoury + first-person view models.
- `game/src/hud.js` — HUD, radar, radio feed, buy menu.
- `game/src/audio.js` — synthesized WebAudio sound.
- `game/src/input.js` — keyboard / mouse / pointer lock.
- `game/vendor/three/` — three.js 0.187.0, as the kit ships it.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
