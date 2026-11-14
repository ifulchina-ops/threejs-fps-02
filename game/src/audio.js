// EMBERLINE — all sound is synthesized with WebAudio, so the game ships no audio
// files and makes no network request. A tiny noise buffer plus oscillators covers
// gunfire, hits, reloads, buys and round stingers.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      // Do not resume here: resuming needs a user gesture, and calling resume
      // without one only logs an autoplay warning. unlock() resumes on click.
      return context.state === 'running';
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // A fresh context starts suspended until a user gesture; scheduling on it
      // only logs an autoplay warning, so report not-ready until unlock() resumes.
      return context.state === 'running';
    } catch {
      return false;
    }
  }

  function noise(when, duration, filterFreq, gainValue, type = 'lowpass') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, frequency, duration, gainValue, type = 'sine', slideTo = null) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    shot(kind) {
      if (!ensure()) return;
      const now = context.currentTime;
      if (kind === 'sniper') {
        noise(now, 0.28, 900, 0.9);
        tone(now, 160, 0.18, 0.5, 'sawtooth', 50);
      } else if (kind === 'shotgun') {
        noise(now, 0.22, 700, 0.9);
        tone(now, 120, 0.16, 0.45, 'sawtooth', 45);
      } else if (kind === 'pistol') {
        noise(now, 0.1, 1400, 0.55);
        tone(now, 220, 0.08, 0.3, 'square', 90);
      } else {
        noise(now, 0.12, 1800, 0.6);
        tone(now, 190, 0.09, 0.28, 'sawtooth', 70);
      }
    },
    distantShot() {
      if (!ensure()) return;
      noise(context.currentTime, 0.14, 500, 0.22);
    },
    hit(kill) {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, kill ? 1320 : 980, 0.07, 0.35, 'sine');
      if (kill) tone(now + 0.08, 1760, 0.1, 0.3, 'sine');
    },
    hurt() {
      if (!ensure()) return;
      tone(context.currentTime, 140, 0.14, 0.4, 'sawtooth', 70);
    },
    reload() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 520, 0.05, 0.25, 'square');
      tone(now + 0.25, 380, 0.05, 0.25, 'square');
    },
    dryFire() {
      if (!ensure()) return;
      tone(context.currentTime, 700, 0.04, 0.2, 'square');
    },
    buy() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 880, 0.08, 0.3, 'sine');
      tone(now + 0.09, 1318, 0.12, 0.3, 'sine');
    },
    denied() {
      if (!ensure()) return;
      tone(context.currentTime, 220, 0.16, 0.3, 'square', 160);
    },
    captureTick() {
      if (!ensure()) return;
      tone(context.currentTime, 1180, 0.05, 0.22, 'sine');
    },
    roundStart() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 523, 0.12, 0.3, 'triangle');
      tone(now + 0.13, 784, 0.18, 0.3, 'triangle');
    },
    roundWin() {
      if (!ensure()) return;
      const now = context.currentTime;
      [523, 659, 784, 1046].forEach((freq, i) => tone(now + i * 0.11, freq, 0.16, 0.3, 'triangle'));
    },
    roundLose() {
      if (!ensure()) return;
      const now = context.currentTime;
      [392, 330, 262].forEach((freq, i) => tone(now + i * 0.14, freq, 0.2, 0.3, 'triangle'));
    },
  };
}
