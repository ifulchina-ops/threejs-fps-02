// EMBERLINE — boot, the one loop, and the match: buy phases, 100-second rounds,
// first to 5, won by elimination or by capturing the Relay at mid. Money between
// rounds buys weapons and armour. ?shot=start|buy|play|end with &seed=N stages a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 12;
const CAPTURE_SECONDS = 6;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 325;
const LOSS_REWARD = 1400;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(shot ? seed : (Date.now() % 2147483647) + 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const direction = new THREE.Vector3();
const muzzleWorld = new THREE.Vector3();

const bots = createBots(scene, world.colliders, world.shootables, {
  damagePlayer(damage, fromBot) { damagePlayer(damage, fromBot); },
  onKill(victim, attacker) { onBotKilled(victim, attacker); },
  audioDistantShot() { audio.distantShot(); },
  playerSpeed() { return player.groundSpeed(); },
});
const shootables = world.shootables.concat(bots.hitMeshes);

// ---- Match state ----
let phase = 'menu';
let round = 1;
let score = { vanguard: 0, ember: 0 };
let money = 800;
let health = 100;
let armor = 0;
let playerAlive = true;
let roundTimer = ROUND_SECONDS;
let buyTimer = BUY_SECONDS;
let capture = { vanguard: 0, ember: 0 };
let captureTickAt = 0;
let roundEndAt = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let kills = 0;
let deaths = 0;
let fovTarget = 74;
let staging = false; // true while a ?shot= scene is being staged: no damage, no round end.

const body = player.state;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function refreshHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.weaponId);
  hud.setHealth(health, armor);
  hud.setMoney(money);
  hud.setScore(score.vanguard, score.ember, round);
  hud.setTimer(phase === 'buy' ? buyTimer : roundTimer, phase === 'buy' ? 'BUY' : phase === 'live' ? 'ROUND' : phase.toUpperCase());
}

function startMatch() {
  score = { vanguard: 0, ember: 0 };
  round = 1;
  money = 800;
  kills = 0;
  deaths = 0;
  startBuy();
}

function startBuy() {
  phase = 'buy';
  buyTimer = BUY_SECONDS;
  capture = { vanguard: 0, ember: 0 };
  bots.reset(random);
  player.reset(0, 15.5, 0);
  health = 100;
  playerAlive = true;
  weapon.refill();
  hud.hideOverlay();
  hud.hideBanner();
  hud.setCapture(null);
  hud.showBuy(money, weapon.state.weaponId, armor > 0, buy);
  refreshHud();
}

function startRound() {
  phase = 'live';
  roundTimer = ROUND_SECONDS;
  hud.hideBuy();
  hud.hideOverlay();
  audio.roundStart();
  hud.banner(`ROUND ${round}`, 'Capture the Relay or eliminate the Ember squad', 2000);
  refreshHud();
  if (!shot) input.requestLock();
}

function endRound(winner, reason) {
  if (phase !== 'live' || staging) return;
  phase = 'roundEnd';
  roundEndAt = elapsed + 4;
  const playerWon = winner === 'vanguard';
  if (winner) score[winner] += 1;
  money += playerWon ? WIN_REWARD : LOSS_REWARD;
  if (winner) audio.roundWin();
  else audio.roundLose();
  const label = winner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : winner === 'ember' ? 'EMBER WINS THE ROUND' : 'ROUND DRAW';
  hud.banner(label, reason, 3600);
  hud.setCapture(null);
  refreshHud();
}

function endMatch() {
  phase = 'matchEnd';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.hideBuy();
  hud.showMatchEnd(score.vanguard, score.ember);
  refreshHud();
}

