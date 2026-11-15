// KESTREL — the bots. 5v5: four AURORA teammates beside the player, five
// WARDEN defenders. Each round the attackers pick a team plan (rush, split,
// slow push, fake, overlook) and walk it as a unit, calling it on the radio;
// defenders hold their sites and rotate when the core goes down. Bots fight
// in bursts after a reaction delay, miss more the further and faster their
// target moves, and use the same axis-separated collision as the player.
// They also hear: a gunshot or a sprinting footstep draws the nearest enemy
// bots to investigate. They buy their own weapons with round money, throw
// smoke on site executes and flash toward contact, and a flashbang blinds
// them just as it blinds the player. One bot carries the Pulse Core: if the
// carrier falls, the core drops and the nearest attacker picks it up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, stepBody } from './player.js';
import { WAYPOINTS } from './world.js';

const HEALTH = 100;
const BOT_SPEED = 3.8;
const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 6;
const THINK_TICK = 0.14;

// What a bot's weapon does in its hands: damage per hit, burst size, gap
// between shots, and how far it stays accurate. Bots buy up as they earn.
const BOT_WEAPONS = {
  pistol: { damage: [11, 25], burst: [2, 3], gap: 0.22, range: 30, gun: 0.45 },
  smg: { damage: [8, 18], burst: [4, 6], gap: 0.11, range: 26, gun: 0.55 },
  shotgun: { damage: [16, 34], burst: [1, 1], gap: 0.9, range: 12, gun: 0.65 },
  rifle: { damage: [11, 25], burst: [3, 5], gap: 0.13, range: 55, gun: 0.75 },
  sniper: { damage: [40, 70], burst: [1, 1], gap: 1.4, range: 90, gun: 1.05 },
};
const BOT_BUY = [
  ['sniper', 4750], ['rifle', 2700], ['smg', 1250], ['shotgun', 1100], ['pistol', 0],
];

