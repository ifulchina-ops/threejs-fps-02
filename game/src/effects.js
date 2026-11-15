// KESTREL — combat feedback: tracer lines and impact sparks. One module owns
// every short-lived visual, so the gun code and the bots never manage meshes
// themselves. Tracers are pooled lines with a fixed lifetime; impact sparks
// are one shared Points cloud with a ring of slots, so a firefight allocates
// nothing per frame.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 240;

export function createEffects(scene) {
  const tracers = [];
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffd27a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;

  // Pre-allocate the tracer lines once; firing reuses them round-robin.
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  return {
    tracer(from, to) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.line.material.opacity = 0.9;
      slot.life = 0.07;
    },
    impact(point, normal) {
      // Eight sparks flying off the hit surface, biased along its normal.
      for (let i = 0; i < 8; i += 1) {
        const index = sparkCursor;
        sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
        sparkPos[index * 3] = point.x;
        sparkPos[index * 3 + 1] = point.y;
        sparkPos[index * 3 + 2] = point.z;
        sparkVel[index * 3] = normal.x * 2 + (Math.random() - 0.5) * 3;
        sparkVel[index * 3 + 1] = normal.y * 2 + Math.random() * 2.5;
        sparkVel[index * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * 3;
        sparkLife[index] = 0.25 + Math.random() * 0.2;
      }
      sparkGeo.getAttribute('position').needsUpdate = true;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / 0.07) * 0.9;
        if (slot.life <= 0) slot.line.visible = false;
      }
      let anyAlive = false;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anyAlive = true;
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -50;
      }
      if (anyAlive) sparkGeo.getAttribute('position').needsUpdate = true;
    },
  };
}
