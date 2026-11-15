// KESTREL — grenades. Three types, one physics pass: a thrown grenade arcs
// under gravity, bounces off the world's colliders, and pops on its fuse.
//   HE "Shard"   — explodes for up to 70 damage in a 5 m radius, falling off
//                  with distance, and only through line of sight (cover saves).
//   Smoke "Veil" — blooms into a cloud for 12 s; bots cannot see through it
//                  (their line-of-sight check tests the cloud) and neither can
//                  the player, so it cuts a sightline for a site execute.
//   Flash "Strobe" — pops 1.2 s after the throw: anyone facing it with line of
//                  sight inside 12 m is blinded, scaled by angle and distance;
//                  the player gets a white flash overlay, bots stop shooting.
// The player buys them in the buy menu (Q cycles, G throws); bots throw smoke
// on site executes and flashes toward contact. One grenade at a time per
// thrower is tracked; a thrown grenade is a small dark sphere with a blinking
// pin light so it reads in flight.
import * as THREE from 'three';

export const GRENADES = {
  he: {
    id: 'he', name: 'Shard HE', price: 300, max: 1,
    fuse: 1.6, radius: 5, damage: 70, blurb: 'Frags a room. Cover saves.',
  },
  smoke: {
    id: 'smoke', name: 'Veil Smoke', price: 300, max: 1,
    fuse: 0.9, radius: 2.6, duration: 12, blurb: 'Cuts a sightline for 12s.',
  },
  flash: {
    id: 'flash', name: 'Strobe Flash', price: 200, max: 2,
    fuse: 1.2, radius: 12, blurb: 'Blinds anyone facing it.',
  },
};
export const GRENADE_ORDER = ['he', 'smoke', 'flash'];

const GRAVITY = 12;
const BOUNCE = 0.45;
const ROLL_FRICTION = 0.72;
const SMOKE_PUFFS = 26;

