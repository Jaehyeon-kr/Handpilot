import * as THREE from 'three';

export const clouds = [];

export function buildWorld(scene) {
  // 지형
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7a2a });
  const bigGround = new THREE.Mesh(new THREE.PlaneGeometry(12000, 16000, 12, 16), groundMat);
  bigGround.rotation.x = -Math.PI / 2;
  bigGround.position.set(0, 0, 6500);
  bigGround.receiveShadow = true;
  scene.add(bigGround);

  // 활주로
  makeRunway(scene, 0, 0, 4200, 24);
  makeRunway(scene, -1500, 10000, 3500, 26);

  // 구름
  for (let i = 0; i < 60; i++) {
    makeCloud(scene, (Math.random() - 0.5) * 6000, 120 + Math.random() * 300, Math.random() * 12000 - 1000, 0.8 + Math.random() * 1.2);
  }

  // 나무
  for (let i = 0; i < 200; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    makeTree(scene, side * (20 + Math.random() * 400), Math.random() * 4500);
  }
  for (let i = 0; i < 300; i++) {
    const x = (Math.random() - 0.5) * 5000;
    const z = 4500 + Math.random() * 7000;
    if (Math.abs(x) > 60 || z < 4500) makeTree(scene, x, z);
  }

  // 산
  makeMountain(scene, -1200, 3500, 280, 500);
  makeMountain(scene,  1500, 4200, 350, 600);
  makeMountain(scene, -800,  6500, 200, 380);
  makeMountain(scene,  2000, 7000, 420, 700);
  makeMountain(scene, -2500, 8500, 180, 350);
  makeMountain(scene,  800,  9000, 240, 420);

  // 호수
  makeLake(scene,  900, 5500, 600, 400);
  makeLake(scene, -1800, 7200, 800, 500);
  makeLake(scene,  1200, 8800, 500, 350);

  // 도시
  const buildColors = [0x8899aa, 0x99aabb, 0x778899, 0xaabbcc, 0x667788];
  for (let i = 0; i < 40; i++) {
    const bx = -1500 + (Math.random() - 0.5) * 1200;
    const bz = 10500 + (Math.random() - 0.5) * 1200;
    const bw = 20 + Math.random() * 40;
    const bh = 15 + Math.random() * 80;
    makeBuilding(scene, bx, bz, bw, bw * 0.8, bh, buildColors[Math.floor(Math.random() * 5)]);
  }

  // 격납고
  makeHangar(scene, -60, 80);
  makeHangar(scene, -90, 140);
  makeHangar(scene, -60, 200);
}

function makeRunway(scene, cx, cz, len, wide) {
  const rwMat  = new THREE.MeshLambertMaterial({ color: 0x383840 });
  const whtMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const edgeHalf = wide / 2 + 1;

  const rw = new THREE.Mesh(new THREE.PlaneGeometry(wide, len), rwMat);
  rw.rotation.x = -Math.PI / 2; rw.position.set(cx, 0.01, cz + len / 2);
  scene.add(rw);

  [-edgeHalf, edgeHalf].forEach(dx => {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.7, len), whtMat);
    e.rotation.x = -Math.PI / 2; e.position.set(cx + dx, 0.015, cz + len / 2);
    scene.add(e);
  });

  const dashes = Math.floor(len / 40);
  for (let i = 0; i < dashes; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 18), whtMat);
    d.rotation.x = -Math.PI / 2; d.position.set(cx, 0.02, cz + 30 + i * 40);
    scene.add(d);
  }

  [30, len - 30].forEach(dz => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wide * 0.7, 6), whtMat);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.02, cz + dz);
    scene.add(m);
  });

  const lights = Math.floor(len / 50);
  for (let i = 0; i < lights; i++) {
    [-(edgeHalf + 2), edgeHalf + 2].forEach(dx => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffee88 }));
      l.position.set(cx + dx, 0.3, cz + 20 + i * 50);
      scene.add(l);
    });
  }
}

const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
function makeCloud(scene, x, y, z, scale = 1) {
  const g = new THREE.Group();
  [[0,0,0,10,6,10],[10,-1,2,8,5,8],[-10,-1,2,8,5,8],[5,4,0,7,5,7],[-5,3,-2,6,4,6]]
  .forEach(([cx,cy,cz,sx,sy,sz]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), cloudMat);
    m.scale.set(sx*scale, sy*scale, sz*scale); m.position.set(cx*scale, cy*scale, cz*scale);
    g.add(m);
  });
  g.position.set(x, y, z); scene.add(g); clouds.push(g);
}

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
const foliageMats = [
  new THREE.MeshLambertMaterial({ color: 0x2d5a1b }),
  new THREE.MeshLambertMaterial({ color: 0x3a6b22 }),
  new THREE.MeshLambertMaterial({ color: 0x245018 }),
];
function makeTree(scene, x, z) {
  const h = 5 + Math.random() * 8;
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, h, 6), trunkMat);
  trunk.position.y = h / 2;
  const top = new THREE.Mesh(new THREE.ConeGeometry(3 + Math.random() * 2, h * 1.2, 7), foliageMats[Math.floor(Math.random() * 3)]);
  top.position.y = h + h * 0.6;
  g.add(trunk); g.add(top); g.position.set(x, 0, z); scene.add(g);
}

function makeMountain(scene, x, z, h, r) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a6a55 });
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), mat);
  m.position.set(x, h / 2, z); scene.add(m);
  if (h > 200) {
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, h * 0.2, 10), new THREE.MeshLambertMaterial({ color: 0xeeeeff }));
    snow.position.set(x, h * 0.92, z); scene.add(snow);
  }
}

function makeLake(scene, x, z, w, d) {
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0x2255aa, transparent: true, opacity: 0.85 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(x, 0.05, z); scene.add(lake);
}

function makeBuilding(scene, x, z, w, d, h, col) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
  b.position.set(x, h / 2, z); scene.add(b);
}

function makeHangar(scene, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 30), new THREE.MeshLambertMaterial({ color: 0x7788aa }));
  body.position.y = 5;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 12, 8, 4), new THREE.MeshLambertMaterial({ color: 0x556677 }));
  roof.position.y = 13; roof.rotation.y = Math.PI / 4;
  g.add(body); g.add(roof); g.position.set(x, 0, z); scene.add(g);
}
