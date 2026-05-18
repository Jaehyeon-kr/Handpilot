import * as THREE from 'three';

export const TAKEOFF_SPEED  = 150;
export const STALL_SPEED    = 110;
export const CRUISE_SPEED   = 450;
export const MAX_THRUST_ACC = 6.0;
export const GRAVITY        = 9.81;
export const GROUND_Y       = 1.8;

export const st = {
  pos:    new THREE.Vector3(0, GROUND_Y, 0),
  speed:  0,
  thrust: 0,
  yaw:    0,
  pitch:  0,
  roll:   0,
  vSpeed: 0,
  phase:  'ground',
  stall:  false,
  gearDown: true,
};

export let strobeTimer = 0;
export let stallBeepTimer = 0;

export function resetState() {
  st.pos.set(0, GROUND_Y, 0);
  st.speed = 0; st.thrust = 0;
  st.yaw = 0; st.pitch = 0; st.roll = 0;
  st.vSpeed = 0; st.phase = 'ground';
  st.stall = false; st.gearDown = true;
}

export function updatePhysics(dt, keys, gesture) {
  dt = Math.min(dt, 0.05);
  strobeTimer += dt;

  const W = keys['KeyW'] || keys['ArrowUp']    || gesture.W;
  const S = keys['KeyS'] || keys['ArrowDown']  || gesture.S;
  const A = keys['KeyA']                       || gesture.A;
  const D = keys['KeyD']                       || gesture.D;
  const Q = keys['KeyQ'] || keys['Space']      || gesture.Q;
  const E = keys['KeyE'] || keys['ShiftLeft'] || keys['ShiftRight'] || gesture.E;

  const kmh = st.speed * 3.6;

  // 추력
  if (W) st.thrust = Math.min(1.0, st.thrust + dt * 0.7);
  else if (S) st.thrust = Math.max(0.0, st.thrust - dt * 1.2);
  else st.thrust = Math.max(0.0, st.thrust - dt * 0.08);

  let takeoffEvent = false;
  let landingEvent = null; // null | 'landing' | 'hard' | {goal}

  // 지상
  if (st.phase === 'ground') {
    const airDrag    = st.speed * st.speed * 0.0018;
    const rollDrag   = 0.015 * GRAVITY;
    const brakeForce = S ? 6.0 : 0;
    const accel      = st.thrust * MAX_THRUST_ACC - airDrag - rollDrag - brakeForce;
    st.speed = Math.max(0, st.speed + accel * dt);

    const steerPower = Math.min(kmh, 60) / 60;
    if (A) st.yaw += dt * 0.9 * (0.3 + steerPower * 0.7);
    if (D) st.yaw -= dt * 0.9 * (0.3 + steerPower * 0.7);

    st.pos.x += Math.sin(st.yaw) * st.speed * dt;
    st.pos.z += Math.cos(st.yaw) * st.speed * dt;
    st.pos.y  = GROUND_Y;
    st.pitch  = THREE.MathUtils.lerp(st.pitch, 0, dt * 4);
    st.roll   = THREE.MathUtils.lerp(st.roll,  0, dt * 6);

    if (Q) st.pitch = THREE.MathUtils.lerp(st.pitch, 0.25, dt * 2.5);

    if (kmh >= TAKEOFF_SPEED) {
      st.phase  = 'air';
      st.vSpeed = 4;
      takeoffEvent = true;
    }
  }
  // 공중
  else {
    const inducedDrag   = (GRAVITY / Math.max(st.speed, 1)) * 0.8;
    const parasiticDrag = st.speed * st.speed * 0.0012;
    const accel = st.thrust * MAX_THRUST_ACC - inducedDrag - parasiticDrag;
    st.speed = Math.max(0, Math.min(CRUISE_SPEED / 3.6, st.speed + accel * dt));

    const pitchTarget = Q ? 0.35 : E ? -0.30 : 0;
    st.pitch = THREE.MathUtils.lerp(st.pitch, pitchTarget, dt * 2.0);

    const rollTarget = A ? 0.45 : D ? -0.45 : 0;
    st.roll = THREE.MathUtils.lerp(st.roll, rollTarget, dt * 2.5);
    st.yaw += st.roll * dt * 0.55;

    const stallFactor   = Math.max(0, Math.min(1, (kmh - STALL_SPEED * 0.5) / (STALL_SPEED * 0.5)));
    const liftFromSpeed = st.speed * st.speed * 0.0035 * stallFactor;
    const liftFromPitch = st.pitch * st.speed * 0.6 * stallFactor;
    const totalLift     = liftFromSpeed + liftFromPitch;

    st.vSpeed += (totalLift - GRAVITY) * dt;
    if (st.stall) st.vSpeed -= 5 * dt;
    st.vSpeed = Math.max(-50, Math.min(50, st.vSpeed));

    st.stall = kmh < STALL_SPEED && st.pos.y > GROUND_Y + 10;
    if (st.stall) {
      st.pitch = THREE.MathUtils.lerp(st.pitch, -0.3, dt * 1.5);
      stallBeepTimer -= dt;
      if (stallBeepTimer <= 0) { stallBeepTimer = 0.8; landingEvent = 'stall_beep'; }
    } else { stallBeepTimer = 0; }

    st.pos.x += Math.sin(st.yaw) * st.speed * dt;
    st.pos.z += Math.cos(st.yaw) * st.speed * dt;
    st.pos.y  = Math.max(GROUND_Y, st.pos.y + st.vSpeed * dt);

    // 착지 판정
    if (st.pos.y <= GROUND_Y && st.vSpeed <= 0) {
      const landingSpeed = Math.abs(st.vSpeed);
      if (landingSpeed < 10) {
        st.phase  = 'ground';
        st.vSpeed = 0; st.pitch = 0;
        landingEvent = 'touchdown';
      } else {
        st.vSpeed = landingSpeed * 0.35;
        st.pos.y  = GROUND_Y + 0.3;
        if (landingSpeed > 15) landingEvent = 'hard';
      }
    }
  }

  return { takeoffEvent, landingEvent, kmh };
}
