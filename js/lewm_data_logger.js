import { st, GROUND_Y } from './physics.js';
import { wpObjects, LAND_RW_X, LAND_TOUCH_Z } from './waypoint.js';

const DEFAULTS = {
  enabled: false,
  captureEvery: 3,
  maxSteps: 8000,
  frameSize: 224,
};

const state = {
  ...DEFAULTS,
  step: 0,
  episode: 0,
  rows: [],
};

function actionFrom(keys, gesture) {
  return [
    keys['KeyW'] || keys['ArrowUp'] || gesture.W ? 1 : 0,
    keys['KeyS'] || keys['ArrowDown'] || gesture.S ? 1 : 0,
    keys['KeyA'] || gesture.A ? 1 : 0,
    keys['KeyD'] || gesture.D ? 1 : 0,
    keys['KeyQ'] || keys['Space'] || gesture.Q ? 1 : 0,
    keys['KeyE'] || keys['ShiftLeft'] || keys['ShiftRight'] || gesture.E ? 1 : 0,
  ];
}

function telemetryFrom(result) {
  const nextWp = wpObjects.find(wp => wp.active && !wp.passed);
  const dx = nextWp ? nextWp.pos.x - st.pos.x : 0;
  const dy = nextWp ? nextWp.pos.y - st.pos.y : 0;
  const dz = nextWp ? nextWp.pos.z - st.pos.z : 0;
  const runwayLateralError = st.pos.x - LAND_RW_X;
  const runwayDistance = LAND_TOUCH_Z - st.pos.z;

  return [
    st.pos.x,
    st.pos.y,
    st.pos.z,
    st.speed,
    st.thrust,
    st.yaw,
    st.pitch,
    st.roll,
    st.vSpeed,
    st.phase === 'ground' ? 1 : 0,
    st.phase === 'air' ? 1 : 0,
    st.stall ? 1 : 0,
    st.gearDown ? 1 : 0,
    dx,
    dy,
    dz,
    runwayLateralError,
    runwayDistance,
    result?.takeoffEvent ? 1 : 0,
    result?.landingEvent === 'hard' ? 1 : 0,
    result?.landingEvent === 'touchdown' ? 1 : 0,
  ];
}

function rewardFrom(prevTelemetry, telemetry) {
  if (!prevTelemetry) return 0;
  const altitudeGain = telemetry[1] - prevTelemetry[1];
  const speedKmh = telemetry[3] * 3.6;
  const stall = telemetry[11];
  const takeoff = telemetry[18];
  const hardLanding = telemetry[19];
  const lateralPenalty = Math.abs(telemetry[16]) * 0.0002;
  const pitchPenalty = Math.max(0, Math.abs(telemetry[6]) - 0.45);

  return (
    4.0 * takeoff
    + 0.04 * altitudeGain
    + 0.001 * speedKmh
    - 5.0 * stall
    - 4.0 * hardLanding
    - lateralPenalty
    - pitchPenalty
  );
}

function captureFrame(renderer, size) {
  const source = renderer.domElement;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function initLeWMDataLogger() {
  const statusEl = document.getElementById('lewm-status');
  const recBtn = document.getElementById('lewm-rec');
  const stopBtn = document.getElementById('lewm-stop');
  const exportBtn = document.getElementById('lewm-export');

  function refreshStatus() {
    if (!statusEl) return;
    statusEl.textContent = `${state.enabled ? 'recording' : 'idle'} | ${state.rows.length}`;
  }

  window.lewmLogger = {
    start(options = {}) {
      Object.assign(state, DEFAULTS, options);
      state.enabled = true;
      state.step = 0;
      state.episode += 1;
      state.rows = [];
      console.info('[LeWM logger] started', state);
      refreshStatus();
    },
    stop() {
      state.enabled = false;
      console.info('[LeWM logger] stopped', state.rows.length);
      refreshStatus();
    },
    export(filename = `flight_rollout_ep${state.episode}.json`) {
      downloadJson(filename, {
        version: 1,
        frameEncoding: 'jpeg_data_url',
        frameSize: state.frameSize,
        actionNames: ['W', 'S', 'A', 'D', 'Q', 'E'],
        telemetryNames: [
          'x', 'y', 'z', 'speed', 'thrust', 'yaw', 'pitch', 'roll', 'vSpeed',
          'phase_ground', 'phase_air', 'stall', 'gearDown',
          'next_wp_dx', 'next_wp_dy', 'next_wp_dz',
          'runway_lateral_error', 'runway_distance',
          'takeoff_event', 'hard_landing_event', 'touchdown_event',
        ],
        rows: state.rows,
      });
      refreshStatus();
    },
    status() {
      return { ...state, rows: state.rows.length };
    },
  };

  recBtn?.addEventListener('click', () => window.lewmLogger.start());
  stopBtn?.addEventListener('click', () => window.lewmLogger.stop());
  exportBtn?.addEventListener('click', () => window.lewmLogger.export());
  refreshStatus();
}

export function logLeWMStep({ renderer, keys, gesture, result }) {
  if (!state.enabled) return;
  state.step += 1;
  if (state.step % state.captureEvery !== 0) return;
  if (state.rows.length >= state.maxSteps) {
    state.enabled = false;
    return;
  }

  const prev = state.rows.length ? state.rows[state.rows.length - 1].telemetry : null;
  const telemetry = telemetryFrom(result);
  state.rows.push({
    episode: state.episode,
    step: state.step,
    frame: captureFrame(renderer, state.frameSize),
    action: actionFrom(keys, gesture),
    telemetry,
    reward: rewardFrom(prev, telemetry),
    done: st.pos.y <= GROUND_Y && result?.landingEvent === 'hard',
  });

  const statusEl = document.getElementById('lewm-status');
  if (statusEl) statusEl.textContent = `recording | ${state.rows.length}`;
}
