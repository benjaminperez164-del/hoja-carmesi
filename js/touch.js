'use strict';
// ---------- Controles táctiles (multitáctil) -> Input.setVirtual ----------
const Touch = (() => {
  const ui = document.getElementById('touch-ui');
  const stick = document.getElementById('stick'), knob = document.getElementById('stick-knob');
  const buttons = Array.from(ui.querySelectorAll('.tbtn[data-action]'));
  const touches = new Map();       // identifier -> { kind: 'stick'|'btn'|'tap', btn, ox, oy }
  const R = 46, DEAD = 12;         // radio del joystick y zona muerta (px CSS)
  let triedFullscreen = false;

  function enable() {
    if (!document.body.classList.contains('touch')) { document.body.classList.add('touch'); resize(); }
  }
  const isPortrait = () => window.innerHeight > window.innerWidth;

  // --- Joystick: 8 direcciones; arriba/abajo algo más estrictos para no activarlos al correr
  function setStick(dx, dy) {
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    let l = false, r = false, u = false, dn = false;
    if (d > DEAD) {
      const c = dx / d, s = dy / d;
      r = c > 0.38; l = c < -0.38; dn = s > 0.55; u = s < -0.55;
    }
    Input.setVirtual('left', l); Input.setVirtual('right', r);
    Input.setVirtual('up', u); Input.setVirtual('down', dn);
  }
  function placeStick(x, y) { stick.style.left = x + 'px'; stick.style.top = y + 'px'; }
  function homeStick() { stick.style.left = ''; stick.style.top = ''; stick.classList.remove('active'); knob.style.transform = ''; setStick(0, 0); }

  // --- Botones: prueba de impacto con margen extra
  function btnAt(x, y) {
    let best = null, bd = Infinity;
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 + (b.id === 'btn-pause' ? 10 : 16);
      const d = Math.hypot(x - cx, y - cy);
      if (d < rad && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function press(b) {
    if (!b) return;
    b.classList.add('on'); Input.setVirtual(b.dataset.action, true);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
  }
  function release(b) {
    if (!b) return;
    // mantener pulsado si otro dedo sigue sobre el mismo botón
    for (const t of touches.values()) if (t.btn === b) return;
    b.classList.remove('on'); Input.setVirtual(b.dataset.action, false);
  }

  const menuState = () => Game.state === 'title' || Game.state === 'victory' || Game.state === 'pause' || Game.state === 'levelclear' || Game.state === 'ability';
  const soundBtn = document.getElementById('btn-sound');
  function onSoundBtn(x, y) { if (!soundBtn) return false; const r = soundBtn.getBoundingClientRect(); return r.width > 0 && Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width / 2 + 8; }
  const toLogical = (cx, cy) => { const d = window.devicePixelRatio || 1; return [(cx * d - offX) / scale, (cy * d - offY) / scale]; };

  function onStart(e) {
    enable();
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      if (onSoundBtn(x, y) && Game.state !== 'title') { touches.set(t.identifier, { kind: 'none' }); Sound.unlock(); Sound.toggle(); continue; }
      if (menuState()) {
        // tocar en cualquier parte = comenzar / continuar
        touches.set(t.identifier, { kind: 'tap' });
        if (Game.state === 'title' || Game.state === 'pause') { const [lx, ly] = toLogical(x, y); if (Game.menuTap(lx, ly)) continue; if (Game.state === 'title') continue; }
        Input.setVirtual(Game.state === 'pause' ? 'pause' : 'start', true);
        continue;
      }
      const b = btnAt(x, y);
      if (b) { touches.set(t.identifier, { kind: 'btn', btn: b }); press(b); continue; }
      const stickBusy = [...touches.values()].some(v => v.kind === 'stick');
      if (!stickBusy && x < window.innerWidth * 0.45) {
        touches.set(t.identifier, { kind: 'stick', ox: x, oy: y });
        placeStick(x, y); stick.classList.add('active'); setStick(0, 0);
      } else touches.set(t.identifier, { kind: 'none' });
    }
  }
  function onMove(e) {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      if (s.kind === 'stick') {
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
        const d = Math.hypot(dx, dy);
        // el centro sigue al dedo si se aleja mucho (joystick flotante)
        if (d > R * 1.6) { const k = (d - R * 1.6) / d; s.ox += dx * k; s.oy += dy * k; placeStick(s.ox, s.oy); dx = t.clientX - s.ox; dy = t.clientY - s.oy; }
        setStick(dx, dy);
      } else if (s.kind === 'btn') {
        // deslizar el pulgar de un botón a otro
        const b = btnAt(t.clientX, t.clientY);
        if (b && b !== s.btn && b.id !== 'btn-pause') { const old = s.btn; s.btn = b; release(old); press(b); }
      }
    }
  }
  function onEnd(e) {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      touches.delete(t.identifier);
      if (s.kind === 'stick') homeStick();
      else if (s.kind === 'btn') release(s.btn);
      else if (s.kind === 'tap') { Input.setVirtual('start', false); Input.setVirtual('pause', false); }
    }
    if (e.type === 'touchend') tryFullscreen();
  }
  function releaseAll() {
    touches.clear(); homeStick();
    buttons.forEach(b => b.classList.remove('on'));
    Input.clearVirtual();
  }

  // Pantalla completa + bloqueo horizontal (Android/Chrome). En iOS Safari no existe: se ignora.
  function tryFullscreen() {
    if (triedFullscreen) return;
    triedFullscreen = true;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const lock = () => { try { const o = window.screen && window.screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {} };
    try {
      if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
        const p = req.call(el, { navigationUI: 'hide' });
        if (p && p.then) p.then(lock).catch(() => {}); else lock();
      } else lock();
    } catch (e) {}
  }

  const opts = { passive: false };
  // Escuchar en todo el documento: el lienzo y la capa táctil comparten los toques
  document.addEventListener('touchstart', onStart, opts);
  document.addEventListener('touchmove', onMove, opts);
  document.addEventListener('touchend', onEnd, opts);
  document.addEventListener('touchcancel', onEnd, opts);
  document.addEventListener('contextmenu', e => e.preventDefault());
  // Clic de ratón en el menú del título (escritorio)
  document.addEventListener('mousedown', e => { if (Game.state === 'title' || Game.state === 'pause') { const [lx, ly] = toLogical(e.clientX, e.clientY); Game.menuTap(lx, ly); } });
  document.addEventListener('gesturestart', e => e.preventDefault());   // iOS: pellizcar para zoom
  document.addEventListener('dblclick', e => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // Sincronizar estado visible y pausar si se pone en vertical
  let lastState = '';
  function sync() {
    if (Game.state !== lastState) { lastState = Game.state; document.body.dataset.state = Game.state; if (menuState()) releaseAll(); }
    if (document.body.classList.contains('touch') && isPortrait() && Game.state === 'play') { Game.state = 'pause'; releaseAll(); }
    requestAnimationFrame(sync);
  }
  sync();
  return { enable, releaseAll, touches };
})();
