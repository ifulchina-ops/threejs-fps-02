// EMBERLINE — the bots. Four Ember attackers and three Vanguard teammates, built from
// boxes and spheres in their team colours, with a simple but honest brain: patrol
// waypoints toward the Relay or the enemy spawn, stop and strafe when they see an
// enemy, fire in bursts after a reaction delay, and miss more the further and faster
// their target moves. They use the same axis-separated collision as the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, stepBody } from './player.js';

const WAYPOINTS = [
  [0, 0], [-5.2, -3.4], [5.2, -3.4], [-5.2, 4.2], [5.2, 4.2],
  [-13, -3], [13, -3], [-13, 3], [13, 3], [0, -8.6], [0, 8.6],
  [-8.6, 0], [8.6, 0], [-18, -10], [18, -10], [-18, 10], [18, 10],
];
const HEALTH = 100;
const BOT_SPEED = 3.6;

function teamColor(team) {
  return team === 'ember' ? PALETTE.ember : PALETTE.vanguard;
}

export function createBots(scene, colliders, shootables, callbacks) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const tracers = [];
  const tmp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function buildBot(team, name, x, z, skill) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor(team)), roughness: 0.6, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
    const visorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.relay), roughness: 0.3, metalness: 0.4, emissive: new THREE.Color(PALETTE.relay), emissiveIntensity: 0.35 });

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
    group.add(legL, legR, torso, head, visor, gun);
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
      team, name, group, torso, head, body, skill,
      health: HEALTH, alive: true, fall: 0, fadeAt: 0,
      waypoint: null, thinkAt: 0, reactionAt: 0, burstLeft: 0, nextShotAt: 0,
      target: null, stuckAt: 0, lastPos: new THREE.Vector3(x, 0, z), strafeDir: 1,
      keys: new Set(),
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnTeams() {
    buildBot('vanguard', 'Rook', -3, 13, 0.55);
    buildBot('vanguard', 'Sable', 3, 13, 0.5);
    buildBot('vanguard', 'Iris', 0, 15.5, 0.6);
    buildBot('ember', 'Ash', -4, -13, 0.6);
    buildBot('ember', 'Cinder', 4, -13, 0.55);
    buildBot('ember', 'Flint', -1.5, -15, 0.5);
    buildBot('ember', 'Spark', 1.5, -15, 0.65);
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

  function pickWaypoint(bot, random) {
    const choices = WAYPOINTS.filter(([x, z]) => {
      const dx = x - bot.body.position.x;
      const dz = z - bot.body.position.z;
      return dx * dx + dz * dz > 9;
    });
    const point = choices[Math.floor(random() * choices.length)] || [0, 0];
    bot.waypoint = new THREE.Vector2(point[0], point[1]);
  }

  function nearestEnemy(bot, playerState, playerAlive) {
    let best = null;
    let bestDist = Infinity;
    if (playerAlive && bot.team === 'ember') {
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
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function muzzleOf(bot) {
    const p = bot.body.position;
    const yaw = bot.body.yaw;
    return new THREE.Vector3(p.x - Math.sin(yaw) * 0.5, p.y + 1.2, p.z - Math.cos(yaw) * 0.5);
  }

  function botShoot(bot, target, time, random) {
    const from = muzzleOf(bot);
    const aimPoint = new THREE.Vector3(target.pos.x, target.pos.y + target.eye * 0.8, target.pos.z);
    // Hit chance falls with distance and with the target's speed; bots are beatable.
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
    callbacks.onKill(bot, attacker);
    return true;
  }

  function stepBot(bot, dt, time, random, playerState, playerAlive) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.5;
      bot.fadeAt += dt;
      if (bot.fadeAt > 3.5) bot.group.visible = false;
      return;
    }
    // Think on a slow tick; movement and shooting run every frame.
    if (time >= bot.thinkAt) {
      bot.thinkAt = time + 0.14;
      const enemy = nearestEnemy(bot, playerState, playerAlive);
      bot.target = null;
      if (enemy && enemy.dist < 48) {
        const from = eyeOf(bot).clone();
        const to = new THREE.Vector3(enemy.pos.x, enemy.pos.y + enemy.eye * 0.8, enemy.pos.z);
        if (hasLineOfSight(from, to)) bot.target = enemy;
      }
      if (bot.target) {
        if (bot.reactionAt === 0) bot.reactionAt = time + (0.35 + random() * 0.45) / bot.skill;
        if (time >= bot.reactionAt && bot.burstLeft === 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.nextShotAt = time;
        }
      } else {
        bot.reactionAt = 0;
        bot.burstLeft = 0;
        if (!bot.waypoint || bot.body.position.distanceTo(new THREE.Vector3(bot.waypoint.x, 0, bot.waypoint.y)) < 1.2) {
          pickWaypoint(bot, random);
        }
        // Stuck? pick a fresh waypoint.
        if (bot.body.position.distanceTo(bot.lastPos) < 0.05) {
          bot.stuckAt += 0.14;
          if (bot.stuckAt > 1.2) { pickWaypoint(bot, random); bot.stuckAt = 0; }
        } else bot.stuckAt = 0;
        bot.lastPos.copy(bot.body.position);
      }
    }

    bot.keys.clear();
    if (bot.target) {
      // Face the target, strafe sideways, keep some distance.
      const dx = bot.target.pos.x - bot.body.position.x;
      const dz = bot.target.pos.z - bot.body.position.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = wantYaw - bot.body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.body.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
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
    } else if (bot.waypoint) {
      const dx = bot.waypoint.x - bot.body.position.x;
      const dz = bot.waypoint.y - bot.body.position.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = wantYaw - bot.body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
      if (Math.abs(diff) < 1.1) bot.keys.add('KeyW');
    }
    stepBody(bot.body, dt, bot.keys, false);
    // Clamp bot speed to a jog, not a sprint.
    const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    if (speed > BOT_SPEED) {
      bot.body.velocity.x *= BOT_SPEED / speed;
      bot.body.velocity.z *= BOT_SPEED / speed;
    }
    bot.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.group.rotation.y = bot.body.yaw;
    // Walk bob.
    const bobPhase = time * 9 + bot.body.position.x;
    bot.group.position.y = bot.body.position.y + (speed > 0.5 ? Math.abs(Math.sin(bobPhase)) * 0.03 : 0);
  }

  function step(dt, time, random, playerState, playerAlive) {
    for (const bot of bots) stepBot(bot, dt, time, random, playerState, playerAlive);
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
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    reset(random) {
      const spawns = {
        vanguard: [[-3, 13], [3, 13], [0, 15.5]],
        ember: [[-4, -13], [4, -13], [-1.5, -15], [1.5, -15]],
      };
      let vi = 0;
      let ei = 0;
      for (const bot of bots) {
        const list = spawns[bot.team];
        const [x, z] = list[(bot.team === 'vanguard' ? vi : ei) % list.length];
        if (bot.team === 'vanguard') vi += 1; else ei += 1;
        bot.body.position.set(x, 0, z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
        bot.body.pitch = 0;
        bot.health = HEALTH;
        bot.alive = true;
        bot.fall = 0;
        bot.fadeAt = 0;
        bot.group.visible = true;
        bot.group.rotation.set(0, bot.body.yaw, 0);
        bot.group.position.set(x, 0, z);
        bot.waypoint = null;
        bot.target = null;
        bot.burstLeft = 0;
        bot.reactionAt = 0;
        bot.thinkAt = 0;
        pickWaypoint(bot, random);
      }
    },
    aimPoint(index) {
      const alive = bots.filter((b) => b.alive && b.team === 'ember');
      const bot = alive[index % Math.max(1, alive.length)] || bots[3];
      return new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.2, bot.body.position.z);
    },
  };
}
