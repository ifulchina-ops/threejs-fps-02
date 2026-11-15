// SOLSTICE — keyboard and mouse: pointer lock, look deltas, fire / aim state,
// and the interact key (E) the plant/defuse objective uses. One module, so the
// game loop never touches DOM events directly.
export function createInput(element, onLockChange) {
  const keys = new Set();
  const state = { keys, aiming: false, firing: false, interact: false };
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
    keys.add(event.code);
    if (event.code === 'KeyE') state.interact = true;
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
    requestLock() {
      if (!locked()) element.requestPointerLock();
    },
    isLocked: locked,
  };
}
