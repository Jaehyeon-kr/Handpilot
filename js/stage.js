import { st, GROUND_Y, resetState } from './physics.js';
import { sfxWaypoint, sfxMission, sfxHardLand, sfxReset } from './audio.js';
import { showBanner } from './hud.js';
import { wpObjects, trailPoints, LAND_RW_X, WP_RADIUS } from './waypoint.js';

export const STAGES = [
  { name: 'Stage 1 — 이륙 연습',     desc: 'W로 가속 → 150km/h에서 Q로 이륙', goal: 'takeoff', wps: 0, timeLimit: 0 },
  { name: 'Stage 2 — 첫 비행',       desc: 'WP 2개를 통과하라', goal: 'waypoints', wps: 2, timeLimit: 0 },
  { name: 'Stage 3 — 항로 비행',     desc: 'WP 3개 통과 + 착륙', goal: 'land', wps: 3, timeLimit: 0 },
  { name: 'Stage 4 — 정밀 비행',     desc: 'WP 5개 통과 + 착륙', goal: 'land', wps: 5, timeLimit: 180 },
  { name: 'Stage 5 — 마스터',        desc: '전체 WP + 제한시간 내 착륙', goal: 'land', wps: 5, timeLimit: 120 },
];

export let currentStage = 0;
export let stageUnlocked = 1;
let _tutorialDone = false;
let _missionComplete = false;
export function isTutorialDone() { return _tutorialDone; }
export function isMissionComplete() { return _missionComplete; }
let tutStep = 0;
export let stageTimer = 0;
let gameStarted = false;

let tutOverlay, tutStepEl, tutKb, tutHand, tutProgress;
let stageOverlay, stageList;
let wpStatusEl, missionTitleEl;

// localStorage 복원
try {
  const saved = JSON.parse(localStorage.getItem('flightSimProgress'));
  if (saved) { stageUnlocked = saved.unlocked || 1; _tutorialDone = saved.tutDone || false; }
} catch(e) {}

function saveProgress() {
  try { localStorage.setItem('flightSimProgress', JSON.stringify({ unlocked: stageUnlocked, tutDone: _tutorialDone })); } catch(e) {}
}

const TUT_STEPS = [
  {
    text: '🎮 W키를 눌러 가속하세요',
    kb: '<p class="tut-highlight"><span>W</span> 를 꾹 누르세요</p>',
    hand: '<p class="tut-highlight">오른손 <span>주먹</span> 쥐기</p>',
    check: () => st.speed * 3.6 > 30,
  },
  {
    text: '🚀 150 km/h에서 Q로 이륙!',
    kb: '<p>계속 <span>W</span> 가속</p><p class="tut-highlight">속도 나오면 <span>Q</span> 이륙</p>',
    hand: '<p><span>주먹</span> 유지</p><p class="tut-highlight">오른손 <span>아래로 당기기</span></p>',
    check: () => st.phase === 'air',
  },
  {
    text: '↔ A/D로 좌우 방향을 전환하세요',
    kb: '<p class="tut-highlight"><span>A</span> 왼쪽 / <span>D</span> 오른쪽</p>',
    hand: '<p class="tut-highlight">왼손 <span>기울이기</span></p>',
    check: () => Math.abs(st.roll) > 0.15,
  },
  {
    text: '↕ Q/E로 상승·하강하세요',
    kb: '<p class="tut-highlight"><span>Q</span> 상승 / <span>E</span> 하강</p>',
    hand: '<p class="tut-highlight">오른손 <span>높이</span> 조절</p>',
    check: () => st.pos.y > GROUND_Y + 50,
  },
  {
    text: '✅ 튜토리얼 완료! 스테이지를 선택하세요',
    kb: '<p>잘 하셨습니다!</p>',
    hand: '<p>이제 자유롭게!</p>',
    check: () => false,
  },
];

export function initStageUI() {
  tutOverlay = document.getElementById('tutorial-overlay');
  tutStepEl = document.getElementById('tut-step');
  tutKb = document.getElementById('tut-kb');
  tutHand = document.getElementById('tut-hand');
  tutProgress = document.getElementById('tut-progress');
  stageOverlay = document.getElementById('stage-overlay');
  stageList = document.getElementById('stage-list');
  wpStatusEl = document.getElementById('wp-status');
  missionTitleEl = document.getElementById('mission-title');
}

export function showTutorial() {
  if (!tutOverlay) return;
  tutStep = 0;
  tutOverlay.classList.remove('hidden');
  updateTutorialUI();
  setTimeout(() => { tutOverlay.style.background = 'rgba(0,0,10,0.3)'; }, 2000);
}

function updateTutorialUI() {
  const s = TUT_STEPS[tutStep];
  tutStepEl.textContent = s.text;
  tutKb.innerHTML = s.kb;
  tutHand.innerHTML = s.hand;
  tutProgress.innerHTML = TUT_STEPS.map((_, i) =>
    `<div class="tut-dot ${i < tutStep ? 'done' : i === tutStep ? 'active' : ''}"></div>`
  ).join('');
}

export function checkTutorial() {
  if (_tutorialDone || tutStep >= TUT_STEPS.length) return;
  const s = TUT_STEPS[tutStep];
  if (s.check()) {
    sfxWaypoint();
    tutStep++;
    if (tutStep >= TUT_STEPS.length - 1) {
      tutStep = TUT_STEPS.length - 1;
      updateTutorialUI();
      setTimeout(() => {
        _tutorialDone = true;
        saveProgress();
        tutOverlay.classList.add('hidden');
        tutOverlay.style.background = '';
        showStageSelect();
      }, 2000);
    } else {
      updateTutorialUI();
    }
  }
}

