'use strict';
// ---------- Bucle principal, salas, cámara, HUD y pantallas ----------
const VW = 480, VH = 272, STEP = 1 / 60;
const GAME_TITLE = 'HOJA CARMESÍ', GAME_SUB = 'Ecos del Abismo';
const IS_TOUCH = () => document.body.classList.contains('touch');

const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
const view = document.createElement('canvas'); view.width = VW; view.height = VH;
const ctx = view.getContext('2d');
let scale = 2, offX = 0, offY = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  const isTouch = document.body.classList.contains('touch');
  if (isTouch) {
    // Móvil: llenar la pantalla manteniendo proporción; escala entera solo si apenas se pierde espacio
    const s = Math.min(W * dpr / VW, H * dpr / VH), si = Math.floor(s);
    scale = (si >= 1 && si / s > 0.9) ? si : s;
  } else {
    let s = Math.min(W / VW, H / VH);
    if (s >= 1) s = Math.floor(s);
    scale = s * dpr;
  }
  screen.width = Math.floor(W * dpr); screen.height = Math.floor(H * dpr);
  screen.style.width = W + 'px'; screen.style.height = H + 'px';
  offX = Math.floor((screen.width - VW * scale) / 2); offY = Math.floor((screen.height - VH * scale) / 2);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------- Pre-render de baldosas por sala ----------
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r * k)) | 0; g = Math.max(0, Math.min(255, g * k)) | 0; b = Math.max(0, Math.min(255, b * k)) | 0;
  return `rgb(${r},${g},${b})`;
}
function renderRoomTiles(room) {
  const c = document.createElement('canvas'); c.width = room.pw; c.height = room.ph;
  const g = c.getContext('2d');
  const base = room.tint;
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
    const t = room.grid[y][x], px = x * TILE, py = y * TILE;
    const wx = x + room.ox, wy = y + room.oy;
    if (t === T_SOLID) {
      const r = hash(wx, wy);
      g.fillStyle = shade(base, 0.55 + r * 0.12); g.fillRect(px, py, TILE, TILE);
      // ladrillos
      g.fillStyle = shade(base, 0.42);
      g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + ((wy % 2) ? 5 : 11), py, 1, 7); g.fillRect(px + ((wy % 2) ? 12 : 3), py + 8, 1, 8);
      if (r > 0.8) { g.fillStyle = shade(base, 0.75); g.fillRect(px + 3, py + 10, 3, 2); }
      const above = World.tileAt(wx, wy - 1), below = World.tileAt(wx, wy + 1);
      const left = World.tileAt(wx - 1, wy), right = World.tileAt(wx + 1, wy);
      if (above !== T_SOLID) {
        g.fillStyle = shade(base, 1.35); g.fillRect(px, py, TILE, 2);
        g.fillStyle = shade(base, 0.95); g.fillRect(px, py + 2, TILE, 1);
        if (r > 0.55) { g.fillStyle = '#4f8f6a'; g.fillRect(px + (r * 12 | 0), py - 2, 2, 2); g.fillRect(px + (r * 7 | 0) + 4, py - 1, 1, 1); }
      }
      if (below !== T_SOLID) { g.fillStyle = shade(base, 0.3); g.fillRect(px, py + TILE - 2, TILE, 2); }
      if (left !== T_SOLID) { g.fillStyle = shade(base, 0.85); g.fillRect(px, py, 1, TILE); }
      if (right !== T_SOLID) { g.fillStyle = shade(base, 0.35); g.fillRect(px + TILE - 1, py, 1, TILE); }
    } else if (t === T_SPIKE) {
      g.fillStyle = shade(base, 0.35); g.fillRect(px, py + 13, TILE, 3);
      for (let i = 0; i < 4; i++) {
        const sx = px + i * 4;
        g.fillStyle = '#c9cfe6'; g.beginPath(); g.moveTo(sx, py + 14); g.lineTo(sx + 2, py + 5); g.lineTo(sx + 4, py + 14); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(sx + 2, py + 5, 1, 4);
        g.fillStyle = '#7b809c'; g.fillRect(sx + 3, py + 10, 1, 4);
      }
    } else if (t === T_PLAT) {
      g.fillStyle = shade(base, 1.2); g.fillRect(px, py, TILE, 2);
      g.fillStyle = shade(base, 0.7); g.fillRect(px, py + 2, TILE, 3);
      g.fillStyle = shade(base, 0.45); g.fillRect(px + 2, py + 5, 2, 3); g.fillRect(px + 12, py + 5, 2, 3);
    }
  }
  room.canvas = c;
}

