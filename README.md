# EMBERLINE — a round-based tactical FPS

A Counter-Strike-style tactical shooter built on three.js 0.187.0, played
single-player against bots in a desktop browser. No build step, no network
request: static files under `game/`, all sound synthesized with WebAudio.

## The game

**Foundry Yard** — an original dusk industrial yard, 44 × 36 m. Two teams,
**Vanguard** (blue) vs **Ember** (orange-red). First to 5 rounds wins the match.

- **Rounds**: 100 seconds each. Win by eliminating the enemy squad or by
  capturing the **Relay** console at mid (stand in the ring for 6 seconds).
- **Economy**: start with $800; +$300 per kill, +$325 for a round win,
  +$1,400 for a loss. Between rounds, a 12-second **buy phase** (press `B`,
  keys 1–6, or click): P9 Sidearm (free), VK-9 Ripper SMG ($1,400),
  M12 Breacher shotgun ($1,200), AR-77 Longshot rifle ($2,700),
  LW-50 Deadeye sniper ($4,500), Kevlar Vest ($650, 50 armour).
- **Gunplay**: accuracy beats speed — spread grows while moving and shrinks
  when still, crouched, or aiming down sights (right mouse). Headshots deal
  3× (4× with the sniper). Five weapons with distinct fire rates, magazines,
  reload times, and damage falloff.
- **Bots**: 3 Vanguard teammates and 4 Ember attackers patrol waypoints,
  take cover lanes, stop and strafe when they see you, and fire in bursts
  after a reaction delay. Tracers, muzzle flashes, and a killfeed show every
  shot.
- **HUD**: health + armour bar, money, weapon + ammunition, round timer,
  team scores, capture progress, dynamic crosshair, hitmarker, damage flash.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| Right-click | Aim down sights |
| R | Reload |
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

## License

MIT — see `LICENSE`.
