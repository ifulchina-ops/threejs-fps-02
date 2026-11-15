// KESTREL — the armoury. Five weapons, one table: price, damage, headshot
// multiplier, fire rate, magazine, spread and feel. Accuracy is the skill:
// spread grows with movement and shrinks when still, crouched or aiming down
// sights, and every shot climbs the view a little, so bursts beat spray.
// Damage falls off with range, so a rifle wins a lane and a shotgun wins a
// corner. The view model is boxes and a sight on the camera, with muzzle flash.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-12 Sparrow', price: 0, damage: 34, headMult: 3.0,
    fireGap: 0.16, auto: false, mag: 12, reserve: 48, reloadTime: 1.4,
    spreadStill: 0.0035, spreadMoving: 0.02, pellets: 1, range: 45, kick: 0.006,
    climb: 0.004,
  },
  smg: {
    id: 'smg', name: 'KV-9 Hornet', price: 1250, damage: 26, headMult: 3.0,
    fireGap: 0.082, auto: true, mag: 25, reserve: 100, reloadTime: 1.7,
    spreadStill: 0.005, spreadMoving: 0.03, pellets: 1, range: 38, kick: 0.007,
    climb: 0.005,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Gale', price: 1100, damage: 13, headMult: 2.0,
    fireGap: 0.85, auto: false, mag: 6, reserve: 24, reloadTime: 2.4,
    spreadStill: 0.03, spreadMoving: 0.05, pellets: 7, range: 18, kick: 0.02,
    climb: 0.016,
  },
  rifle: {
    id: 'rifle', name: 'AR-90 Valkyr', price: 2700, damage: 33, headMult: 3.0,
    fireGap: 0.108, auto: true, mag: 30, reserve: 90, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, pellets: 1, range: 70, kick: 0.009,
    climb: 0.007,
  },
  sniper: {
    id: 'sniper', name: 'SR-7 Halcyon', price: 4750, damage: 95, headMult: 4.0,
    fireGap: 1.35, auto: false, mag: 5, reserve: 15, reloadTime: 2.8,
    spreadStill: 0.0004, spreadMoving: 0.06, pellets: 1, range: 95, kick: 0.03,
    climb: 0.024,
  },
};

export const BUY_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];
export const ARMOR_PRICE = 650;

const VIEW_MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.26], barrel: [0.04, 0.04, 0.16], stock: null },
  smg: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.26], stock: [0.07, 0.07, 0.16] },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
  shotgun: { receiver: [0.09, 0.11, 0.5], barrel: [0.06, 0.06, 0.42], stock: [0.08, 0.09, 0.24] },
  sniper: { receiver: [0.09, 0.11, 0.55], barrel: [0.035, 0.035, 0.6], stock: [0.075, 0.09, 0.26] },
};

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#34383f'), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });

  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(model, flash, flashLight);

  let def = WEAPONS.rifle;
  const state = {
    mag: 0, reserve: 0, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    weaponId: 'rifle', heat: 0,
  };

  function rebuildModel() {
    while (model.children.length) model.remove(model.children[0]);
    const spec = VIEW_MODELS[def.id];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    model.add(receiver);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), grip);
    barrel.position.set(0, 0.025, -(spec.receiver[2] / 2 + spec.barrel[2] / 2 - 0.05));
    model.add(barrel);
    if (spec.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.stock), grip);
      stock.position.set(0, -0.02, spec.receiver[2] / 2 + spec.stock[2] / 2 - 0.05);
      model.add(stock);
    }
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
    sight.position.set(0, 0.075, -0.05);
    model.add(sight);
    model.scale.setScalar(0.62);
    model.position.set(0.26, -0.24, -0.55);
    flash.position.set(0.26, -0.22, -1.12);
    flashLight.position.set(0.26, -0.2, -0.8);
  }

  function equip(id, keepAmmo = false) {
    def = WEAPONS[id];
    state.weaponId = id;
    if (!keepAmmo) {
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.heat = 0;
    rebuildModel();
  }

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    // Heat is the spray penalty: it builds while firing and cools off when
    // the trigger is released, so a disciplined burst stays accurate.
    state.heat = Math.max(0, state.heat - dt * 2.2);
    const aimBlend = aiming ? 0.55 : 1;
    model.position.x = 0.26 * aimBlend;
    model.position.y = -0.24 + (aiming ? 0.05 : 0);
    model.position.z = -0.55 + state.kick - (aiming ? 0.08 : 0);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 20 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  equip('pistol');

  return {
    state,
    get def() { return def; },
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.04 + def.kick;
      state.heat = Math.min(1, state.heat + 0.16);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed, aiming, crouching) {
      let spread = def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMoving;
      spread *= 1 + state.heat * 1.4;
      if (aiming) spread *= 0.45;
      if (crouching) spread *= 0.8;
      return spread;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
    },
  };
}
