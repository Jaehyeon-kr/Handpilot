import * as THREE from 'three';
import { stepPhysicsState } from './physics.js';
import { TAKEOFF_SPEED, STALL_SPEED } from './physics.js';

// ═══════════════════════════════════════════════════════════════════
//  Route Planner — 순수 물리 시뮬레이션으로 후보 경로 생성
// ═══════════════════════════════════════════════════════════════════

const HORIZON    = 5.0;   // 롤아웃 지평선 (초)
const STEP_DT    = 0.1;   // 롤아웃 스텝 간격 (초)
const N_STEPS    = Math.round(HORIZON / STEP_DT);  // 50 스텝
const PLAN_EVERY = 30;    // 30 프레임마다 재계산

// 후보 액션 정의
const CANDIDATE_ACTIONS = [
  { id: 'RouteA', label: 'No Rotate',       fn: (s, i)   => ({ W: true,  Q: false, S: false, A: false, D: false, E: false }) },
  { id: 'RouteB', label: 'Q after 150',     fn: (s, i)   => ({ W: true,  Q: s.speed * 3.6 >= 150, S: false, A: false, D: false, E: false }) },
  { id: 'RouteC', label: 'Q after 120',     fn: (s, i)   => ({ W: true,  Q: s.speed * 3.6 >= 120, S: false, A: false, D: false, E: false }) },
  { id: 'RouteD', label: 'Q Immediate',     fn: (s, i)   => ({ W: true,  Q: true,                 S: false, A: false, D: false, E: false }) },
  { id: 'RouteE', label: 'Q Pulse 150',     fn: (s, i)   => ({ W: true,  Q: s.speed * 3.6 >= 150 && i % 4 < 2, S: false, A: false, D: false, E: false }) },
  { id: 'RouteF', label: 'Steer Correct',   fn: (s, i)   => ({ W: true,  Q: s.speed * 3.6 >= 150, S: false, A: s.pos.x > 5, D: s.pos.x < -5, E: false }) },
];

// 모듈 내부 상태
let _lastRoutes  = [];
let _bestIdx     = 0;
let _frameCount  = 0;

// ─── 초기화 ───────────────────────────────────────────────────────
export function initRoutePlanner() {
  _lastRoutes = [];
  _bestIdx    = 0;
  _frameCount = 0;
}

// ─── 단일 후보 롤아웃 ─────────────────────────────────────────────
function rollout(candidateDef, initState) {
  // initState 얕은 복사 (pos는 clone)
  let s = {
    ...initState,
    pos: initState.pos.clone(),
  };

  const points = [];
  let takeoffStep  = -1;
  let stallCount   = 0;
  let maxPitch     = 0;
  let maxRoll      = 0;

  for (let i = 0; i < N_STEPS; i++) {
    const action = candidateDef.fn(s, i);
    s = stepPhysicsState(s, action, STEP_DT);
    points.push(s.pos.clone());

    if (s.phase === 'air' && takeoffStep < 0) takeoffStep = i;
    if (s.stall) stallCount++;
    maxPitch = Math.max(maxPitch, Math.abs(s.pitch));
    maxRoll  = Math.max(maxRoll,  Math.abs(s.roll));
  }

  const takeoffSuccess  = takeoffStep >= 0;
  const altitudeGain    = points.length ? points[points.length - 1].y - initState.pos.y : 0;
  const finalSpeed      = s.speed * 3.6;
  const lateralError    = s.pos.x;  // 활주로 중심선 기준 (x=0)
  const excessivePitch  = maxPitch > 0.5 ? 1 : 0;
  const excessiveRoll   = maxRoll  > 0.5 ? 1 : 0;
  const stallFlag       = stallCount > 0 ? 1 : 0;

  // 점수 공식 (설계 문서 기준)
  const score =
    4.0 * (takeoffSuccess ? 1 : 0)
    + 0.015 * altitudeGain
    + 0.004 * finalSpeed
    - 5.0 * stallFlag
    - 0.01 * Math.abs(lateralError)
    - 1.5 * excessivePitch
    - 1.0 * excessiveRoll;

  // 색상 분류
  let color;
  if (stallFlag || (!takeoffSuccess && maxPitch > 0.5) || maxRoll > 0.5) {
    color = 'red';
  } else if (!takeoffSuccess || altitudeGain < 5) {
    color = 'yellow';
  } else {
    color = 'green';
  }

  // stall 위험도
  const stallRiskRaw = stallCount / N_STEPS;
  const stallRisk = stallRiskRaw > 0.3 ? 'High' : stallRiskRaw > 0.1 ? 'Med' : 'Low';

  // 이륙 시간 (초)
  const takeoffTime = takeoffStep >= 0 ? +(takeoffStep * STEP_DT).toFixed(1) : null;

  return {
    id:             candidateDef.id,
    label:          candidateDef.label,
    points,
    score,
    color,
    takeoffSuccess,
    takeoffTime,
    stallRisk,
    _altitudeGain:  altitudeGain,
    _finalSpeed:    finalSpeed,
  };
}

// ─── 경로 계획 (매 N 프레임마다 실제 계산) ────────────────────────
export function planRoutes(currentSt) {
  _frameCount++;
  if (_frameCount % PLAN_EVERY !== 0 && _lastRoutes.length > 0) return _lastRoutes;

  // currentSt를 읽기 전용으로 복사
  const initState = {
    pos:      currentSt.pos.clone(),
    speed:    currentSt.speed,
    thrust:   currentSt.thrust,
    yaw:      currentSt.yaw,
    pitch:    currentSt.pitch,
    roll:     currentSt.roll,
    vSpeed:   currentSt.vSpeed,
    phase:    currentSt.phase,
    stall:    currentSt.stall,
    gearDown: currentSt.gearDown,
  };

  const routes = CANDIDATE_ACTIONS.map(cand => rollout(cand, initState));

  // best 선택 (점수 최고)
  let bestScore = -Infinity;
  let bestIdx   = 0;
  routes.forEach((r, i) => {
    if (r.score > bestScore) { bestScore = r.score; bestIdx = i; }
  });

  // best route 색상을 cyan으로 덮어씌우기
  routes.forEach((r, i) => { r.color = i === bestIdx ? 'cyan' : r.color; });

  _lastRoutes = routes;
  _bestIdx    = bestIdx;
  return routes;
}

// ─── getter ───────────────────────────────────────────────────────
export function getLastRoutes()  { return _lastRoutes; }
export function getBestRouteIdx() { return _bestIdx; }