function buy(id) {
  if (phase !== 'buy') return;
  if (id === 'armor') {
    if (armor > 0 || money < ARMOR_PRICE) { audio.denied(); return; }
    money -= ARMOR_PRICE;
    armor = 50;
    audio.buy();
  } else {
    const def = WEAPONS[id];
    if (!def) return;
    if (id === weapon.state.weaponId) return;
    if (money < def.price) { audio.denied(); return; }
    money -= def.price;
    weapon.equip(id);
    audio.buy();
  }
  hud.showBuy(money, weapon.state.weaponId, armor > 0, buy);
  refreshHud();
}

function onBotKilled(victim, attacker) {
  const attackerName = attacker === 'player' ? 'You' : attacker ? attacker.name : 'You';
  const friendly = victim.team === 'ember';
  hud.killfeed(`${attackerName}  ▸  ${victim.name}`, victim.team === 'vanguard');
  if (attacker === 'player' && victim.team === 'ember') {
    money += KILL_REWARD;
    kills += 1;
    audio.hit(true);
    refreshHud();
  }
  if (victim.team === 'vanguard' && !bots.aliveCount('vanguard') && playerAlive === false) {
    // Whole Vanguard side is gone; handled by the elimination check in step().
  }
}

function damagePlayer(damage, fromBot) {
  if (staging || !playerAlive || phase !== 'live') return;
  let remaining = damage;
  if (armor > 0) {
    const absorbed = Math.min(armor, remaining * 0.5);
    armor -= absorbed;
    remaining -= absorbed;
  }
  health -= remaining;
  hud.damage();
  audio.hurt();
  refreshHud();
  if (health <= 0) {
    health = 0;
    playerAlive = false;
    deaths += 1;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.killfeed(`${fromBot.name}  ▸  You`, false);
    hud.showOverlay('dead');
    refreshHud();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    weapon.reload();
    return false;
  }
  const def = weapon.def;
  camera.getWorldDirection(direction);
  let hitAny = false;
  let killedAny = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, dir);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const muzzle = muzzleWorld.copy(camera.position).addScaledVector(direction, 0.6);
    if (hit) {
      bots.fireTracer(muzzle, hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part;
        let damage = def.damage * (part === 'head' ? def.headMult : 1);
        if (hit.distance > def.range) damage *= 0.55;
        const killed = bots.damageBot(bot, damage, part, 'player');
        hitAny = true;
        killedAny = killedAny || killed;
        hud.hitMarker(killed, shot ? 4000 : 90);
        if (!killed) audio.hit(false);
      }
    } else {
      bots.fireTracer(muzzle, camera.position.clone().addScaledVector(dir, 60));
    }
  }
  weapon.pullTrigger();
  player.recoil(0.004 + def.kick, (random() * 2 - 1) * def.kick * 0.5);
  audio.shot(def.id);
  refreshHud();
  return hitAny;
}

function stepCapture(dt) {
  const inZone = (pos) => {
    const dx = pos.x - world.relayCenter.x;
    const dz = pos.z - world.relayCenter.z;
    return dx * dx + dz * dz < world.relayRadius * world.relayRadius;
  };
  let vanguardIn = 0;
  let emberIn = 0;
  if (playerAlive && inZone(body.position)) vanguardIn += 1;
  for (const bot of bots.bots) {
    if (!bot.alive || !inZone(bot.body.position)) continue;
    if (bot.team === 'vanguard') vanguardIn += 1;
    else emberIn += 1;
  }
  if (vanguardIn > 0 && emberIn === 0) {
    capture.vanguard = Math.min(1, capture.vanguard + dt / CAPTURE_SECONDS);
    capture.ember = Math.max(0, capture.ember - dt / (CAPTURE_SECONDS / 2));
    if (elapsed >= captureTickAt) { audio.captureTick(); captureTickAt = elapsed + 1; }
    hud.setCapture(capture.vanguard, 'VANGUARD CAPTURING RELAY');
    if (capture.vanguard >= 1) endRound('vanguard', 'Relay captured — the yard is ours.');
  } else if (emberIn > 0 && vanguardIn === 0) {
    capture.ember = Math.min(1, capture.ember + dt / CAPTURE_SECONDS);
    capture.vanguard = Math.max(0, capture.vanguard - dt / (CAPTURE_SECONDS / 2));
    hud.setCapture(capture.ember, 'EMBER CAPTURING RELAY');
    if (capture.ember >= 1) endRound('ember', 'Ember captured the Relay.');
  } else {
    capture.vanguard = Math.max(0, capture.vanguard - dt / (CAPTURE_SECONDS * 2));
    capture.ember = Math.max(0, capture.ember - dt / (CAPTURE_SECONDS * 2));
    const leading = capture.vanguard >= capture.ember ? capture.vanguard : capture.ember;
    hud.setCapture(leading > 0.02 ? leading : null, capture.vanguard >= capture.ember ? 'VANGUARD CAPTURING RELAY' : 'EMBER CAPTURING RELAY');
  }
}

