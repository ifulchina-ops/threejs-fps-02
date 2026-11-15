// SOLSTICE — the bots. 5v5: four HELIOS teammates beside the player, five UMBRA
// defenders. Each round the attackers pick a team plan (rush, split, slow push,
// fake) and the bots walk it as a unit, calling it out on the radio; defenders
// hold their sites and rotate when the charge goes down. Bots fight in bursts
// after a reaction delay, miss more the further and faster their target moves,
// and use the same axis-separated collision as the player. One bot carries the
// Surge Charge: if the carrier falls, the charge drops and the nearest attacker
// picks it up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, stepBody } from './player.js';
import { WAYPOINTS } from './world.js';

const HEALTH = 100;
const BOT_SPEED = 3.8;
const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 6;
const THINK_TICK = 0.14;

// Team plans. Each assigns every HELIOS bot a route (waypoint keys) and a role;
// the carrier plants at the plan's target site. Defenders always hold sites.
const PLANS = [
  {
    name: 'RUSH A', target: 'A', callout: 'Rushing A — follow me!',
    routes: [
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'aPost2'],
    ],
  },
  {
    name: 'RUSH B', target: 'B', callout: 'Rushing B — go go go!',
    routes: [
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
  {
    name: 'SPLIT', target: 'A', callout: 'Splitting sites — two A, two B!',
    routes: [
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'aSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
  {
    name: 'SLOW A', target: 'A', callout: 'Slow push A — clear every corner.',
    routes: [
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aSite'],
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'aPost2'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'aEntry', 'aPost1'],
    ],
  },
  {
    name: 'SLOW B', target: 'B', callout: 'Slow push B — clear every corner.',
    routes: [
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost1'],
    ],
  },
  {
    name: 'FAKE A', target: 'B', callout: 'Fake A, then we hit B — stay quiet.',
    routes: [
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'midNorth', 'mid', 'eastMid2', 'bEntry', 'bSite'],
      ['heliosWest', 'westMid', 'westMid2', 'aEntry', 'midNorth', 'mid', 'eastMid2', 'bEntry', 'bSite'],
      ['heliosMid', 'midSouth', 'mid', 'midNorth', 'bEntry', 'bSite'],
      ['heliosEast', 'eastMid', 'eastMid2', 'bEntry', 'bPost2'],
    ],
  },
];

const DEFENDER_POSTS = [
  ['umbraWest', 'aPost1'], ['umbraWest', 'aBack'], ['umbraEast', 'bPost1'],
  ['umbraEast', 'bBack'], ['umbraSpawn', 'midNorth'],
];

function teamColor(team) {
  return team === 'helios' ? PALETTE.helios : PALETTE.umbra;
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
  const tracers = [];
  const tmp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
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
      color: new THREE.Color(team === 'helios' ? PALETTE.accent : PALETTE.umbra),
      roughness: 0.3, metalness: 0.4,
      emissive: new THREE.Color(team === 'helios' ? PALETTE.accent : PALETTE.umbra), emissiveIntensity: 0.5,
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
      team, name, group, torso, head, pack, body, skill,
      health: HEALTH, alive: true, fall: 0, fadeAt: 0,
      route: [], routeIndex: 0, thinkAt: 0, reactionAt: 0, burstLeft: 0, nextShotAt: 0,
      target: null, stuckAt: 0, lastPos: new THREE.Vector3(x, 0, z), strafeDir: 1,
      keys: new Set(), isCarrier: false, planting: false, defusing: false,
      holdUntil: 0, calledContact: false, postSpot: null,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnTeams() {
    buildBot('helios', 'Rook', -3, 15, 0.55);
    buildBot('helios', 'Sable', 3, 15, 0.5);
    buildBot('helios', 'Iris', 0, 17, 0.6);
    buildBot('helios', 'Vex', -1.5, 16, 0.65);
    buildBot('umbra', 'Ash', -4, -15, 0.6);
    buildBot('umbra', 'Cinder', 4, -15, 0.55);
    buildBot('umbra', 'Flint', -1.5, -17, 0.5);
    buildBot('umbra', 'Spark', 1.5, -17, 0.65);
    buildBot('umbra', 'Nyx', 0, -15.5, 0.58);
  }

  function eyeOf(bot) {
    return tmp.set(bot.body.position.x, bot.body.position.y + 1.55, bot.body.position.z);
  }

  function hasLineOfSight(from, to) {
    toTarget.copy(to).sub(from);
    const distance = toTarget.length();
    if (distance > 60) return false;
    raycaster.set(from, toTarget.normalize());
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance >= distance - 0.15;
  }

  function nearestEnemy(bot, playerState, playerAlive) {
    let best = null;
    let bestDist = Infinity;
    if (playerAlive && bot.team === 'umbra') {
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

  function fireTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function muzzleOf(bot) {
    const p = bot.body.position;
    const yaw = bot.body.yaw;
    return new THREE.Vector3(p.x - Math.sin(yaw) * 0.5, p.y + 1.2, p.z - Math.cos(yaw) * 0.5);
  }

  function botShoot(bot, target, time, random) {
    bot.lastShotAt = time; // the radar hears a shot for a moment after it fires.
    const from = muzzleOf(bot);
    const aimPoint = new THREE.Vector3(target.pos.x, target.pos.y + target.eye * 0.8, target.pos.z);
    const targetSpeed = target.kind === 'player' ? callbacks.playerSpeed() : 3;
    let chance = 0.42 - target.dist * 0.006 - targetSpeed * 0.02;
    chance = Math.max(0.06, Math.min(0.55, chance)) * (0.7 + bot.skill * 0.6);
    const hit = random() < chance;
    const end = aimPoint.clone();
    if (!hit) {
      end.x += (random() * 2 - 1) * 1.6;
      end.y += (random() * 2 - 1) * 0.8;
      end.z += (random() * 2 - 1) * 1.6;
    }
    fireTracer(from, end);
    if (target.dist < 40) callbacks.audioDistantShot();
    if (hit) {
      const damage = 11 + random() * 14;
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

  // Decide what this bot should be doing right now, given the charge state.
  // charge: { holder: 'player' | bot | null, droppedAt: Vector3 | null,
  //           planted: bool, site: 'A' | 'B' | null, plantSite: 'A' | 'B' }.
  function objective(bot, charge, time, random) {
    if (bot.team === 'umbra') {
      if (charge.planted) {
        // Nearest alive defender defuses; the rest take cover angles on the site.
        const site = charge.site;
        const sitePos = waypointPos(site === 'A' ? 'aSite' : 'bSite');
        const defenders = bots.filter((b) => b.team === 'umbra' && b.alive);
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

    // HELIOS.
    if (charge.planted) {
      // Post-plant: take a cover spot near the site and hold angles.
      if (!bot.postSpot) {
        const posts = charge.site === 'A' ? ['aPost1', 'aPost2', 'aBack', 'aEntry'] : ['bPost1', 'bPost2', 'bBack', 'bEntry'];
        bot.postSpot = posts[Math.floor(random() * posts.length)];
        setRoute(bot, [bot.postSpot]);
      }
      return;
    }
    if (charge.holder === null && charge.droppedAt) {
      // The charge is on the ground: nearest attacker goes and picks it up.
      const attackers = bots.filter((b) => b.team === 'helios' && b.alive);
      const nearest = attackers.reduce((best, b) => (
        !best || b.body.position.distanceTo(charge.droppedAt) < best.body.position.distanceTo(charge.droppedAt) ? b : best
      ), null);
      if (nearest === bot) {
        const d = bot.body.position.distanceTo(charge.droppedAt);
        if (d < 1.4) {
          if (callbacks.onChargePickup) callbacks.onChargePickup(bot);
        } else {
          // Walk straight at the dropped charge.
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
    if (time >= bot.thinkAt) {
      bot.thinkAt = time + THINK_TICK;
      const enemy = nearestEnemy(bot, playerState, playerAlive);
      bot.target = null;
      if (enemy && enemy.dist < 48) {
        const from = eyeOf(bot).clone();
        const to = new THREE.Vector3(enemy.pos.x, enemy.pos.y + enemy.eye * 0.8, enemy.pos.z);
        if (hasLineOfSight(from, to)) bot.target = enemy;
      }
      if (bot.target) {
        // Combat interrupts a plant or defuse channel.
        bot.planting = false;
        bot.defusing = false;
        if (!bot.calledContact && time > radioCooldownUntil) {
          radio(`${bot.name}: Contact ${areaName(bot.body.position.x, bot.body.position.z)}!`, bot.team);
          radioCooldownUntil = time + 5;
          bot.calledContact = true;
        }
        if (bot.reactionAt === 0) bot.reactionAt = time + (0.35 + random() * 0.45) / bot.skill;
        if (time >= bot.reactionAt && bot.burstLeft === 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.nextShotAt = time;
        }
      } else {
        bot.reactionAt = 0;
        bot.burstLeft = 0;
        objective(bot, charge, time, random);
        // Advance along the route; skip a waypoint we are standing on.
        const target = routeTarget(bot);
        if (target && bot.body.position.distanceTo(target) < 1.2) bot.routeIndex += 1;
        // Stuck? skip to the next waypoint.
        if (bot.body.position.distanceTo(bot.lastPos) < 0.05) {
          bot.stuckAt += THINK_TICK;
          if (bot.stuckAt > 1.2) { bot.routeIndex += 1; bot.stuckAt = 0; }
        } else bot.stuckAt = 0;
        bot.lastPos.copy(bot.body.position);
      }
    }

    bot.keys.clear();
    if (bot.planting || bot.defusing) {
      // Channeling: stand still, face the site.
      const siteKey = charge.planted || bot.defusing ? (charge.site === 'A' ? 'aSite' : 'bSite') : (plan.target === 'A' ? 'aSite' : 'bSite');
      const sitePos = waypointPos(siteKey);
      faceToward(bot, sitePos.x, sitePos.z, dt, 3);
    } else if (bot.target) {
      const dx = bot.target.pos.x - bot.body.position.x;
      const dz = bot.target.pos.z - bot.body.position.z;
      faceToward(bot, bot.target.pos.x, bot.target.pos.z, dt, 2.4);
      if (Math.random() < dt * 0.25) bot.strafeDir *= -1;
      if (bot.target.dist > 16) bot.keys.add('KeyW');
      else if (bot.target.dist < 6) bot.keys.add('KeyS');
      bot.keys.add(bot.strafeDir > 0 ? 'KeyD' : 'KeyA');
      if (bot.burstLeft > 0 && time >= bot.nextShotAt) {
        botShoot(bot, bot.target, time, random);
        bot.burstLeft -= 1;
        bot.nextShotAt = time + 0.11;
        if (bot.burstLeft === 0) bot.reactionAt = time + 0.5 + random() * 0.7;
      }
    } else if (bot.directTarget) {
      const diff = faceToward(bot, bot.directTarget.x, bot.directTarget.z, dt, 3.2);
      if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
      if (bot.body.position.distanceTo(bot.directTarget) < 1.2) bot.directTarget = null;
    } else {
      const target = routeTarget(bot);
      if (target) {
        const diff = faceToward(bot, target.x, target.z, dt, 3.2);
        if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
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
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      tracers[i].line.material.opacity = Math.max(0, tracers[i].life / 0.07);
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  spawnTeams();

  return {
    bots,
    hitMeshes,
    step,
    damageBot,
    fireTracer,
    muzzleOf,
    get plan() { return plan; },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    reset(nextRandom, announce = true) {
      plan = PLANS[Math.floor(nextRandom() * PLANS.length)];
      const helios = bots.filter((b) => b.team === 'helios');
      const umbra = bots.filter((b) => b.team === 'umbra');
      const spawns = {
        helios: [[-3, 15], [3, 15], [0, 17], [-1.5, 16]],
        umbra: [[-4, -15], [4, -15], [-1.5, -17], [1.5, -17], [0, -15.5]],
      };
      helios.forEach((bot, i) => {
        const [x, z] = spawns.helios[i % spawns.helios.length];
        resetBot(bot, x, z, 0);
        setRoute(bot, plan.routes[i % plan.routes.length]);
      });
      umbra.forEach((bot, i) => {
        const [x, z] = spawns.umbra[i % spawns.umbra.length];
        resetBot(bot, x, z, Math.PI);
        setRoute(bot, DEFENDER_POSTS[i % DEFENDER_POSTS.length]);
      });
      radioCooldownUntil = 0;
      if (announce) radio(`${helios[0].name}: ${plan.callout}`, 'helios');
      return plan;
    },
    setCarrier(bot) {
      for (const b of bots) {
        b.isCarrier = b === bot;
        b.pack.visible = b === bot;
      }
    },
    aimPoint(index) {
      const alive = bots.filter((b) => b.alive && b.team === 'umbra');
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
  }
}
