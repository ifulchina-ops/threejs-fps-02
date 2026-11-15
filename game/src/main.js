// SOLSTICE — boot, the one loop, and the match: 15-second buy phases, 100-second
// rounds, first to 5, won by elimination, by detonating the planted Surge Charge,
// or by defusing it. 5v5: the player plus four HELIOS bots against five UMBRA bots.
// ?shot=start|buy|play|end with &seed=N stages a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
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
const BUY_SECONDS = 15;
const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 6;
const FUSE_SECONDS = 35;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const PLANT_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_BASE = 1400;
const LOSS_STEP = 500;
const LOSS_MAX = 3400;

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
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 35, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 180);
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

// ---- The Surge Charge: who holds it, where it is, whether it is live ----
const charge = {
  holder: 'player', // 'player' | bot | null
  droppedAt: null,
  planted: false,
  site: null, // 'A' | 'B'
  plantProgress: 0,
  defuseProgress: 0,
  fuseLeft: FUSE_SECONDS,
};

const bots = createBots(scene, world.colliders, world.shootables, {
  damagePlayer(damage, fromBot) { damagePlayer(damage, fromBot); },
  onKill(victim, attacker) { onBotKilled(victim, attacker); },
  audioDistantShot() { audio.distantShot(); },
  playerSpeed() { return player.groundSpeed(); },
  radio(text, team) { hud.radio(text, team); audio.radio(); },
  onCarrierDown(bot) { dropCharge(bot.body.position); },
  onChargePickup(bot) {
    charge.holder = bot;
    charge.droppedAt = null;
    bots.setCarrier(bot);
    hud.radio(`${bot.name}: Got the charge — heading to ${bots.plan.target}!`, 'helios');
  },
  onPlantStart(bot, site) {
    hud.radio(`${bot.name}: Planting at ${site} — cover me!`, 'helios');
  },
});
const shootables = world.shootables.concat(bots.hitMeshes);

// ---- Match state ----
let phase = 'menu';
let round = 1;
let score = { helios: 0, umbra: 0 };
let money = 800;
let health = 100;
let armor = 0;
let playerAlive = true;
let roundTimer = ROUND_SECONDS;
let buyTimer = BUY_SECONDS;
let roundEndAt = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let kills = 0;
let deaths = 0;
let lossStreak = 0;
let fovTarget = 74;
let staging = false;
let lastBeepAt = 0;
let lastPlantTickAt = 0;
let currentPlan = null;

const body = player.state;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function siteAt(pos) {
  for (const key of ['A', 'B']) {
    const site = world.sites[key];
    const dx = pos.x - site.center.x;
    const dz = pos.z - site.center.z;
    if (dx * dx + dz * dz < site.radius * site.radius) return key;
  }
  return null;
}

function refreshHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.weaponId);
  hud.setHealth(health, armor);
  hud.setMoney(money);
  hud.setScore(score.helios, score.umbra, round);
  hud.setAlive(bots.aliveCount('helios') + (playerAlive ? 1 : 0), bots.aliveCount('umbra'));
  hud.setCharge(charge.holder === 'player' && playerAlive);
  if (phase === 'buy') hud.setTimer(buyTimer, 'BUY');
  else if (charge.planted) hud.setTimer(charge.fuseLeft, 'BOMB');
  else hud.setTimer(roundTimer, phase === 'live' ? 'ROUND' : phase.toUpperCase());
  hud.setBomb(charge.planted ? charge.fuseLeft : null, charge.site);
}

function startMatch() {
  score = { helios: 0, umbra: 0 };
  round = 1;
  money = 800;
  kills = 0;
  deaths = 0;
  lossStreak = 0;
  startBuy();
}

function startBuy() {
  phase = 'buy';
  buyTimer = BUY_SECONDS;
  currentPlan = bots.reset(random);
  bots.setCarrier(null);
  charge.holder = 'player';
  charge.droppedAt = null;
  charge.planted = false;
  charge.site = null;
  charge.plantProgress = 0;
  charge.defuseProgress = 0;
  charge.fuseLeft = FUSE_SECONDS;
  world.chargeGroup.visible = false;
  player.reset(0, 17, 0);
  health = 100;
  playerAlive = true;
  weapon.refill();
  hud.hideOverlay();
  hud.hideBanner();
  hud.setProgress(null);
  hud.setBomb(null);
  hud.showBuy(money, weapon.state.weaponId, armor > 0, buy);
  hud.banner(`PLAN: ${currentPlan.name}`, currentPlan.callout, 3000);
  refreshHud();
}

