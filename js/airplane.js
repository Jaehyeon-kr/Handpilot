import * as THREE from 'three';

export function makeAirplane(scene) {
  const g = new THREE.Group();

  const bodyMat    = new THREE.MeshPhongMaterial({ color: 0xe8eef5, shininess: 80 });
  const darkMat    = new THREE.MeshPhongMaterial({ color: 0x223344, shininess: 40 });
  const glassMat   = new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.55, shininess: 120 });
  const engineMat  = new THREE.MeshPhongMaterial({ color: 0x445566, shininess: 60 });
  const intakeMat  = new THREE.MeshPhongMaterial({ color: 0x111122 });
  const accentMat  = new THREE.MeshPhongMaterial({ color: 0x2255cc });

  // 동체
  const fuselage = new THREE.Group();
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.1, 5, 12), bodyMat);
  nose.rotation.z = Math.PI / 2; nose.position.x = 8.5;
  fuselage.add(nose);

  const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 11, 12), bodyMat);
  mid.rotation.z = Math.PI / 2; mid.position.x = 2.5;
  fuselage.add(mid);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 7, 12), bodyMat);
  tail.rotation.z = -Math.PI / 2; tail.position.x = -5.5;
  fuselage.add(tail);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bodyMat);
  belly.position.set(2, -0.4, 0);
  fuselage.add(belly);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 8, 12), accentMat);
  stripe.rotation.z = Math.PI / 2; stripe.position.x = 3; stripe.scale.y = 0.08;
  fuselage.add(stripe);
  g.add(fuselage);

  // 조종석
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), glassMat);
  cockpit.scale.set(1.4, 0.6, 0.9); cockpit.position.set(6.5, 0.7, 0);
  g.add(cockpit);

  // 주날개
  function makeTaperedWing(side) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(3.5, 0); shape.lineTo(2.0, side * 10); shape.lineTo(-0.5, side * 10); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
    const wing = new THREE.Mesh(geo, bodyMat);
    wing.rotation.x = Math.PI / 2; wing.position.set(-0.5, -0.1, 0);
    if (side < 0) wing.scale.z = -1;
    return wing;
  }
  g.add(makeTaperedWing(1)); g.add(makeTaperedWing(-1));

  // 윙렛
  [-10, 10].forEach(z => {
    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.8), accentMat);
    winglet.position.set(1.5, 0.7, z); winglet.rotation.z = Math.sign(z) * 0.2;
    g.add(winglet);
  });

  // 수평 꼬리날개
  function makeTailWing(side) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(2.0, 0); shape.lineTo(1.0, side * 4.5); shape.lineTo(-0.3, side * 4.5); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
    const w = new THREE.Mesh(geo, bodyMat);
    w.rotation.x = Math.PI / 2; w.position.set(-8.5, 0.2, 0);
    if (side < 0) w.scale.z = -1;
    return w;
  }
  g.add(makeTailWing(1)); g.add(makeTailWing(-1));

  // 수직 꼬리날개
  const vtShape = new THREE.Shape();
  vtShape.moveTo(0, 0); vtShape.lineTo(2.5, 0); vtShape.lineTo(1.2, 4.5); vtShape.lineTo(-0.5, 4.5); vtShape.closePath();
  const vtGeo = new THREE.ExtrudeGeometry(vtShape, { depth: 0.15, bevelEnabled: false });
  const vtail = new THREE.Mesh(vtGeo, bodyMat);
  vtail.position.set(-8.5, 0.4, -0.075);
  g.add(vtail);

  // 엔진
  function makeEngine(z) {
    const eg = new THREE.Group();
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.6), darkMat);
    pylon.position.y = -0.8; eg.add(pylon);
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 4.5, 12), engineMat);
    nacelle.rotation.z = Math.PI / 2; nacelle.position.set(0, -1.9, 0); eg.add(nacelle);
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.08, 8, 16), intakeMat);
    intake.rotation.y = Math.PI / 2; intake.position.set(2.3, -1.9, 0); eg.add(intake);
    for (let b = 0; b < 8; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.12), darkMat);
      blade.position.set(2.1, -1.9, 0);
      blade.rotation.x = (b / 8) * Math.PI * 2;
      blade.position.y += Math.sin((b / 8) * Math.PI * 2) * 0.35;
      blade.position.z += Math.cos((b / 8) * Math.PI * 2) * 0.35;
      eg.add(blade);
    }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.2, 10), darkMat);
    nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-2.5, -1.9, 0); eg.add(nozzle);
    eg.position.set(1.0, 0, z);
    return eg;
  }
  g.add(makeEngine(-4.5)); g.add(makeEngine(4.5));

  // 착륙장치
  const gearMat = new THREE.MeshPhongMaterial({ color: 0x333344, shininess: 30 });
  const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
  function makeGear(x, z, legLen = 2.2) {
    const gg = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, legLen, 6), gearMat);
    leg.position.y = -legLen / 2; gg.add(leg);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), gearMat);
    axle.rotation.z = Math.PI / 2; axle.position.y = -legLen; gg.add(axle);
    [-0.4, 0.4].forEach(dz => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.18, 8, 14), wheelMat);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(0, -legLen, dz); gg.add(wheel);
    });
    gg.position.set(x, 0, z);
    return gg;
  }
  const noseGear = makeGear(5.5, 0, 1.8);
  const mainGearL = makeGear(0, -3.5, 2.2);
  const mainGearR = makeGear(0,  3.5, 2.2);
  g.add(noseGear); g.add(mainGearL); g.add(mainGearR);

  // 항법등
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  navGreen.position.set(1.5, 0, 10.2); g.add(navGreen);
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navRed.position.set(1.5, 0, -10.2); g.add(navRed);
  const strobeW = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobeW.position.set(-9, 1.2, 0); g.add(strobeW);

  const wrapper = new THREE.Group();
  wrapper.add(g);
  scene.add(wrapper);
  return { group: wrapper, noseGear, mainGearL, mainGearR, strobeW };
}
