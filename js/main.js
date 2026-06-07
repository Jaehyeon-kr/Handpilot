import * as THREE from 'three';
import { makeAirplane } from './airplane.js';
import { buildWorld, clouds } from './world.js';
import { st, GROUND_Y, strobeTimer, updatePhysics } from './physics.js';
import { initCameraControls, updateCamera } from './camera.js';
import { initHUD, showBanner, updateHUD } from './hud.js';
import { updateAudio } from './audio.js';
import { gesture, initHands } from './hands.js';
import { buildWaypoints, wpObjects, updateTrail } from './waypoint.js';
import { sfxTakeoff, sfxLanding, sfxHardLand, sfxStall } from './audio.js';
import { initLeWMDataLogger, logLeWMStep } from './lewm_data_logger.js';
import { initRoutePlanner, planRoutes, getLastRoutes, getBestRouteIdx } from './route_planner.js';
import { initRouteRenderer, updateRouteLines, setRoutesVisible } from './route_renderer.js';
import { initModelPanel, updateModelPanel, isAssistEnabled, areRoutesVisible, onRolloutBtnClick, updateRolloutStatus } from './model_panel.js';
import { initAutoRollout, startAutoRollout, stopAutoRollout, isAutoRolloutRunning, tickAutoRollout, onAutoRolloutStatus, getNoiseYaw, getNoisePitch, notifyWp1Passed } from './auto_rollout.js';
import {
  initStageUI, showTutorial, showStageSelect,
  checkTutorial, checkStageComplete, checkWaypointPass,
  handleLanding, updateStageTimer, updateWpHUD,
  resetAircraft, isTutorialDone, isMissionComplete,
} from './stage.js';

// ═══════════════════════════════════════════════════════════════════
//  렌더러 / 씬
// ═══════════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.pointerEvents = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ab0d8);
scene.fog = new THREE.FogExp2(0x8ec8e8, 0.0008);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 3000);

// 조명
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(200, 300, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.far = 1500;
sun.shadow.camera.left = sun.shadow.camera.bottom = -600;
sun.shadow.camera.right = sun.shadow.camera.top = 600;
sun.shadow.bias = -0.0001;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x88bbff, 0x446633, 0.7));

// 월드 빌드
buildWorld(scene);

// 비행기
const airplane = makeAirplane(scene);
const airplaneGroup = airplane.group;
airplaneGroup.position.set(0, GROUND_Y, 0);

// 웨이포인트
buildWaypoints(scene);

// 카메라
initCameraControls(renderer);

// HUD
initHUD();
initStageUI();
updateWpHUD();
initLeWMDataLogger();
initRoutePlanner();
initRouteRenderer(scene);
initModelPanel();
initAutoRollout({ resetAircraft, wpObjects });

// Auto Rollout 버튼 토글
onRolloutBtnClick(() => {
  if (isAutoRolloutRunning()) stopAutoRollout();
  else startAutoRollout(10);
});
// 상태 변화 → 패널 갱신
onAutoRolloutStatus(updateRolloutStatus);

// 제스처
initHands();

// 키 입력
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') resetAircraft();
  if (e.code === 'KeyG') st.gearDown = !st.gearDown;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.code] = false);

// Clock
const clock = new THREE.Clock();