export function createGrenades(scene, colliders, shootables, callbacks) {
  const live = [];
  const clouds = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  const shellGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23262b'), roughness: 0.5, metalness: 0.4 });
  const pinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5252') });

  function hasLineOfSight(from, to) {
    tmpA.copy(to).sub(from);
    const distance = tmpA.length();
    if (distance < 0.01) return true;
    raycaster.set(from, tmpA.normalize());
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance >= distance - 0.1;
  }

  // A soft round puff, drawn once on a canvas and shared by every smoke
  // sprite, so a cloud reads as smoke instead of stacked squares.
  const puffTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  })();

  // A smoke cloud is a cluster of soft sprites around its anchor point.
  function makeCloud(position) {
    const group = new THREE.Group();
    const mat = new THREE.SpriteMaterial({
      map: puffTexture, color: new THREE.Color('#c8d2e0'), transparent: true, opacity: 0.5, depthWrite: false,
    });
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const sprite = new THREE.Sprite(mat);
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 2.1;
      sprite.position.set(Math.cos(angle) * radius, 0.3 + Math.random() * 1.9, Math.sin(angle) * radius);
      const scale = 1.1 + Math.random() * 1.5;
      sprite.scale.set(scale, scale, 1);
      group.add(sprite);
    }
    group.position.copy(position);
    scene.add(group);
    return group;
  }

  function popSmoke(grenade) {
    const cloud = {
      center: grenade.mesh.position.clone(),
      radius: GRENADES.smoke.radius,
      left: GRENADES.smoke.duration,
      group: makeCloud(grenade.mesh.position),
    };
    clouds.push(cloud);
    callbacks.onSmoke(cloud);
  }

  function popFlash(grenade) {
    callbacks.onFlash(grenade.mesh.position.clone(), GRENADES.flash.radius);
    // A brief white starburst at the pop point.
    const burst = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.95 }),
    );
    burst.position.copy(grenade.mesh.position);
    scene.add(burst);
    const light = new THREE.PointLight(new THREE.Color('#ffffff'), 60, 18);
    light.position.copy(grenade.mesh.position);
    scene.add(light);
    setTimeout(() => {
      scene.remove(burst, light);
      burst.geometry.dispose();
      burst.material.dispose();
    }, 120);
  }

  function popHE(grenade) {
    const at = grenade.mesh.position.clone();
    callbacks.onExplode(at, GRENADES.he.radius, GRENADES.he.damage, grenade.thrower);
    const burst = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb020'), transparent: true, opacity: 0.9 }),
    );
    burst.position.copy(at);
    scene.add(burst);
    const light = new THREE.PointLight(new THREE.Color('#ff9a2e'), 80, 20);
    light.position.copy(at);
    scene.add(light);
    setTimeout(() => {
      scene.remove(burst, light);
      burst.geometry.dispose();
      burst.material.dispose();
    }, 160);
  }

  function pop(grenade) {
    if (grenade.type === 'he') popHE(grenade);
    else if (grenade.type === 'smoke') popSmoke(grenade);
    else popFlash(grenade);
    scene.remove(grenade.mesh);
    grenade.dead = true;
  }

  // Bounce off a collider: reflect the velocity component along the smallest
  // penetration axis and dampen the rest, so a grenade skitters, not slides.
  function bounceOff(grenade, box) {
    const p = grenade.mesh.position;
    const v = grenade.velocity;
    const dxMin = Math.abs(p.x - box.min.x);
    const dxMax = Math.abs(p.x - box.max.x);
    const dyMin = Math.abs(p.y - box.min.y);
    const dyMax = Math.abs(p.y - box.max.y);
    const dzMin = Math.abs(p.z - box.min.z);
    const dzMax = Math.abs(p.z - box.max.z);
    const min = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
    if (min === dxMin || min === dxMax) {
      v.x = -v.x * BOUNCE;
      v.y *= ROLL_FRICTION;
      v.z *= ROLL_FRICTION;
    } else if (min === dyMin || min === dyMax) {
      v.y = -v.y * BOUNCE;
      v.x *= ROLL_FRICTION;
      v.z *= ROLL_FRICTION;
    } else {
      v.z = -v.z * BOUNCE;
      v.x *= ROLL_FRICTION;
      v.y *= ROLL_FRICTION;
    }
    if (v.lengthSq() < 0.09) v.set(0, 0, 0);
  }

  const probe = new THREE.Box3();

  function stepGrenade(grenade, dt) {
    grenade.fuse -= dt;
    if (grenade.fuse <= 0) {
      pop(grenade);
      return;
    }
    const v = grenade.velocity;
    v.y -= GRAVITY * dt;
    const p = grenade.mesh.position;
    p.addScaledVector(v, dt);
    // Ground plane.
    if (p.y < 0.09) {
      p.y = 0.09;
      if (Math.abs(v.y) > 0.8) v.y = -v.y * BOUNCE;
      else v.y = 0;
      v.x *= ROLL_FRICTION;
      v.z *= ROLL_FRICTION;
    }
    // Colliders: a small box around the grenade, tested against each collider.
    probe.min.set(p.x - 0.09, p.y - 0.09, p.z - 0.09);
    probe.max.set(p.x + 0.09, p.y + 0.09, p.z + 0.09);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) {
        bounceOff(grenade, collider);
        break;
      }
    }
    grenade.pin.material = grenade.fuse < 0.5 ? pinMat : grenade.pin.material;
    grenade.spin += dt * 9;
    grenade.mesh.rotation.x = grenade.spin;
  }

  return {
    throw(type, origin, direction, thrower) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb020') }),
      );
      pin.position.set(0, 0.1, 0);
      mesh.add(pin);
      mesh.position.copy(origin);
      mesh.castShadow = true;
      scene.add(mesh);
      const velocity = direction.clone().multiplyScalar(11);
      velocity.y += 3.4;
      live.push({
        type, mesh, pin, velocity, fuse: GRENADES[type].fuse, thrower, spin: 0, dead: false,
      });
      callbacks.onThrow(type, thrower);
    },
    step(dt) {
      for (let i = live.length - 1; i >= 0; i -= 1) {
        stepGrenade(live[i], dt);
        if (live[i].dead) live.splice(i, 1);
      }
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const cloud = clouds[i];
        cloud.left -= dt;
        cloud.group.children.forEach((sprite) => {
          sprite.material.opacity = 0.32 * Math.min(1, cloud.left / 2);
          sprite.position.y += dt * 0.12;
        });
        if (cloud.left <= 0) {
          scene.remove(cloud.group);
          clouds.splice(i, 1);
        }
      }
    },
    // Does the segment from->to pass through any live smoke cloud? Bots ask
    // this before shooting, so smoke genuinely cuts a sightline.
    blockedBySmoke(from, to) {
      for (const cloud of clouds) {
        tmpB.copy(to).sub(from);
        const length = tmpB.length();
        if (length < 0.01) continue;
        tmpB.normalize();
        tmpC.copy(cloud.center).sub(from);
        const along = Math.max(0, Math.min(length, tmpC.dot(tmpB)));
        tmpA.copy(from).addScaledVector(tmpB, along);
        if (tmpA.distanceTo(cloud.center) < cloud.radius) return true;
      }
      return false;
    },
    hasLineOfSight,
    reset() {
      for (const grenade of live) scene.remove(grenade.mesh);
      for (const cloud of clouds) scene.remove(cloud.group);
      live.length = 0;
      clouds.length = 0;
    },
    get liveCount() { return live.length; },
    get clouds() { return clouds; },
  };
}
