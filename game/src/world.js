// SOLSTICE — the map: "Array Nine", an original desert solar station at golden
// hour, 48 x 40 m. HELIOS spawns south, UMBRA north. Two bombsites: A "Reactor"
// (the control building, west) and B "Array" (the panel field, east), joined by
// west, mid and east lanes. Every box is a collider and a surface a bullet stops
// on. The waypoint graph drives the bots' team plans. Plain geometry plus
// procedural canvas textures — no models, no image files, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_HEIGHT = 5;

// Named waypoints the bots' team plans walk. Routes are lists of these keys.
export const WAYPOINTS = {
  heliosSpawn: [0, 17],
  heliosWest: [-10, 14], heliosEast: [10, 14], heliosMid: [0, 12],
  westMid: [-19, 6], westMid2: [-19, -2],
  eastMid: [19, 6], eastMid2: [19, -2],
  midSouth: [0, 8], mid: [0, 0], midNorth: [0, -6],
  aEntry: [-14, -4], aSite: [-14, -11], aBack: [-20, -13], aPost1: [-10, -14], aPost2: [-18, -7],
  bEntry: [14, -4], bSite: [14, -11], bBack: [20, -13], bPost1: [10, -14], bPost2: [18, -7],
  umbraSpawn: [0, -17], umbraWest: [-8, -15], umbraEast: [8, -15],
};

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  // Sandy concrete.
  ctx.fillStyle = '#8a7a5e';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 900; i += 1) {
    const shade = Math.random() * 0.09;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${shade})` : `rgba(255,240,200,${shade})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 1024, 3 + Math.random() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  // Slab seams.
  ctx.strokeStyle = 'rgba(60,50,35,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(1024, i * 128); ctx.stroke();
  }
  // Site rings: A is west (left), B is east (right). Map x -24..24 -> 0..1024,
  // z -20..20 -> 0..1024 (texture v runs south-to-north here).
  const toPx = (x, z) => [(x + 24) / 48 * 1024, (z + 20) / 40 * 1024];
  for (const [site, color] of [['A', 'rgba(255,154,46,0.75)'], ['B', 'rgba(46,211,198,0.75)']]) {
    const [cx, cy] = toPx(site === 'A' ? -14 : 14, -11);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.setLineDash([22, 14]);
    ctx.beginPath(); ctx.arc(cx, cy, 85, 0, Math.PI * 2); ctx.stroke();
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
  ctx.fillStyle = 'rgba(20,18,14,0.85)';
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
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.02 });

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

  // Floor and perimeter walls (48 x 40 m, open to the golden sky).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(48.4, 0.4, 40.4), groundMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.6, WALL_HEIGHT, 40.4, -24.2, WALL_HEIGHT / 2, 0, 'concrete');
  box(0.6, WALL_HEIGHT, 40.4, 24.2, WALL_HEIGHT / 2, 0, 'concrete');
  box(48.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, -20.2, 'concrete');
  box(48.4, WALL_HEIGHT, 0.6, 0, WALL_HEIGHT / 2, 20.2, 'concrete');

  // ---- Site A "Reactor": control building + dome + cooling tower ----
  box(8, 3.6, 5, -17.5, 1.8, -14.5, 'concrete');
  const windowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd27a'), emissive: new THREE.Color('#ff9a2e'), emissiveIntensity: 0.9 });
  const windows = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.9, 0.1), windowMat);
  windows.position.set(-17.5, 2.5, -11.95);
  group.add(windows);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), materials.steel);
  dome.position.set(-10.5, 0, -14.5);
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);
  colliders.push(new THREE.Box3().setFromObject(dome));
  shootables.push(dome);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 7, 20), materials.concrete);
  tower.position.set(-21.5, 3.5, -17.5);
  tower.castShadow = true;
  group.add(tower);
  colliders.push(new THREE.Box3().setFromObject(tower));
  shootables.push(tower);

  // ---- Site B "Array": solar panel field ----
  function panel(x, z, rotationY) {
    const frame = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.2), materials.panel);
    slab.castShadow = true;
    slab.receiveShadow = true;
    frame.add(slab);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), materials.steel);
    leg.position.set(0, -0.55, 0);
    frame.add(leg);
    const leg2 = leg.clone();
    leg2.position.x = 1.4;
    frame.add(leg2);
    const leg3 = leg.clone();
    leg3.position.x = -1.4;
    frame.add(leg3);
    frame.position.set(x, 1.15, z);
    frame.rotation.x = -0.42;
    frame.rotation.y = rotationY;
    group.add(frame);
    const bounds = new THREE.Box3().setFromObject(frame);
    colliders.push(bounds);
    shootables.push(slab);
    return frame;
  }
  panel(11, -8, 0.2); panel(17, -8, -0.2); panel(11, -14.5, 0.2); panel(17, -14.5, -0.2);
  panel(-6, 9, 0.15); panel(6, 9, -0.15); panel(-6, 13.5, 0.15); panel(6, 13.5, -0.15);
  // Transformer boxes near B.
  box(1.8, 1.4, 1.2, 20.5, 0.7, -5, 'rust');
  box(1.8, 1.4, 1.2, 20.5, 0.7, -8, 'steel');

  // ---- Mid "Conduit": an overhead pipe run + cover crates ----
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 12), materials.steel);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, 4.4, 0);
  pipe.castShadow = true;
  group.add(pipe);
  box(0.8, 4.4, 0.8, -3.4, 2.2, -6, 'steel');
  box(0.8, 4.4, 0.8, 3.4, 2.2, 6, 'steel');
  box(1.6, 1.1, 1.6, -4.5, 0.55, -2, 'rust');
  box(1.6, 1.1, 1.6, 4.5, 0.55, 2, 'rust');
  box(1.6, 1.1, 1.6, -4.5, 0.55, 3.5, 'sand');
  box(1.6, 1.1, 1.6, 4.5, 0.55, -3.5, 'sand');

  // Lane cover: crates, barriers and pillars along west / east / mid.
  box(1.6, 1.1, 1.6, -19, 0.55, 10, 'rust');
  box(1.6, 1.1, 1.6, -16.5, 0.55, 2, 'sand');
  box(1.6, 1.1, 1.6, -21, 0.55, -6, 'sand');
  box(1.6, 1.1, 1.6, 19, 0.55, 10, 'rust');
  box(1.6, 1.1, 1.6, 16.5, 0.55, 2, 'sand');
  box(1.6, 1.1, 1.6, 21, 0.55, -6, 'sand');
  box(1.2, 3.2, 1.2, -9, 1.6, 0, 'concrete');
  box(1.2, 3.2, 1.2, 9, 1.6, 0, 'concrete');
  box(3.4, 1.0, 1.2, -14, 0.5, 6, 'concrete');
  box(3.4, 1.0, 1.2, 14, 0.5, 6, 'concrete');
  // Spawn cover.
  box(4.2, 1.0, 1.0, -8, 0.5, 17.5, 'concrete');
  box(4.2, 1.0, 1.0, 8, 0.5, 17.5, 'concrete');
  box(4.2, 1.0, 1.0, -8, 0.5, -17.5, 'concrete');
  box(4.2, 1.0, 1.0, 8, 0.5, -17.5, 'concrete');
  // Barrels.
  for (const [x, z] of [[-22, 14], [22, 14], [-22, -10], [22, -16], [-12, -17], [12, -17]]) {
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
  const boardA = siteBoard('A', -14, -11, '#ff9a2e');
  const boardB = siteBoard('B', 14, -11, '#2ed3c6');
  const lightA = new THREE.PointLight(new THREE.Color(PALETTE.helios), 8, 14);
  lightA.position.set(-14, 3.5, -11);
  scene.add(lightA);
  const lightB = new THREE.PointLight(new THREE.Color(PALETTE.umbra), 8, 14);
  lightB.position.set(14, 3.5, -11);
  scene.add(lightB);

  // The planted charge: a small blinking device, hidden until a plant happens.
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

  // Dust motes drifting in the golden light.
  const dustCount = 220;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 46;
    dustPositions[i * 3 + 1] = 0.3 + Math.random() * 4.5;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 38;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.06, transparent: true, opacity: 0.55 }));
  scene.add(dust);

  // Light: a low golden sun from the west, warm hemisphere, cool fill.
  const sky = new THREE.HemisphereLight(new THREE.Color('#ffd9a0'), new THREE.Color('#5c4a33'), 1.4);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 3.2);
  sun.position.set(-20, 13, 10);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fa0c8'), 0.6);
  fill.position.set(16, 12, -14);
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
    dust,
    sites: {
      A: { center: new THREE.Vector3(-14, 0, -11), radius: 4.2 },
      B: { center: new THREE.Vector3(14, 0, -11), radius: 4.2 },
    },
    heliosSpawn: new THREE.Vector3(0, 0, 17),
    umbraSpawn: new THREE.Vector3(0, 0, -17),
  };
}
