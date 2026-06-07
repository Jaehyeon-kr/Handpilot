// ═══════════════════════════════════════════════════════════════════
//  Model Panel — Ghost Route Planner HUD UI 모듈 (DOM only, no THREE)
// ═══════════════════════════════════════════════════════════════════

// 내부 상태
let _assistEnabled  = false;
let _routesVisible  = true;
let _panel          = null;
let _contentEl      = null;
let _routesBtnEl    = null;
let _assistBtnEl    = null;
let _rolloutBtnEl   = null;
let _rolloutStatusEl = null;
let _onRolloutClick = null;  // main.js에서 주입하는 콜백

// ─── 패널 DOM 생성 ─────────────────────────────────────────────────
export function initModelPanel() {
  if (_panel) return;  // 중복 방지

  _panel = document.createElement('div');
  _panel.id = 'ghost-route-panel';
  Object.assign(_panel.style, {
    position:       'fixed',
    top:            '360px',
    left:           '16px',
    zIndex:         '2000',
    width:          '180px',
    color:          '#bff',
    fontSize:       '11px',
    fontFamily:     "'Courier New', monospace",
    background:     'rgba(0,0,20,0.58)',
    border:         '1px solid rgba(0,255,255,0.32)',
    borderRadius:   '8px',
    padding:        '8px',
    pointerEvents:  'auto',
    isolation:      'isolate',
  });

  // 타이틀
  const title = document.createElement('div');
  title.style.cssText = 'color:#0ff; font-weight:bold; margin-bottom:5px;';
  title.textContent   = 'GHOST ROUTES  [physics preview]';
  _panel.appendChild(title);

  // 구분선
  _panel.appendChild(_makeSep());

  // 콘텐츠 영역 (updateModelPanel이 채움)
  _contentEl = document.createElement('div');
  _contentEl.style.cssText = 'min-height:64px; margin-bottom:6px;';
  _panel.appendChild(_contentEl);

  // 구분선
  _panel.appendChild(_makeSep());

  // 버튼 행
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:4px; margin-top:4px;';

  _routesBtnEl = _makeBtn('Routes ON/OFF');
  _routesBtnEl.addEventListener('click', () => {
    _routesVisible = !_routesVisible;
    _routesBtnEl.style.color     = _routesVisible ? '#0ff' : '#666';
    _routesBtnEl.style.borderColor = _routesVisible ? 'rgba(0,255,255,0.4)' : 'rgba(100,100,100,0.4)';
  });

  _assistBtnEl = _makeBtn('Assist OFF');
  _assistBtnEl.addEventListener('click', () => {
    _assistEnabled = !_assistEnabled;
    _assistBtnEl.textContent   = _assistEnabled ? 'Assist ON' : 'Assist OFF';
    _assistBtnEl.style.color   = _assistEnabled ? '#0f0' : '#0ff';
  });

  btnRow.appendChild(_routesBtnEl);
  btnRow.appendChild(_assistBtnEl);
  _panel.appendChild(btnRow);

  // Auto Rollout 행
  _panel.appendChild(_makeSep());

  // 설명 텍스트
  const desc = document.createElement('div');
  desc.style.cssText = 'color:#888; font-size:9px; line-height:1.5; margin-bottom:4px;';
  desc.innerHTML = '목표: <span style="color:#ff8">이륙</span> → <span style="color:#0f8">WP1 통과</span><br>조건: WP1 통과 | 추락 | 45s 타임아웃';
  _panel.appendChild(desc);

  _rolloutStatusEl = document.createElement('div');
  _rolloutStatusEl.style.cssText = 'color:#888; font-size:10px; margin-bottom:4px;';
  _rolloutStatusEl.textContent   = 'Auto Rollout: idle';
  _panel.appendChild(_rolloutStatusEl);

  const rolloutRow = document.createElement('div');
  rolloutRow.style.cssText = 'display:flex; gap:4px;';

  _rolloutBtnEl = _makeBtn('▶ Auto x10');
  _rolloutBtnEl.style.flexGrow = '1';
  _rolloutBtnEl.addEventListener('click', () => { _onRolloutClick?.(); });
  rolloutRow.appendChild(_rolloutBtnEl);
  _panel.appendChild(rolloutRow);

  document.body.appendChild(_panel);
}

