import * as THREE from 'three';
import { GROUND_Y } from './physics.js';

export const GLIDE_ANGLE   = 3.0;
export const LAND_RW_X     = -1500;
export const LAND_TOUCH_Z  = 13200;

const WP_DEFS = [
  { x:    0, y: 220, z: 4800  },
  { x: 1400, y: 300, z: 6000  },
  { x:  900, y: 200, z: 8500  },
  { x: -600, y: 300, z: 10000 },
  { x:-1500, y: 160, z: 11500 },
];
export const WP_RADIUS = 90;

export let wpObjects = [];
export let trailPoints = [];
export const trailMax = 300;
export let trailLine;
let trailGeo, trailPositions;

export function buildWaypoints(scene) {
  const colors = [0xffdd00, 0xff8800, 0x00ffcc, 0xcc44ff, 0x00ff88];

  wpObjects = WP_DEFS.map((wp, idx) => {
    const g = new THREE.Group();
    const col = colors[idx];

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(WP_RADIUS * 0.75, 2.2, 8, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    g.add(ring);

    const lineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4 });
    const R = WP_RADIUS * 0.8;
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-R,0), new THREE.Vector3(0,R,0)]), lineMat));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-R,0,0), new THREE.Vector3(R,0,0)]), lineMat));

    const dot = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
    dot.position.set(0, R + 14, 0); g.add(dot);
    for (let i = 0; i <= idx; i++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pip.position.set((i - idx * 0.5) * 10, R + 28, 0); g.add(pip);
    }

    g.position.set(wp.x, wp.y, wp.z);
    scene.add(g);
    return { group: g, ring, passed: false, active: true, pos: new THREE.Vector3(wp.x, wp.y, wp.z) };
  });

  // ILS 글라이드패스
  const ilsPts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const z = LAND_TOUCH_Z - t * 3200;
    const dist = LAND_TOUCH_Z - z;
    const h = Math.tan(GLIDE_ANGLE * Math.PI / 180) * dist;
    ilsPts.push(new THREE.Vector3(LAND_RW_X, Math.max(GROUND_Y, h + GROUND_Y), z));
  }
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ilsPts),
    new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.3 })
  ));

  // ILS 링 게이트
  for (let i = 1; i <= 6; i++) {
    const dist = i * 400;
    const z    = LAND_TOUCH_Z - dist;
    const h    = Math.tan(GLIDE_ANGLE * Math.PI / 180) * dist;
    const gg   = new THREE.Group();
    gg.add(new THREE.Mesh(
      new THREE.TorusGeometry(22, 0.8, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    ));
    gg.position.set(LAND_RW_X, Math.max(GROUND_Y, h + GROUND_Y), z);
    scene.add(gg);
  }

  // 터치다운 마커
  const tdMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 4; i++) {
    [-9, 9].forEach(dx => {
      const td = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), tdMat);
      td.rotation.x = -Math.PI / 2;
      td.position.set(LAND_RW_X + dx, 0.03, LAND_TOUCH_Z - 20 - i * 30);
      scene.add(td);
    });
  }

  // 비행 궤적
  trailGeo = new THREE.BufferGeometry();
  trailPositions = new Float32Array(trailMax * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setDrawRange(0, 0);
  trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 }));
  scene.add(trailLine);

  return wpObjects;
}

export function updateTrail(st, dt) {
  if (st.phase === 'air') {
    trailPoints.push(st.pos.clone());
    if (trailPoints.length > trailMax) trailPoints.shift();
  }
  const pos = trailGeo.attributes.position;
  trailPoints.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
  pos.needsUpdate = true;
  trailGeo.setDrawRange(0, trailPoints.length);
}
