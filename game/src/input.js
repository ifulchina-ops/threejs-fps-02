// KESTREL — keyboard and mouse: pointer lock, look deltas, fire / aim state,
// the interact key (E) the plant/defuse objective uses, and the grenade keys
// (Q cycles the grenade type, G throws the selected one). One module, so the
// game loop never touches DOM events directly.
export function createInput(element, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    aiming: false,
    firing: false,
    interact: false,
    throwPressed: false,
    cyclePressed: false,
  };
  let lookX = 0;
  let lookY = 0;

  function locked() {
    return document.pointerLockElement === element;
  }

  document.addEventListener('mousemove', (event) => {
    if (!locked()) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  });
  document.addEventListener('mousedown', (event) => {
    if (!locked()) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  document.addEventListener('contextmenu', (event) => {
    if (locked()) event.preventDefault();
  });
  window.addEventListener('keydown', (event) => {
    // Ignore repeats: a held G must throw exactly one grenade.
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyE') state.interact = true;
    if (event.code === 'KeyG') state.throwPressed = true;
    if (event.code === 'KeyQ') state.cyclePressed = true;
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (event.code === 'KeyE') state.interact = false;
  });
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
    state.interact = false;
    state.throwPressed = false;
    state.cyclePressed = false;
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) {
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(locked());
  });

  return {
    state,
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takeThrow() {
      const pressed = state.throwPressed;
      state.throwPressed = false;
      return pressed;
    },
    takeCycle() {
      const pressed = state.cyclePressed;
      state.cyclePressed = false;
      return pressed;
    },
    requestLock() {
      if (!locked()) element.requestPointerLock();
    },
    isLocked: locked,
  };
}
