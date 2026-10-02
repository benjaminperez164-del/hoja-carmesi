'use strict';
// ---------- Entrada: teclado + mando ----------
const Input = (() => {
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', KeyJ: 'jump', Space: 'jump',
    KeyX: 'attack', KeyK: 'attack',
    KeyC: 'dash', KeyL: 'dash',
    KeyV: 'heal', ShiftLeft: 'heal', ShiftRight: 'heal',
    Enter: 'start', Escape: 'pause', KeyP: 'pause',
  };
  const ACTIONS = ['left','right','up','down','jump','attack','dash','heal','start','pause'];
  const keyState = {}, latched = {};
  const virt = {}, virtLatch = {};   // entrada virtual (controles táctiles)
  const padLatch = {};               // pulsaciones de mando vistas durante pasos congelados (hit-stop)
  const cur = {}, prev = {};
  ACTIONS.forEach(a => { cur[a] = false; prev[a] = false; });
  let usingPad = false;

  window.addEventListener('keydown', e => {
    const a = KEYMAP[e.code];
    if (a) { keyState[e.code] = true; latched[e.code] = true; e.preventDefault(); usingPad = false; }
  });
  window.addEventListener('keyup', e => {
    if (KEYMAP[e.code]) { keyState[e.code] = false; e.preventDefault(); }
  });
  window.addEventListener('blur', () => { for (const k in keyState) keyState[k] = false; for (const a in virt) virt[a] = false; });

  function pollPad(state) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const any = (v) => { if (v) usingPad = true; return v; };
      state.left  = state.left  || any(b(14) || ax < -0.4);
      state.right = state.right || any(b(15) || ax > 0.4);
      state.up    = state.up    || any(b(12) || ay < -0.5);
      state.down  = state.down  || any(b(13) || ay > 0.5);
      state.jump  = state.jump  || any(b(0));
      state.attack= state.attack|| any(b(2));
      state.dash  = state.dash  || any(b(1) || b(5) || b(7));
      state.heal  = state.heal  || any(b(3) || b(4) || b(6));
      state.start = state.start || any(b(9));
      state.pause = state.pause || any(b(8));
    }
  }

  // Llamado una vez por paso fijo de simulación. frozen = paso congelado por el hit-stop: no se consume nada
  // (teclado y táctil ya quedan retenidos en sus latch; el mando se muestrea y se retiene aquí) y se entrega en el primer paso real.
  function update(frozen) {
    if (frozen) { try { const s = {}; pollPad(s); for (const a in s) if (s[a]) padLatch[a] = true; } catch (e) {} return; }
    const s = {};
    ACTIONS.forEach(a => s[a] = false);
    for (const code in keyState) if (keyState[code] || latched[code]) s[KEYMAP[code]] = true;
    for (const code in latched) latched[code] = false;
    for (const a in virt) if (virt[a] || virtLatch[a]) s[a] = true;
    for (const a in virtLatch) virtLatch[a] = false;
    try { pollPad(s); } catch (e) { /* sin mando */ }
    for (const a in padLatch) { if (padLatch[a]) s[a] = true; padLatch[a] = false; }
    ACTIONS.forEach(a => { prev[a] = cur[a]; cur[a] = s[a]; });
  }
  // on=true pulsa, on=false suelta. Una pulsación corta nunca se pierde (se retiene un paso).
  function setVirtual(a, on) {
    if (on && !virt[a]) virtLatch[a] = true;
    virt[a] = !!on;
  }
  function clearVirtual() { for (const a in virt) virt[a] = false; }
  return {
    update, setVirtual, clearVirtual,
    down: a => cur[a],
    pressed: a => cur[a] && !prev[a],
    released: a => !cur[a] && prev[a],
    get usingPad() { return usingPad; },
  };
})();
