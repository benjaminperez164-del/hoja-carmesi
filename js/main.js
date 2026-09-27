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
  if (room.theme === 'day') return renderDayTiles(room);
  if (room.theme === 'crystal') return renderCrystalTiles(room);
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

// Paleta diurna: roca cálida media-oscura con contorno negro y césped brillante (alto contraste con el cielo claro)
function renderDayTiles(room) {
  const c = document.createElement('canvas'); c.width = room.pw; c.height = room.ph;
  const g = c.getContext('2d');
  const OL = '#241610';
  const isSolid = (x, y) => World.tileAt(x, y) === T_SOLID;
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
    const t = room.grid[y][x], px = x * TILE, py = y * TILE, wx = x + room.ox, wy = y + room.oy;
    if (t === T_SOLID) {
      const r = hash(wx, wy);
      g.fillStyle = r > 0.5 ? '#8a6446' : '#83603f'; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = '#6a4a32';
      g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + ((wy % 2) ? 5 : 11), py, 1, 7); g.fillRect(px + ((wy % 2) ? 12 : 3), py + 8, 1, 8);
      g.fillStyle = '#a57c55'; g.fillRect(px + ((wy % 2) ? 1 : 6), py + 1, 3, 1);
      if (r > 0.82) { g.fillStyle = '#5f9e4a'; g.fillRect(px + 9, py + 10, 3, 2); }
      const up = isSolid(wx, wy - 1), dn = isSolid(wx, wy + 1), lf = isSolid(wx - 1, wy), rt = isSolid(wx + 1, wy);
      g.fillStyle = OL;
      if (!up) g.fillRect(px, py, TILE, 1);
      if (!dn) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (!lf) g.fillRect(px, py, 2, TILE);
      if (!rt) g.fillRect(px + TILE - 2, py, 2, TILE);
      if (!up) {
        g.fillStyle = '#3f9a3a'; g.fillRect(px, py + 1, TILE, 4);
        g.fillStyle = '#7ddc5a'; g.fillRect(px, py + 1, TILE, 2);
        g.fillStyle = '#2a6a2a'; g.fillRect(px, py + 5, TILE, 1);
        g.fillStyle = '#7ddc5a'; g.fillRect(px + (r * 12 | 0), py - 2, 1, 3); g.fillRect(px + ((r * 97) % 13 | 0), py - 1, 1, 2);
        if (r > 0.7) { g.fillStyle = r > 0.85 ? '#ff6fa8' : '#ffe14a'; g.fillRect(px + 6, py - 2, 2, 2); }
        if (!lf) { g.fillStyle = OL; g.fillRect(px, py, 2, 6); }
        if (!rt) { g.fillStyle = OL; g.fillRect(px + TILE - 2, py, 2, 6); }
      }
    } else if (t === T_SPIKE) {
      // zarzas espinosas: magenta oscuro con puntas claras y contorno
      g.fillStyle = OL; g.fillRect(px, py + 8, TILE, 8);
      g.fillStyle = '#6a1f5a'; g.fillRect(px, py + 10, TILE, 6);
      for (let i = 0; i < 4; i++) {
        const sx = px + i * 4;
        g.fillStyle = OL; g.beginPath(); g.moveTo(sx - 0.5, py + 12); g.lineTo(sx + 2, py + 3); g.lineTo(sx + 4.5, py + 12); g.fill();
        g.fillStyle = '#b8327e'; g.beginPath(); g.moveTo(sx + 0.5, py + 12); g.lineTo(sx + 2, py + 5); g.lineTo(sx + 3.5, py + 12); g.fill();
        g.fillStyle = '#ffd0ec'; g.fillRect(sx + 2, py + 5, 1, 2);
      }
    } else if (t === T_PLAT) {
      g.fillStyle = OL; g.fillRect(px, py, TILE, 7);
      g.fillStyle = '#c07a3c'; g.fillRect(px, py + 1, TILE, 4);
      g.fillStyle = '#f0b060'; g.fillRect(px, py + 1, TILE, 1);
      g.fillStyle = OL; g.fillRect(px + 3, py + 7, 2, 3); g.fillRect(px + 11, py + 7, 2, 3);
    }
  }
  room.canvas = c;
}

// Paleta del templo: piedra azul pizarra con contorno marino, remate dorado y cristales; alto contraste con el fondo claro
function renderCrystalTiles(room) {
  const c = document.createElement('canvas'); c.width = room.pw; c.height = room.ph;
  const g = c.getContext('2d');
  const OL = '#16203a';
  const isSolid = (x, y) => World.tileAt(x, y) === T_SOLID && !(World.roomAtTile(x, y) || {}).phaseKeys?.has((x - World.roomAtTile(x, y).ox) + ',' + (y - World.roomAtTile(x, y).oy));
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
    const t = room.grid[y][x], px = x * TILE, py = y * TILE, wx = x + room.ox, wy = y + room.oy;
    if (room.phaseKeys.has(x + ',' + y)) continue;          // bloques de fase: se dibujan en vivo
    if (t === T_SOLID) {
      const r = hash(wx, wy);
      g.fillStyle = r > 0.5 ? '#5f73a8' : '#5a6ea2'; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = '#4a5c8e';
      g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + ((wy % 2) ? 5 : 11), py, 1, 7); g.fillRect(px + ((wy % 2) ? 12 : 3), py + 8, 1, 8);
      g.fillStyle = '#8ea4d8'; g.fillRect(px + ((wy % 2) ? 1 : 6), py + 1, 3, 1);
      if (r > 0.84) { g.fillStyle = '#9fe6ff'; g.fillRect(px + 9, py + 9, 2, 4); g.fillStyle = '#ffffff'; g.fillRect(px + 9, py + 9, 1, 2); }
      const up = isSolid(wx, wy - 1), dn = isSolid(wx, wy + 1), lf = isSolid(wx - 1, wy), rt = isSolid(wx + 1, wy);
      g.fillStyle = OL;
      if (!up) g.fillRect(px, py, TILE, 1);
      if (!dn) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (!lf) g.fillRect(px, py, 2, TILE);
      if (!rt) g.fillRect(px + TILE - 2, py, 2, TILE);
      if (!up) {
        g.fillStyle = '#e8f0ff'; g.fillRect(px, py + 1, TILE, 4);
        g.fillStyle = '#ffd24a'; g.fillRect(px, py + 5, TILE, 1);
        g.fillStyle = '#ffffff'; g.fillRect(px, py + 1, TILE, 1);
        if (r > 0.72) { g.fillStyle = OL; g.fillRect(px + 5, py - 5, 5, 5); g.fillStyle = r > 0.86 ? '#ff9ae0' : '#9fe6ff'; g.fillRect(px + 6, py - 4, 3, 4); g.fillStyle = '#ffffff'; g.fillRect(px + 6, py - 4, 1, 2); }
        if (!lf) { g.fillStyle = OL; g.fillRect(px, py, 2, 6); }
        if (!rt) { g.fillStyle = OL; g.fillRect(px + TILE - 2, py, 2, 6); }
      }
    } else if (t === T_SPIKE) {
      // púas de cristal: cian/magenta con contorno oscuro
      g.fillStyle = OL; g.fillRect(px, py + 11, TILE, 5);
      for (let i = 0; i < 4; i++) {
        const sx = px + i * 4;
        g.fillStyle = OL; g.beginPath(); g.moveTo(sx - 0.5, py + 13); g.lineTo(sx + 2, py + 2); g.lineTo(sx + 4.5, py + 13); g.fill();
        g.fillStyle = i % 2 ? '#ff5ad0' : '#3ad8ff'; g.beginPath(); g.moveTo(sx + 0.5, py + 13); g.lineTo(sx + 2, py + 4); g.lineTo(sx + 3.5, py + 13); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(sx + 2, py + 5, 1, 3);
      }
    } else if (t === T_PLAT) {
      g.fillStyle = OL; g.fillRect(px, py, TILE, 7);
      g.fillStyle = '#c8d8ff'; g.fillRect(px, py + 1, TILE, 4);
      g.fillStyle = '#ffffff'; g.fillRect(px, py + 1, TILE, 1);
      g.fillStyle = '#ffd24a'; g.fillRect(px, py + 4, TILE, 1);
      g.fillStyle = OL; g.fillRect(px + 3, py + 7, 2, 3); g.fillRect(px + 11, py + 7, 2, 3);
    }
  }
  room.canvas = c;
}