// ---------- Estado del juego ----------
const Game = {
  state: 'title', t: 0, player: new Player(), enemies: [], hazards: [], objs: [], boss: null,
  cam: { x: 0, y: 0 }, room: null, banner: null, toasts: [], fade: 0, fadeDir: 0,
  respawn: { room: 'santuario', tx: 14, ty: 15 }, bossDown: false, shard: false, killed: new Set(),
  flashHud: 0, deadT: 0, victoryT: 0, playTime: 0, timeScale: 1, slowT: 0, titleT: 0,

  hittables() { const l = this.enemies.filter(e => !e.dead); if (this.boss && !this.boss.dead) l.push(this.boss); return l; },

  newGame() {
    this.player = new Player();
    this.bossDown = false; this.shard = false; this.playTime = 0; this.killed = new Set();
    World.rooms.forEach(r => { r.visited = false; });
    this.resetBossEncounter();
    this.respawn = { room: 'santuario', tx: 14, ty: 15 };
    this.spawnAtRespawn();
    this.state = 'play';
    this.toast('Explora el reino. Busca al Guardián.', 3);
  },
  spawnAtRespawn() {
    const r = World.byId[this.respawn.room];
    const p = this.player;
    p.reset(r.px + this.respawn.tx * TILE - p.w / 2, r.py + this.respawn.ty * TILE - p.h);
    p.hp = p.maxHp;
    FX.clear();
    this.resetBossEncounter();
    this.enterRoom(r, true);
    p.sitting = true;
  },
  // Reinicia por completo el combate del jefe: puertas abiertas en TODAS las salas, proyectiles fuera,
  // y el jefe se recrea con vida completa en estado previo a la intro (al volver a entrar en su sala).
  resetBossEncounter() {
    World.rooms.forEach(r => r.doors.forEach(d => d.active = false));
    this.hazards = [];
    this.slowT = 0;
    if (this.boss) this.boss = null;
  },
  enterRoom(room, snap) {
    // Salir de una sala (o reaparecer) nunca deja puertas cerradas atrás
    this.resetBossEncounter();
    this.room = World.cur = room;
    this.enemies = []; this.hazards = []; this.objs = []; this.boss = null;
    room.objs.forEach((o, idx) => {
      const x = room.px + o.tx * TILE, y = room.py + o.ty * TILE;
      const kid = room.id + ':' + idx;
      if ((o.type === 'walker' || o.type === 'flyer') && this.killed.has(kid)) return;  // los enemigos muertos no vuelven
      if (o.type === 'walker') this.enemies.push(Object.assign(new Walker(x, y), { kid }));
      else if (o.type === 'flyer') this.enemies.push(Object.assign(new Flyer(x, y), { kid }));
      else if (o.type === 'boss' && !this.bossDown) this.boss = new Boss(x, y, room);
      else if (o.type === 'bench') this.objs.push({ type: 'bench', x: x - 12, y: y - 10, w: 24, h: 10, tx: o.tx, ty: o.ty });
      else if (o.type === 'shard' && !this.shard) this.objs.push({ type: 'shard', x: x - 5, y: y - 14, w: 10, h: 12 });
      else if (o.type === 'sign') this.objs.push({ type: 'sign', x: x - 4, y: y - 14, w: 8, h: 14, text: o.text });
    });
    if (!room.visited || snap) this.banner = { text: room.name, t: 0 };
    room.visited = true;
    if (snap) this.snapCam();
  },
  startBoss(b) {
    this.room.doors.forEach(d => d.active = true);
    this.banner = { text: b.name, t: 0, boss: true };
    FX.burst(this.room.px + 8, this.room.py + 10 * TILE, 20, { colors: ['#ff3a5c', '#ffffff'], speed: 100, grav: 0 });
  },
  bossDefeated() {
    // El jefe queda derrotado desde ya: aunque algo golpeara al jugador durante la animación, no se reinicia
    this.bossDown = true; this.slowT = 1.8;
    this.hazards = []; this.player.invulnT = 99;
    World.rooms.forEach(r => r.doors.forEach(d => d.active = false));
  },
  victory() {
    this.bossDown = true; this.player.invulnT = 0;
    World.rooms.forEach(r => r.doors.forEach(d => d.active = false));
    this.state = 'victory'; this.victoryT = 0;
  },
  playerDied() { this.state = 'dying'; this.deadT = 0; FX.shake(6, 0.5); },
  toast(text, t) { this.toasts.push({ text, t: 0, life: t || 2.5 }); if (this.toasts.length > 3) this.toasts.shift(); },

  snapCam() { const c = this.camTarget(); this.cam.x = c.x; this.cam.y = c.y; },
  camTarget() {
    const p = this.player, r = this.room;
    let x = p.cx + p.facing * 24 - VW / 2, y = p.cy - 16 - VH / 2;
    x = r.pw <= VW ? r.px + (r.pw - VW) / 2 : Math.max(r.px, Math.min(r.px + r.pw - VW, x));
    y = r.ph <= VH ? r.py + (r.ph - VH) / 2 : Math.max(r.py, Math.min(r.py + r.ph - VH, y));
    return { x, y };
  },

  update(dt) {
    this.t += dt;
    Input.update();
    if (this.state === 'title') {
      this.titleT += dt;
      if (Input.pressed('start') || Input.pressed('jump')) this.newGame();
      return;
    }
    if (this.state === 'pause') { if (Input.pressed('pause') || Input.pressed('start')) this.state = 'play'; return; }
    if (this.state === 'victory') {
      this.victoryT += dt; FX.update(dt);
      if (this.victoryT > 1.5 && (Input.pressed('start') || Input.pressed('jump'))) { this.state = 'title'; this.titleT = 0; FX.clear(); }
      return;
    }
    if (this.state === 'play' && (Input.pressed('pause') || Input.pressed('start'))) { this.state = 'pause'; return; }
    if (this.flashHud > 0) this.flashHud -= dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < t.life);

    if (this.state === 'dying') {
      this.deadT += dt;
      FX.update(dt * 0.5);
      if (this.deadT > 1.6) { this.state = 'play'; this.spawnAtRespawn(); this.toast('Has despertado en el banco.', 2.5); }
      return;
    }

    if (FX.hitStop > 0) { FX.hitStop--; FX.update(dt * 0.25); return; }
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.4; }
    this.playTime += dt;

    const p = this.player;
    p.update(dt, this);
    if (this.state !== 'play') return;

    // objetos: bancos, fragmento
    for (const o of this.objs) {
      if (o.type === 'bench' && aabb(p, { x: o.x - 4, y: o.y - 20, w: o.w + 8, h: 30 }) && p.onGround && !p.sitting && Input.pressed('up')) {
        p.sitting = true; p.x = o.x + o.w / 2 - p.w / 2; p.hp = p.maxHp; p.atk = null; p.dashT = 0;
        this.respawn = { room: this.room.id, tx: o.tx, ty: o.ty };
        this.enterRoom(this.room, false); p.sitting = true;
        FX.ring(p.cx, p.cy, '#ffd28a', 34); FX.burst(p.cx, p.cy, 18, { colors: ['#ffd28a', '#ffffff'], speed: 90, grav: -30 });
        this.toast('Descansas en el banco. Salud restaurada y progreso guardado.', 3);
      }
      if (o.type === 'shard' && !o.taken && aabb(p, o)) {
        o.taken = true; this.shard = true; p.maxHp++; p.hp = p.maxHp;
        FX.ring(o.x + 5, o.y + 6, '#ffffff', 40); FX.burst(o.x + 5, o.y + 6, 30, { colors: ['#ffffff', '#bff6ff'], speed: 150, grav: 0 }); FX.stop(10);
        this.toast('¡Fragmento de máscara! Salud máxima +1', 3.5); this.flashHud = 0.6;
      }
    }
    this.objs = this.objs.filter(o => !o.taken);

    for (const e of this.enemies) if (!e.dead) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    for (const h of this.hazards) h.update(dt, this);
    this.hazards = this.hazards.filter(h => !h.dead);
    for (const e of this.enemies) if (e.dead && e.kid) this.killed.add(e.kid);
    this.enemies = this.enemies.filter(e => !e.dead);

    // daño por contacto
    if (p.hp > 0 && p.spikeT <= 0) {
      const body = { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 3 };
      for (const e of this.hittables()) {
        if (this.boss === e && (e.state === 'dormant' || e.state === 'dying')) continue;
        if (aabb(body, e)) { p.hurt(e.contact, e.cx, this); break; }
      }
      for (const h of this.hazards) if (aabb(body, h)) { p.hurt(1, h.x + h.w / 2, this); break; }
    }

    // transición de sala
    const r = this.room;
    if (p.cx < r.px || p.cx >= r.px + r.pw || p.cy < r.py || p.cy >= r.py + r.ph) {
      const nr = World.roomAtPx(p.cx, p.cy);
      if (nr && nr !== r) { this.enterRoom(nr, false); this.fade = 0.5; FX.parts = []; FX.slashes = []; }
    }

    // cámara
    const c = this.camTarget();
    this.cam.x += (c.x - this.cam.x) * Math.min(1, dt * 10);
    this.cam.y += (c.y - this.cam.y) * Math.min(1, dt * 8);
    if (this.fade > 0) { this.fade -= dt * 2.5; if (this.fade > 0.3) this.snapCam(); }
    FX.update(dt);
  },

  // ---------- Dibujo ----------
  draw() {
    ctx.imageSmoothingEnabled = false;
    if (this.state === 'title') { this.drawTitleBg(); }
    else this.drawWorld();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#05040a'; sctx.fillRect(0, 0, screen.width, screen.height);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(view, offX, offY, VW * scale, VH * scale);
    // UI en alta resolución (coordenadas lógicas 480x272)
    sctx.setTransform(scale, 0, 0, scale, offX, offY);
    sctx.save(); sctx.beginPath(); sctx.rect(0, 0, VW, VH); sctx.clip();
    if (this.state === 'title') this.drawTitleUI(sctx);
    else {
      this.drawHUD(sctx);
      if (this.state === 'pause') this.drawPause(sctx);
      if (this.state === 'victory') this.drawVictory(sctx);
    }
    sctx.restore();
  },

  drawBackground(r, cx, cy) {
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, r.bg[0]); grd.addColorStop(1, r.bg[1]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // capas de parallax: arcos y columnas lejanas
    const layers = [[0.2, 0.55, 70], [0.45, 0.8, 46]];
    for (const [par, k, spacing] of layers) {
      ctx.fillStyle = shade(r.tint, k * 0.32);
      const ox = -((cx * par) % spacing) - spacing;
      for (let x = ox, i = Math.floor(cx * par / spacing); x < VW + spacing; x += spacing, i++) {
        const hr = hash(i, par * 100 | 0);
        const top = 40 + hr * 90 - (cy * par * 0.3) % 40;
        const w = 10 + hr * 14;
        ctx.fillRect(Math.round(x), Math.round(top), Math.round(w), VH);
        ctx.fillRect(Math.round(x - 3), Math.round(top), Math.round(w + 6), 4);
        if (hr > 0.5) { ctx.beginPath(); ctx.arc(Math.round(x + spacing / 2 + w / 2), Math.round(top + 10), spacing / 2 - 2, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
      }
    }
    // motas flotantes
    ctx.fillStyle = 'rgba(200,220,255,0.35)';
    for (let i = 0; i < 26; i++) {
      const hx = hash(i, 7), hy = hash(i, 13);
      const x = ((hx * VW * 1.5 - cx * 0.6 + Math.sin(this.t * 0.5 + i) * 10) % VW + VW) % VW;
      const y = ((hy * VH - this.t * (4 + hx * 8) - cy * 0.6) % VH + VH) % VH;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  },

  drawWorld() {
    const r = this.room;
    const [sx, sy] = FX.shakeOffset();
    const cx = Math.round(this.cam.x) + sx, cy = Math.round(this.cam.y) + sy;
    this.drawBackground(r, cx, cy);
    ctx.save(); ctx.translate(-cx, -cy);
    // salas vecinas visibles (para transiciones suaves)
    for (const o of World.rooms) {
      if (o !== r && o.canvas && o.px < cx + VW && o.px + o.pw > cx && o.py < cy + VH && o.py + o.ph > cy) ctx.drawImage(o.canvas, o.px, o.py);
    }
    if (r.canvas) ctx.drawImage(r.canvas, r.px, r.py);
    // puertas del jefe
    for (const d of r.doors) if (d.active) {
      const x = r.px + d.x * TILE, y = r.py + d.y * TILE;
      for (let i = 0; i < d.h * TILE; i += 4) {
        ctx.fillStyle = (Math.floor(this.t * 12) + i / 4) % 2 ? '#ff3a5c' : '#ff9ab0';
        ctx.fillRect(x + 4, y + i, 8, 3);
      }
    }
    // objetos
    for (const o of this.objs) this.drawObj(o);
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss && !this.boss.dead) this.boss.draw(ctx);
    for (const h of this.hazards) h.draw(ctx);
    this.player.draw(ctx);
    FX.draw(ctx);
    ctx.restore();
    // viñeta
    const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
    if (this.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade * 2)})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.state === 'dying') { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.deadT / 1.2)})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.player.spikeT > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.7 - Math.abs(this.player.spikeT - 0.22) * 3)})`; ctx.fillRect(0, 0, VW, VH); }
  },

  drawObj(o) {
    const x = Math.round(o.x), y = Math.round(o.y);
    if (o.type === 'bench') {
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(x, y + 2, o.w, 3);
      ctx.fillStyle = '#9a7048'; ctx.fillRect(x, y + 1, o.w, 1);
      ctx.fillStyle = '#4a3220'; ctx.fillRect(x + 2, y + 5, 2, 5); ctx.fillRect(x + o.w - 4, y + 5, 2, 5);
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(x + 1, y - 7, 2, 9); ctx.fillRect(x + o.w - 3, y - 7, 2, 9); ctx.fillRect(x + 1, y - 7, o.w - 2, 2);
      // llama del banco
      const fl = Math.sin(this.t * 8) > 0 ? 1 : 0;
      ctx.fillStyle = '#ffd28a'; ctx.fillRect(x + o.w / 2 - 1, y - 14 - fl, 3, 4);
      ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x + o.w / 2 - 1, y - 11, 3, 2);
      const p = this.player;
      if (!p.sitting && aabb(p, { x: o.x - 4, y: o.y - 20, w: o.w + 8, h: 30 })) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + o.w / 2 - 1, y - 26 + Math.round(Math.sin(this.t * 5)), 3, 3);
        ctx.fillRect(x + o.w / 2 - 3, y - 24 + Math.round(Math.sin(this.t * 5)), 7, 1);
        o.prompt = true;
      } else o.prompt = false;
    } else if (o.type === 'shard') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(191,246,255,0.3)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 9, 0, Math.PI * 2); ctx.fill();
      drawMask(ctx, x, y + b, 10, 12, true, '#ffffff');
    } else if (o.type === 'sign') {
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x + 3, y + 4, 2, 10);
      ctx.fillStyle = '#8a6a48'; ctx.fillRect(x - 2, y, 12, 6);
      ctx.fillStyle = '#c8a878'; ctx.fillRect(x, y + 2, 8, 1);
      o.near = Math.abs(this.player.cx - (x + 4)) < 30 && Math.abs(this.player.cy - y) < 30;
    }
  },

  // ---------- HUD (alta resolución) ----------
  drawHUD(g) {
    const p = this.player;
    // orbe de alma
    const ox = 22, oy = 22, rr = 14;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(ox, oy, rr + 2, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.clip();
    const lvl = oy + rr - (p.soul / 99) * rr * 2;
    const wave = Math.sin(this.t * 3) * 1.2;
    g.fillStyle = p.soul >= P.HEAL_COST ? '#dff9ff' : '#8fb8c8';
    g.fillRect(ox - rr, lvl + wave, rr * 2, rr * 2);
    g.restore();
    g.strokeStyle = '#e8ecff'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.6;
    for (const k of [33, 66]) { const yy = oy + rr - (k / 99) * rr * 2; g.beginPath(); g.moveTo(ox - rr + 2, yy); g.lineTo(ox + rr - 2, yy); g.stroke(); }
    // máscaras
    for (let i = 0; i < p.maxHp; i++) {
      const full = i < p.hp;
      drawMask(g, 42 + i * 13, 11, 10, 12, full, this.flashHud > 0 && full ? '#bff6ff' : null);
    }
    // minimapa
    this.drawMinimap(g);
    // nombre de sala
    if (this.banner) {
      const b = this.banner, t = b.t;
      const a = t < 0.4 ? t / 0.4 : t > 2.0 ? Math.max(0, 1 - (t - 2.0) / 0.6) : 1;
      g.globalAlpha = a;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = b.boss ? 'bold 18px Georgia, serif' : '15px Georgia, serif';
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(b.text, VW / 2 + 1, (b.boss ? 70 : 58) + 1);
      g.fillStyle = b.boss ? '#ffb0c0' : '#eef0fa'; g.fillText(b.text, VW / 2, b.boss ? 70 : 58);
      g.strokeStyle = b.boss ? '#ff3a5c' : '#c8c0d8'; g.lineWidth = 0.8;
      const w = g.measureText(b.text).width / 2 + 10;
      g.beginPath(); g.moveTo(VW / 2 - w - 30 * a, b.boss ? 82 : 69); g.lineTo(VW / 2 + w + 30 * a, b.boss ? 82 : 69); g.stroke();
      g.globalAlpha = 1;
    }
    // barra del jefe
    const bo = this.boss;
    if (bo && bo.state !== 'dormant' && !bo.dead) {
      const w = 260, x = (VW - w) / 2, y = VH - 18;
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - 2, y - 2, w + 4, 9);
      g.fillStyle = '#3a0d18'; g.fillRect(x, y, w, 5);
      g.fillStyle = bo.phase2 ? '#ff3a5c' : '#d8283f'; g.fillRect(x, y, w * (bo.hp / bo.maxHp), 5);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, y, w * (bo.hp / bo.maxHp), 1);
      g.font = '8px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillStyle = '#ffd0d8'; g.fillText(bo.name, VW / 2, y - 3);
    }
    // carteles y avisos
    for (const o of this.objs) {
      if (o.type === 'sign' && o.near) this.bubble(g, o.text, o.x + 4 - this.cam.x, o.y - 10 - this.cam.y);
      if (o.type === 'bench' && o.prompt) this.bubble(g, '↑ Sentarse', o.x + o.w / 2 - this.cam.x, o.y - 34 - this.cam.y);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '8px sans-serif';
    this.toasts.forEach((t, i) => {
      const a = Math.min(1, t.t * 4, (t.life - t.t) * 2);
      g.globalAlpha = a;
      const y = VH - 40 - (this.toasts.length - 1 - i) * 13;
      const w = g.measureText(t.text).width + 14;
      g.fillStyle = 'rgba(8,6,16,0.8)'; g.fillRect(VW / 2 - w / 2, y - 6, w, 12);
      g.fillStyle = '#eef0fa'; g.fillText(t.text, VW / 2, y + 0.5);
      g.globalAlpha = 1;
    });
    if (this.state === 'dying' && this.deadT > 0.5) {
      g.globalAlpha = Math.min(1, (this.deadT - 0.5) * 2);
      g.fillStyle = '#ff9ab0'; g.font = '16px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Has caído...', VW / 2, VH / 2); g.globalAlpha = 1;
    }
  },
  bubble(g, text, x, y) {
    g.font = '7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 8;
    g.fillStyle = 'rgba(8,6,16,0.8)'; g.fillRect(x - w / 2, y - 5, w, 10);
    g.fillStyle = '#ffe8c0'; g.fillText(text, x, y + 0.5);
  },
  drawMinimap(g) {
    const s = 0.5, mx = VW - 92, my = 8;
    g.fillStyle = 'rgba(8,6,16,0.65)'; g.fillRect(mx - 4, my - 3, 88, 34);
    for (const r of World.rooms) {
      if (!r.visited) continue;
      const x = mx + r.ox * s, y = my + (r.oy + 17) * s;
      g.fillStyle = r === this.room ? 'rgba(255,210,138,0.55)' : 'rgba(200,192,216,0.35)';
      g.fillRect(x, y, r.w * s, r.h * s);
      g.strokeStyle = 'rgba(238,240,250,0.7)'; g.lineWidth = 0.5; g.strokeRect(x, y, r.w * s, r.h * s);
      if (r.objs.some(o => o.type === 'bench')) { g.fillStyle = '#ffd28a'; g.fillRect(x + r.w * s / 2 - 1, y + r.h * s - 4, 2, 2); }
      if (r.boss && !this.bossDown) { g.fillStyle = '#ff3a5c'; g.fillRect(x + r.w * s / 2 - 1.5, y + r.h * s / 2 - 1.5, 3, 3); }
    }
    const p = this.player;
    if (Math.floor(this.t * 4) % 2) { g.fillStyle = '#ffffff'; g.fillRect(mx + p.cx / TILE * s - 1, my + (p.cy / TILE + 17) * s - 1, 2, 2); }
  },

  controlsList() {
    if (IS_TOUCH()) return [
      ['Joystick (izquierda)', 'Moverse'],
      ['SALTAR', 'Saltar (mantén para más altura)'],
      ['ATACAR', 'Combo de 3 golpes / tajo aéreo'],
      ['↓ + ATACAR (aire)', 'Tajo abajo: rebota en enemigos/pinchos'],
      ['↑ + ATACAR (aire)', 'Tajo hacia arriba'],
      ['DASH', 'Dash (en suelo y 1 en el aire)'],
      ['SALTAR en pared', 'Salto de pared (con DASH: más lejos)'],
      ['CURAR (mantener)', 'Curar 1 máscara (gasta energía)'],
      ['↑ en un banco', 'Sentarse · ↓+SALTAR: bajar plataforma'],
      ['❚❚', 'Pausa'],
    ];
    return [
      ['← → / A D', 'Moverse'],
      ['Z / J / Espacio', 'Saltar (mantén para más altura)'],
      ['X / K', 'Atacar (combo de 3 golpes)'],
      ['↓ + Ataque (aire)', 'Tajo abajo: rebota en enemigos/pinchos'],
      ['↑ + Ataque (aire)', 'Tajo hacia arriba'],
      ['C / L', 'Dash (en suelo y 1 en el aire)'],
      ['Saltar en pared', 'Salto de pared (con Dash: más lejos)'],
      ['V / Shift (mantener)', 'Curar 1 máscara (gasta energía)'],
      ['↑ / W en un banco', 'Sentarse: guardar y curar'],
      ['Enter / Esc', 'Pausa'],
    ];
  },
  drawControls(g, x, y, lh) {
    g.textBaseline = 'middle'; g.font = '8px sans-serif';
    this.controlsList().forEach(([k, d], i) => {
      g.textAlign = 'right'; g.fillStyle = '#ffd28a'; g.fillText(k, x, y + i * lh);
      g.textAlign = 'left'; g.fillStyle = '#e8ecff'; g.fillText(d, x + 8, y + i * lh);
    });
  },

  drawTitleBg() {
    const r = World.byId.guardian;
    this.drawBackground({ bg: ['#1a0c1a', '#05030a'], tint: '#4a2a50' }, this.titleT * 20, 0);
    ctx.fillStyle = '#140a16'; ctx.fillRect(0, 222, VW, 50);
    ctx.fillStyle = '#3a2440'; ctx.fillRect(0, 222, VW, 2);
    // héroe grande
    ctx.save(); ctx.translate(96, 222); ctx.scale(3, 3);
    const t = this.titleT;
    ctx.strokeStyle = '#d9dcef'; ctx.lineCap = 'round';
    let px = -3, py = -23;
    for (let i = 1; i < 7; i++) {
      const nx = -3 - i * 2.4, ny = -23 + i * 1.6 + Math.sin(t * 3 + i * 0.7) * i * 0.35;
      ctx.lineWidth = Math.max(1.2, 4 - i * 0.45); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke(); px = nx; py = ny;
    }
    drawKaen(ctx, 0, 0, 1, 'idle', t, null);
    ctx.restore();
    // arco de espada decorativo
    FX.slashes = FX.slashes.filter(s => s.title);
    if (Math.floor(t / 1.6) !== Math.floor((t - STEP) / 1.6)) FX.slash({ title: true, x: 112, y: 170, a0: -2.2, a1: 1.1, r: 52, thick: 14, life: 0.45 });
    FX.update(0);
    for (const s of FX.slashes) { s.t += 1 / 60; drawSlashArc(ctx, s); }
    FX.slashes = FX.slashes.filter(s => s.t < s.life);
    const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
  },
  drawTitleUI(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 30px Georgia, serif';
    g.fillStyle = '#3a0010'; g.fillText(GAME_TITLE, 318, 36);
    g.fillStyle = '#ff3a5c'; g.fillText(GAME_TITLE, 316, 34);
    g.font = 'italic 12px Georgia, serif'; g.fillStyle = '#e8ecff'; g.fillText('— ' + GAME_SUB + ' —', 316, 56);
    g.font = '7px sans-serif'; g.fillStyle = '#a898c8'; g.fillText('Kaen, el espadachín carmesí, desciende al reino hueco', 316, 70);
    g.fillStyle = 'rgba(8,6,16,0.7)'; g.fillRect(186, 80, 282, 138);
    g.strokeStyle = 'rgba(255,58,92,0.6)'; g.lineWidth = 0.6; g.strokeRect(186, 80, 282, 138);
    g.font = 'bold 8px sans-serif'; g.fillStyle = '#ffb0c0'; g.textAlign = 'center'; g.fillText('CONTROLES', 327, 89);
    this.drawControls(g, 296, 101, 10.5);
    g.font = '7px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Controles táctiles · también funciona con teclado o mando' : 'Mando: A saltar · X atacar · B/RB dash · Y/LB curar · Start pausa', 327, 211);
    if (Math.floor(this.titleT * 2) % 2 === 0) {
      g.font = 'bold 11px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(IS_TOUCH() ? 'Toca la pantalla para comenzar' : 'Pulsa ENTER o Z para comenzar', 327, 234);
    }
    g.font = '6px sans-serif'; g.fillStyle = '#6d6488'; g.fillText('Prototipo vertical slice · arte provisional procedural', 327, 262);
  },
  drawPause(g) {
    g.fillStyle = 'rgba(5,4,10,0.8)'; g.fillRect(0, 0, VW, VH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 18px Georgia, serif'; g.fillStyle = '#ff3a5c'; g.fillText('PAUSA', VW / 2, 36);
    this.drawControls(g, 230, 70, 14);
    g.font = '8px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca la pantalla para continuar' : 'Pulsa ENTER o Esc para continuar', VW / 2, 225);
  },
  drawVictory(g) {
    const a = Math.min(1, this.victoryT / 1.2);
    g.fillStyle = `rgba(5,4,10,${0.75 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 30px Georgia, serif'; g.fillStyle = '#3a0010'; g.fillText('¡VICTORIA!', VW / 2 + 2, 92);
    g.fillStyle = '#ffd28a'; g.fillText('¡VICTORIA!', VW / 2, 90);
    g.font = '12px Georgia, serif'; g.fillStyle = '#e8ecff';
    g.fillText('El Guardián Hueco ha caído. El abismo guarda silencio.', VW / 2, 124);
    const m = Math.floor(this.playTime / 60), s = Math.floor(this.playTime % 60);
    g.font = '9px sans-serif'; g.fillStyle = '#a898c8';
    g.fillText(`Tiempo: ${m}:${String(s).padStart(2, '0')}   ·   Fragmento de máscara: ${this.shard ? 'encontrado' : 'no encontrado'}`, VW / 2, 146);
    if (this.victoryT > 1.5 && Math.floor(this.victoryT * 2) % 2 === 0) {
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(IS_TOUCH() ? 'Toca para volver al título' : 'Pulsa ENTER para volver al título', VW / 2, 190);
    }
    g.globalAlpha = 1;
  },
};