function update(dt) {
  // 튜토리얼 / 스테이지 (auto rollout 중엔 스킵)
  if (!isAutoRolloutRunning()) {
    if (!isTutorialDone()) checkTutorial();
    checkStageComplete();
  }
  updateStageTimer(dt);
  updateWpHUD();

  // ── Assist / Auto Rollout → gesture 오버라이드 (물리 전에 적용) ──
  if (isAssistEnabled() || isAutoRolloutRunning()) {
    // WP가 하나도 활성화 안 된 경우 전부 활성화
    if (!wpObjects.some(wp => wp.active)) {
      wpObjects.forEach(wp => { wp.active = true; wp.group.visible = true; });
    }
    // 다음 미통과 웨이포인트를 타겟으로 사용
    const nextWp = wpObjects.find(wp => wp.active && !wp.passed);
    const target = nextWp ? nextWp.pos : null;

    gesture.W = true;
    gesture.S = false;

    if (target) {
      const dx       = target.x - st.pos.x;
      const dz       = target.z - st.pos.z;
      const dy       = target.y - st.pos.y;
      const targetYaw = Math.atan2(dx, dz);
      // yaw 차이를 -π~π 범위로 정규화
      // 노이즈 오프셋 추가 (auto rollout 중 공중에서만)
      const noiseYaw = getNoiseYaw();
      let yawDiff = (targetYaw + noiseYaw) - st.yaw;
      while (yawDiff >  Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      gesture.A = yawDiff >  0.04;
      gesture.D = yawDiff < -0.04;

      if (st.phase === 'ground') {
        gesture.Q = st.speed * 3.6 >= 145;           // 이륙 속도 근처에서 기수 올리기
        gesture.E = false;
      } else {
        // 고도 제어: 노이즈 pitch 오프셋 포함
        const noisePitch = getNoisePitch();
        gesture.Q = (dy + noisePitch * 80) >  15;
        gesture.E = (dy + noisePitch * 80) < -15;
      }
    } else {
      // 웨이포인트 없음 (모두 통과) → 착륙 활주로 방향으로
      const rwDx = -1500 - st.pos.x;
      const rwDz = 12000 - st.pos.z;
      const rwYaw = Math.atan2(rwDx, rwDz);
      let yawDiff = rwYaw - st.yaw;
      while (yawDiff >  Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      gesture.A = yawDiff >  0.04;
      gesture.D = yawDiff < -0.04;
      gesture.Q = false;
      gesture.E = st.pos.y > 80;                     // 착륙을 위해 고도 낮추기
    }
  }

  // 물리
  const result = updatePhysics(dt, keys, gesture);

  // 이벤트 처리
  if (result.takeoffEvent) {
    showBanner('✈  TAKEOFF !', '#00ffcc');
    sfxTakeoff();
  }
  if (result.landingEvent === 'stall_beep') sfxStall();
  if (result.landingEvent === 'hard') {
    showBanner('💥  HARD LANDING', '#ff4400');
    sfxHardLand();
  }
  if (result.landingEvent === 'touchdown') {
    handleLanding();
  }

  // 공중: 웨이포인트 체크
  if (st.phase === 'air') {
    const wp0Before = wpObjects[0]?.passed;
    checkWaypointPass();
    if (!wp0Before && wpObjects[0]?.passed) notifyWp1Passed();
  }

  // 비행기 자세
  airplaneGroup.position.copy(st.pos);
  airplaneGroup.rotation.order = 'YZX';
  airplaneGroup.rotation.y = st.yaw - Math.PI / 2;
  airplaneGroup.rotation.z = st.pitch;
  airplaneGroup.rotation.x = -st.roll;

  // 착륙장치
  const gearTarget = st.gearDown ? 0 : -Math.PI / 2;
  airplane.noseGear.rotation.x = THREE.MathUtils.lerp(airplane.noseGear.rotation.x, gearTarget, dt * 3);
  airplane.mainGearL.rotation.x = THREE.MathUtils.lerp(airplane.mainGearL.rotation.x, gearTarget, dt * 3);
  airplane.mainGearR.rotation.x = THREE.MathUtils.lerp(airplane.mainGearR.rotation.x, gearTarget, dt * 3);

  // 스트로브
  airplane.strobeW.visible = Math.floor(strobeTimer * 2) % 2 === 0;

  // 궤적
  updateTrail(st, dt);

  // 구름
  clouds.forEach(c => { c.position.x -= dt * 3; if (c.position.x < -600) c.position.x = 600; });

  // HUD
  updateHUD(wpObjects);

  logLeWMStep({ renderer, keys, gesture, result });

  // ── Auto Rollout tick ──────────────────────────────────────────
  if (isAutoRolloutRunning()) tickAutoRollout(dt, result);

  // ── Ghost Route Planner ────────────────────────────────────────
  planRoutes(st);
  const routes  = getLastRoutes();
  const bestIdx = getBestRouteIdx();

  if (areRoutesVisible()) updateRouteLines(routes, bestIdx);
  else                    setRoutesVisible(false);

  updateModelPanel(routes, bestIdx);

}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  update(dt);
  updateCamera(dt, camera, airplaneGroup);
  updateAudio(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 광고 설정
adConfig({ preloadAdBreaks: 'on', sound: 'on' });

// 시작
adBreak({
  type: 'preroll',
  adBreakDone: () => {
    animate();
    showStageSelect();
  }
});

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
