import * as THREE from 'three';
import { st } from './physics.js';

let camYaw = 0, camPitch = 12, camDist = 35;
let isDragging = false, lastMX = 0, lastMY = 0;

export function initCameraControls(renderer) {
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button === 2) { isDragging = true; lastMX = e.clientX; lastMY = e.clientY; }
  });
  renderer.domElement.addEventListener('mouseup', e => { if (e.button === 2) isDragging = false; });
  renderer.domElement.addEventListener('mousemove', e => {
    if (!isDragging) return;
    camYaw   += (e.clientX - lastMX) * 0.35;
    camPitch -= (e.clientY - lastMY) * 0.35;
    camPitch  = Math.max(-15, Math.min(70, camPitch));
    lastMX = e.clientX; lastMY = e.clientY;
  });
  renderer.domElement.addEventListener('wheel', e => {
    camDist = Math.max(10, Math.min(120, camDist + e.deltaY * 0.06));
  }, { passive: true });
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
}

export function updateCamera(dt, camera, airplaneGroup) {
  const pitchRad = camPitch * Math.PI / 180;

  if (!isDragging) {
    const behindX = -Math.sin(st.yaw) * Math.cos(pitchRad);
    const behindY =  Math.sin(pitchRad);
    const behindZ = -Math.cos(st.yaw) * Math.cos(pitchRad);

    const offset = new THREE.Vector3(behindX, behindY, behindZ).multiplyScalar(camDist);
    const target = airplaneGroup.position.clone().add(new THREE.Vector3(0, 2, 0));
    camera.position.lerp(target.clone().add(offset), Math.min(dt * 10, 1));
    camera.lookAt(target);
  } else {
    const rad = camYaw * Math.PI / 180;
    const offset = new THREE.Vector3(
      Math.sin(rad) * Math.cos(pitchRad),
      Math.sin(pitchRad),
      -Math.cos(rad) * Math.cos(pitchRad)
    ).multiplyScalar(camDist);

    const target = airplaneGroup.position.clone().add(new THREE.Vector3(0, 2, 0));
    camera.position.lerp(target.clone().add(offset), Math.min(dt * 10, 1));
    camera.lookAt(target);
  }
}