// ---------- Guardado (localStorage) ----------
const SAVE_KEY = 'hojaCarmesi.save.v1';
const Save = {
  load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.v === 1 ? d : null; } catch (e) { return null; } },
  write(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
};
const ENEMY_TYPES = ['walker', 'flyer', 'shield', 'turret', 'prisma', 'moth'];
// Objetos recogibles (una vez por partida; la clave se guarda en «secrets»)
const PICKUPS = {
  shard: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard2: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard3: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  cristal: { msg: '¡Cristal del Alba! Ganas más energía por golpe y curas más rápido', col: '#ffb020' },
  vasija: { msg: '¡Vasija de Energía! Curar cuesta menos energía (4 curas con el orbe lleno)', col: '#7ad8ff' },
  celeste: { msg: '', col: '#9fe6ff', ability: true },
};
const SECRET_KEYS = ['shard', 'cristal', 'shard2', 'vasija', 'shard3'];
const LEVEL_NAMES = { 1: 'Reino Hueco', 2: 'Cumbres del Alba', 3: 'Templo de Cristal' };

// ---------- Estado del juego ----------
const Game = {
  state: 'title', t: 0, player: new Player(), enemies: [], hazards: [], objs: [], boss: null,
  cam: { x: 0, y: 0 }, room: null, banner: null, toasts: [], fade: 0, fadeDir: 0,
  respawn: { room: 'santuario', tx: 14, ty: 15 }, beaten: {}, secrets: new Set(), killed: new Set(),
  dyn: [], winds: [], props: [], roomT: 0, menu: null, clearT: 0, clearLevel: 1, phaseSet: 'a', abilityT: 0,
  flashHud: 0, deadT: 0, victoryT: 0, playTime: 0, timeScale: 1, slowT: 0, titleT: 0,

  hittables() {
    const l = this.enemies.filter(e => !e.dead);
    if (this.boss && !this.boss.dead) l.push(this.boss);
    for (const w of this.props) if (!w.dead) l.push(w);
    for (const h of this.hazards) if (h.hittable && !h.dead) l.push(h);
    return l;
  },
  get level() { return this.room ? this.room.level : 1; },
  applyUpgrades() {
    const p = this.player;
    p.soulGain = this.secrets.has('cristal') ? 17 : P.SOUL_HIT;
    p.healTime = this.secrets.has('cristal') ? 0.62 : P.HEAL_T;
    p.healCost = this.secrets.has('vasija') ? 24 : P.HEAL_COST;
    p.hasDouble = this.secrets.has('celeste');
  },
  saveGame() {
    const ok = Save.write({
      v: 1, ver: 2, level: this.level, respawn: this.respawn, maxHp: this.player.maxHp,
      secrets: [...this.secrets], beaten: this.beaten, playTime: this.playTime,
      visited: World.rooms.filter(r => r.visited).map(r => r.id),
    });
    return ok;
  },
  continueGame() {
    const d = Save.load(); if (!d) return this.newGame();
    this.player = new Player();
    this.player.maxHp = d.maxHp || 5;
    this.beaten = Object.assign({}, d.beaten || {}); this.secrets = new Set(d.secrets || []);
    // Migración de partidas antiguas: quien ya venció al Heraldo recibe el Salto Celeste
    if (this.beaten.heraldo && !this.secrets.has('celeste')) this.secrets.add('celeste');
    if (d.completed && !this.beaten.oraculo) delete d.completed;
    this.killed = new Set(); this.playTime = d.playTime || 0;
    World.rooms.forEach(r => { r.visited = (d.visited || []).includes(r.id); });
    this.restoreWalls();
    this.respawn = d.respawn && World.byId[d.respawn.room] ? d.respawn : { room: 'santuario', tx: 14, ty: 15 };
    this.applyUpgrades();
    this.spawnAtRespawn();
    this.state = 'play';
    this.toast('Partida cargada: ' + World.byId[this.respawn.room].name, 3);
    if (this.secrets.has('celeste') && !(d.secrets || []).includes('celeste')) { this.toast('Has obtenido el Salto Celeste: salta de nuevo en el aire', 4); this.saveGame(); }
  },
  // Aplica/revierte muros secretos rotos en la rejilla de las salas
  restoreWalls() {
    for (const r of World.rooms) for (const w of r.walls) {
      const t = this.secrets.has(w.id) ? T_EMPTY : T_SOLID;
      let changed = false;
      for (let j = w.y; j < w.y + w.h; j++) for (let i = w.x; i < w.x + w.w; i++) if (r.grid[j][i] !== t) { r.grid[j][i] = t; changed = true; }
      if (changed) renderRoomTiles(r);
    }
  },
  breakWall(w) {
    this.secrets.add(w.id);
    this.restoreWalls();
    FX.burst(w.x + w.w / 2, w.y + w.h / 2, 30, { colors: ['#a57c55', '#e6c48a', '#241610'], speed: 160, life: 0.7 });
    FX.shake(5, 0.3); FX.stop(6); sfx('crumble');
    this.toast('¡Un pasaje oculto!', 2.5);
  },
  openTitle() {
    this.state = 'title'; this.titleT = 0; FX.clear();
    const has = !!Save.load();
    this.menu = { items: has ? ['continue', 'new'] : ['new'], sel: 0, confirm: null };
  },
  menuAction(item) {
    const m = this.menu;
    sfx('select');
    if (m.confirm) {
      if (item === 'yes') { Save.clear(); this.newGame(); }
      else m.confirm = null;
      return;
    }
    if (item === 'continue') this.continueGame();
    else if (item === 'new') { if (Save.load()) { m.confirm = { sel: 0 }; } else this.newGame(); }
  },
  menuButtons() {
    const m = this.menu; if (!m) return [];
    if (m.confirm) return [{ id: 'no', label: 'No', x: 180, y: 150, w: 56, h: 18 }, { id: 'yes', label: 'Sí, borrar', x: 244, y: 150, w: 56, h: 18 }];
    const labels = { continue: 'Continuar', new: 'Nueva partida' };
    const w = 92, gap = 10, total = m.items.length * w + (m.items.length - 1) * gap;
    return m.items.map((id, i) => ({ id, label: labels[id], x: 327 - total / 2 + i * (w + gap), y: 226, w, h: 18 }));
  },
  // Toque / clic en coordenadas lógicas (480x272)
  soundButton() { return { x: 6, y: 6, w: 78, h: 14 }; },
  onSoundButton(lx, ly) { const b = this.soundButton(); return lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 4 && ly <= b.y + b.h + 4; },
  drawSoundButton(g) {
    const b = this.soundButton(), m = Sound.muted;
    g.fillStyle = 'rgba(8,6,16,0.75)'; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = m ? 'rgba(255,255,255,0.4)' : '#9fe6ff'; g.lineWidth = 0.7; g.strokeRect(b.x, b.y, b.w, b.h);
    g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = m ? '#a898c8' : '#e8fbff';
    g.fillText((m ? '✕ ' : '♪ ') + 'Sonido: ' + (m ? 'No' : 'Sí') + '  (M)', b.x + b.w / 2, b.y + b.h / 2 + 0.5);
  },
  menuTap(lx, ly) {
    if ((this.state === 'title' || this.state === 'pause') && this.onSoundButton(lx, ly)) { Sound.toggle(); return true; }
    if (this.state !== 'title' || !this.menu) return false;
    for (const b of this.menuButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 6 && ly <= b.y + b.h + 6) { this.menuAction(b.id); return true; }
    if (!this.menu.confirm && this.menu.items.length === 1) { this.menuAction(this.menu.items[0]); return true; }
    return false;
  },

  newGame() {
    this.player = new Player();
    this.beaten = {}; this.secrets = new Set(); this.playTime = 0; this.killed = new Set();
    World.rooms.forEach(r => { r.visited = false; });
    this.restoreWalls(); this.applyUpgrades();
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
    this.syncDoors();
    this.hazards = [];
    this.slowT = 0;
    if (this.boss) this.boss = null;
  },
  // Puertas de bloqueo: siempre abiertas fuera del combate. Puertas de salida: abiertas si su jefe fue derrotado.
  syncDoors() {
    World.rooms.forEach(r => r.doors.forEach(d => { d.active = d.kind === 'exit' ? !this.beaten[d.boss] : false; }));
  },
  enterRoom(room, snap) {
    // Salir de una sala (o reaparecer) nunca deja puertas cerradas atrás
    this.resetBossEncounter();
    this.room = World.cur = room;
    this.enemies = []; this.hazards = []; this.objs = []; this.boss = null;
    this.roomT = 0;
    this.dyn = World.dyn = room.movers.map(d => new Mover(room, d)).concat(room.crumbles.map(d => new Crumble(room, d)), room.blinks.map(d => new Blink(room, d)));
    this.setPhase('a', room);
    this.dyn.forEach(d => d.update && d.kind === 'mover' && d.update(0, 0));
    this.winds = room.winds.map(d => new Wind(room, d));
    this.props = room.walls.filter(w => !this.secrets.has(w.id)).map(w => new BreakWall(room, w));
    for (const d of room.beams) this.hazards.push(new Beam(room, d));
    // Salvaguarda: en el Nivel 3 siempre se tiene el Salto Celeste si el Heraldo fue vencido
    if (room.level === 3 && this.beaten.heraldo && !this.secrets.has('celeste')) { this.secrets.add('celeste'); this.applyUpgrades(); this.toast('Salto Celeste: pulsa SALTAR otra vez en el aire', 4); }
    this.player.plat = null;
    room.objs.forEach((o, idx) => {
      const x = room.px + o.tx * TILE, y = room.py + o.ty * TILE;
      const kid = room.id + ':' + idx;
      // los enemigos muertos no vuelven (salvo al descansar en un banco)
      if (ENEMY_TYPES.includes(o.type) && (this.killed.has(kid) || (window.GAME && window.GAME.noEnemies))) return;
      const add = e => { e.kid = kid; e.day = !!o.day || room.theme !== 'night'; e.crystal = room.theme === 'crystal'; this.enemies.push(e); };
      if (o.type === 'walker') add(new Walker(x, y));
      else if (o.type === 'flyer') add(new Flyer(x, y));
      else if (o.type === 'shield') add(new Shielder(x, y));
      else if (o.type === 'turret') add(new Turret(x, y));
      else if (o.type === 'prisma') add(new Prisma(x, y));
      else if (o.type === 'moth') add(new Moth(x, y));
      else if (o.type === 'switch') this.props.push(new CrystalSwitch(x, y));
      else if (o.type === 'boss' && !this.beaten[o.boss]) this.boss = o.boss === 'heraldo' ? new Herald(x, y, room) : o.boss === 'oraculo' ? new Oracle(x, y, room) : new Boss(x, y, room);
      else if (o.type === 'celeste') { if (this.beaten.heraldo && !this.secrets.has('celeste')) this.objs.push(this.makePickup(o.type, x, y)); }
      else if (PICKUPS[o.type] && !this.secrets.has(o.type)) this.objs.push(this.makePickup(o.type, x, y));
      else if (o.type === 'bench') this.objs.push({ type: 'bench', x: x - 12, y: y - 10, w: 24, h: 10, tx: o.tx, ty: o.ty });
      else if (o.type === 'sign') this.objs.push({ type: 'sign', x: x - 4, y: y - 14, w: 8, h: 14, text: o.text });
    });
    if (!room.visited || snap) this.banner = { text: room.name, t: 0 };
    room.visited = true;
    if (snap) this.snapCam();
  },
  makePickup(type, x, y) { return { type, x: x - 5, y: y - 14, w: 10, h: 12, hit: { x: x - 10, y: y - 26, w: 20, h: 26 } }; },
  // Bloques de fase (Nivel 3): la fase activa es sólida; al volverse sólido espera a que el jugador no esté dentro
  setPhase(s, room) {
    room = room || this.room; this.phaseSet = s;
    for (const b of room.phases) { b.want = b.set === s; if (!b.want) this.fillPhase(room, b, T_EMPTY); }
    this.updatePhases(room);
  },
  togglePhase() { this.setPhase(this.phaseSet === 'a' ? 'b' : 'a'); },
  fillPhase(room, b, t) { for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) room.grid[j][i] = t; b.solid = t === T_SOLID; },
  updatePhases(room) {
    room = room || this.room; const p = this.player;
    for (const b of room.phases) if (b.want && !b.solid) {
      const bx = room.px + b.x * TILE, by = room.py + b.y * TILE;
      if (!aabb(p, { x: bx, y: by, w: b.w * TILE, h: b.h * TILE })) this.fillPhase(room, b, T_SOLID);
    }
  },
  drawPhases(r) {
    for (const b of r.phases) {
      const x = r.px + b.x * TILE, y = r.py + b.y * TILE, w = b.w * TILE, h = b.h * TILE;
      const gold = b.set === 'a';
      if (b.solid) {
        ctx.fillStyle = '#16203a'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = gold ? '#ffc83a' : '#3ad8ff'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = gold ? '#fff0b0' : '#d8f8ff'; ctx.fillRect(x + 1, y + 1, w - 2, 2);
        ctx.fillStyle = gold ? '#c08a10' : '#1a8ac0';
        for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) ctx.fillRect(x + i * TILE + 6, y + j * TILE + 6, 4, 4);
      } else {
        ctx.strokeStyle = gold ? 'rgba(200,140,20,0.6)' : 'rgba(30,140,200,0.6)'; ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); ctx.setLineDash([]);
      }
    }
  },
  startBoss(b) {
    this.room.doors.forEach(d => { if (d.kind === 'lock') d.active = true; });
    sfx('doorLock');
    this.banner = { text: b.name, t: 0, boss: true };
    FX.burst(this.room.px + 8, this.room.py + 10 * TILE, 20, { colors: ['#ff3a5c', '#ffffff'], speed: 100, grav: 0 });
  },
  bossDefeated(b) {
    // El jefe queda derrotado desde ya: aunque algo golpeara al jugador durante la animación, no se reinicia
    this.beaten[b.key || 'guardian'] = true; this.slowT = 1.8;
    this.hazards = this.hazards.filter(h => h.persistent); this.player.invulnT = 99;
    this.syncDoors();
    this.saveGame();
    sfx('bossDie'); setTimeout(() => sfx('doorOpen'), 700);
  },
  victory(b) {
    this.player.invulnT = 0;
    this.syncDoors();
    const key = b && b.key;
    if (key === 'oraculo') { this.state = 'victory'; this.victoryT = 0; Save.write(Object.assign(Save.load() || {}, { v: 1, completed: true })); }
    else {
      this.state = 'levelclear'; this.clearT = 0; this.clearLevel = key === 'heraldo' ? 2 : 1;
      // la pluma del Heraldo cae en la arena
      if (key === 'heraldo' && !this.secrets.has('celeste')) {
        const o = this.room.objs.find(o => o.type === 'celeste');
        if (o) this.objs.push(this.makePickup('celeste', this.room.px + o.tx * TILE, this.room.py + o.ty * TILE));
      }
    }
  },
  musicName() {
    const s = this.state;
    if (s === 'title') return 'title';
    if (s === 'victory') return 'victory';
    if (s === 'levelclear' || s === 'ability') return 'clear';
    const b = this.boss;
    if (b && b.state !== 'dormant' && b.state !== 'dying' && !b.dead) return 'boss' + this.level;
    if (this.slowT > 0 || (b && b.state === 'dying')) return null;
    return ({ 1: 'cave', 2: 'dawn', 3: 'crystal' })[this.level] || 'cave';
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
      if (!this.menu) this.openTitle();
      const m = this.menu, btns = this.menuButtons();
      const cur = m.confirm ? m.confirm : m;
      const n = btns.length;
      if (Input.pressed('up') || Input.pressed('left')) { cur.sel = (cur.sel + n - 1) % n; sfx('move'); }
      if (Input.pressed('down') || Input.pressed('right')) { cur.sel = (cur.sel + 1) % n; sfx('move'); }
      if (m.confirm && Input.pressed('pause')) m.confirm = null;
      else if (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) this.menuAction(btns[cur.sel].id);
      return;
    }
    if (this.state === 'levelclear') {
      this.clearT += dt; FX.update(dt);
      if ((this.clearT > 1.5 && (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack'))) || this.clearT > 6) {
        this.state = 'play';
        this.toast(this.clearLevel === 2 ? 'Recoge la pluma del Heraldo. Al este: Templo de Cristal' : 'Se ha abierto un camino al este: Cumbres del Alba', 4);
      }
      return;
    }
    if (this.state === 'ability') {
      this.abilityT += dt; FX.update(dt);
      if ((this.abilityT > 1.2 && (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack'))) || this.abilityT > 8) { this.state = 'play'; this.player.jumpBuf = 0; }
      return;
    }
    if (this.state === 'pause') { if (Input.pressed('pause') || Input.pressed('start')) this.state = 'play'; return; }
    if (this.state === 'victory') {
      this.victoryT += dt; FX.update(dt);
      if (this.victoryT > 1.5 && (Input.pressed('start') || Input.pressed('jump'))) this.openTitle();
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
    this.roomT += dt;
    for (const d of this.dyn) d.update(dt, this.roomT, p);
    if (this.room.phases.length) this.updatePhases();
    for (const w of this.props) if (w.update) w.update(dt);
    if (p.plat && p.plat.solid && p.spikeT <= 0) { p.x += p.plat.dx; p.y += p.plat.dy; }
    p.inWind = false;
    if (p.spikeT <= 0 && !p.sitting) for (const w of this.winds) w.apply(p, dt);
    p.update(dt, this);
    if (this.state !== 'play') return;

    // objetos: bancos, fragmento
    for (const o of this.objs) {
      if (o.type === 'bench' && aabb(p, { x: o.x - 4, y: o.y - 20, w: o.w + 8, h: 30 }) && p.onGround && !p.sitting && Input.pressed('up')) {
        p.sitting = true; p.x = o.x + o.w / 2 - p.w / 2; p.hp = p.maxHp; p.atk = null; p.dashT = 0;
        this.respawn = { room: this.room.id, tx: o.tx, ty: o.ty };
        this.killed.clear();                      // descansar revive a los enemigos (estilo Hollow Knight)
        this.enterRoom(this.room, false); p.sitting = true;
        const saved = this.saveGame(); sfx('bench');
        FX.ring(p.cx, p.cy, '#ffd28a', 34); FX.burst(p.cx, p.cy, 18, { colors: ['#ffd28a', '#ffffff'], speed: 90, grav: -30 });
        this.toast(saved ? 'Descansas en el banco. Salud restaurada y progreso guardado.' : 'Descansas en el banco. (No se pudo guardar)', 3);
      }
      const pk = PICKUPS[o.type];
      if (pk && !o.taken && aabb(p, o.hit || o)) {
        o.taken = true; this.secrets.add(o.type);
        if (pk.hp) { p.maxHp++; p.hp = p.maxHp; }
        this.applyUpgrades();
        if (o.type === 'cristal' || o.type === 'vasija') p.soul = 99;
        FX.ring(o.x + 5, o.y + 6, pk.col, 44); FX.burst(o.x + 5, o.y + 6, 30, { colors: [pk.col, '#ffffff'], speed: 150, grav: 0 }); FX.stop(10);
        sfx('pickup'); this.flashHud = 0.6;
        if (pk.ability) { this.state = 'ability'; this.abilityT = 0; this.saveGame(); }
        else this.toast(pk.msg, 4);
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
      const bodies = this.enemies.filter(e => !e.dead);
      if (this.boss && !this.boss.dead) bodies.push(this.boss);
      for (const e of bodies) {
        if (this.boss === e && (e.state === 'dormant' || e.state === 'dying')) continue;
        if (e.contact && aabb(body, e)) { p.hurt(e.contact, e.cx, this); break; }
      }
      for (const h of this.hazards) if (h.harmful !== false && (h.hits ? h.hits(body) : aabb(body, h))) { p.hurt(1, h.x + h.w / 2, this); break; }
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
      if (this.state === 'levelclear') this.drawLevelClear(sctx);
      if (this.state === 'ability') this.drawAbility(sctx);
    }
    sctx.restore();
  },

  drawDaySky(r, cx, cy) {
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, '#5cb8f5'); grd.addColorStop(0.55, '#aee0ff'); grd.addColorStop(1, '#ffe2b0');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // sol y rayos
    const sx = VW * 0.8 - cx * 0.02, sy = 46;
    ctx.fillStyle = 'rgba(255,244,200,0.25)'; ctx.beginPath(); ctx.arc(sx, sy, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,244,200,0.45)'; ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.10)';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx - 60 + i * 50, 0); ctx.lineTo(sx - 20 + i * 50, 0); ctx.lineTo(sx - 180 + i * 70, VH); ctx.lineTo(sx - 240 + i * 70, VH); ctx.fill(); }
    // montañas lejanas y cercanas
    const mount = (par, base, amp, col, seed) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, VH);
      for (let x = 0; x <= VW + 20; x += 20) {
        const wx = x + cx * par, i = Math.floor(wx / 60), f = (wx / 60) - i;
        const h0 = hash(i, seed), h1 = hash(i + 1, seed);
        const h = h0 + (h1 - h0) * (f * f * (3 - 2 * f));
        ctx.lineTo(x, base - h * amp - (cy * par * 0.2) % 30);
      }
      ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill();
    };
    mount(0.08, 190, 90, '#b4c8ea', 3);
    // nubes
    for (let i = 0; i < 7; i++) {
      const par = 0.12 + (i % 3) * 0.06;
      const x = ((hash(i, 41) * 900 - cx * par + this.t * (4 + i)) % 620 + 620) % 620 - 70;
      const y = 20 + hash(i, 43) * 90 - cy * par * 0.2 % 20;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + k * 12, y + (k % 2 ? -5 : 0), 10 + (k % 2) * 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(200,220,245,0.9)'; ctx.fillRect(x - 8, y + 6, 52, 4);
    }
    mount(0.22, 235, 70, '#9bb4de', 7);
    // ruinas lejanas (columnas) sobre la cresta
    ctx.fillStyle = '#a7bde3';
    const sp = 90, ox = -((cx * 0.22) % sp) - sp;
    for (let x = ox, i = Math.floor(cx * 0.22 / sp); x < VW + sp; x += sp, i++) {
      if (hash(i, 9) < 0.5) continue;
      const h = 30 + hash(i, 11) * 40, top = 200 - h;
      ctx.fillRect(Math.round(x), top, 8, h + 60); ctx.fillRect(Math.round(x + 26), top + 10, 8, h + 50); ctx.fillRect(Math.round(x - 3), top, 40, 5);
    }
  },
  drawFalls(r) {
    for (const f of r.falls) {
      const x = r.px + f.x * TILE, y = r.py + f.y * TILE, w = f.w * TILE, h = f.h * TILE;
      ctx.fillStyle = 'rgba(160,220,255,0.55)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(235,250,255,0.8)';
      for (let i = 0; i < w; i += 3) {
        const off = (this.t * 140 + i * 29) % 24;
        for (let yy = -24 + off; yy < h; yy += 24) ctx.fillRect(x + i, Math.max(y, y + yy), 1, Math.min(10, h - yy));
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 5; i++) { const fx = x + ((i * 7 + this.t * 20) % w); ctx.beginPath(); ctx.arc(fx, y + h - 2, 3 + Math.sin(this.t * 6 + i) * 1.5, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  // Templo de Cristal: fondo claro (blanco/azul pálido/oro) con haces de luz, arcos y cristales en parallax
  drawCrystalBg(r, cx, cy) {
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, '#fdfbff'); grd.addColorStop(0.5, '#e4eeff'); grd.addColorStop(1, '#fff1d6');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // haces de luz diagonales
    for (let i = 0; i < 5; i++) {
      const x = ((i * 130 - cx * 0.05) % 650 + 650) % 650 - 80;
      ctx.fillStyle = `rgba(255,236,170,${0.16 + 0.05 * Math.sin(this.t * 0.8 + i)})`;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 36, 0); ctx.lineTo(x - 70, VH); ctx.lineTo(x - 120, VH); ctx.fill();
    }
    // columnas y arcos lejanos
    const layer = (par, col, sp, top) => {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 5;
      const ox = -((cx * par) % sp) - sp;
      for (let x = ox, i = Math.floor(cx * par / sp); x < VW + sp; x += sp, i++) {
        const t0 = top - (cy * par * 0.3) % 30;
        ctx.fillRect(Math.round(x), t0, 12, VH); ctx.fillRect(Math.round(x - 3), t0, 18, 5);
        ctx.beginPath(); ctx.arc(Math.round(x + sp / 2 + 6), t0 + 14, sp / 2 - 8, Math.PI, 0); ctx.stroke();
      }
    };
    layer(0.15, '#d6e2fa', 96, 60); layer(0.35, '#c4d4f4', 70, 96);
    // cristales flotantes
    for (let i = 0; i < 14; i++) {
      const par = 0.2 + (i % 3) * 0.15;
      const x = ((hash(i, 21) * 900 - cx * par) % 560 + 560) % 560 - 40;
      const y = ((hash(i, 23) * 260 - cy * par * 0.3 + Math.sin(this.t * 0.9 + i) * 6) % 280 + 280) % 280 - 4;
      const s = 3 + (i % 3) * 2;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,140,220,0.55)' : 'rgba(120,200,255,0.55)';
      ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 1.6); ctx.lineTo(x - s, y); ctx.fill();
    }
    // motas doradas
    ctx.fillStyle = 'rgba(255,200,80,0.8)';
    for (let i = 0; i < 20; i++) {
      const x = ((hash(i, 31) * VW * 1.5 - cx * 0.5) % VW + VW) % VW;
      const y = ((hash(i, 37) * VH - this.t * (6 + hash(i, 5) * 8) - cy * 0.5) % VH + VH) % VH;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  },
  drawBackground(r, cx, cy) {
    if (r.theme === 'day') return this.drawDaySky(r, cx, cy);
    if (r.theme === 'crystal') return this.drawCrystalBg(r, cx, cy);
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
    this.drawFalls(r);
    if (r.canvas) ctx.drawImage(r.canvas, r.px, r.py);
    for (const w of this.winds) w.draw(ctx, this.t);
    if (r.phases.length) this.drawPhases(r);
    for (const d of this.dyn) d.draw(ctx);
    for (const w of this.props) w.draw(ctx);
    // puertas: bloqueo del jefe (rojo) / salida sellada (piedra con sello dorado)
    for (const d of r.doors) if (d.active) {
      const x = r.px + d.x * TILE, y = r.py + d.y * TILE;
      if (d.kind === 'exit') {
        ctx.fillStyle = '#241610'; ctx.fillRect(x, y - 2, TILE, d.h * TILE + 2);
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + 2, y, TILE - 4, d.h * TILE);
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 5, y + d.h * TILE / 2 - 4, 6, 8);
        ctx.fillStyle = '#3a2e22'; for (let i = 8; i < d.h * TILE; i += 12) ctx.fillRect(x + 2, y + i, TILE - 4, 1);
        continue;
      }
      for (let i = 0; i < d.h * TILE; i += 4) {
        ctx.fillStyle = (Math.floor(this.t * 12) + i / 4) % 2 ? '#ff3a5c' : '#ff9ab0';
        ctx.fillRect(x + 4, y + i, 8, 3);
      }
    }
    // objetos
    for (const o of this.objs) this.drawObj(o);
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss && !this.boss.dead) this.boss.draw(ctx);
    for (const h of this.hazards) h.draw(ctx, this.t);
    this.player.draw(ctx);
    FX.draw(ctx);
    ctx.restore();
    // viñeta
    const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, r.theme === 'day' ? 'rgba(90,40,0,0.12)' : r.theme === 'crystal' ? 'rgba(60,80,160,0.12)' : 'rgba(0,0,0,0.55)');
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
    } else if (o.type === 'vasija') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(122,216,255,0.4)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#16203a'; ctx.fillRect(x - 2, y + 1 + b, 14, 13); ctx.fillRect(x + 1, y - 3 + b, 8, 5);
      ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x - 1, y + 2 + b, 12, 11); ctx.fillStyle = '#7ad8ff'; ctx.fillRect(x, y + 6 + b, 10, 6);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 2, y - 2 + b, 6, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 7 + b, 2, 3);
    } else if (o.type === 'celeste') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(159,230,255,0.45)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 13, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x + 5, y + 6 + b); ctx.rotate(-0.5);
      ctx.fillStyle = '#16203a'; ctx.fillRect(-4, -10, 8, 20);
      ctx.fillStyle = '#d8f8ff'; ctx.fillRect(-3, -9, 6, 18); ctx.fillStyle = '#9fe6ff'; ctx.fillRect(0, -9, 3, 18);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(-1, -9, 1, 20);
      ctx.restore();
    } else if (o.type === 'shard' || o.type === 'shard2' || o.type === 'shard3') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      if (this.room.theme !== 'night') { ctx.fillStyle = 'rgba(22,32,58,0.5)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(191,246,255,0.3)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 9, 0, Math.PI * 2); ctx.fill();
      drawMask(ctx, x, y + b, 10, 12, true, '#ffffff');
    } else if (o.type === 'cristal') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(255,176,32,0.35)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241610'; ctx.beginPath(); ctx.moveTo(x + 5, y - 3 + b); ctx.lineTo(x + 12, y + 6 + b); ctx.lineTo(x + 5, y + 15 + b); ctx.lineTo(x - 2, y + 6 + b); ctx.fill();
      ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(x + 5, y - 1 + b); ctx.lineTo(x + 10, y + 6 + b); ctx.lineTo(x + 5, y + 13 + b); ctx.lineTo(x, y + 6 + b); ctx.fill();
      ctx.fillStyle = '#fff4c0'; ctx.fillRect(x + 4, y + 2 + b, 2, 5);
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
    const hc = p.healCost || P.HEAL_COST;
    g.fillStyle = p.soul >= hc ? '#dff9ff' : '#8fb8c8';
    g.fillRect(ox - rr, lvl + wave, rr * 2, rr * 2);
    g.restore();
    g.strokeStyle = '#e8ecff'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.6;
    for (let k = hc; k < 99; k += hc) { const yy = oy + rr - (k / 99) * rr * 2; g.beginPath(); g.moveTo(ox - rr + 2, yy); g.lineTo(ox + rr - 2, yy); g.stroke(); }
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
      { const bw = g.measureText(b.text).width + 60, by = b.boss ? 70 : 58;
        const gr = g.createLinearGradient(VW / 2 - bw / 2, 0, VW / 2 + bw / 2, 0);
        gr.addColorStop(0, 'rgba(10,6,16,0)'); gr.addColorStop(0.2, 'rgba(10,6,16,0.55)'); gr.addColorStop(0.8, 'rgba(10,6,16,0.55)'); gr.addColorStop(1, 'rgba(10,6,16,0)');
        g.fillStyle = gr; g.fillRect(VW / 2 - bw / 2, by - 14, bw, 30); }
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
      g.fillStyle = 'rgba(10,4,12,0.85)'; g.fillText(bo.name, VW / 2 + 0.7, y - 2.3); g.fillStyle = '#ffd0d8'; g.fillText(bo.name, VW / 2, y - 3);
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
    x = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, x));
    g.fillStyle = 'rgba(8,6,16,0.8)'; g.fillRect(x - w / 2, y - 5, w, 10);
    g.fillStyle = '#ffe8c0'; g.fillText(text, x, y + 0.5);
  },
  drawMinimap(g) {
    const lv = this.level, rooms = World.rooms.filter(r => r.level === lv);
    const minX = Math.min(...rooms.map(r => r.ox)), maxX = Math.max(...rooms.map(r => r.ox + r.w));
    const minY = Math.min(...rooms.map(r => r.oy)), maxY = Math.max(...rooms.map(r => r.oy + r.h));
    const s = Math.min(80 / (maxX - minX), 28 / (maxY - minY)), mx = VW - 92, my = 8;
    g.fillStyle = 'rgba(8,6,16,0.7)'; g.fillRect(mx - 4, my - 3, 88, 42);
    g.font = '6px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#ffd28a';
    g.fillText('Nivel ' + lv + ' · ' + LEVEL_NAMES[lv], mx - 1, my + 34);
    for (const r of rooms) {
      if (!r.visited) continue;
      const x = mx + (r.ox - minX) * s, y = my + (r.oy - minY) * s;
      g.fillStyle = r === this.room ? 'rgba(255,210,138,0.55)' : 'rgba(200,192,216,0.35)';
      g.fillRect(x, y, r.w * s, r.h * s);
      g.strokeStyle = 'rgba(238,240,250,0.7)'; g.lineWidth = 0.5; g.strokeRect(x, y, r.w * s, r.h * s);
      if (r.objs.some(o => o.type === 'bench')) { g.fillStyle = '#ffd28a'; g.fillRect(x + r.w * s / 2 - 1, y + r.h * s - 4, 2, 2); }
      if (r.boss && !r.objs.some(o => o.type === 'boss' && this.beaten[o.boss])) { g.fillStyle = '#ff3a5c'; g.fillRect(x + r.w * s / 2 - 1.5, y + r.h * s / 2 - 1.5, 3, 3); }
    }
    const p = this.player;
    if (Math.floor(this.t * 4) % 2) { g.fillStyle = '#ffffff'; g.fillRect(mx + (p.cx / TILE - minX) * s - 1, my + (p.cy / TILE - minY) * s - 1, 2, 2); }
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
      ['SALTAR en el aire', 'Salto Celeste (se obtiene en el Nivel 2)'],
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
      ['Saltar en el aire', 'Salto Celeste (se obtiene en el Nivel 2)'],
      ['V / Shift (mantener)', 'Curar 1 máscara (gasta energía)'],
      ['↑ / W en un banco', 'Sentarse: guardar y curar'],
      ['Enter / Esc · M', 'Pausa · Sonido sí/no'],
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
    this.drawControls(g, 296, 100, 9.8);
    g.font = '7px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Controles táctiles · también funciona con teclado o mando' : 'Mando: A saltar · X atacar · B/RB dash · Y/LB curar · Start pausa', 327, 211);
    const m = this.menu;
    if (m) {
      const btns = this.menuButtons(), cur = m.confirm ? m.confirm : m;
      if (m.confirm) {
        g.fillStyle = 'rgba(5,4,10,0.85)'; g.fillRect(0, 0, VW, VH);
        g.fillStyle = '#1a1024'; g.fillRect(150, 100, 180, 80); g.strokeStyle = '#ff3a5c'; g.lineWidth = 1; g.strokeRect(150, 100, 180, 80);
        g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center';
        g.fillText('¿Empezar una nueva partida?', 240, 118);
        g.font = '8px sans-serif'; g.fillStyle = '#ffb0c0'; g.fillText('Se borrará tu partida guardada.', 240, 134);
      }
      btns.forEach((b, i) => {
        const sel = cur.sel === i;
        g.fillStyle = sel ? 'rgba(255,58,92,0.85)' : 'rgba(8,6,16,0.75)'; g.fillRect(b.x, b.y, b.w, b.h);
        g.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.4)'; g.lineWidth = sel ? 1.2 : 0.6; g.strokeRect(b.x, b.y, b.w, b.h);
        g.font = 'bold 9px sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
      });
      if (!m.confirm) {
        g.font = '7px sans-serif'; g.fillStyle = '#a898c8';
        g.font = '6.5px sans-serif'; g.fillText(IS_TOUCH() ? 'Toca una opción' : '↑↓ elegir · ENTER / Z confirmar', 327, 259); g.font = '7px sans-serif';
        const d = Save.load();
        if (d && d.respawn && World.byId[d.respawn.room]) { g.fillStyle = '#ffd28a'; g.fillText('Guardado: Nivel ' + (d.level || 1) + ' · ' + World.byId[d.respawn.room].name + (d.completed ? ' · ¡juego completado!' : ''), 327, 250); }
      }
    }
    g.font = '6px sans-serif'; g.fillStyle = '#6d6488'; g.fillText('Prototipo vertical slice · arte provisional procedural', 327, 267);
    if (!m || !m.confirm) this.drawSoundButton(g);
  },
  drawPause(g) {
    g.fillStyle = 'rgba(5,4,10,0.8)'; g.fillRect(0, 0, VW, VH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 18px Georgia, serif'; g.fillStyle = '#ff3a5c'; g.fillText('PAUSA', VW / 2, 36);
    this.drawControls(g, 230, 62, 13);
    g.font = '8px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca la pantalla para continuar' : 'Pulsa ENTER o Esc para continuar', VW / 2, 222);
    this.drawSoundButton(g);
  },
  drawAbility(g) {
    const a = Math.min(1, this.abilityT / 0.6);
    g.fillStyle = `rgba(8,14,34,${0.72 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 10px Georgia, serif'; g.fillStyle = '#aee0ff'; g.fillText('Nueva habilidad', VW / 2, 74);
    g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#16203a'; g.fillText('SALTO CELESTE', VW / 2 + 2, 100);
    g.fillStyle = '#e8fbff'; g.fillText('SALTO CELESTE', VW / 2, 98);
    g.font = '13px Georgia, serif'; g.fillStyle = '#ffd24a'; g.fillText('Salta de nuevo en el aire', VW / 2, 128);
    g.font = '8px sans-serif'; g.fillStyle = '#e8ecff';
    g.fillText(IS_TOUCH() ? 'Pulsa SALTAR otra vez mientras estás en el aire.' : 'Pulsa Saltar (Z / J / Espacio) otra vez mientras estás en el aire.', VW / 2, 152);
    g.fillText('Se recarga al tocar el suelo, agarrarte a una pared o rebotar con el tajo abajo.', VW / 2, 165);
    if (this.abilityT > 1.2 && Math.floor(this.abilityT * 2) % 2 === 0) {
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(IS_TOUCH() ? 'Toca para continuar' : 'Pulsa ENTER para continuar', VW / 2, 200);
    }
    g.globalAlpha = 1;
  },
  drawLevelClear(g) {
    const a = Math.min(1, this.clearT / 0.8);
    g.fillStyle = `rgba(5,4,10,${0.7 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = this.clearLevel, title = 'NIVEL ' + L + ' COMPLETADO';
    g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#3a0010'; g.fillText(title, VW / 2 + 2, 98);
    g.fillStyle = '#ffd28a'; g.fillText(title, VW / 2, 96);
    g.font = '12px Georgia, serif'; g.fillStyle = '#e8ecff';
    g.fillText(L === 2 ? 'El Heraldo del Alba ha caído. Una pluma celeste brilla en la arena…' : 'El Guardián Hueco ha caído. Un sello se rompe al este…', VW / 2, 128);
    g.font = 'italic 11px Georgia, serif'; g.fillStyle = '#aee0ff';
    g.fillText('Siguiente: Nivel ' + (L + 1) + ' — ' + LEVEL_NAMES[L + 1], VW / 2, 148);
    if (this.clearT > 1.5 && Math.floor(this.clearT * 2) % 2 === 0) {
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(IS_TOUCH() ? 'Toca para continuar' : 'Pulsa ENTER para continuar', VW / 2, 190);
    }
    g.globalAlpha = 1;
  },
  drawVictory(g) {
    const a = Math.min(1, this.victoryT / 1.2);
    g.fillStyle = `rgba(5,4,10,${0.75 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 30px Georgia, serif'; g.fillStyle = '#3a0010'; g.fillText('¡VICTORIA!', VW / 2 + 2, 92);
    g.fillStyle = '#ffd28a'; g.fillText('¡VICTORIA!', VW / 2, 90);
    g.font = '12px Georgia, serif'; g.fillStyle = '#e8ecff';
    g.fillText('El Oráculo Prismático se apaga. La luz del templo vuelve a ser libre.', VW / 2, 124);
    const m = Math.floor(this.playTime / 60), s = Math.floor(this.playTime % 60);
    g.font = '9px sans-serif'; g.fillStyle = '#a898c8';
    const found = SECRET_KEYS.filter(k => this.secrets.has(k)).length;
    g.fillText(`Tiempo: ${m}:${String(s).padStart(2, '0')}   ·   Secretos: ${found}/${SECRET_KEYS.length}   ·   Fin del prototipo`, VW / 2, 146);
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
  while (acc >= STEP && n < 5) { if (!(window.GAME && window.GAME.manual)) Game.update(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  Game.draw();
  Sound.music(Game.musicName()); Sound.duck = Game.state === 'pause' ? 0.35 : 1; Sound.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Ganchos de depuración (para pruebas automáticas)
window.GAME = {
  Game, World, Input, FX, Sound,
  start() { if (Game.state === 'title') Game.newGame(); },
  manual: false,
  // Modo manual: el bucle deja de avanzar la simulación y las pruebas la avanzan de forma determinista
  setManual(on) { this.manual = !!on; },
  step(n, actions) {
    const all = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'heal', 'start', 'pause'];
    if (actions) all.forEach(a => Input.setVirtual(a, actions.includes(a)));
    for (let i = 0; i < n; i++) Game.update(STEP);
    return Game.state;
  },
  warp(roomId, tx, ty) {
    const r = World.byId[roomId], p = Game.player;
    p.reset(r.px + tx * TILE - p.w / 2, r.py + ty * TILE - p.h);
    FX.clear(); Game.enterRoom(r, true);
  },
};