// Team plans. Each assigns every AURORA bot a route (waypoint keys); the
// carrier plants at the plan's target site. Defenders always hold sites.
const PLANS = [
  {
    name: 'RUSH A', target: 'A', callout: 'Rushing A — follow me!',
    routes: [
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'aPost2'],
    ],
  },
  {
    name: 'RUSH B', target: 'B', callout: 'Rushing B — go go go!',
    routes: [
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
  {
    name: 'SPLIT', target: 'A', callout: 'Splitting sites — two A, two B!',
    routes: [
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
  {
    name: 'SLOW A', target: 'A', callout: 'Slow push A — clear every corner.',
    routes: [
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'aPost2'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aPost1'],
    ],
  },
  {
    name: 'OVERLOOK', target: 'B', callout: 'Taking the Overlook, then B!',
    routes: [
      ['auroraMid', 'midSouth', 'overlookBase', 'overlook'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraMid', 'midSouth', 'overlookBase', 'overlook', 'midNorth', 'bEntry', 'bSite'],
    ],
  },
  {
    name: 'FAKE A', target: 'B', callout: 'Fake A, then we hit B — stay quiet.',
    routes: [
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'midNorth', 'mid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraWest', 'westMid', 'westMid2', 'aEntry', 'midNorth', 'mid', 'eastMid2', 'bEntry', 'bSite'],
      ['auroraMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['auroraEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
];

const DEFENDER_POSTS = [
  ['wardenWest', 'aPost1'], ['wardenWest', 'aBack'], ['wardenEast', 'bPost1'],
  ['wardenEast', 'bBack'], ['wardenSpawn', 'midNorth'],
];

function teamColor(team) {
  return team === 'aurora' ? PALETTE.aurora : PALETTE.warden;
}

function areaName(x, z) {
  if (z < -7 && x < -6) return 'A site';
  if (z < -7 && x > 6) return 'B site';
  if (Math.abs(x) < 7) return 'mid';
  if (x < -7) return 'west lane';
  return 'east lane';
}

export function createBots(scene, colliders, shootables, callbacks) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const tmp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  let plan = PLANS[0];
  let radioCooldownUntil = 0;

  function radio(text, team) {
    if (callbacks.radio) callbacks.radio(text, team);
  }

  function buildBot(team, name, x, z, skill) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor(team)), roughness: 0.6, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
    const visorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'aurora' ? PALETTE.accent : PALETTE.warden),
      roughness: 0.3, metalness: 0.4,
      emissive: new THREE.Color(team === 'aurora' ? PALETTE.accent : PALETTE.warden), emissiveIntensity: 0.5,
    });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.18), darkMat);
    legL.position.set(-0.11, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), torsoMat);
    torso.position.y = 1.08;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), darkMat);
    head.position.y = 1.62;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), visorMat);
    visor.position.set(0, 1.63, -0.15);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.14),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.charge), emissive: new THREE.Color(PALETTE.charge), emissiveIntensity: 0.5 }),
    );
    pack.position.set(0, 1.15, 0.22);
    pack.visible = false;
    group.add(legL, legR, torso, head, visor, gun, pack);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.position.set(x, 0, z);
    scene.add(group);

    const body = makeBody(colliders, x, z);
    const bot = {
      team, name, group, torso, head, gun, pack, body, skill,
      health: HEALTH, alive: true, fall: 0, fadeAt: 0,
      route: [], routeIndex: 0, thinkAt: 0, reactionAt: 0, burstLeft: 0, nextShotAt: 0,
      target: null, stuckAt: 0, lastPos: new THREE.Vector3(x, 0, z), strafeDir: 1,
      keys: new Set(), isCarrier: false, planting: false, defusing: false,
      holdUntil: 0, calledContact: false, postSpot: null,
      weaponId: 'pistol', money: 800, blindUntil: 0,
      investigateAt: null, investigateUntil: 0,
      smokedThisRound: false, flashedThisRound: false,
      directTarget: null, lastShotAt: -99,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnTeams() {
    buildBot('aurora', 'Kestrel', -3, 17, 0.55);
    buildBot('aurora', 'Lark', 3, 17, 0.5);
    buildBot('aurora', 'Finch', 0, 19, 0.6);
    buildBot('aurora', 'Wren', -1.5, 18, 0.65);
    buildBot('warden', 'Onyx', -4, -17, 0.6);
    buildBot('warden', 'Slate', 4, -17, 0.55);
    buildBot('warden', 'Frost', -1.5, -19, 0.5);
    buildBot('warden', 'Gale', 1.5, -19, 0.65);
    buildBot('warden', 'North', 0, -17.5, 0.58);
  }

  function eyeOf(bot, out) {
    return out.set(bot.body.position.x, bot.body.position.y + 1.55, bot.body.position.z);
  }

  function hasLineOfSight(from, to) {
    toTarget.copy(to).sub(from);
    const distance = toTarget.length();
    if (distance > 60) return false;
    raycaster.set(from, toTarget.normalize());
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance >= distance - 0.15;
  }

  function canSee(bot, enemyPos, enemyEye) {
    if (bot.blindUntil > 0) return false;
    const from = eyeOf(bot, tmpEye);
    const to = tmp.set(enemyPos.x, enemyPos.y + enemyEye * 0.8, enemyPos.z);
    if (!hasLineOfSight(from, to)) return false;
    // Smoke cuts the sightline: no shooting through a cloud.
    if (callbacks.smokeBlocks && callbacks.smokeBlocks(from, to)) return false;
    return true;
  }

  function nearestEnemy(bot, playerState, playerAlive) {
    let best = null;
    let bestDist = Infinity;
    if (playerAlive && bot.team === 'warden') {
      const d = bot.body.position.distanceTo(playerState.position);
      if (d < bestDist) { bestDist = d; best = { kind: 'player', pos: playerState.position, eye: playerState.position.y + playerState.eye }; }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const d = bot.body.position.distanceTo(other.body.position);
      if (d < bestDist) { bestDist = d; best = { kind: 'bot', bot: other, pos: other.body.position, eye: other.body.position.y + 1.3 }; }
    }
    return best ? { ...best, dist: bestDist } : null;
  }

  function muzzleOf(bot) {
    const p = bot.body.position;
    const yaw = bot.body.yaw;
    return new THREE.Vector3(p.x - Math.sin(yaw) * 0.5, p.y + 1.2, p.z - Math.cos(yaw) * 0.5);
  }

  function botShoot(bot, target, time, random) {
    bot.lastShotAt = time;
    const weapon = BOT_WEAPONS[bot.weaponId];
    const from = muzzleOf(bot);
    const aimPoint = new THREE.Vector3(target.pos.x, target.pos.y + target.eye * 0.8, target.pos.z);
    const targetSpeed = target.kind === 'player' ? callbacks.playerSpeed() : 3;
    let chance = 0.42 - target.dist * 0.006 - targetSpeed * 0.02;
    if (target.dist > weapon.range) chance *= 0.4;
    chance = Math.max(0.06, Math.min(0.55, chance)) * (0.7 + bot.skill * 0.6);
    const hit = random() < chance;
    const end = aimPoint.clone();
    if (!hit) {
      end.x += (random() * 2 - 1) * 1.6;
      end.y += (random() * 2 - 1) * 0.8;
      end.z += (random() * 2 - 1) * 1.6;
    }
    if (callbacks.tracer) callbacks.tracer(from, end);
    if (target.dist < 40) callbacks.audioDistantShot();
    // A gunshot is loud: enemy bots within 30 m hear it and investigate.
    if (callbacks.noise) callbacks.noise(from, 30, bot.team, time);
    if (hit) {
      const [lo, hi] = weapon.damage;
      const damage = lo + random() * (hi - lo);
      if (target.kind === 'player') callbacks.damagePlayer(damage, bot);
      else damageBot(target.bot, damage, 'torso', bot);
    }
  }

  function damageBot(bot, amount, part, attacker) {
    if (!bot.alive) return false;
    bot.health -= amount * (part === 'head' ? 3 : 1);
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.fadeAt = 0;
    bot.keys.clear();
    bot.planting = false;
    bot.defusing = false;
    bot.investigateAt = null;
    if (bot.isCarrier) {
      bot.isCarrier = false;
      bot.pack.visible = false;
      if (callbacks.onCarrierDown) callbacks.onCarrierDown(bot);
    }
    callbacks.onKill(bot, attacker);
    return true;
  }

  function waypointPos(key) {
    const [x, z] = WAYPOINTS[key];
    return new THREE.Vector3(x, 0, z);
  }

  function setRoute(bot, keys) {
    bot.route = keys.slice();
    bot.routeIndex = 0;
  }

  function routeTarget(bot) {
    if (bot.routeIndex >= bot.route.length) return null;
    return waypointPos(bot.route[bot.routeIndex]);
  }

  function faceToward(bot, x, z, dt, turnRate) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const wantYaw = Math.atan2(-dx, -dz);
    let diff = wantYaw - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
    return diff;
  }

  function throwAt(bot, type, targetPos) {
    const origin = eyeOf(bot, new THREE.Vector3());
    const direction = targetPos.clone().sub(origin).normalize();
    if (callbacks.throwGrenade) callbacks.throwGrenade(type, origin, direction, bot);
  }

  // Decide what this bot should be doing right now, given the core state.
  function objective(bot, charge, time, random) {
    if (bot.team === 'warden') {
      if (charge.planted) {
        const site = charge.site;
        const sitePos = waypointPos(site === 'A' ? 'aSite' : 'bSite');
        const defenders = bots.filter((b) => b.team === 'warden' && b.alive);
        const nearest = defenders.reduce((best, b) => (
          !best || b.body.position.distanceTo(sitePos) < best.body.position.distanceTo(sitePos) ? b : best
        ), null);
        if (nearest === bot) {
          bot.defusing = bot.body.position.distanceTo(sitePos) < 2.2;
          if (!bot.defusing) {
            setRoute(bot, bot.route.length && bot.route[bot.route.length - 1] === (site === 'A' ? 'aSite' : 'bSite')
              ? bot.route : [site === 'A' ? 'aSite' : 'bSite']);
          }
          return;
        }
        bot.defusing = false;
        const post = site === 'A' ? 'aPost2' : 'bPost2';
        if (!bot.postSpot) {
          bot.postSpot = post;
          setRoute(bot, [post]);
        }
        return;
      }
      bot.defusing = false;
      return; // hold the assigned post (route set at reset).
    }

    // AURORA.
    if (charge.planted) {
      if (!bot.postSpot) {
        const posts = charge.site === 'A' ? ['aPost1', 'aPost2', 'aBack', 'aEntry'] : ['bPost1', 'bPost2', 'bBack', 'bEntry'];
        bot.postSpot = posts[Math.floor(random() * posts.length)];
        setRoute(bot, [bot.postSpot]);
      }
      return;
    }
    if (charge.holder === null && charge.droppedAt) {
      const attackers = bots.filter((b) => b.team === 'aurora' && b.alive);
      const nearest = attackers.reduce((best, b) => (
        !best || b.body.position.distanceTo(charge.droppedAt) < best.body.position.distanceTo(charge.droppedAt) ? b : best
      ), null);
      if (nearest === bot) {
        const d = bot.body.position.distanceTo(charge.droppedAt);
        if (d < 1.4) {
          if (callbacks.onChargePickup) callbacks.onChargePickup(bot);
        } else {
          bot.route = [];
          bot.directTarget = charge.droppedAt.clone();
        }
        return;
      }
      return; // keep pushing the plan site.
    }
    if (bot.isCarrier) {
      const siteKey = plan.target === 'A' ? 'aSite' : 'bSite';
      const sitePos = waypointPos(siteKey);
      const d = bot.body.position.distanceTo(sitePos);
      if (d < 2.4) {
        if (!bot.planting && callbacks.onPlantStart) callbacks.onPlantStart(bot, plan.target);
        bot.planting = true;
      } else {
        bot.planting = false;
        if (!bot.route.length || bot.route[bot.route.length - 1] !== siteKey) {
          setRoute(bot, [siteKey]);
        }
      }
      return;
    }
    bot.planting = false;
  }

  function stepBot(bot, dt, time, random, playerState, playerAlive, charge) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.5;
      bot.fadeAt += dt;
      if (bot.fadeAt > 3.5) bot.group.visible = false;
      return;
    }
    if (bot.blindUntil > 0 && time >= bot.blindUntil) bot.blindUntil = 0;
    const blinded = bot.blindUntil > 0;

    if (time >= bot.thinkAt) {
      bot.thinkAt = time + THINK_TICK;
      const enemy = blinded ? null : nearestEnemy(bot, playerState, playerAlive);
      bot.target = null;
      if (enemy && enemy.dist < 48 && canSee(bot, enemy.pos, enemy.eye)) bot.target = enemy;
      if (bot.target) {
        bot.planting = false;
        bot.defusing = false;
        bot.investigateAt = null;
        if (!bot.calledContact && time > radioCooldownUntil) {
          radio(`${bot.name}: Contact ${areaName(bot.body.position.x, bot.body.position.z)}!`, bot.team);
          radioCooldownUntil = time + 5;
          bot.calledContact = true;
        }
        // Defenders flash toward first contact; attackers smoke their execute.
        if (bot.team === 'warden' && !bot.flashedThisRound && random() < 0.35) {
          bot.flashedThisRound = true;
          throwAt(bot, 'flash', bot.target.pos);
          radio(`${bot.name}: Flashing ${areaName(bot.target.pos.x, bot.target.pos.z)}!`, bot.team);
        }
        if (bot.reactionAt === 0) bot.reactionAt = time + (0.35 + random() * 0.45) / bot.skill;
        if (time >= bot.reactionAt && bot.burstLeft === 0) {
          const weapon = BOT_WEAPONS[bot.weaponId];
          bot.burstLeft = weapon.burst[0] + Math.floor(random() * (weapon.burst[1] - weapon.burst[0] + 1));
          bot.nextShotAt = time;
        }
      } else {
        bot.reactionAt = 0;
        bot.burstLeft = 0;
        // Attackers smoke the site entry as they close in on the execute.
        if (bot.team === 'aurora' && !charge.planted && !bot.smokedThisRound && !bot.isCarrier) {
          const entryKey = plan.target === 'A' ? 'aEntry' : 'bEntry';
          const entryPos = waypointPos(entryKey);
          if (bot.body.position.distanceTo(entryPos) < 20 && random() < 0.5) {
            bot.smokedThisRound = true;
            throwAt(bot, 'smoke', entryPos);
            radio(`${bot.name}: Smoke out on ${plan.target}!`, bot.team);
          }
        }
        objective(bot, charge, time, random);
        const target = routeTarget(bot);
        if (target && bot.body.position.distanceTo(target) < 1.2) bot.routeIndex += 1;
        // Stuck? Hop (climbs the Overlook steps) and then skip a waypoint.
        if (bot.body.position.distanceTo(bot.lastPos) < 0.05) {
          bot.stuckAt += THINK_TICK;
          if (bot.stuckAt > 0.5) bot.keys.add('Space');
          if (bot.stuckAt > 1.2) { bot.routeIndex += 1; bot.stuckAt = 0; }
        } else bot.stuckAt = 0;
        bot.lastPos.copy(bot.body.position);
      }
    }

    bot.keys.clear();
    if (blinded) {
      // Blinded: stop, crouch behind whatever is near, wait it out.
      bot.keys.add('ControlLeft');
    } else if (bot.planting || bot.defusing) {
      const siteKey = charge.planted || bot.defusing ? (charge.site === 'A' ? 'aSite' : 'bSite') : (plan.target === 'A' ? 'aSite' : 'bSite');
      const sitePos = waypointPos(siteKey);
      faceToward(bot, sitePos.x, sitePos.z, dt, 3);
    } else if (bot.target) {
      faceToward(bot, bot.target.pos.x, bot.target.pos.z, dt, 2.4);
      if (Math.random() < dt * 0.25) bot.strafeDir *= -1;
      if (bot.target.dist > 16) bot.keys.add('KeyW');
      else if (bot.target.dist < 6) bot.keys.add('KeyS');
      bot.keys.add(bot.strafeDir > 0 ? 'KeyD' : 'KeyA');
      if (bot.burstLeft > 0 && time >= bot.nextShotAt) {
        botShoot(bot, bot.target, time, random);
        bot.burstLeft -= 1;
        bot.nextShotAt = time + BOT_WEAPONS[bot.weaponId].gap;
        if (bot.burstLeft === 0) bot.reactionAt = time + 0.5 + random() * 0.7;
      }
    } else if (bot.investigateAt && time < bot.investigateUntil) {
      const diff = faceToward(bot, bot.investigateAt.x, bot.investigateAt.z, dt, 3.2);
      if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
      if (bot.body.position.distanceTo(bot.investigateAt) < 1.5) bot.investigateAt = null;
    } else if (bot.directTarget) {
      const diff = faceToward(bot, bot.directTarget.x, bot.directTarget.z, dt, 3.2);
      if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
      if (bot.body.position.distanceTo(bot.directTarget) < 1.2) bot.directTarget = null;
    } else {
      const target = routeTarget(bot);
      if (target) {
        const diff = faceToward(bot, target.x, target.z, dt, 3.2);
        if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
        // Hop up the Overlook steps when the route climbs.
        if (target.y > bot.body.position.y + 0.2 && bot.body.onGround) bot.keys.add('Space');
      }
    }
    stepBody(bot.body, dt, bot.keys, false);
    const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    if (speed > BOT_SPEED) {
      bot.body.velocity.x *= BOT_SPEED / speed;
      bot.body.velocity.z *= BOT_SPEED / speed;
    }
    bot.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.group.rotation.y = bot.body.yaw;
    const bobPhase = time * 9 + bot.body.position.x;
    bot.group.position.y = bot.body.position.y + (speed > 0.5 ? Math.abs(Math.sin(bobPhase)) * 0.03 : 0);
  }

  function step(dt, time, random, playerState, playerAlive, charge) {
    for (const bot of bots) stepBot(bot, dt, time, random, playerState, playerAlive, charge);
  }

  function buyFor(bot) {
    for (const [id, price] of BOT_BUY) {
      if (bot.money >= price) {
        bot.weaponId = id;
        bot.money -= price;
        break;
      }
    }
    // The gun mesh shows what the bot carries: longer for rifle and sniper.
    const length = BOT_WEAPONS[bot.weaponId].gun;
    bot.gun.scale.z = length / 0.55;
    bot.gun.position.z = -0.3 - (length - 0.55) / 2;
  }

  spawnTeams();

  return {
    bots,
    hitMeshes,
    step,
    damageBot,
    muzzleOf,
    get plan() { return plan; },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    // A noise at a position, heard by the other team within radius: bots with
    // no target walk over to investigate for a few seconds.
    hearNoise(position, radius, sourceTeam, time) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === sourceTeam || bot.target) continue;
        if (bot.body.position.distanceTo(position) > radius) continue;
        if (bot.planting || bot.defusing) continue;
        bot.investigateAt = position.clone();
        bot.investigateUntil = time + 4;
      }
    },
    // A flashbang pop: bots facing it with line of sight are blinded, longer
    // the closer they are. Facing away or behind cover saves them.
    flashBots(position, radius, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const eye = eyeOf(bot, new THREE.Vector3());
        const distance = eye.distanceTo(position);
        if (distance > radius) continue;
        if (!hasLineOfSight(position, eye)) continue;
        const toFlash = new THREE.Vector3().copy(position).sub(eye).normalize();
        const facing = new THREE.Vector3(-Math.sin(bot.body.yaw), 0, -Math.cos(bot.body.yaw));
        const facingFactor = Math.max(0, toFlash.dot(facing));
        const duration = 2.6 * (1 - distance / radius) * (0.25 + 0.75 * facingFactor);
        if (duration > 0.25) bot.blindUntil = time + duration;
      }
    },
    reset(nextRandom, announce = true) {
      plan = PLANS[Math.floor(nextRandom() * PLANS.length)];
      const aurora = bots.filter((b) => b.team === 'aurora');
      const warden = bots.filter((b) => b.team === 'warden');
      const spawns = {
        aurora: [[-3, 17], [3, 17], [0, 19], [-1.5, 18]],
        warden: [[-4, -17], [4, -17], [-1.5, -19], [1.5, -19], [0, -17.5]],
      };
      aurora.forEach((bot, i) => {
        const [x, z] = spawns.aurora[i % spawns.aurora.length];
        resetBot(bot, x, z, 0);
        buyFor(bot);
        setRoute(bot, plan.routes[i % plan.routes.length]);
      });
      warden.forEach((bot, i) => {
        const [x, z] = spawns.warden[i % spawns.warden.length];
        resetBot(bot, x, z, Math.PI);
        buyFor(bot);
        setRoute(bot, DEFENDER_POSTS[i % DEFENDER_POSTS.length]);
      });
      radioCooldownUntil = 0;
      if (announce) radio(`${aurora[0].name}: ${plan.callout}`, 'aurora');
      return plan;
    },
    payRound(winner) {
      for (const bot of bots) {
        if (bot.team === winner) bot.money += 3250;
        else bot.money += 1400;
      }
    },
    setCarrier(bot) {
      for (const b of bots) {
        b.isCarrier = b === bot;
        b.pack.visible = b === bot;
      }
    },
    aimPoint(index) {
      const alive = bots.filter((b) => b.alive && b.team === 'warden');
      const bot = alive[index % Math.max(1, alive.length)] || bots[4];
      return new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.2, bot.body.position.z);
    },
  };

  function resetBot(bot, x, z, yaw) {
    bot.body.position.set(x, 0, z);
    bot.body.velocity.set(0, 0, 0);
    bot.body.yaw = yaw;
    bot.body.pitch = 0;
    bot.health = HEALTH;
    bot.alive = true;
    bot.fall = 0;
    bot.fadeAt = 0;
    bot.group.visible = true;
    bot.group.rotation.set(0, yaw, 0);
    bot.group.position.set(x, 0, z);
    bot.route = [];
    bot.routeIndex = 0;
    bot.directTarget = null;
    bot.target = null;
    bot.burstLeft = 0;
    bot.reactionAt = 0;
    bot.thinkAt = 0;
    bot.isCarrier = false;
    bot.pack.visible = false;
    bot.planting = false;
    bot.defusing = false;
    bot.postSpot = null;
    bot.calledContact = false;
    bot.stuckAt = 0;
    bot.blindUntil = 0;
    bot.investigateAt = null;
    bot.investigateUntil = 0;
    bot.smokedThisRound = false;
    bot.flashedThisRound = false;
  }
}
