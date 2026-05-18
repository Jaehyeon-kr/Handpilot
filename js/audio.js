import { st, CRUISE_SPEED } from './physics.js';

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let sndReady = false;

let windNoise, windGain;
let masterGain;

export function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioCtx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(audioCtx.destination);

  // 바람 소리: 화이트노이즈 필터링
  const bufSize = audioCtx.sampleRate * 2;
  const noiseBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  windNoise = audioCtx.createBufferSource();
  windNoise.buffer = noiseBuf;
  windNoise.loop = true;

  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 800;
  windFilter.Q.value = 0.5;

  windGain = audioCtx.createGain();
  windGain.gain.value = 0;

  windNoise.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windNoise.start();

  sndReady = true;
}

export function updateAudio(dt) {
  if (!sndReady) return;
  const t = audioCtx.currentTime;
  const kmh = st.speed * 3.6;
  const speedRatio = Math.min(1, kmh / CRUISE_SPEED);
  windGain.gain.setTargetAtTime(speedRatio * 0.08, t, 0.2);
}

function playTone(freq, dur, type, vol) {
  if (!sndReady) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.value = vol || 0.15;
  g.gain.setTargetAtTime(0, audioCtx.currentTime + dur * 0.7, dur * 0.15);
  o.connect(g); g.connect(masterGain);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

export function sfxTakeoff()  { playTone(523, 0.3, 'sine', 0.2); setTimeout(() => playTone(659, 0.3, 'sine', 0.2), 150); setTimeout(() => playTone(784, 0.4, 'sine', 0.2), 300); }
export function sfxLanding()  { playTone(440, 0.15, 'square', 0.1); playTone(220, 0.3, 'square', 0.1); }
export function sfxWaypoint() { playTone(880, 0.1, 'sine', 0.2); setTimeout(() => playTone(1175, 0.15, 'sine', 0.2), 100); setTimeout(() => playTone(1397, 0.2, 'sine', 0.2), 200); }
export function sfxMission()  { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.25), i*200)); }
export function sfxStall()    { playTone(300, 0.2, 'square', 0.2); setTimeout(() => playTone(200, 0.3, 'square', 0.2), 250); }
export function sfxHardLand() { playTone(150, 0.4, 'sawtooth', 0.2); playTone(100, 0.5, 'sawtooth', 0.15); }
export function sfxReset()    { playTone(400, 0.1, 'sine', 0.1); playTone(300, 0.1, 'sine', 0.1); }

// 유저 인터랙션 시 오디오 시작
['click','keydown','touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { initAudio(); }, { once: false })
);