// ─── Auto Rollout 콜백 등록 ────────────────────────────────────────
export function onRolloutBtnClick(cb) { _onRolloutClick = cb; }

// ─── Auto Rollout 상태 갱신 ───────────────────────────────────────
export function updateRolloutStatus({ running, done, total }) {
  if (!_rolloutStatusEl || !_rolloutBtnEl) return;
  if (running) {
    _rolloutStatusEl.textContent   = `Rollout: ${done}/${total} ep`;
    _rolloutStatusEl.style.color   = '#0f0';
    _rolloutBtnEl.textContent      = '■ Stop';
    _rolloutBtnEl.style.color      = '#f44';
    _rolloutBtnEl.style.borderColor = 'rgba(255,80,80,0.5)';
  } else {
    _rolloutStatusEl.textContent   = done >= total && total > 0
      ? `Done: ${done} ep — exported!` : 'Auto Rollout: idle';
    _rolloutStatusEl.style.color   = done >= total && total > 0 ? '#0ff' : '#888';
    _rolloutBtnEl.textContent      = '▶ Auto x10';
    _rolloutBtnEl.style.color      = '#0ff';
    _rolloutBtnEl.style.borderColor = 'rgba(0,255,255,0.4)';
  }
}

// ─── 패널 내용 갱신 ────────────────────────────────────────────────
export function updateModelPanel(routes, bestIdx) {
  if (!_contentEl) return;

  if (!routes || routes.length === 0) {
    _contentEl.innerHTML = '<span style="color:#666">Calculating...</span>';
    return;
  }

  const best = routes[bestIdx];
  if (!best) return;

  const takeoffStr  = best.takeoffTime != null ? `${best.takeoffTime}s` : 'N/A';
  const scoreStr    = best.score.toFixed(2);
  const stallColor  = best.stallRisk === 'High' ? '#ff4400' : best.stallRisk === 'Med' ? '#ffaa00' : '#00ff88';

  _contentEl.innerHTML = `
<div style="margin:2px 0"><span style="color:#0ff">Best:</span> ${_esc(best.label)}</div>
<div style="margin:2px 0"><span style="color:#0ff">Takeoff:</span> ${takeoffStr}</div>
<div style="margin:2px 0"><span style="color:#0ff">Stall Risk:</span> <span style="color:${stallColor}">${best.stallRisk}</span></div>
<div style="margin:2px 0"><span style="color:#0ff">Score:</span> ${scoreStr}</div>
`.trim();
}

// ─── getter ───────────────────────────────────────────────────────
export function isAssistEnabled()  { return _assistEnabled; }
export function areRoutesVisible() { return _routesVisible; }

// ─── 내부 헬퍼 ────────────────────────────────────────────────────
function _makeSep() {
  const hr = document.createElement('div');
  hr.style.cssText = 'border-top:1px solid rgba(0,255,255,0.2); margin:4px 0;';
  return hr;
}

function _makeBtn(label) {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    height:          '24px',
    padding:         '0 7px',
    margin:          '2px 1px 0 0',
    color:           '#0ff',
    background:      'rgba(0,255,255,0.08)',
    border:          '1px solid rgba(0,255,255,0.4)',
    borderRadius:    '4px',
    font:            'inherit',
    cursor:          'pointer',
    pointerEvents:   'auto',
    position:        'relative',
    zIndex:          '1',
    fontSize:        '10px',
  });
  btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(0,255,255,0.18)'; });
  btn.addEventListener('mouseout',  () => { btn.style.background = 'rgba(0,255,255,0.08)'; });
  return btn;
}

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
