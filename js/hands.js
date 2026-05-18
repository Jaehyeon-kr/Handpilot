export const gesture = { W: false, S: false, A: false, D: false, Q: false, E: false };
export let handActive = false;

let stickTiltX = 0, stickTiltY = 0, stickThrottle = 0;
let leftDetected = false, rightDetected = false;

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]];

let gestureHud, stickCanvas, sCtx, handOverlay, hoCtx;

export function initHands() {
  gestureHud = document.getElementById('gesture-hud');
  stickCanvas = document.getElementById('stickCanvas');
  sCtx = stickCanvas.getContext('2d');
  handOverlay = document.getElementById('handOverlay');
  hoCtx = handOverlay.getContext('2d');

  setInterval(drawStick, 50);
  initMediaPipe();
}

function drawHandLandmarks(lm, color, label) {
  const W = 240, H = 180;
  hoCtx.strokeStyle = color; hoCtx.lineWidth = 1.5;
  for (const [a,b] of HAND_CONNECTIONS) {
    hoCtx.beginPath(); hoCtx.moveTo(lm[a].x * W, lm[a].y * H);
    hoCtx.lineTo(lm[b].x * W, lm[b].y * H); hoCtx.stroke();
  }
  for (const p of lm) {
    hoCtx.beginPath(); hoCtx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
    hoCtx.fillStyle = color; hoCtx.fill();
  }
  hoCtx.fillStyle = color; hoCtx.font = 'bold 11px monospace';
  hoCtx.fillText(label, lm[0].x * W - 15, lm[0].y * H + 18);
}

function drawStick() {
  const W = 180, H = 180;
  stickCanvas.width = W; stickCanvas.height = H;
  const cx = W / 2, cy = H / 2, R = 65;

  sCtx.beginPath(); sCtx.arc(cx, cy, R + 8, 0, Math.PI * 2);
  sCtx.fillStyle = 'rgba(0,0,30,0.6)'; sCtx.fill();
  sCtx.strokeStyle = 'rgba(0,255,255,0.3)'; sCtx.lineWidth = 1.5; sCtx.stroke();

  sCtx.strokeStyle = 'rgba(0,255,255,0.15)'; sCtx.lineWidth = 1;
  sCtx.beginPath(); sCtx.moveTo(cx - R, cy); sCtx.lineTo(cx + R, cy); sCtx.stroke();
  sCtx.beginPath(); sCtx.moveTo(cx, cy - R); sCtx.lineTo(cx, cy + R); sCtx.stroke();

  sCtx.fillStyle = 'rgba(0,255,255,0.4)'; sCtx.font = '9px monospace'; sCtx.textAlign = 'center';
  sCtx.fillText('UP', cx, cy - R - 4); sCtx.fillText('DOWN', cx, cy + R + 12);
  sCtx.fillText('L', cx - R - 8, cy + 3); sCtx.fillText('R', cx + R + 8, cy + 3);

  const hx = cx + stickTiltX * R * 0.8;
  const hy = cy + stickTiltY * R * 0.8;

  sCtx.strokeStyle = 'rgba(200,200,200,0.5)'; sCtx.lineWidth = 3;
  sCtx.beginPath(); sCtx.moveTo(cx, cy); sCtx.lineTo(hx, hy); sCtx.stroke();

  const handleColor = stickThrottle > 0.3 ?
    `rgba(${Math.floor(255*stickThrottle)},${Math.floor(255*(1-stickThrottle*0.5))},0,0.9)` :
    'rgba(0,255,200,0.8)';
  sCtx.beginPath(); sCtx.arc(hx, hy, 14, 0, Math.PI * 2);
  sCtx.fillStyle = handleColor; sCtx.fill();
  sCtx.strokeStyle = '#fff'; sCtx.lineWidth = 2; sCtx.stroke();

  if (stickThrottle > 0.1) {
    sCtx.fillStyle = '#000'; sCtx.font = 'bold 10px monospace'; sCtx.textAlign = 'center';
    sCtx.fillText(Math.round(stickThrottle * 100), hx, hy + 4);
  }

  sCtx.font = '9px monospace';
  sCtx.textAlign = 'left'; sCtx.fillStyle = leftDetected ? '#0f0' : '#f44';
  sCtx.fillText(leftDetected ? 'L: OK' : 'L: --', 4, H - 4);
  sCtx.textAlign = 'right'; sCtx.fillStyle = rightDetected ? '#0f0' : '#f44';
  sCtx.fillText(rightDetected ? 'R: OK' : 'R: --', W - 4, H - 4);
}

