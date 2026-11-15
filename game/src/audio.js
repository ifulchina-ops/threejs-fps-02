// KESTREL — all sound is synthesized with WebAudio: no audio files, no
// network. Gunfire per weapon class, grenade pins and pops, plant/defuse
// beeps, round stingers, radio blips and the accelerating fuse beep of a
// planted core. Everything is a short envelope over noise or an oscillator,
// so it stays cheap and reliable.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ frequency = 1200, duration = 0.12, type = 'square', gain = 0.25, slideTo = null, noise = false }) {
    if (!ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const osc = noise ? ctx.createBufferSource() : ctx.createOscillator();
    if (noise) {
      osc.buffer = noiseBuffer(duration);
    } else {
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    }
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gainNode);
    gainNode.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function tonePair(first, second, gap = 0.09) {
    burst(first);
    setTimeout(() => burst(second), gap * 1000);
  }

  const SHOTS = {
    pistol: { frequency: 900, duration: 0.09, type: 'square', gain: 0.22, slideTo: 220 },
    smg: { frequency: 1100, duration: 0.07, type: 'square', gain: 0.18, slideTo: 300 },
    rifle: { frequency: 700, duration: 0.11, type: 'sawtooth', gain: 0.26, slideTo: 140 },
    shotgun: { frequency: 320, duration: 0.22, type: 'sawtooth', gain: 0.34, slideTo: 70, noise: true },
    sniper: { frequency: 500, duration: 0.3, type: 'sawtooth', gain: 0.34, slideTo: 60 },
  };

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    shot(id) {
      burst(SHOTS[id] || SHOTS.rifle);
    },
    distantShot() {
      burst({ frequency: 300, duration: 0.1, type: 'triangle', gain: 0.05, slideTo: 120 });
    },
    dryFire() {
      burst({ frequency: 1400, duration: 0.04, type: 'square', gain: 0.08 });
    },
    reload() {
      tonePair(
        { frequency: 500, duration: 0.06, type: 'square', gain: 0.1 },
        { frequency: 750, duration: 0.06, type: 'square', gain: 0.1 },
        0.14,
      );
    },
    hit(kill) {
      if (kill) {
        tonePair(
          { frequency: 1200, duration: 0.05, type: 'sine', gain: 0.16 },
          { frequency: 1800, duration: 0.08, type: 'sine', gain: 0.16 },
          0.05,
        );
      } else {
        burst({ frequency: 1500, duration: 0.05, type: 'sine', gain: 0.12 });
      }
    },
    hurt() {
      burst({ frequency: 180, duration: 0.16, type: 'sawtooth', gain: 0.2, slideTo: 90 });
    },
    buy() {
      tonePair(
        { frequency: 880, duration: 0.07, type: 'sine', gain: 0.14 },
        { frequency: 1320, duration: 0.09, type: 'sine', gain: 0.14 },
        0.07,
      );
    },
    denied() {
      burst({ frequency: 220, duration: 0.12, type: 'square', gain: 0.12, slideTo: 160 });
    },
    roundStart() {
      tonePair(
        { frequency: 660, duration: 0.1, type: 'triangle', gain: 0.16 },
        { frequency: 990, duration: 0.14, type: 'triangle', gain: 0.16 },
        0.1,
      );
    },
    roundWin() {
      [523, 659, 784, 1046].forEach((frequency, index) => {
        setTimeout(() => burst({ frequency, duration: 0.16, type: 'triangle', gain: 0.16 }), index * 110);
      });
    },
    roundLose() {
      [392, 330, 262].forEach((frequency, index) => {
        setTimeout(() => burst({ frequency, duration: 0.18, type: 'triangle', gain: 0.14 }), index * 130);
      });
    },
    radio() {
      burst({ frequency: 2000, duration: 0.05, type: 'sine', gain: 0.07 });
      setTimeout(() => burst({ frequency: 2400, duration: 0.04, type: 'sine', gain: 0.05 }), 60);
    },
    plantTick() {
      burst({ frequency: 1000, duration: 0.06, type: 'sine', gain: 0.14 });
    },
    planted() {
      tonePair(
        { frequency: 1200, duration: 0.1, type: 'square', gain: 0.16 },
        { frequency: 900, duration: 0.14, type: 'square', gain: 0.16 },
        0.12,
      );
    },
    fuseBeep(urgent) {
      burst({ frequency: urgent ? 1600 : 1200, duration: 0.05, type: 'square', gain: 0.1 });
    },
    defuseTick() {
      burst({ frequency: 1400, duration: 0.05, type: 'sine', gain: 0.12 });
    },
    explosion() {
      burst({ frequency: 90, duration: 0.9, type: 'sawtooth', gain: 0.4, slideTo: 30, noise: true });
      burst({ frequency: 60, duration: 1.2, type: 'sine', gain: 0.3, slideTo: 25 });
    },
    grenadePin() {
      burst({ frequency: 2200, duration: 0.05, type: 'square', gain: 0.1 });
    },
    grenadeThrow() {
      burst({ frequency: 400, duration: 0.12, type: 'sine', gain: 0.1, slideTo: 200 });
    },
    grenadePop() {
      burst({ frequency: 500, duration: 0.35, type: 'sawtooth', gain: 0.3, slideTo: 80, noise: true });
    },
    flashRing() {
      burst({ frequency: 3200, duration: 0.8, type: 'sine', gain: 0.08, slideTo: 2400 });
    },
    smokeHiss() {
      burst({ frequency: 800, duration: 0.9, type: 'triangle', gain: 0.08, slideTo: 300, noise: true });
    },
  };
}
