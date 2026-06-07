import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════
//  Route Renderer — Three.js로 경로 라인을 씬에 그리는 모듈
// ═══════════════════════════════════════════════════════════════════

const COLOR_MAP = {
  red:    '#ff2200',
  yellow: '#ffaa00',
  green:  '#00ff88',
  cyan:   '#00ffff',
};

let _scene      = null;
let _lineGroups = [];
let _visible    = true;

export function initRouteRenderer(scene) {
  _scene      = scene;
  _lineGroups = [];
  _visible    = true;
}

function clearLines() {
  _lineGroups.forEach(lines => {
    lines.forEach(line => {
      _scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
  });
  _lineGroups = [];
}

function makeRouteLine(points, colorHex, opacity) {
  const positions = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    positions[i * 3]     = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color:       new THREE.Color(colorHex),
    transparent: true,
    opacity,
    depthTest:   false,
    fog:         false,
  });
  return new THREE.Line(geo, mat);
}

export function updateRouteLines(routes, bestIdx) {
  if (!_scene) return;
  clearLines();

  routes.forEach((route, idx) => {
    if (!route.points || route.points.length < 2) return;

    const colorHex = COLOR_MAP[route.color] ?? COLOR_MAP.yellow;
    const isBest   = idx === bestIdx;
    const lines    = [];

    if (isBest) {
      const line1 = makeRouteLine(route.points, colorHex, 1.0);
      const offsetPoints = route.points.map(p => new THREE.Vector3(p.x + 0.8, p.y, p.z));
      const line2 = makeRouteLine(offsetPoints, colorHex, 0.7);
      line1.visible = _visible;
      line2.visible = _visible;
      _scene.add(line1);
      _scene.add(line2);
      lines.push(line1, line2);
    } else {
      const line = makeRouteLine(route.points, colorHex, 0.45);
      line.visible = _visible;
      _scene.add(line);
      lines.push(line);
    }

    _lineGroups.push(lines);
  });
}

export function setRoutesVisible(visible) {
  _visible = visible;
  _lineGroups.forEach(lines => {
    lines.forEach(line => { line.visible = visible; });
  });
}