function getFingerClosedCount(lm) {
  return [lm[8].y > lm[6].y, lm[12].y > lm[10].y, lm[16].y > lm[14].y, lm[20].y > lm[18].y].filter(Boolean).length;
}

async function initMediaPipe() {
  try {
    const video = document.getElementById('webcam');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    video.srcObject = stream;
    await video.play();

    const hands = new window.Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
    });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });

    hands.onResults(results => {
      handOverlay.width = 240; handOverlay.height = 180;
      hoCtx.clearRect(0, 0, 240, 180);

      const landmarks = results.multiHandLandmarks || [];
      const handedness = results.multiHandedness || [];
      leftDetected = false; rightDetected = false;
      let leftLm = null, rightLm = null;

      for (let i = 0; i < landmarks.length; i++) {
        const label = handedness[i]?.label || '';
        if (label === 'Right') { leftLm = landmarks[i]; leftDetected = true; }
        else if (label === 'Left') { rightLm = landmarks[i]; rightDetected = true; }
      }
      handActive = leftDetected || rightDetected;

      if (leftLm)  drawHandLandmarks(leftLm,  '#00ff88', 'L');
      if (rightLm) drawHandLandmarks(rightLm, '#ff8800', 'R');

      // PULL / PUSH 기준선
      const OW = 240, OH = 180;
      const pullY = 0.55 * OH, pushY = 0.45 * OH;
      hoCtx.strokeStyle = '#4488ff'; hoCtx.lineWidth = 1.5; hoCtx.setLineDash([6, 4]);
      hoCtx.beginPath(); hoCtx.moveTo(0, pushY); hoCtx.lineTo(OW, pushY); hoCtx.stroke();
      hoCtx.strokeStyle = '#ff4444';
      hoCtx.beginPath(); hoCtx.moveTo(0, pullY); hoCtx.lineTo(OW, pullY); hoCtx.stroke();
      hoCtx.setLineDash([]);
      hoCtx.font = 'bold 10px monospace';
      hoCtx.fillStyle = '#4488ff'; hoCtx.fillText('▲ PUSH (기수↓)', 4, pushY - 4);
      hoCtx.fillStyle = '#ff4444'; hoCtx.fillText('▼ PULL (기수↑)', 4, pullY + 12);

      // 왼손: 조향
      if (leftLm) {
        const wrist = leftLm[0], middleBase = leftLm[9];
        const tiltX = -(middleBase.x - wrist.x);
        const TILT_THRESH = 0.03;
        const tiltNorm = Math.max(-1, Math.min(1, tiltX / 0.2));
        stickTiltX = stickTiltX * 0.6 + tiltNorm * 0.4;
        gesture.A = tiltX < -TILT_THRESH;
        gesture.D = tiltX >  TILT_THRESH;
        const heightNorm = Math.max(-1, Math.min(1, (wrist.y - 0.5) / 0.3));
        stickTiltY = stickTiltY * 0.6 + heightNorm * 0.4;
      } else {
        gesture.A = gesture.D = false;
        stickTiltX *= 0.85; stickTiltY *= 0.85;
      }

      // 오른손: 동력 + 피치
      if (rightLm) {
        const closedCount = getFingerClosedCount(rightLm);
        gesture.W = closedCount >= 3;
        gesture.S = closedCount <= 1;
        stickThrottle = gesture.W ? Math.min(1, stickThrottle + 0.08) : stickThrottle * 0.85;
        const rY = rightLm[0].y;
        gesture.Q = rY > 0.55;
        gesture.E = rY < 0.45;
      } else {
        gesture.W = gesture.S = gesture.Q = gesture.E = false;
        stickThrottle *= 0.85;
      }

      // HUD
      const acts = [];
      if (gesture.W) acts.push('THR'); if (gesture.S) acts.push('BRK');
      if (gesture.A) acts.push('< L'); if (gesture.D) acts.push('R >');
      if (gesture.Q) acts.push('PULL'); if (gesture.E) acts.push('PUSH');
      gestureHud.innerHTML =
        `<span style="color:#0f8">L:${leftDetected?'조향':'--'}</span> | ` +
        `<span style="color:#f80">R:${rightDetected?'동력':'--'}</span>` +
        (acts.length ? `<br>${acts.join('  ')}` : '');
    });

    async function detectLoop() {
      await hands.send({ image: video });
      requestAnimationFrame(detectLoop);
    }
    detectLoop();
    gestureHud.textContent = 'HAND: 카메라 시작...';
  } catch (err) {
    console.warn('MediaPipe init failed:', err);
    gestureHud.textContent = 'HAND: 초기화 실패';
  }
}
