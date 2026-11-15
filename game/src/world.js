// KESTREL — the map: "High Observatory", an original alpine station at blue
// hour, 52 x 44 m. AURORA spawns south, WARDEN north. Two sites: A "Dome" (the
// telescope dome, west) and B "Array" (the dish field, east), joined by west,
// mid and east lanes, with a flank gap on each side of mid and an elevated
// Overlook above mid — four shallow steps up, sightlines over both sites.
// Every box is a collider and a surface a bullet stops on. The waypoint graph
// drives the bots' team plans. Plain geometry plus procedural canvas textures
// — no models, no image files, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_HEIGHT = 5;

// Named waypoints the bots' team plans walk. Routes are lists of these keys.
export const WAYPOINTS = {
  auroraSpawn: [0, 19],
  auroraWest: [-11, 15], auroraEast: [11, 15], auroraMid: [0, 13],
  westMid: [-21, 7], westMid2: [-21, -2], westGap: [-13, 4],
  eastMid: [21, 7], eastMid2: [21, -2], eastGap: [13, 4],
  midSouth: [0, 9], mid: [0, 2], midNorth: [0, -6],
  overlookBase: [0, 3], overlook: [0, -2],
  aEntry: [-15, -5], aSite: [-15, -12], aBack: [-21, -15], aPost1: [-10, -15], aPost2: [-19, -7],
  bEntry: [15, -5], bSite: [15, -12], bBack: [21, -15], bPost1: [10, -15], bPost2: [19, -7],
  wardenSpawn: [0, -19], wardenWest: [-9, -16], wardenEast: [9, -16],
};

function snowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  // Moonlit snow: pale blue-white with soft drifts.
  ctx.fillStyle = '#c9d4e6';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 1100; i += 1) {
    const shade = Math.random() * 0.08;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(70,90,130,${shade})` : `rgba(255,255,255,${shade})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 1024, 3 + Math.random() * 34, 0, Math.PI * 2);
    ctx.fill();
  }
  // Trampled lanes: darker packed snow along the three lanes.
  ctx.fillStyle = 'rgba(90,105,140,0.16)';
  for (const x of [120, 512, 904]) ctx.fillRect(x - 46, 0, 92, 1024);
  // Site rings: A is west (left), B is east (right). Map x -26..26 -> 0..1024,
  // z -22..22 -> 0..1024 (texture v runs south-to-north here).
  const toPx = (x, z) => [(x + 26) / 52 * 1024, (z + 22) / 44 * 1024];
  for (const [site, color] of [['A', 'rgba(255,154,46,0.8)'], ['B', 'rgba(79,216,232,0.8)']]) {
    const [cx, cy] = toPx(site === 'A' ? -15 : 15, -12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.setLineDash([22, 14]);
    ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(site, cx, cy);
  }
  // Centre line, dashed amber.
  ctx.strokeStyle = 'rgba(255,176,32,0.4)';
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 20]);
  ctx.beginPath(); ctx.moveTo(512, 0); ctx.lineTo(512, 1024); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(16,20,32,0.9)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
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
      roughness: name === 'panel' ? 0.35 : name === 'accent' ? 0.5 : 0.9,
      metalness: name === 'panel' ? 0.6 : name === 'steel' ? 0.5 : 0.05,
      emissive: name === 'charge' ? new THREE.Color(PALETTE.charge) : new THREE.Color('#000000'),
      emissiveIntensity: name === 'charge' ? 0.4 : 0,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({ map: snowTexture(), roughness: 0.95, metalness: 0.02 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffd27a'), emissive: new THREE.Color('#ff9a2e'), emissiveIntensity: 1.1,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collider = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collider) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls (52 x 44 m, open to the night sky).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(52.4, 0.4, 44.4), groundMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.6, WALL_HEIGHT, 44.4, -26.2, WALL_HEIGHT / 2, 0, 'concrete');
  box(0.6, WALL_HEIGHT, 44.4, 26.2, WALL_HEIGHT / 2, 0, 'concrete');
  box(52.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, -22.2, 'concrete');
  box(52.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, 22.2, 'concrete');

  // ---- Site A "Dome": telescope dome + control building ----
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), materials.dome);
  dome.position.set(-19.5, 0, -15.5);
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);
  colliders.push(new THREE.Box3().setFromObject(dome));
  shootables.push(dome);
  // The dome slit: a dark slot the telescope peers through.
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.3), materials.surface);
  slit.position.set(-19.5, 1.9, -12.6);
  slit.rotation.x = -0.5;
  group.add(slit);
  box(7, 3.4, 5, -12.5, 1.7, -16.5, 'concrete');
  const windowsA = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.1), windowMat);
  windowsA.position.set(-12.5, 2.4, -13.95);
  group.add(windowsA);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 6, 8), materials.steel);
  mast.position.set(-23.5, 3, -19.5);
  mast.castShadow = true;
  group.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5252') }),
  );
  beacon.position.set(-23.5, 6.1, -19.5);
  group.add(beacon);

  // ---- Site B "Array": dish antenna field ----
  function dish(x, z, rotationY) {
    const frame = new THREE.Group();
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, 0, 0.62),
      materials.panel,
    );
    bowl.rotation.x = Math.PI - 0.9;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    frame.add(bowl);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.6, 8), materials.steel);
    pole.position.y = -0.8;
    frame.add(pole);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), materials.steel);
    hub.position.set(0, 0.9, 0.7);
    frame.add(hub);
    frame.position.set(x, 1.7, z);
    frame.rotation.y = rotationY;
    group.add(frame);
    const bounds = new THREE.Box3().setFromObject(frame);
    colliders.push(bounds);
    shootables.push(bowl);
    return frame;
  }
  dish(11.5, -8.5, 0.4); dish(18.5, -8.5, -0.3); dish(11.5, -15.5, 0.3); dish(18.5, -15.5, -0.4);
  box(1.8, 1.4, 1.2, 22.5, 0.7, -5, 'rust');
  box(1.8, 1.4, 1.2, 22.5, 0.7, -8, 'steel');
  box(7, 3.4, 5, 12.5, 1.7, -18.5, 'concrete');
  const windowsB = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.1), windowMat);
  windowsB.position.set(12.5, 2.4, -15.95);
  group.add(windowsB);

  // ---- Mid "Overlook": a raised platform with sightlines over both sites.
  // Four shallow steps (0.28 m each) climb its south face; the platform top
  // sits at 1.12 m with a low parapet for cover.
  const steps = [
    { h: 0.28, z: 3.4 }, { h: 0.56, z: 2.7 }, { h: 0.84, z: 2.0 }, { h: 1.12, z: 1.3 },
  ];
  for (const step of steps) box(2.2, step.h, 0.75, 0, step.h / 2, step.z, 'concrete');
  box(6, 0.24, 4.4, 0, 1.0, -1.4, 'concrete');
  box(6, 0.9, 0.3, 0, 1.57, -3.45, 'concrete');
  box(0.3, 0.9, 4.4, -2.85, 1.57, -1.4, 'concrete');
  box(0.3, 0.9, 4.4, 2.85, 1.57, -1.4, 'concrete');
  // Overhead cable run down mid, on two pylons.
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 44, 8), materials.steel);
  cable.rotation.x = Math.PI / 2;
  cable.position.set(0, 4.6, 0);
  group.add(cable);
  box(0.5, 4.6, 0.5, -4.2, 2.3, -8, 'steel');
  box(0.5, 4.6, 0.5, 4.2, 2.3, 8, 'steel');

  // Lane cover: crates, barriers and pillars along west / east / mid.
  box(1.6, 1.1, 1.6, -21, 0.55, 11, 'rust');
  box(1.6, 1.1, 1.6, -18.5, 0.55, 2, 'snow');
  box(1.6, 1.1, 1.6, -23, 0.55, -6, 'snow');
  box(1.6, 1.1, 1.6, 21, 0.55, 11, 'rust');
  box(1.6, 1.1, 1.6, 18.5, 0.55, 2, 'snow');
  box(1.6, 1.1, 1.6, 23, 0.55, -6, 'snow');
  box(1.2, 3.2, 1.2, -9, 1.6, 0, 'concrete');
  box(1.2, 3.2, 1.2, 9, 1.6, 0, 'concrete');
  box(3.4, 1.0, 1.2, -15, 0.5, 7, 'concrete');
  box(3.4, 1.0, 1.2, 15, 0.5, 7, 'concrete');
  box(1.6, 1.1, 1.6, -5, 0.55, -3, 'rust');
  box(1.6, 1.1, 1.6, 5, 0.55, -3, 'rust');
  // Flank-gap cover: low snow walls at the mid gaps.
  box(2.6, 1.0, 0.6, -11, 0.5, 4.5, 'snow');
  box(2.6, 1.0, 0.6, 11, 0.5, 4.5, 'snow');
  // Spawn cover.
  box(4.2, 1.0, 1.0, -8, 0.5, 19.5, 'concrete');
  box(4.2, 1.0, 1.0, 8, 0.5, 19.5, 'concrete');
  box(4.2, 1.0, 1.0, -8, 0.5, -19.5, 'concrete');
  box(4.2, 1.0, 1.0, 8, 0.5, -19.5, 'concrete');
  // Barrels.
  for (const [x, z] of [[-24, 15], [24, 15], [-24, -10], [24, -17], [-12, -19], [12, -19]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14), materials.rust);
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // ---- Site markers: glowing A / B boards + beacon lights ----
  function siteBoard(letter, x, z, color) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true }),
    );
    board.position.set(x, 3.2, z);
    group.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), materials.steel);
    post.position.set(x, 1.6, z);
    group.add(post);
    return board;
  }
  const boardA = siteBoard('A', -15, -12, '#ff9a2e');
  const boardB = siteBoard('B', 15, -12, '#4fd8e8');
  const lightA = new THREE.PointLight(new THREE.Color(PALETTE.aurora), 10, 16);
  lightA.position.set(-15, 3.5, -12);
  scene.add(lightA);
  const lightB = new THREE.PointLight(new THREE.Color(PALETTE.warden), 10, 16);
  lightB.position.set(15, 3.5, -12);
  scene.add(lightB);

  // The planted core: a small blinking device, hidden until a plant happens.
  const chargeGroup = new THREE.Group();
  const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.36), materials.charge);
  chargeBody.castShadow = true;
  const chargeLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2020') }),
  );
  chargeLight.position.set(0, 0.2, 0);
  chargeGroup.add(chargeBody, chargeLight);
  chargeGroup.visible = false;
  scene.add(chargeGroup);

  // Stars overhead, and snowfall drifting down (main.js animates the fall).
  const starCount = 320;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    starPositions[i * 3] = (Math.random() - 0.5) * 160;
    starPositions[i * 3 + 1] = 24 + Math.random() * 50;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 160;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false }));
  scene.add(stars);

  const flakeCount = 260;
  const flakePositions = new Float32Array(flakeCount * 3);
  for (let i = 0; i < flakeCount; i += 1) {
    flakePositions[i * 3] = (Math.random() - 0.5) * 50;
    flakePositions[i * 3 + 1] = Math.random() * 9;
    flakePositions[i * 3 + 2] = (Math.random() - 0.5) * 42;
  }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePositions, 3));
  const snowfall = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.7 }));
  scene.add(snowfall);

  // Light: cold moonlight from the north-east, cool hemisphere, warm site glow.
  const sky = new THREE.HemisphereLight(new THREE.Color('#7d9cc8'), new THREE.Color('#2a3348'), 1.1);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#9db8e8'), 2.4);
  moon.position.set(18, 20, -14);
  moon.target.position.set(-4, 0, 2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -32;
  moon.shadow.camera.right = 32;
  moon.shadow.camera.top = 28;
  moon.shadow.camera.bottom = -28;
  moon.shadow.camera.far = 90;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#ff9a2e'), 0.35);
  fill.position.set(-14, 10, 16);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    boardA,
    boardB,
    lightA,
    lightB,
    chargeGroup,
    chargeLight,
    snowfall,
    sites: {
      A: { center: new THREE.Vector3(-15, 0, -12), radius: 4.2 },
      B: { center: new THREE.Vector3(15, 0, -12), radius: 4.2 },
    },
    auroraSpawn: new THREE.Vector3(0, 0, 19),
    wardenSpawn: new THREE.Vector3(0, 0, -19),
  };
}