export function showStageSelect() {
  stageOverlay.classList.remove('hidden');
  stageList.innerHTML = STAGES.map((s, i) => {
    const locked = i >= stageUnlocked;
    const stars = i < stageUnlocked - 1 ? '★' : '';
    return `<button class="stage-btn ${locked ? 'locked' : ''}" data-stage="${i}" ${locked ? 'disabled' : ''}>
      ${s.name} ${stars ? '<span class="star">' + stars + '</span>' : ''}
      <br><small style="color:#888">${s.desc}${s.timeLimit ? ' (제한 ' + s.timeLimit + '초)' : ''}</small>
    </button>`;
  }).join('');

  stageList.querySelectorAll('.stage-btn:not(.locked)').forEach(btn => {
    btn.addEventListener('click', () => startStage(parseInt(btn.dataset.stage)));
  });
}

function startStage(idx) {
  currentStage = idx;
  stageOverlay.classList.add('hidden');
  const s = STAGES[idx];

  wpObjects.forEach((wp, i) => {
    const active = i < s.wps;
    wp.group.visible = active;
    wp.active = active;
  });

  if (missionTitleEl) missionTitleEl.textContent = `✈ ${s.name}: ${s.desc}`;
  stageTimer = s.timeLimit || 0;
  resetAircraftForStage();
  updateWpHUD();
}

function resetAircraftForStage() {
  resetState();
  _missionComplete = false;
  trailPoints.length = 0;
  const colors = [0xffdd00, 0xff8800, 0x00ffcc, 0xcc44ff, 0x00ff88];
  wpObjects.forEach((wp, i) => {
    wp.passed = false;
    wp.ring.material.opacity = 0.9;
    wp.ring.material.color.set(colors[i]);
  });
}

export function resetAircraft() {
  if (gameStarted) {
    adBreak({ type: 'next', name: 'restart', beforeAd: () => {}, afterAd: () => {}, adBreakDone: () => {} });
  }
  gameStarted = true;
  sfxReset();
  resetState();
  _missionComplete = false;
  trailPoints.length = 0;
  wpObjects.forEach(wp => {
    wp.passed = false;
    wp.ring.material.opacity = 0.9;
    wp.ring.material.color.set(wp === wpObjects[0] ? 0xffdd00 : wp === wpObjects[1] ? 0xff8800 : 0x00ff88);
  });
  updateWpHUD();
}

export function checkStageComplete() {
  if (_missionComplete) return;
  const s = STAGES[currentStage];
  if (s.goal === 'takeoff' && st.phase === 'air' && st.pos.y > GROUND_Y + 30) {
    completeStage();
  }
}

export function checkWaypointPass() {
  if (_missionComplete) return;
  let nextWP = wpObjects.findIndex(wp => wp.active && !wp.passed);
  if (nextWP >= 0) {
    const wp = wpObjects[nextWP];
    const dist = st.pos.distanceTo(wp.pos);
    if (dist < WP_RADIUS) {
      wp.passed = true;
      wp.ring.material.color.set(0x00ff00);
      wp.ring.material.opacity = 0.4;
      updateWpHUD();
      showBanner(`✓ WP${nextWP + 1} 통과!`, '#00ff88');
      sfxWaypoint();
      if (STAGES[currentStage].goal === 'waypoints') checkStageLanding();
    }
  }
}

export function checkStageLanding() {
  const s = STAGES[currentStage];
  const activeWps = wpObjects.filter(wp => wp.active);
  const allDone = activeWps.length === 0 || activeWps.every(wp => wp.passed);
  if (s.goal === 'waypoints' && allDone) { completeStage(); return true; }
  return false;
}

export function handleLanding() {
  const s = STAGES[currentStage];
  const activeWps = wpObjects.filter(wp => wp.active);
  const allDone = activeWps.length === 0 || activeWps.every(wp => wp.passed);
  const onLandRW = Math.abs(st.pos.x - LAND_RW_X) < 25 && st.pos.z > 9900 && st.pos.z < 13600;

  if (allDone && onLandRW && s.goal === 'land') {
    completeStage();
  } else if (onLandRW && !allDone) {
    showBanner('⚠ WP를 먼저 통과하세요!', '#ff8800');
  } else {
    showBanner('🛬  LANDING', '#ffaa00');
  }
}

function completeStage() {
  if (_missionComplete) return;
  _missionComplete = true;
  sfxMission();
  showBanner(`🏆 ${STAGES[currentStage].name} CLEAR!`, '#ffdd00');

  if (currentStage + 1 > stageUnlocked - 1) {
    stageUnlocked = Math.min(STAGES.length, currentStage + 2);
    saveProgress();
  }

  adBreak({
    type: 'next', name: 'stage-clear',
    beforeAd: () => {}, afterAd: () => {},
    adBreakDone: () => { setTimeout(() => showStageSelect(), 2000); },
  });
}

export function updateStageTimer(dt) {
  const s = STAGES[currentStage];
  if (s.timeLimit > 0 && !_missionComplete && st.phase === 'air') {
    stageTimer -= dt;
    if (stageTimer <= 0) {
      stageTimer = 0;
      showBanner('⏰ TIME UP!', '#ff4400');
      sfxHardLand();
      setTimeout(() => showStageSelect(), 2500);
    }
  }
}

export function updateWpHUD() {
  if (!wpStatusEl) return;
  const s = STAGES[currentStage];
  const activeWps = wpObjects.filter(wp => wp.active);
  const icons = activeWps.map(wp => wp.passed ? '●' : '○');
  const suffix = s.goal === 'land' ? ' → 착륙' : '';
  const timer = s.timeLimit > 0 && !_missionComplete ? ` ⏱${Math.ceil(stageTimer)}s` : '';
  wpStatusEl.textContent = `WP ${icons.join(' ')}${suffix}${timer}`;
}
