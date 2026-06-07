// ═══════════════════════════════════════════════════════════════════
//  Auto Rollout — Assist 모드로 N 에피소드를 자동 비행·기록·리셋
// ═══════════════════════════════════════════════════════════════════
//
//  흐름:
//    startAutoRollout(n) 호출
//      → lewmLogger.start()      (REC 시작)
//      → Assist 모드 ON
//      → 매 프레임 tickAutoRollout() 호출
//          - 에피소드 종료 조건 체크 (착륙 성공 | 추락 | 타임아웃)
//          - 종료 시 → lewmLogger.stop(), resetAircraft(), 다음 에피소드
//          - N 에피소드 완료 → lewmLogger.export(), 자동 정지
// ═══════════════════════════════════════════════════════════════════

import { st, GROUND_Y } from './physics.js';

// ── 설정 ──────────────────────────────────────────────────────────
const EPISODE_TIMEOUT   = 45;    // 에피소드 최대 길이 (초)
const MIN_EPISODE_TIME  = 3;     // 너무 짧은 에피소드 무시 (초)
const RESET_DELAY       = 1.2;   // 리셋 후 다음 에피소드 대기 (초)

// 노이즈 설정
const NOISE_CHANGE_INTERVAL = 2.5;  // 노이즈 목표값 바꾸는 주기 (초)
const NOISE_MAX_YAW         = 0.18; // 최대 yaw 오프셋 (rad) — 약 ±10°
const NOISE_MAX_PITCH       = 0.08; // 최대 pitch 오프셋

// ── 상태 ──────────────────────────────────────────────────────────
let _running        = false;
let _totalEpisodes  = 0;
let _doneEpisodes   = 0;
let _episodeTime    = 0;
let _resetTimer     = 0;
let _waitingReset   = false;
let _onStatusChange = null;   // UI 콜백

// 외부에서 주입받는 의존성
let _resetAircraft  = null;
let _lewmLogger     = null;   // window.lewmLogger

// ── 노이즈 상태 (smoothed random walk) ────────────────────────────
let _noiseYaw       = 0;      // 현재 yaw 오프셋
let _noisePitch     = 0;      // 현재 pitch 오프셋
let _noiseYawTarget = 0;      // 목표 yaw 오프셋
let _noisePitchTarget = 0;    // 목표 pitch 오프셋
let _noiseTimer     = 0;      // 다음 목표값 변경까지 남은 시간

function _updateNoise(dt) {
  _noiseTimer -= dt;
  if (_noiseTimer <= 0) {
    // 새 목표값 랜덤 설정 (부호 포함 균등 분포)
    _noiseYawTarget   = (Math.random() * 2 - 1) * NOISE_MAX_YAW;
    _noisePitchTarget = (Math.random() * 2 - 1) * NOISE_MAX_PITCH;
    _noiseTimer = NOISE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6);
  }
  // 현재값을 목표값으로 부드럽게 보간 (지수 평활)
  const alpha = 1 - Math.exp(-dt * 1.2);
  _noiseYaw   += (_noiseYawTarget   - _noiseYaw)   * alpha;
  _noisePitch += (_noisePitchTarget - _noisePitch) * alpha;
}

function _resetNoise() {
  _noiseYaw = _noisePitch = _noiseYawTarget = _noisePitchTarget = 0;
  _noiseTimer = 0;
}

// ── 노이즈 getter (main.js의 assist 블록에서 읽어감) ───────────────
export function getNoiseYaw()   { return _running ? _noiseYaw   : 0; }
export function getNoisePitch() { return _running ? _noisePitch : 0; }

// ── 초기화 ────────────────────────────────────────────────────────
let _wpObjects = null;
export function initAutoRollout({ resetAircraft, wpObjects }) {
  _resetAircraft = resetAircraft;
  _wpObjects     = wpObjects;
}

// ── 시작 ──────────────────────────────────────────────────────────
export function startAutoRollout(numEpisodes) {
  if (_running) return;
  _lewmLogger = window.lewmLogger;
  if (!_lewmLogger) { console.warn('[AutoRollout] lewmLogger 없음'); return; }

  _totalEpisodes = numEpisodes;
  _doneEpisodes  = 0;
  _running       = true;
  _waitingReset  = false;
  _episodeTime   = 0;

  // WP 전부 활성화 (WP1이 반드시 존재하도록)
  _wpObjects?.forEach(wp => { wp.active = true; wp.group.visible = true; });

  // captureEvery 높게, frameSize 작게 → 캡처 부하 최소화
  _lewmLogger.start({ captureEvery: 10, maxSteps: 12000, frameSize: 64 });
  _notify();
  console.info(`[AutoRollout] 시작 — ${numEpisodes} 에피소드`);
}