function step(dt) {
  elapsed += dt;
  if (phase === 'buy') {
    buyTimer -= dt;
    if (buyTimer <= 0) startRound();
  } else if (phase === 'live') {
    roundTimer -= dt;
    player.step(dt, input.state.keys, input.state.aiming);
    weapon.step(dt, input.state.aiming);
    bots.step(dt, elapsed, random, body, playerAlive);
    stepCapture(dt);
    // Elimination check.
    if (bots.aliveCount('ember') === 0) endRound('vanguard', 'Ember squad eliminated.');
    else if (bots.aliveCount('vanguard') === 0 && !playerAlive) endRound('ember', 'Vanguard squad eliminated.');
    else if (roundTimer <= 0) {
      const vanguardAlive = bots.aliveCount('vanguard') + (playerAlive ? 1 : 0);
      const emberAlive = bots.aliveCount('ember');
      if (vanguardAlive > emberAlive) endRound('vanguard', 'Time — Vanguard held more fighters.');
      else if (emberAlive > vanguardAlive) endRound('ember', 'Time — Ember held more fighters.');
      else endRound(null, 'Time — nobody held the yard.');
    }
  } else if (phase === 'roundEnd') {
    weapon.step(dt, false);
    bots.step(dt, elapsed, random, body, playerAlive);
    if (elapsed >= roundEndAt) {
      if (score.vanguard >= WIN_ROUNDS || score.ember >= WIN_ROUNDS || round >= MAX_ROUNDS) endMatch();
      else {
        round += 1;
        startBuy();
      }
    }
  }
  // Relay beacon pulse.
  const pulse = 0.7 + Math.sin(elapsed * 3) * 0.3;
  world.beacon.material.color.setRGB(0.34 * pulse, 0.84 * pulse, 0.91 * pulse);
  world.beaconLight.intensity = 4 + pulse * 4;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (phase === 'live') player.look(look.x, look.y);
    if (phase === 'live' && playerAlive) {
      if (input.state.firing && weapon.ready()) shoot(weapon.spread(player.groundSpeed(), input.state.aiming, body.crouching));
      if (input.state.keys.has('KeyR') && weapon.reload()) audio.reload();
    }
    // ADS zoom.
    fovTarget = input.state.aiming && phase === 'live' ? 55 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    // Crosshair spread readout.
    if (phase === 'live') {
      const spread = weapon.spread(player.groundSpeed(), input.state.aiming, body.crouching);
      hud.setSpread(3 + spread * 260);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    refreshHud();
  }
  renderer.render(scene, camera);
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (phase === 'menu' || phase === 'matchEnd') {
    startMatch();
    return;
  }
  if (phase === 'live' && !playerAlive) {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

hud.onDeploy(() => {
  if (phase === 'buy') startRound();
});

window.addEventListener('keydown', (event) => {
  if (phase === 'buy') {
    if (event.code === 'Enter') startRound();
    const buyKeys = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'rifle', Digit5: 'sniper', Digit6: 'armor' };
    if (buyKeys[event.code]) buy(buyKeys[event.code]);
  }
  if (event.code === 'KeyB' && phase === 'buy') {
    const panel = document.getElementById('buy-panel');
    panel.hidden = !panel.hidden;
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (phase === 'live' && playerAlive && !started) {
    hud.showOverlay('start');
  } else if (phase === 'live' && playerAlive) {
    hud.showOverlay('paused');
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

// Put an Ember bot at an exact spot for a staged capture: the bots wander to
// waypoints on their own, so a screenshot needs them placed, not hoped for.
function placeBot(index, x, z) {
  const bot = bots.bots[index];
  bot.body.position.set(x, 0, z);
  bot.body.velocity.set(0, 0, 0);
  bot.body.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
  bot.group.position.set(x, 0, z);
  bot.group.rotation.set(0, bot.body.yaw, 0);
  bot.waypoint = new THREE.Vector2(x, z);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  // Stage a real match state, then freeze one frame of it.
  score = { vanguard: name === 'end' ? 2 : name === 'play' ? 1 : 0, ember: name === 'end' ? 1 : 0 };
  round = name === 'play' ? 2 : name === 'end' ? 3 : 1;
  money = name === 'buy' ? 2450 : name === 'play' ? 1850 : 800;
  health = name === 'play' ? 82 : 100;
  armor = name === 'play' ? 35 : name === 'buy' ? 50 : 0;
  phase = name === 'buy' ? 'buy' : 'live';
  roundTimer = name === 'play' ? 72 : ROUND_SECONDS;
  buyTimer = 9;
  playerAlive = true;
  bots.reset(random);
  weapon.equip('rifle');
  weapon.refill();
  if (name === 'play') weapon.state.mag = 27;
  hud.hideOverlay();
  hud.hideBuy();
  staging = true;
  if (name === 'start') {
    phase = 'menu';
    player.reset(0, 15.5, 0);
    placeBot(3, 2, -4);
    placeBot(4, -3.5, -6);
    aimAt(new THREE.Vector3(0, 1.6, 0));
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    player.reset(-2, 14, 0.15);
    placeBot(3, 2, -4);
    placeBot(4, -3.5, -6);
    aimAt(new THREE.Vector3(0, 1.6, -4));
    settle(20);
    hud.showBuy(money, weapon.state.weaponId, armor > 0, buy);
    hud.banner('BUY PHASE', 'Round 2 starts in 9 seconds', 4000);
  } else if (name === 'play') {
    // Mid-fight at the Relay: two Ember bots staged in the open, one dropped.
    player.reset(-4, 7, 0);
    placeBot(3, -1.5, -2);
    placeBot(4, 3.5, -3.5);
    settle(12);
    const point = bots.aimPoint(0);
    for (let roundFired = 0; roundFired < 4; roundFired += 1) {
      aimAt(point);
      shoot(0);
      settle(7);
    }
    aimAt(bots.aimPoint(0));
    shoot(0);
    capture.vanguard = 0.45;
    hud.setCapture(0.45, 'VANGUARD CAPTURING RELAY');
    settle(10);
  } else {
    // end: a round just won, banner up, a fallen Ember bot in view.
    player.reset(-4, 5, 0);
    placeBot(3, -1, -2);
    placeBot(4, 2.5, -3);
    settle(12);
    const point = bots.aimPoint(0);
    for (let roundFired = 0; roundFired < 4; roundFired += 1) {
      aimAt(point);
      shoot(0);
      settle(7);
    }
    settle(10);
    capture = { vanguard: 0, ember: 0 };
    hud.setCapture(null);
    hud.banner('VANGUARD WINS THE ROUND', 'Ember squad eliminated — Relay held', 8000);
    score = { vanguard: 2, ember: 1 };
  }
  staging = false;
  refreshHud();
  paintTwiceThenReady();
}

syncCamera();
refreshHud();
window.__emberline = { scene, camera, player, bots, weapon };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
