import { st, GROUND_Y, STALL_SPEED } from './physics.js';
import { LAND_RW_X, LAND_TOUCH_Z, GLIDE_ANGLE } from './waypoint.js';

let spdEl, altEl, vsiEl, hdgEl, phaseEl, gsEl, bannerEl, thrFill;
let ahiCanvas, ahiCtx, mmCanvas, mmCtx;

export function initHUD() {
  spdEl    = document.getElementById('spd');
  altEl    = document.getElementById('alt');
  vsiEl    = document.getElementById('vsi');
  hdgEl    = document.getElementById('hdg');
  phaseEl  = document.getElementById('phase');
  gsEl     = document.getElementById('gs');
  bannerEl = document.getElementById('banner');
  thrFill  = document.getElementById('throttle-fill');
  ahiCanvas = document.getElementById('ahi');
  ahiCtx    = ahiCanvas.getContext('2d');
  mmCanvas  = document.getElementById('minimap');
  mmCtx     = mmCanvas.getContext('2d');
}

export function showBanner(text, color = '#ffff00') {
  bannerEl.textContent = text;
  bannerEl.style.color = color;
  bannerEl.style.textShadow = `0 0 30px ${color}`;
  bannerEl.style.opacity = '1';
  setTimeout(() => bannerEl.style.opacity = '0', 2500);
}

export function updateHUD(wpObjects) {
  spdEl.textContent = (st.speed * 3.6).toFixed(0);
  altEl.textContent = Math.max(0, st.pos.y - GROUND_Y).toFixed(0);
  vsiEl.textContent = (st.vSpeed > 0 ? '+' : '') + st.vSpeed.toFixed(1);
  hdgEl.textContent = ((360 - (st.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(0);
  phaseEl.textContent = st.stall ? '⚠ STALL' : st.phase === 'ground' ? 'GROUND' : 'AIRBORNE';
  phaseEl.style.color = st.stall ? '#ff4444' : '#00ffcc';
  thrFill.style.height = (st.thrust * 100) + '%';

  // G/S
  if (st.phase === 'air' && Math.abs(st.pos.x - LAND_RW_X) < 300 && st.pos.z < LAND_TOUCH_Z) {
    const dist   = LAND_TOUCH_Z - st.pos.z;
    const idealH = Math.tan(GLIDE_ANGLE * Math.PI / 180) * dist + GROUND_Y;
    const dev    = st.pos.y - idealH;
    gsEl.textContent = (dev > 0 ? '▲+' : '▼') + dev.toFixed(0) + 'm';
    gsEl.style.color  = Math.abs(dev) < 15 ? '#00ffcc' : Math.abs(dev) < 40 ? '#ffaa00' : '#ff4444';
  } else {
    gsEl.textContent = '--';
    gsEl.style.color = '#ffffff';
  }

  drawAHI(st.pitch, st.roll);
  drawMinimap(wpObjects);
}

function drawAHI(pitch, roll) {
  const w = 120, h = 120, cx = 60, cy = 60, r = 52;
  ahiCtx.clearRect(0, 0, w, h);
  ahiCtx.save();
  ahiCtx.beginPath(); ahiCtx.arc(cx, cy, r, 0, Math.PI * 2); ahiCtx.clip();
  ahiCtx.translate(cx, cy); ahiCtx.rotate(-roll); ahiCtx.translate(-cx, -cy);
  const pitchPx = pitch * 150;
  ahiCtx.fillStyle = '#4488cc'; ahiCtx.fillRect(0, 0, w, cy + pitchPx);
  ahiCtx.fillStyle = '#886633'; ahiCtx.fillRect(0, cy + pitchPx, w, h);
  ahiCtx.fillStyle = '#ffffff'; ahiCtx.fillRect(0, cy + pitchPx - 1, w, 2);
  for (let deg = -30; deg <= 30; deg += 10) {
    if (deg === 0) continue;
    const y = cy + pitchPx + deg * 5;
    const lw = deg % 20 === 0 ? 24 : 14;
    ahiCtx.fillRect(cx - lw / 2, y - 0.5, lw, 1.5);
  }
  ahiCtx.restore();
  ahiCtx.strokeStyle = '#ffff00'; ahiCtx.lineWidth = 2.5; ahiCtx.beginPath();
  ahiCtx.moveTo(cx - 22, cy); ahiCtx.lineTo(cx - 8, cy);
  ahiCtx.moveTo(cx - 8, cy); ahiCtx.lineTo(cx, cy + 5);
  ahiCtx.moveTo(cx, cy + 5); ahiCtx.lineTo(cx + 8, cy);
  ahiCtx.moveTo(cx + 8, cy); ahiCtx.lineTo(cx + 22, cy);
  ahiCtx.moveTo(cx, cy + 5); ahiCtx.lineTo(cx, cy + 10);
  ahiCtx.stroke();
  ahiCtx.strokeStyle = 'rgba(0,255,255,0.6)'; ahiCtx.lineWidth = 2;
  ahiCtx.beginPath(); ahiCtx.arc(cx, cy, r, 0, Math.PI * 2); ahiCtx.stroke();
}

function drawMinimap(wpObjects) {
  const w = 110, h = 110, cx = 55, cy = 55, r = 50;
  mmCtx.clearRect(0, 0, w, h);
  mmCtx.save();
  mmCtx.beginPath(); mmCtx.arc(cx, cy, r, 0, Math.PI * 2); mmCtx.clip();
  mmCtx.fillStyle = '#1a2a1a'; mmCtx.fillRect(0, 0, w, h);

  const scale = 0.04;
  mmCtx.fillStyle = '#445';
  mmCtx.fillRect(cx - 3, cy - r, 6, r * 2);

  const px = cx - st.pos.x * scale;
  const py = cy - st.pos.z * scale * 0.3;
  mmCtx.save(); mmCtx.translate(px, py); mmCtx.rotate(-st.yaw);
  mmCtx.fillStyle = '#0ff'; mmCtx.beginPath();
  mmCtx.moveTo(0, -6); mmCtx.lineTo(-4, 4); mmCtx.lineTo(0, 2); mmCtx.lineTo(4, 4);
  mmCtx.closePath(); mmCtx.fill(); mmCtx.restore();

  if (wpObjects) {
    wpObjects.forEach((wp, i) => {
      if (!wp.active) return;
      const wx = cx - wp.pos.x * scale;
      const wz = cy - wp.pos.z * scale * 0.3;
      mmCtx.beginPath(); mmCtx.arc(wx, wz, 4, 0, Math.PI * 2);
      mmCtx.fillStyle = wp.passed ? '#0f0' : '#ff0';
      mmCtx.fill();
      mmCtx.fillStyle = '#fff'; mmCtx.font = '7px monospace'; mmCtx.textAlign = 'center';
      mmCtx.fillText(String(i + 1), wx, wz + 2.5);
    });
  }

  mmCtx.restore();
  mmCtx.strokeStyle = 'rgba(0,255,255,0.4)'; mmCtx.lineWidth = 1.5;
  mmCtx.beginPath(); mmCtx.arc(cx, cy, r, 0, Math.PI * 2); mmCtx.stroke();
}