// ── 정지 ──────────────────────────────────────────────────────────
export function stopAutoRollout() {
  if (!_running) return;
  _running = false;
  _lewmLogger?.stop();
  if (_doneEpisodes > 0) {
    _lewmLogger?.export(`flight_rollout_auto_${_doneEpisodes}ep.json`);
    console.info(`[AutoRollout] 수동 정지 → ${_doneEpisodes} 에피소드 export`);
  } else {
    console.info('[AutoRollout] 수동 정지 (저장할 완료 에피소드 없음)');
  }
  _notify();
}

// ── getter ─────────────────────────────────────────────────────────
export function isAutoRolloutRunning() { return _running; }
export function autoRolloutStatus() {
  return { running: _running, done: _doneEpisodes, total: _totalEpisodes };
}
export function onAutoRolloutStatus(cb) { _onStatusChange = cb; }

// ── WP1 통과 신호 (stage.js의 checkWaypointPass 대신 여기서 직접 관리) ──
let _wp1Passed = false;
export function notifyWp1Passed() {
  if (_running && !_waitingReset) _wp1Passed = true;
}

// ── 에피소드 종료 조건 ─────────────────────────────────────────────
// 목표: 이륙 → 첫 번째 WP(레일 끝) 통과
// 종료: WP1 통과 신호 | 추락(hard landing) | 타임아웃
function _episodeDone(lastResult) {
  if (_episodeTime < MIN_EPISODE_TIME) return false;
  if (_wp1Passed) {
    console.info('[AutoRollout] 종료 이유: WP1 통과');
    return true;
  }
  if (lastResult?.landingEvent === 'hard') {
    console.info('[AutoRollout] 종료 이유: 추락');
    return true;
  }
  if (lastResult?.landingEvent === 'touchdown') {
    console.info('[AutoRollout] 종료 이유: 착륙(WP 미통과)');
    return true;
  }
  if (_episodeTime >= EPISODE_TIMEOUT) {
    console.info('[AutoRollout] 종료 이유: 타임아웃');
    return true;
  }
  return false;
}

// ── 매 프레임 호출 ────────────────────────────────────────────────
export function tickAutoRollout(dt, lastResult) {
  if (!_running) return;

  // 리셋 대기 중
  if (_waitingReset) {
    _resetTimer -= dt;
    if (_resetTimer <= 0) {
      _waitingReset  = false;
      _episodeTime   = 0;
      _wp1Passed     = false;
      _resetNoise();
      _wpObjects?.forEach(wp => { wp.active = true; wp.group.visible = true; wp.passed = false; wp.ring.material.opacity = 0.9; });
      _lewmLogger.start({ captureEvery: 3, maxSteps: 12000 });
      _notify();
    }
    return;
  }

  _episodeTime += dt;
  // 공중일 때만 노이즈 적용 (지상 활주 중엔 직선 유지)
  if (st.phase === 'air') _updateNoise(dt);

  if (_episodeDone(lastResult)) {
    _lewmLogger.stop();
    _doneEpisodes++;
    console.info(`[AutoRollout] 에피소드 ${_doneEpisodes}/${_totalEpisodes} 완료 (${_episodeTime.toFixed(1)}s)`);

    if (_doneEpisodes >= _totalEpisodes) {
      // 전체 완료 → export
      _running = false;
      _lewmLogger.export(`flight_rollout_auto_${_totalEpisodes}ep.json`);
      _notify();
      console.info('[AutoRollout] 전체 완료 → 자동 export');
      return;
    }

    // 다음 에피소드 준비
    _waitingReset = true;
    _resetTimer   = RESET_DELAY;
    _resetAircraft();
    _notify();
  }
}

// ── 상태 변경 알림 ─────────────────────────────────────────────────
function _notify() {
  _onStatusChange?.({ running: _running, done: _doneEpisodes, total: _totalEpisodes });
}