// Máscara de salud (forma original: escudo con ojos)
function drawMask(g, x, y, w, h, full, tint) {
  g.save(); g.translate(x, y);
  g.beginPath();
  g.moveTo(w * 0.5, 0); g.lineTo(w, h * 0.22); g.lineTo(w * 0.9, h * 0.75); g.lineTo(w * 0.5, h); g.lineTo(w * 0.1, h * 0.75); g.lineTo(0, h * 0.22); g.closePath();
  if (full) { g.fillStyle = tint || '#f4f5ff'; g.fill(); g.strokeStyle = '#8a8fb0'; g.lineWidth = 0.8; g.stroke(); g.fillStyle = '#1a1628'; g.fillRect(w * 0.22, h * 0.38, w * 0.2, h * 0.2); g.fillRect(w * 0.58, h * 0.38, w * 0.2, h * 0.2); }
  else { g.fillStyle = 'rgba(40,36,60,0.6)'; g.fill(); g.strokeStyle = 'rgba(160,160,190,0.6)'; g.lineWidth = 0.8; g.stroke(); }
  g.restore();
}

// ---------- Arranque ----------
World.rooms.forEach(renderRoomTiles);
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  let n = 0;
  while (acc >= STEP && n < 5) { Game.update(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  Game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Ganchos de depuración (para pruebas automáticas)
window.GAME = {
  Game, World, Input, FX,
  start() { if (Game.state === 'title') Game.newGame(); },
  warp(roomId, tx, ty) {
    const r = World.byId[roomId], p = Game.player;
    p.reset(r.px + tx * TILE - p.w / 2, r.py + ty * TILE - p.h);
    FX.clear(); Game.enterRoom(r, true);
  },
};
