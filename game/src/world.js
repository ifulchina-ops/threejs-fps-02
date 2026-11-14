// EMBERLINE — the map: "Foundry Yard", an original dusk industrial yard, 44 x 36 m.
// Two spawn ends (Vanguard south, Ember north), a raised Relay platform at mid, two
// lanes split by container stacks, crates and pillars for cover. Every box is a collider
// for players and bots and a surface a bullet stops on. Plain geometry plus one
// procedural canvas texture for the ground — no models, no image files, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_HEIGHT = 5;

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#22262e';
  ctx.fillRect(0, 0, 512, 512);
  // Concrete slabs.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(512, i * 64); ctx.stroke();
  }
  // Wear: faint blotches.
  for (let i = 0; i < 260; i += 1) {
    const shade = Math.random() * 0.05;
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Painted mid line and hazard ring around the relay.
  ctx.strokeStyle = 'rgba(240,168,48,0.55)';
  ctx.lineWidth = 5;
  ctx.setLineDash([26, 18]);
  ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = 'rgba(87,215,232,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(256, 256, 52, 0, Math.PI * 2); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'relay' ? 0.5 : 0.9,
      metalness: name === 'rust' || name === 'teal' ? 0.35 : 0.05,
      emissive: name === 'relay' ? new THREE.Color(PALETTE.relay) : new THREE.Color('#000000'),
      emissiveIntensity: name === 'relay' ? 0.55 : 0,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTexture(),
    roughness: 0.95,
    metalness: 0.02,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls (44 x 36 m, open to the dusk sky).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44.4, 0.4, 36.4), groundMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.6, WALL_HEIGHT, 36.4, -22.2, WALL_HEIGHT / 2, 0, 'surface');
  box(0.6, WALL_HEIGHT, 36.4, 22.2, WALL_HEIGHT / 2, 0, 'surface');
  box(44.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, -18.2, 'surface');
  box(44.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, 18.2, 'surface');

  // The Relay: a raised platform at mid with a console, antenna and beacon light.
  box(7, 0.5, 7, 0, 0.25, 0, 'hairline');
  const consoleMesh = box(1.1, 1.5, 0.7, 0, 1.25, -1.2, 'relay');
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff3ff') }),
  );
  screen.position.set(0, 1.55, -0.83);
  screen.rotation.x = -0.25;
  group.add(screen);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 2.6, 8),
    materials.hairline,
  );
  antenna.position.set(0.9, 2.1, -1.2);
  group.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.relay) }),
  );
  beacon.position.set(0.9, 3.45, -1.2);
  group.add(beacon);
  const beaconLight = new THREE.PointLight(new THREE.Color(PALETTE.relay), 6, 12);
  beaconLight.position.set(0, 3.4, 0);
  scene.add(beaconLight);

  // Container stacks: A lane (west) and B lane (east), each a two-high stack plus singles.
  box(6, 2.6, 2.6, -13, 1.3, -7, 'rust');
  box(6, 2.6, 2.6, -13, 3.9, -7, 'teal');
  box(6, 2.6, 2.6, -13, 1.3, 7, 'teal');
  box(6, 2.6, 2.6, 13, 1.3, -7, 'teal');
  box(6, 2.6, 2.6, 13, 3.9, -7, 'rust');
  box(6, 2.6, 2.6, 13, 1.3, 7, 'rust');
  // Mid crates and pillars — the cover that makes mid fights work.
  box(1.6, 1.1, 1.6, -5.2, 0.55, -3.4, 'rust');
  box(1.6, 1.1, 1.6, 5.2, 0.55, -3.4, 'rust');
  box(1.6, 1.1, 1.6, -5.2, 0.55, 4.2, 'teal');
  box(1.6, 1.1, 1.6, 5.2, 0.55, 4.2, 'teal');
  box(1.2, 3.4, 1.2, -8.6, 1.7, 0, 'hairline');
  box(1.2, 3.4, 1.2, 8.6, 1.7, 0, 'hairline');
  box(3.4, 1.0, 1.2, 0, 0.5, -8.6, 'hairline');
  box(3.4, 1.0, 1.2, 0, 0.5, 8.6, 'hairline');
  // Spawn cover: low walls and barrels at each end.
  box(4.2, 1.0, 1.0, -8, 0.5, 14.6, 'surface');
  box(4.2, 1.0, 1.0, 8, 0.5, 14.6, 'surface');
  box(4.2, 1.0, 1.0, -8, 0.5, -14.6, 'surface');
  box(4.2, 1.0, 1.0, 8, 0.5, -14.6, 'surface');
  for (const [x, z] of [[-16.5, 12.5], [16.5, 12.5], [-16.5, -12.5], [16.5, -12.5]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14), materials.rust);
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // Light: a low amber sun from the west, cool dusk fill, hemisphere sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3c8'), new THREE.Color('#1c1f26'), 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 3.0);
  sun.position.set(-18, 12, 8);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7fb0'), 0.7);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    beacon,
    beaconLight,
    relayCenter: new THREE.Vector3(0, 0, 0),
    relayRadius: 3.6,
    vanguardSpawn: new THREE.Vector3(0, 0, 15.5),
    emberSpawn: new THREE.Vector3(0, 0, -15.5),
  };
}
