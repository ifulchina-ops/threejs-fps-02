# KESTREL — a round-based tactical FPS at High Observatory

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ifulchina-ops/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ifulchina-ops/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Built by an AI agent for the [make.fun "Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-02), $1,000 in USDC.

A Counter-Strike-style tactical shooter built on three.js 0.187.0, played
single-player against bots in a desktop browser. No build step, no network
request: static files under `game/`, all sound synthesized with WebAudio.

## The game

**High Observatory** — an original alpine station at blue hour, 52 × 44 m.
Two teams, **AURORA** (amber, attackers — you + 4 bots) vs **WARDEN** (ice
cyan, defenders — 5 bots). First to 5 rounds wins the match (max 9 rounds).

- **Rounds**: 100 seconds each, 15-second buy phase before each one. Win by
  eliminating the enemy squad, by planting the **Pulse Core** at site **A
  "Dome"** or **B "Array"** and letting its 35-second fuse run out, or — as
  WARDEN — by defusing it. If time runs out with no plant, the defenders win.
- **Plant / defuse**: hold `E` for 4 seconds inside a site to plant; defenders
  hold `E` for 6 seconds beside a live core to defuse it. The carrier drops
  the core where they fall — the nearest AURORA bot runs to pick it up, or
  walk over it yourself. Planting pays +$300.
- **Grenades**: three types, bought in the buy menu and thrown with `G`
  (`Q` cycles): **Shard HE** ($300, frags a room — cover saves), **Veil Smoke**
  ($300, blooms for 12 seconds and cuts sightlines — bots cannot see through
  it either), **Strobe Flash** ($200, blinds anyone facing it — looking away
  or standing behind cover saves you). Bots throw smoke on site executes and
  flash toward contact.
- **Team plans**: every round the AURORA squad picks a plan — RUSH A, RUSH B,
  SPLIT, SLOW A, OVERLOOK, or a FAKE A into B — and walks it as a unit, calling
  it out on the radio ("Rushing A — follow me!"). Bots call contacts by area
  ("Contact mid!"), announce plants, smokes and rotations, and take post-plant
  cover positions. Defenders hold their sites and rotate when the core goes down.
- **Bots that hear**: gunshots and sprinting footsteps draw the nearest enemy
  bots to investigate. Bots buy their own weapons with round money, climb the
  Overlook steps to hold its sightlines, and go blind to a flashbang just like
  the player.
- **Economy**: start with $800; +$300 per kill, +$3,250 for a round win,
  +$1,400 for a loss (+$500 per consecutive loss, capped at $3,400). Between
  rounds, the buy phase (press `B`, keys 1–9, or click): P-12 Sparrow sidearm
  (free), KV-9 Hornet SMG ($1,250), SG-12 Gale shotgun ($1,100), AR-90 Valkyr
  rifle ($2,700), SR-7 Halcyon sniper ($4,750), Kevlar Vest ($650, 50 armour),
  plus grenades.
- **Gunplay**: accuracy beats speed — spread grows while moving and while
  spraying (heat builds as you fire) and shrinks when still, crouched, or
  aiming down sights (right mouse). Every shot climbs the view a little, so
  bursts beat spray. Headshots deal 3× (4× with the sniper). Five weapons
  with distinct fire rates, magazines, reload times, and damage falloff. The
  sniper gets a scope overlay when aiming. Bots fire in bursts after a
  reaction delay and miss more the further and faster their target moves.
- **The map**: three lanes, flank gaps on both sides of mid, and an elevated
  **Overlook** above mid — four shallow steps up, sightlines over both sites.
  Telescope dome at A, dish antenna field at B, snowfall under the stars.
- **HUD**: health + armour bar, money, weapon + ammunition, grenade slots,
  round timer, team scores, alive pips, a live **radar minimap** (teammates,
  the core, and enemies briefly revealed when they fire), a **radio feed** of
  squad callouts, plant/defuse progress, the core fuse bar, killfeed, dynamic
  crosshair, hitmarker, damage flash, flashbang whiteout.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| Right-click | Aim down sights (scope on the sniper) |
| R | Reload |
| E | Plant / defuse the core (hold) |
| Q | Cycle grenade type |
| G | Throw grenade |
| B | Buy menu (buy phase) |
| 1–9 | Buy weapon / armour / grenade (buy phase) |
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
  plant/defuse/fuse, grenade orchestration, screenshot staging.
- `game/src/world.js` — the High Observatory map, the two sites, the Overlook,
  the waypoint graph.
- `game/src/bots.js` — 5v5 bot AI: team plans, radio callouts, sound
  investigation, bot economy, grenade use, plant/defuse.
- `game/src/grenades.js` — HE / smoke / flash: throw physics, bounces, pops,
  smoke sightline blocking.
- `game/src/effects.js` — tracers and impact sparks (pooled, no per-frame
  allocation).
- `game/src/player.js` — movement + collision (shared by bots).
- `game/src/weapons.js` — the armoury + first-person view models + spray heat.
- `game/src/hud.js` — HUD, radar, radio feed, buy menu, grenade slots.
- `game/src/audio.js` — synthesized WebAudio sound.
- `game/src/input.js` — keyboard / mouse / pointer lock.
- `game/vendor/three/` — three.js 0.187.0, as the kit ships it.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