function startRound() {
  phase = 'live';
  roundTimer = ROUND_SECONDS;
  hud.hideBuy();
  hud.hideOverlay();
  audio.roundStart();
  hud.banner(`ROUND ${round}`, `Plant the charge at A or B — or eliminate UMBRA`, 2000);
  refreshHud();
  if (!shot) input.requestLock();
}

function endRound(winner, reason) {
  if (phase !== 'live' || staging) return;
  phase = 'roundEnd';
  roundEndAt = elapsed + 4;
  const playerWon = winner === 'helios';
  if (winner) score[winner] += 1;
  if (playerWon) {
    money += WIN_REWARD;
    lossStreak = 0;
  } else {
    money += Math.min(LOSS_MAX, LOSS_BASE + lossStreak * LOSS_STEP);
    lossStreak += 1;
  }
  if (winner) audio.roundWin();
  else audio.roundLose();
  const label = winner === 'helios' ? 'HELIOS WINS THE ROUND' : winner === 'umbra' ? 'UMBRA WINS THE ROUND' : 'ROUND DRAW';
  hud.banner(label, reason, 3600);
  hud.setProgress(null);
  refreshHud();
}

function endMatch() {
  phase = 'matchEnd';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.hideBuy();
  hud.showMatchEnd(score.helios, score.umbra, kills, deaths);
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

function dropCharge(at) {
  if (charge.planted) return;
  charge.holder = null;
  charge.droppedAt = at.clone();
  charge.droppedAt.y = 0;
  charge.plantProgress = 0;
  hud.radio('Charge dropped — pick it up!', 'helios');
}

function completePlant(site, byPlayer) {
  charge.planted = true;
  charge.site = site;
  charge.fuseLeft = FUSE_SECONDS;
  charge.plantProgress = 0;
  charge.holder = null;
  bots.setCarrier(null);
  world.chargeGroup.visible = true;
  world.chargeGroup.position.copy(world.sites[site].center);
  world.chargeGroup.position.y = 0.15;
  audio.planted();
  if (byPlayer) {
    money += PLANT_REWARD;
    hud.radio('You: Charge planted — hold the site!', 'helios');
  } else {
    hud.radio('Charge planted — hold the site!', 'helios');
  }
  hud.banner(`CHARGE PLANTED AT ${site}`, 'UMBRA has 35 seconds to defuse it', 3000);
  refreshHud();
}

function onBotKilled(victim, attacker) {
  const attackerName = attacker === 'player' ? 'You' : attacker ? attacker.name : 'You';
  hud.killfeed(`${attackerName}  ▸  ${victim.name}`, victim.team === 'umbra');
  if (attacker === 'player' && victim.team === 'umbra') {
    money += KILL_REWARD;
    kills += 1;
    audio.hit(true);
    refreshHud();
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
    if (charge.holder === 'player') dropCharge(body.position);
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

// Plant, defuse and fuse progress, advanced once per fixed step.
function stepCharge(dt) {
  if (charge.planted) {
    // A defuse channel wins the round for UMBRA; the fuse wins it for HELIOS.
    const defusing = bots.bots.some((b) => b.alive && b.defusing);
    if (defusing) {
      charge.defuseProgress = Math.min(1, charge.defuseProgress + dt / DEFUSE_SECONDS);
      if (elapsed >= lastPlantTickAt) { audio.defuseTick(); lastPlantTickAt = elapsed + 0.5; }
      hud.setProgress(charge.defuseProgress, 'UMBRA DEFUSING THE CHARGE');
      if (charge.defuseProgress >= 1) {
        charge.planted = false;
        world.chargeGroup.visible = false;
        endRound('umbra', 'UMBRA defused the charge.');
        return;
      }
    } else {
      charge.defuseProgress = Math.max(0, charge.defuseProgress - dt / (DEFUSE_SECONDS * 2));
      hud.setProgress(charge.defuseProgress > 0.02 ? charge.defuseProgress : null, 'UMBRA DEFUSING THE CHARGE');
    }
    charge.fuseLeft -= dt;
    const interval = charge.fuseLeft > 10 ? 1 : 0.5;
    if (elapsed - lastBeepAt >= interval) {
      audio.fuseBeep(charge.fuseLeft <= 10);
      lastBeepAt = elapsed;
    }
    if (charge.fuseLeft <= 0) {
      audio.explosion();
      world.chargeGroup.visible = false;
      endRound('helios', 'The charge detonated — the site is gone.');
    }
    return;
  }

  // Not planted yet: the player or the carrier bot plants inside a site.
  const playerSite = playerAlive && charge.holder === 'player' ? siteAt(body.position) : null;
  const botPlanting = bots.bots.find((b) => b.alive && b.planting);
  if (playerSite && input.state.interact && !input.state.firing) {
    charge.plantProgress = Math.min(1, charge.plantProgress + dt / PLANT_SECONDS);
    if (elapsed >= lastPlantTickAt) { audio.plantTick(); lastPlantTickAt = elapsed + 0.5; }
    hud.setProgress(charge.plantProgress, `PLANTING CHARGE AT ${playerSite}`);
    if (charge.plantProgress >= 1) completePlant(playerSite, true);
  } else if (botPlanting) {
    charge.plantProgress = Math.min(1, charge.plantProgress + dt / PLANT_SECONDS);
    if (elapsed >= lastPlantTickAt) { audio.plantTick(); lastPlantTickAt = elapsed + 0.5; }
    hud.setProgress(charge.plantProgress, `${botPlanting.name.toUpperCase()} PLANTING AT ${bots.plan.target}`);
    if (charge.plantProgress >= 1) completePlant(bots.plan.target, false);
  } else {
    charge.plantProgress = Math.max(0, charge.plantProgress - dt / (PLANT_SECONDS * 2));
    if (playerSite && charge.holder === 'player') {
      hud.setProgress(charge.plantProgress > 0.02 ? charge.plantProgress : 0, `HOLD E — PLANT THE CHARGE AT ${playerSite}`);
    } else {
      hud.setProgress(charge.plantProgress > 0.02 ? charge.plantProgress : null, 'PLANTING CHARGE');
    }
  }

  // The player can pick up a dropped charge by walking over it.
  if (charge.holder === null && charge.droppedAt && playerAlive) {
    if (body.position.distanceTo(charge.droppedAt) < 1.4) {
      charge.holder = 'player';
      charge.droppedAt = null;
      hud.radio('You picked up the charge.', 'helios');
    }
  }
}

function step(dt) {
  elapsed += dt;
  if (phase === 'buy') {
    buyTimer -= dt;
    if (buyTimer <= 0) startRound();
  } else if (phase === 'live') {
    if (!charge.planted) roundTimer -= dt;
    player.step(dt, input.state.keys, input.state.aiming);
    weapon.step(dt, input.state.aiming);
    bots.step(dt, elapsed, random, body, playerAlive, charge);
    stepCharge(dt);
    // Elimination check.
    const umbraAlive = bots.aliveCount('umbra');
    const heliosAlive = bots.aliveCount('helios') + (playerAlive ? 1 : 0);
    if (umbraAlive === 0) endRound('helios', 'UMBRA squad eliminated.');
    else if (heliosAlive === 0 && !charge.planted) endRound('umbra', 'HELIOS squad eliminated.');
    else if (roundTimer <= 0 && !charge.planted) endRound('umbra', 'Time — UMBRA held the sites.');
  } else if (phase === 'roundEnd') {
    weapon.step(dt, false);
    bots.step(dt, elapsed, random, body, playerAlive, charge);
    if (elapsed >= roundEndAt) {
      if (score.helios >= WIN_ROUNDS || score.umbra >= WIN_ROUNDS || round >= MAX_ROUNDS) endMatch();
      else {
        round += 1;
        startBuy();
      }
    }
  }
  // Site beacons pulse; the planted charge blinks faster as the fuse runs out.
  const pulse = 0.7 + Math.sin(elapsed * 3) * 0.3;
  world.lightA.intensity = 6 + pulse * 4;
  world.lightB.intensity = 6 + pulse * 4;
  if (world.chargeGroup.visible) {
    const blink = charge.planted && charge.fuseLeft <= 10
      ? (Math.sin(elapsed * 14) > 0 ? 1 : 0.1)
      : (Math.sin(elapsed * 4) > 0 ? 1 : 0.2);
    world.chargeLight.material.color.setRGB(1, 0.1 * blink, 0.1 * blink);
  }
  // Dropped charge marker follows the drop point.
  if (charge.droppedAt && !charge.planted) {
    world.chargeGroup.visible = true;
    world.chargeGroup.position.copy(charge.droppedAt);
    world.chargeGroup.position.y = 0.15;
  } else if (!charge.planted) {
    world.chargeGroup.visible = false;
  }
  // Dust drifts on the wind.
  world.dust.rotation.y = elapsed * 0.004;
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
    fovTarget = input.state.aiming && phase === 'live' ? 55 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
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
    hud.drawRadar(body, bots.bots, charge, elapsed);
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

function placeBot(index, x, z) {
  const bot = bots.bots[index];
  bot.body.position.set(x, 0, z);
  bot.body.velocity.set(0, 0, 0);
  bot.body.yaw = bot.team === 'helios' ? 0 : Math.PI;
  bot.group.position.set(x, 0, z);
  bot.group.rotation.set(0, bot.body.yaw, 0);
  bot.route = [];
  bot.routeIndex = 0;
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hud.drawRadar(body, bots.bots, charge, elapsed);
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
  score = { helios: name === 'end' ? 2 : name === 'play' ? 1 : 0, umbra: name === 'end' ? 1 : 0 };
  round = name === 'play' ? 2 : name === 'end' ? 3 : 1;
  money = name === 'buy' ? 2450 : name === 'play' ? 1850 : 800;
  health = name === 'play' ? 82 : 100;
  armor = name === 'play' ? 35 : name === 'buy' ? 50 : 0;
  phase = name === 'buy' ? 'buy' : 'live';
  roundTimer = name === 'play' ? 72 : ROUND_SECONDS;
  buyTimer = 9;
  playerAlive = true;
  currentPlan = bots.reset(random, false);
  bots.setCarrier(null);
  charge.holder = 'player';
  charge.droppedAt = null;
  charge.planted = false;
  charge.site = null;
  weapon.equip('rifle');
  weapon.refill();
  if (name === 'play') weapon.state.mag = 27;
  hud.hideOverlay();
  hud.hideBuy();
  staging = true;
  if (name === 'start') {
    phase = 'menu';
    player.reset(0, 17, 0);
    placeBot(4, 2, -4);
    placeBot(5, -3.5, -6);
    aimAt(new THREE.Vector3(0, 1.6, -8));
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    player.reset(-2, 15, 0);
    placeBot(4, 2, -4);
    placeBot(5, -3.5, -6);
    aimAt(new THREE.Vector3(0, 1.6, -4));
    settle(20);
    hud.showBuy(money, weapon.state.weaponId, armor > 0, buy);
    hud.banner(`PLAN: ${currentPlan.name}`, currentPlan.callout, 4000);
  } else if (name === 'play') {
    // Mid-fight at A with the charge live: two UMBRA bots staged in the open,
    // one dropped, the fuse bar up.
    player.reset(-8, -2, 0);
    placeBot(4, -12, -8);
    placeBot(5, -16, -12);
    placeBot(6, -10, -14);
    settle(12);
    const point = bots.aimPoint(0);
    for (let fired = 0; fired < 4; fired += 1) {
      aimAt(point);
      shoot(0);
      settle(7);
    }
    aimAt(bots.aimPoint(0));
    shoot(0);
    charge.planted = true;
    charge.site = 'A';
    charge.fuseLeft = 24;
    charge.holder = null;
    world.chargeGroup.visible = true;
    world.chargeGroup.position.copy(world.sites.A.center);
    world.chargeGroup.position.y = 0.15;
    hud.radio('Charge planted at A — hold the site!', 'helios');
    hud.killfeed('You  ▸  Ash', true);
    settle(10);
  } else {
    // end: a round just won, banner up, a fallen UMBRA bot in view.
    player.reset(-8, -2, 0);
    placeBot(4, -12, -8);
    placeBot(5, -16, -12);
    settle(12);
    const point = bots.aimPoint(0);
    for (let fired = 0; fired < 4; fired += 1) {
      aimAt(point);
      shoot(0);
      settle(7);
    }
    settle(10);
    charge.holder = null; charge.planted = false; charge.site = null;
    hud.banner('HELIOS WINS THE ROUND', 'The charge detonated — the site is gone.', 8000);
    score = { helios: 2, umbra: 1 };
  }
  staging = false;
  refreshHud();
  paintTwiceThenReady();
}

syncCamera();
refreshHud();
window.__solstice = { scene, camera, player, bots, weapon, charge };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
