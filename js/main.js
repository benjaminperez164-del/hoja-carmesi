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
  if (room.theme === 'forge') return renderTintTiles(room, '#3a2818', '#c08030', '#ffb020');
  if (room.theme === 'storm') return renderTintTiles(room, '#142038', '#5080c0', '#7ad8ff');
  if (room.theme === 'garden') return renderTintTiles(room, '#143020', '#3a8a40', '#6fe080');
  if (room.theme === 'final') return renderTintTiles(room, '#2a1018', '#8a2040', '#ff3a5c');
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
      const OL = '#08060e';
      g.fillStyle = shade(base, 0.55 + r * 0.12); g.fillRect(px, py, TILE, TILE);
      g.fillStyle = shade(base, 0.42);
      g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + ((wy % 2) ? 5 : 11), py, 1, 7); g.fillRect(px + ((wy % 2) ? 12 : 3), py + 8, 1, 8);
      g.fillStyle = shade(base, 0.7); g.fillRect(px + ((wy % 2) ? 1 : 6), py + 1, 3, 1);
      if (r > 0.8) { g.fillStyle = shade(base, 0.78); g.fillRect(px + 3, py + 10, 3, 2); }
      if (r > 0.92) { g.fillStyle = '#c87840'; g.fillRect(px + 10, py + 4, 2, 2); }
      const above = World.tileAt(wx, wy - 1), below = World.tileAt(wx, wy + 1);
      const left = World.tileAt(wx - 1, wy), right = World.tileAt(wx + 1, wy);
      g.fillStyle = OL;
      if (above !== T_SOLID) g.fillRect(px, py, TILE, 1);
      if (below !== T_SOLID) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (left !== T_SOLID) g.fillRect(px, py, 2, TILE);
      if (right !== T_SOLID) g.fillRect(px + TILE - 2, py, 2, TILE);
      if (above !== T_SOLID) {
        g.fillStyle = shade(base, 1.4); g.fillRect(px, py + 1, TILE, 2);
        g.fillStyle = shade(base, 1.05); g.fillRect(px, py + 3, TILE, 1);
        if (r > 0.55) { g.fillStyle = '#4f8f6a'; g.fillRect(px + (r * 12 | 0), py - 2, 2, 2); g.fillRect(px + (r * 7 | 0) + 4, py - 1, 1, 1); }
        if (r > 0.78) { g.fillStyle = '#7ab090'; g.fillRect(px + 8, py - 1, 1, 2); }
      }
    } else if (t === T_SPIKE) {
      const OL = '#08060e';
      g.fillStyle = OL; g.fillRect(px, py + 10, TILE, 6);
      g.fillStyle = shade(base, 0.35); g.fillRect(px, py + 13, TILE, 3);
      for (let i = 0; i < 4; i++) {
        const sx = px + i * 4;
        g.fillStyle = OL; g.beginPath(); g.moveTo(sx - 0.5, py + 14); g.lineTo(sx + 2, py + 4); g.lineTo(sx + 4.5, py + 14); g.fill();
        g.fillStyle = '#c9cfe6'; g.beginPath(); g.moveTo(sx, py + 14); g.lineTo(sx + 2, py + 5); g.lineTo(sx + 4, py + 14); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(sx + 2, py + 5, 1, 4);
        g.fillStyle = '#7b809c'; g.fillRect(sx + 3, py + 10, 1, 4);
      }
    } else if (t === T_PLAT) {
      const OL = '#08060e';
      g.fillStyle = OL; g.fillRect(px, py, TILE, 7);
      g.fillStyle = shade(base, 1.25); g.fillRect(px, py + 1, TILE, 2);
      g.fillStyle = shade(base, 0.85); g.fillRect(px, py + 3, TILE, 3);
      g.fillStyle = shade(base, 1.5); g.fillRect(px, py + 1, TILE, 1);
      g.fillStyle = OL; g.fillRect(px + 2, py + 7, 2, 3); g.fillRect(px + 12, py + 7, 2, 3);
    }
  }
  room.canvas = c;
}

// Paleta diurna: roca cálida media-oscura con contorno negro y césped brillante (alto contraste con el cielo claro)
function renderTintTiles(room, dark, mid, lite) {
  const c = document.createElement('canvas'); c.width = room.pw; c.height = room.h * TILE;
  const g = c.getContext('2d');
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
    const tile = room.grid[y][x]; if (tile === T_EMPTY) continue;
    const px = x * TILE, py = y * TILE;
    if (tile === T_SPIKE) {
      g.fillStyle = mid; g.beginPath(); g.moveTo(px, py + TILE); g.lineTo(px + 8, py + 2); g.lineTo(px + TILE, py + TILE); g.fill();
    } else if (tile === T_PLAT) {
      g.fillStyle = dark; g.fillRect(px, py, TILE, 6);
      g.fillStyle = lite; g.fillRect(px, py + 1, TILE, 2);
      g.fillStyle = mid; g.fillRect(px, py + 3, TILE, 2);
    } else {
      g.fillStyle = dark; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = mid; g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle = lite; g.fillRect(px + 1, py + 1, TILE - 2, 2);
    }
  }
  room.canvas = c;
}
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
const ENEMY_TYPES = ['walker', 'flyer', 'shield', 'turret', 'prisma', 'moth', 'gear', 'spark', 'sprout'];
// Objetos recogibles (una vez por partida; la clave se guarda en «secrets»)
const PICKUPS = {
  shard: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard2: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard3: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard4: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard5: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  cristal: { msg: '¡Cristal del Alba! Ganas más energía por golpe y curas más rápido', col: '#ffb020' },
  vasija: { msg: '¡Vasija de Energía! Curar cuesta menos energía (4 curas con el orbe lleno)', col: '#7ad8ff' },
  orbe: { msg: '¡Orbe Carmesí! Tus golpes generan aún más energía', col: '#ff5a78' },
  shard6: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard7: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard8: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard9: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard10: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard11: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  shard12: { msg: '¡Fragmento de máscara! Salud máxima +1', col: '#ffffff', hp: true },
  orbe2: { msg: '¡Orbe Carmesí! Tus golpes generan aún más energía', col: '#ff5a78' },
  orbe3: { msg: '¡Orbe Carmesí! Tus golpes generan aún más energía', col: '#ff5a78' },
  cristal2: { msg: '¡Cristal del Alba! Ganas más energía por golpe y curas más rápido', col: '#ffb020' },
  cristal3: { msg: '¡Cristal del Alba! Ganas más energía por golpe y curas más rápido', col: '#ffb020' },
  vasija2: { msg: '¡Vasija de Energía! Curar cuesta menos energía', col: '#7ad8ff' },
  celeste: { msg: '', col: '#9fe6ff', ability: true },
  cargado: { msg: '', col: '#ff3a5c', ability: true },
};
const SECRET_KEYS = ['shard', 'cristal', 'shard2', 'vasija', 'shard3', 'shard4', 'orbe', 'shard5', 'shard6', 'shard7', 'orbe2', 'shard8', 'shard9', 'cristal2', 'shard10', 'vasija2', 'orbe3', 'shard11', 'shard12', 'cristal3'];
const ZONE_INTRO = {
  1: { name: 'Reino Hueco', line: 'Donde la noche nunca termina' },
  2: { name: 'Cumbres del Alba', line: 'El viento corta como el acero' },
  3: { name: 'Templo de Cristal', line: 'La luz se quiebra en mil filos' },
  4: { name: 'Forja de Engranajes', line: 'El metal aún arde bajo tierra' },
  5: { name: 'Techos de la Tormenta', line: 'El cielo se abre en relámpagos' },
  6: { name: 'Jardín de Luz', line: 'La raíz recuerda cada paso' },
  7: { name: 'Abismo Carmesí', line: 'Aquí terminan todos los ecos' },
};
const CREDITS = [
  { title: 'HOJA CARMESÍ', lines: ['Ecos del Abismo'] },
  { title: 'Héroe', lines: ['Kaen'] },
  { title: 'Zonas', lines: ['Reino Hueco', 'Cumbres del Alba', 'Templo de Cristal', 'Forja de Engranajes', 'Techos de la Tormenta', 'Jardín de Luz'] },
  { title: 'Jefes', lines: ['Guardián Hueco', 'Heraldo del Alba', 'Oráculo Prismático', 'Forjador', 'Tempestad', 'Raíz Primigenia', 'Ecos del Abismo'] },
  { title: 'Gracias por jugar', lines: ['Benjamin Perez'] },
];
const LEVEL_NAMES = { 1: 'Reino Hueco', 2: 'Cumbres del Alba', 3: 'Templo de Cristal', 4: 'Forja de Engranajes', 5: 'Techos de la Tormenta', 6: 'Jardín de Luz', 7: 'Abismo Carmesí' };
const LEVEL_SHORT = { 1: 'Abismo', 2: 'Cumbres', 3: 'Templo', 4: 'Forja', 5: 'Tormenta', 6: 'Jardín', 7: 'Abismo' };
// Entradas de la colección (solo lectura; usa secrets / beaten existentes)
const COLLECTION = [
  { key: 'shard', name: 'Fragmento de máscara', where: 'Cripta Olvidada · N1', col: '#ffffff' },
  { key: 'cristal', name: 'Cristal del Alba', where: 'Nido Oculto · N2', col: '#ffb020' },
  { key: 'shard2', name: 'Fragmento de máscara', where: 'Nicho Celeste · N1', col: '#ffffff' },
  { key: 'vasija', name: 'Vasija de Energía', where: 'Jardín Colgante · N2', col: '#7ad8ff' },
  { key: 'shard3', name: 'Fragmento de máscara', where: 'Relicario de Luz · N3', col: '#ffffff' },
  { key: 'shard4', name: 'Fragmento de máscara', where: 'Galería Suspendida · N1', col: '#ffffff' },
  { key: 'orbe', name: 'Orbe Carmesí', where: 'Mirador del Alba · N2', col: '#ff5a78' },
  { key: 'shard5', name: 'Fragmento de máscara', where: 'Atrio de Cristal · N3', col: '#ffffff' },
  { key: 'celeste', name: 'Salto Celeste', where: 'Heraldo del Alba · N2', col: '#9fe6ff', ability: true },
  { key: 'cargado', name: 'Sable Cargado', where: 'Oráculo Prismático · N3', col: '#ff3a5c', ability: true },
  { key: 'shard6', name: 'Fragmento de máscara', where: 'Hueco Umbrío · N1', col: '#ffffff' },
  { key: 'shard7', name: 'Fragmento de máscara', where: 'Puente del Eco · N1', col: '#ffffff' },
  { key: 'orbe2', name: 'Orbe Carmesí', where: 'Nido del Viento · N2', col: '#ff5a78' },
  { key: 'shard8', name: 'Fragmento de máscara', where: 'Pasaje del Alba · N2', col: '#ffffff' },
  { key: 'shard9', name: 'Fragmento de máscara', where: 'Cámara de la Lente · N3', col: '#ffffff' },
  { key: 'cristal2', name: 'Cristal del Alba', where: 'Umbral de Luz · N3', col: '#ffb020' },
  { key: 'shard10', name: 'Fragmento de máscara', where: 'Cofre de Bronce · N4', col: '#ffffff' },
  { key: 'vasija2', name: 'Vasija de Energía', where: 'Puente de Magma · N4', col: '#7ad8ff' },
  { key: 'orbe3', name: 'Orbe Carmesí', where: 'Nido Eléctrico · N5', col: '#ff5a78' },
  { key: 'shard11', name: 'Fragmento de máscara', where: 'Puente Relámpago · N5', col: '#ffffff' },
  { key: 'shard12', name: 'Fragmento de máscara', where: 'Pétalo Oculto · N6', col: '#ffffff' },
  { key: 'cristal3', name: 'Cristal del Alba', where: 'Puente de Raíces · N6', col: '#ffb020' },
];
// Única fuente de verdad: jefes principales y la pantalla que muestran al caer (los demás son minijefes: solo aviso)
const MAIN_BOSSES = { guardian: 1, heraldo: 2, oraculo: 3, forjador: 4, tempestad: 5, raiz: 6, ecos: 7 };
const BOSS_META = [
  { key: 'guardian', name: 'Guardián Hueco', level: 1 },
  { key: 'umbra', name: 'Umbra del Foso', level: 1 },
  { key: 'heraldo', name: 'Heraldo del Alba', level: 2 },
  { key: 'aureola', name: 'Aureola Alada', level: 2 },
  { key: 'oraculo', name: 'Oráculo Prismático', level: 3 },
  { key: 'centinela', name: 'Centinela de Cuarzo', level: 3 },
  { key: 'capataz', name: 'Capataz de Bronce', level: 4 },
  { key: 'forjador', name: 'Forjador de Engranajes', level: 4 },
  { key: 'nube', name: 'Nube Viviente', level: 5 },
  { key: 'tempestad', name: 'Tempestad Alada', level: 5 },
  { key: 'espina', name: 'Espina Mayor', level: 6 },
  { key: 'raiz', name: 'Raíz Primigenia', level: 6 },
  { key: 'ecos', name: 'Ecos del Abismo', level: 7 },
];

// ---------- Estado del juego ----------
const Game = {
  state: 'title', t: 0, player: new Player(), enemies: [], hazards: [], objs: [], boss: null,
  cam: { x: 0, y: 0 }, room: null, banner: null, toasts: [], fade: 0, fadeDir: 0,
  respawn: { room: 'santuario', tx: 14, ty: 15 }, beaten: {}, secrets: new Set(), killed: new Set(),
  dyn: [], winds: [], props: [], roomT: 0, menu: null, clearT: 0, clearLevel: 1, phaseSet: 'a', abilityT: 0, abilityKey: null,
  flashHud: 0, deadT: 0, victoryT: 0, playTime: 0, timeScale: 1, slowT: 0, titleT: 0,
  mapZone: 0, pauseSel: 0, zoneCard: null, creditsT: 0, creditsPage: 0,

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
    const hasC = this.secrets.has('cristal') || this.secrets.has('cristal2') || this.secrets.has('cristal3');
    const hasO = this.secrets.has('orbe') || this.secrets.has('orbe2') || this.secrets.has('orbe3');
    const hasV = this.secrets.has('vasija') || this.secrets.has('vasija2');
    p.soulGain = hasC ? 17 : P.SOUL_HIT;
    if (hasO) p.soulGain += 5;
    p.healTime = hasC ? 0.62 : P.HEAL_T;
    p.healCost = hasV ? 24 : P.HEAL_COST;
    p.hasDouble = this.secrets.has('celeste');
    p.hasCharge = this.secrets.has('cargado');
  },
  saveGame() {
    const ok = Save.write({
      v: 1, ver: 3, level: this.level, respawn: this.respawn, maxHp: this.player.maxHp,
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
    // Migración: Heraldo → Salto Celeste; Oráculo → Sable Cargado
    if (this.beaten.heraldo && !this.secrets.has('celeste')) this.secrets.add('celeste');
    if (this.beaten.oraculo && !this.secrets.has('cargado')) this.secrets.add('cargado');
    // Partidas que terminaban en N3: ahora continúan hacia N4 (créditos solo tras Ecos)
    if (d.completed && !this.beaten.ecos) {
      delete d.completed;
      try { Save.write(Object.assign({}, d, { completed: false })); } catch (e) {}
    }
    this.killed = new Set(); this.playTime = d.playTime || 0;
    World.rooms.forEach(r => { r.visited = (d.visited || []).includes(r.id); });
    this.restoreWalls();
    this.respawn = d.respawn && World.byId[d.respawn.room] ? d.respawn : { room: 'santuario', tx: 14, ty: 15 };
    this.applyUpgrades();
    this.spawnAtRespawn();
    this.state = 'play';
    this.toast('Partida cargada: ' + World.byId[this.respawn.room].name, 3);
    let migrated = false;
    if (this.secrets.has('celeste') && !(d.secrets || []).includes('celeste')) { this.toast('Has obtenido el Salto Celeste: salta de nuevo en el aire', 4); migrated = true; }
    if (this.secrets.has('cargado') && !(d.secrets || []).includes('cargado')) { this.toast('Has obtenido el Sable Cargado: mantén ATACAR y suelta', 4); migrated = true; }
    if (migrated) this.saveGame();
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
    const charge = w.d && w.d.charge;
    FX.burst(w.x + w.w / 2, w.y + w.h / 2, charge ? 40 : 30, { colors: charge ? ['#7ad8ff', '#ffffff', '#ff3a5c'] : ['#a57c55', '#e6c48a', '#241610'], speed: 160, life: 0.7 });
    FX.shake(5, 0.3); FX.stop(6); sfx('crumble');
    this.toast(charge ? '¡El sello de cristal se hace trizas!' : '¡Un pasaje oculto!', 2.5);
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
    if ((this.state === 'title' || this.state === 'pause' || this.state === 'map' || this.state === 'collection' || this.state === 'controls') && this.onSoundButton(lx, ly)) { Sound.toggle(); return true; }
    if (this.state === 'pause') {
      for (const b of this.pauseButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 4 && ly <= b.y + b.h + 4) { this.pauseAction(b.id); return true; }
      return true;   // consumir el toque: no reanudar al tocar el fondo
    }
    if (this.state === 'map') {
      for (const b of this.mapButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 4 && ly <= b.y + b.h + 4) { this.mapAction(b.id); return true; }
      // tocar una zona en la vista general
      if (this.mapZone === 0) {
        for (const z of this.mapZoneHits()) if (lx >= z.x && lx <= z.x + z.w && ly >= z.y && ly <= z.y + z.h) { this.mapZone = z.lv; return true; }
      }
      return true;
    }
    if (this.state === 'collection') {
      for (const b of this.collectionButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 4 && ly <= b.y + b.h + 4) { this.collectionAction(b.id); return true; }
      return true;
    }
    if (this.state === 'controls') {
      for (const b of this.controlsButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 4 && ly <= b.y + b.h + 4) { this.controlsAction(b.id); return true; }
      return true;
    }
    if (this.state !== 'title' || !this.menu) return false;
    for (const b of this.menuButtons()) if (lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 6 && ly <= b.y + b.h + 6) { this.menuAction(b.id); return true; }
    if (!this.menu.confirm && this.menu.items.length === 1) { this.menuAction(this.menu.items[0]); return true; }
    return false;
  },
  pauseButtons() {
    const labels = [['resume', 'Reanudar'], ['map', 'Mapa'], ['collection', 'Colección'], ['controls', 'Controles']];
    const w = 140, h = 20, x = (VW - w) / 2, y0 = 68, gap = 8;
    return labels.map(([id, label], i) => ({ id, label, x, y: y0 + i * (h + gap), w, h }));
  },
  pauseAction(id) {
    if (id === 'resume') this.state = 'play';
    else if (id === 'map') { this.state = 'map'; this.mapZone = 0; }
    else if (id === 'collection') this.state = 'collection';
    else if (id === 'controls') this.state = 'controls';
  },
  controlsButtons() {
    return [{ id: 'back', label: '← Volver', x: 12, y: VH - 24, w: 70, h: 16 }];
  },
  controlsAction(id) { if (id === 'back') this.state = 'pause'; },
  mapButtons() {
    const btns = [{ id: 'back', label: '← Volver', x: 12, y: VH - 24, w: 70, h: 16 }];
    if (this.mapZone === 0) {
      // pestañas de nivel solo en detalle; en vista general no hacen falta
    } else {
      btns.push({ id: 'overview', label: 'Vista general', x: VW - 92, y: VH - 24, w: 80, h: 16 });
      btns.push({ id: 'prev', label: '‹', x: VW / 2 - 60, y: 18, w: 18, h: 16 });
      btns.push({ id: 'next', label: '›', x: VW / 2 + 42, y: 18, w: 18, h: 16 });
    }
    return btns;
  },
  mapAction(id) {
    if (id === 'back') { if (this.mapZone) this.mapZone = 0; else this.state = 'pause'; }
    else if (id === 'overview') this.mapZone = 0;
    else if (id === 'prev') this.mapZone = this.mapZone <= 1 ? 6 : this.mapZone - 1;
    else if (id === 'next') this.mapZone = this.mapZone >= 6 ? 1 : this.mapZone + 1;
  },
  mapZoneHits() {
    const w = 100, h = 72, gap = 8, cols = 3;
    const total = cols * w + (cols - 1) * gap, x0 = (VW - total) / 2;
    return [1, 2, 3, 4, 5, 6].map((lv, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      return { lv, x: x0 + col * (w + gap), y: 42 + row * (h + 10), w, h };
    });
  },
  collectionButtons() {
    return [{ id: 'back', label: '← Volver', x: 12, y: VH - 24, w: 70, h: 16 }];
  },
  collectionAction(id) { if (id === 'back') this.state = 'pause'; },

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
    if (this.boss && this.boss.state === 'dying') this.victory(this.boss);
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
    this.props = room.walls.filter(w => !this.secrets.has(w.id)).map(w => w.charge ? new ChargeSeal(room, w) : new BreakWall(room, w));
    for (const d of room.beams) this.hazards.push(new Beam(room, d));
    // Salvaguarda: en el Nivel 3 siempre se tiene el Salto Celeste si el Heraldo fue vencido
    if (room.level === 3 && this.beaten.heraldo && !this.secrets.has('celeste')) { this.secrets.add('celeste'); this.applyUpgrades(); this.toast('Salto Celeste: pulsa SALTAR otra vez en el aire', 4); }
    this.player.plat = null;
    room.objs.forEach((o, idx) => {
      const x = room.px + o.tx * TILE, y = room.py + o.ty * TILE;
      const kid = room.id + ':' + idx;
      // los enemigos muertos no vuelven (salvo al descansar en un banco)
      if (ENEMY_TYPES.includes(o.type) && (this.killed.has(kid) || (window.GAME && window.GAME.noEnemies))) return;
      const add = e => { e.kid = kid; e.day = !!o.day || room.theme !== 'night'; e.crystal = room.theme === 'crystal' || room.theme === 'garden'; this.enemies.push(e); };
      if (o.type === 'walker') add(new Walker(x, y));
      else if (o.type === 'flyer') add(new Flyer(x, y));
      else if (o.type === 'shield') add(new Shielder(x, y));
      else if (o.type === 'turret') add(new Turret(x, y));
      else if (o.type === 'prisma') add(new Prisma(x, y));
      else if (o.type === 'moth') add(new Moth(x, y));
      else if (o.type === 'gear') add(new Gear(x, y));
      else if (o.type === 'spark') add(new Spark(x, y));
      else if (o.type === 'sprout') add(new Sprout(x, y));
      else if (o.type === 'switch') this.props.push(new CrystalSwitch(x, y));
      else if (o.type === 'boss' && !this.beaten[o.boss]) this.boss = (typeof BOSS_FACTORY !== 'undefined' && BOSS_FACTORY[o.boss]) ? BOSS_FACTORY[o.boss](x, y, room) : new Boss(x, y, room);
      else if (o.type === 'celeste') { if (this.beaten.heraldo && !this.secrets.has('celeste')) this.objs.push(this.makePickup(o.type, x, y)); }
      else if (o.type === 'cargado') { if (this.beaten.oraculo && !this.secrets.has('cargado')) this.objs.push(this.makePickup(o.type, x, y)); }
      else if (PICKUPS[o.type] && !this.secrets.has(o.type)) this.objs.push(this.makePickup(o.type, x, y));
      else if (o.type === 'bench') this.objs.push({ type: 'bench', x: x - 12, y: y - 10, w: 24, h: 10, tx: o.tx, ty: o.ty });
      else if (o.type === 'sign') this.objs.push({ type: 'sign', x: x - 4, y: y - 14, w: 8, h: 14, text: o.text });
    });
    const firstOfLevel = !World.rooms.some(r => r.level === room.level && r.visited);
    if (firstOfLevel && ZONE_INTRO[room.level]) this.zoneCard = { level: room.level, t: 0 };
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
    this.saveGame();
    sfx('bossDie');
  },
  // Cierre único del combate (todos los jefes al terminar 'dying'): abre puertas y devuelve la vulnerabilidad normal;
  // los principales muestran su pantalla y los minijefes solo un aviso. Una segunda llamada para el mismo jefe no hace nada.
  victory(b) {
    if (!b || b.closed) return;
    b.closed = true; b.dead = true;
    this.player.invulnT = 0;
    this.syncDoors(); sfx('doorOpen');
    const key = b.key;
    if (!MAIN_BOSSES[key]) { this.toast((b.name || 'Enemigo') + ' derrotado', 2.5); return; }
    if (key === 'ecos') {
      this.state = 'levelclear'; this.clearT = 0; this.clearLevel = 7;
      const cur = Save.load() || { v: 1 };
      Save.write(Object.assign(cur, { v: 1, completed: true, beaten: Object.assign({}, cur.beaten || {}, this.beaten), secrets: [...this.secrets], playTime: this.playTime }));
      return;
    }
    this.state = 'levelclear'; this.clearT = 0; this.clearLevel = MAIN_BOSSES[key];
    if (key === 'oraculo' && !this.secrets.has('cargado')) {
      const o = this.room.objs.find(o => o.type === 'cargado');
      const x = o ? this.room.px + o.tx * TILE : (b.cx || this.player.cx);
      const y = o ? this.room.py + o.ty * TILE : (b.cy || this.player.cy);
      this.objs.push(this.makePickup('cargado', x, y));
    }
    if (key === 'heraldo' && !this.secrets.has('celeste')) {
      const o = this.room.objs.find(o => o.type === 'celeste');
      if (o) this.objs.push(this.makePickup('celeste', this.room.px + o.tx * TILE, this.room.py + o.ty * TILE));
    }
  },
  startCredits() { this.state = 'credits'; this.creditsT = 0; this.creditsPage = 0; FX.clear(); },
  musicName() {
    const s = this.state;
    if (s === 'title') return 'title';
    if (s === 'victory' || s === 'credits') return 'victory';
    if (s === 'levelclear' || s === 'ability') return 'clear';
    const b = this.boss;
    if (b && b.state !== 'dormant' && b.state !== 'dying' && !b.dead) return 'boss' + this.level;
    if (this.slowT > 0 || (b && b.state === 'dying')) return null;
    return ({ 1: 'cave', 2: 'dawn', 3: 'crystal', 4: 'forge', 5: 'storm', 6: 'garden', 7: 'final' })[this.level] || 'cave';
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
        if (this.clearLevel === 7) { this.startCredits(); return; }
        if (this.clearLevel === 3 && !this.secrets.has('cargado')) {
          this.state = 'play'; this.toast('Recoge el Sable Cargado en la arena', 4); return;
        }
        this.state = 'play';
        const next = {
          1: 'Se ha abierto un camino al este: Cumbres del Alba',
          2: 'Recoge la pluma del Heraldo. Al este: Templo de Cristal',
          3: 'Al este: Forja de Engranajes',
          4: 'Al este: Techos de la Tormenta',
          5: 'Al este: Jardín de Luz',
          6: 'Al este: Abismo Carmesí — el final',
        };
        this.toast(next[this.clearLevel] || 'Continúa al este', 4);
      }
      return;
    }
    if (this.state === 'ability') {
      this.abilityT += dt; FX.update(dt);
      if ((this.abilityT > 1.2 && (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack'))) || this.abilityT > 8) {
        this.player.jumpBuf = 0;
        this.state = 'play';
        if (this.abilityKey === 'cargado') this.toast('Al este se abre la Forja de Engranajes', 4);
      }
      return;
    }
    if (this.state === 'credits') {
      this.creditsT += dt; FX.update(dt);
      if (this.creditsT > 1.0 && (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack'))) {
        if (this.creditsPage < CREDITS.length - 1) { this.creditsPage++; this.creditsT = 0.35; sfx('move'); }
        else this.openTitle();
      }
      return;
    }
    if (this.state === 'pause') {
      const btns = this.pauseButtons();
      if (Input.pressed('up')) this.pauseSel = (this.pauseSel + btns.length - 1) % btns.length;
      if (Input.pressed('down')) this.pauseSel = (this.pauseSel + 1) % btns.length;
      if (Input.pressed('pause')) this.state = 'play';
      else if (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) this.pauseAction(btns[this.pauseSel].id);
      return;
    }
    if (this.state === 'map') {
      if (Input.pressed('pause')) { if (this.mapZone) this.mapZone = 0; else this.state = 'pause'; }
      else if (Input.pressed('left') || Input.pressed('up')) {
        if (this.mapZone) this.mapZone = this.mapZone <= 1 ? 6 : this.mapZone - 1;
      } else if (Input.pressed('right') || Input.pressed('down')) {
        if (this.mapZone) this.mapZone = this.mapZone >= 6 ? 1 : this.mapZone + 1;
        else this.mapZone = 1;
      } else if (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) {
        if (this.mapZone === 0) this.mapZone = 1; else this.mapZone = 0;
      }
      return;
    }
    if (this.state === 'collection') {
      if (Input.pressed('pause') || Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) this.state = 'pause';
      return;
    }
    if (this.state === 'controls') {
      if (Input.pressed('pause') || Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) this.state = 'pause';
      return;
    }
    if (this.state === 'victory') {
      this.victoryT += dt; FX.update(dt);
      if (this.victoryT > 1.5 && (Input.pressed('start') || Input.pressed('jump'))) this.openTitle();
      return;
    }
    if (this.state === 'play' && (Input.pressed('pause') || Input.pressed('start'))) { this.state = 'pause'; this.pauseSel = 0; return; }
    if (this.flashHud > 0) this.flashHud -= dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    if (this.zoneCard) { this.zoneCard.t += dt; if (this.zoneCard.t > 3.2) this.zoneCard = null; }
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
        if ((o.type === 'cristal' || o.type === 'cristal2' || o.type === 'cristal3') || (o.type === 'vasija' || o.type === 'vasija2') || (o.type === 'orbe' || o.type === 'orbe2' || o.type === 'orbe3')) p.soul = 99;
        FX.ring(o.x + 5, o.y + 6, pk.col, 44); FX.burst(o.x + 5, o.y + 6, 30, { colors: [pk.col, '#ffffff'], speed: 150, grav: 0 }); FX.stop(10);
        sfx('pickup'); this.flashHud = 0.6;
        if (pk.ability) { this.state = 'ability'; this.abilityT = 0; this.abilityKey = o.type; this.saveGame(); }
        else this.toast(pk.msg, 4);
      }
    }
    this.objs = this.objs.filter(o => !o.taken);

    for (const e of this.enemies) if (!e.dead) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    for (const h of this.hazards) h.update(dt, this);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.props = this.props.filter(w => !w.dead);
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
      if (this.state === 'map') this.drawMap(sctx);
      if (this.state === 'collection') this.drawCollection(sctx);
      if (this.state === 'controls') this.drawControlsScreen(sctx);
      if (this.state === 'victory') this.drawVictory(sctx);
      if (this.state === 'levelclear') this.drawLevelClear(sctx);
      if (this.state === 'ability') this.drawAbility(sctx);
      if (this.state === 'credits') this.drawCredits(sctx);
      if (this.zoneCard && (this.state === 'play' || this.state === 'dying')) this.drawZoneCard(sctx);
    }
    sctx.restore();
  },

  drawThemeBg(r, cx, cy, cols, accent, spar) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = accent;
    for (let i = 0; i < 22; i++) {
      const px = ((i * 97 + Math.floor(this.t * 18) - cx * 0.05) % VW + VW) % VW;
      const py = 18 + (i * 53 + Math.floor(cy * 0.03)) % Math.max(1, VH - 36);
      ctx.globalAlpha = spar; ctx.fillRect(px, py, 2, 2);
    }
    ctx.globalAlpha = 1;
  },
  drawDaySky(r, cx, cy) {
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, '#4aa8f0'); grd.addColorStop(0.45, '#aee0ff'); grd.addColorStop(0.75, '#ffe8c0'); grd.addColorStop(1, '#ffd090');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // sol y corona
    const sx = VW * 0.78 - cx * 0.02, sy = 44;
    ctx.fillStyle = 'rgba(255,244,200,0.2)'; ctx.beginPath(); ctx.arc(sx, sy, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,244,200,0.4)'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sx - 4, sy - 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.12)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(sx - 70 + i * 45, 0); ctx.lineTo(sx - 25 + i * 45, 0); ctx.lineTo(sx - 200 + i * 65, VH); ctx.lineTo(sx - 260 + i * 65, VH); ctx.fill(); }
    const mount = (par, base, amp, col, seed) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, VH);
      for (let x = 0; x <= VW + 20; x += 16) {
        const wx = x + cx * par, i = Math.floor(wx / 60), f = (wx / 60) - i;
        const h0 = hash(i, seed), h1 = hash(i + 1, seed);
        const h = h0 + (h1 - h0) * (f * f * (3 - 2 * f));
        ctx.lineTo(x, base - h * amp - (cy * par * 0.2) % 30);
      }
      ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill();
    };
    mount(0.05, 175, 100, '#c8d8f0', 2);
    mount(0.1, 195, 85, '#a8c0e4', 3);
    // nubes en capas
    for (let i = 0; i < 9; i++) {
      const par = 0.1 + (i % 3) * 0.07;
      const x = ((hash(i, 41) * 900 - cx * par + this.t * (3 + i * 0.7)) % 640 + 640) % 640 - 80;
      const y = 16 + hash(i, 43) * 95 - cy * par * 0.2 % 20;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)';
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + k * 11, y + (k % 2 ? -6 : 0), 9 + (k % 3) * 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(180,200,230,0.85)'; ctx.fillRect(x - 6, y + 7, 58, 3);
    }
    mount(0.22, 235, 70, '#8eacd8', 7);
    // ruinas / acantilados
    ctx.fillStyle = '#7a96c0';
    const sp = 88, ox = -((cx * 0.22) % sp) - sp;
    for (let x = ox, i = Math.floor(cx * 0.22 / sp); x < VW + sp; x += sp, i++) {
      if (hash(i, 9) < 0.4) continue;
      const h = 28 + hash(i, 11) * 48, top = 198 - h;
      const rx = Math.round(x);
      ctx.fillRect(rx, top, 9, h + 70); ctx.fillRect(rx + 24, top + 8, 9, h + 60);
      ctx.fillRect(rx - 3, top, 42, 5);
      if (hash(i, 13) > 0.5) { ctx.fillStyle = '#6a86b0'; ctx.fillRect(rx + 2, top + 14, 5, 8); ctx.fillStyle = '#7a96c0'; }
    }
    // aves lejanas
    ctx.strokeStyle = 'rgba(40,50,80,0.45)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const bx = ((this.t * (12 + i * 4) + i * 180 - cx * 0.08) % (VW + 40)) - 20;
      const by = 40 + i * 18 + Math.sin(this.t * 2 + i) * 3;
      ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.quadraticCurveTo(bx, by - 4, bx + 5, by); ctx.stroke();
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
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, '#e8f0ff'); grd.addColorStop(0.75, '#fff4e0'); grd.addColorStop(1, '#ffe8c8');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // vitral lejano
    for (let i = 0; i < 4; i++) {
      const x = ((i * 140 - cx * 0.08) % 620 + 620) % 620 - 40;
      ctx.fillStyle = i % 2 ? 'rgba(255,160,210,0.18)' : 'rgba(120,190,255,0.18)';
      ctx.fillRect(x, 30, 40, 90);
      ctx.strokeStyle = 'rgba(100,120,180,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(x, 30, 40, 90);
      ctx.beginPath(); ctx.moveTo(x + 20, 30); ctx.lineTo(x + 20, 120); ctx.moveTo(x, 75); ctx.lineTo(x + 40, 75); ctx.stroke();
    }
    // haces de luz
    for (let i = 0; i < 6; i++) {
      const x = ((i * 118 - cx * 0.05 + Math.sin(this.t * 0.3 + i) * 8) % 650 + 650) % 650 - 80;
      ctx.fillStyle = `rgba(255,236,170,${0.14 + 0.06 * Math.sin(this.t * 0.8 + i)})`;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 60, VH); ctx.lineTo(x - 120, VH); ctx.fill();
    }
    const layer = (par, col, sp, top) => {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 5;
      const ox = -((cx * par) % sp) - sp;
      for (let x = ox, i = Math.floor(cx * par / sp); x < VW + sp; x += sp, i++) {
        const t0 = top - (cy * par * 0.3) % 30;
        ctx.fillRect(Math.round(x), t0, 12, VH); ctx.fillRect(Math.round(x - 3), t0, 18, 5);
        ctx.beginPath(); ctx.arc(Math.round(x + sp / 2 + 6), t0 + 14, sp / 2 - 8, Math.PI, 0); ctx.stroke();
        // remate dorado
        ctx.fillStyle = 'rgba(255,210,74,0.55)'; ctx.fillRect(Math.round(x - 2), t0, 16, 2);
        ctx.fillStyle = col;
      }
    };
    layer(0.15, '#d6e2fa', 96, 55); layer(0.35, '#c4d4f4', 70, 92);
    // cristales flotantes
    for (let i = 0; i < 16; i++) {
      const par = 0.2 + (i % 3) * 0.15;
      const x = ((hash(i, 21) * 900 - cx * par) % 560 + 560) % 560 - 40;
      const y = ((hash(i, 23) * 260 - cy * par * 0.3 + Math.sin(this.t * 0.9 + i) * 6) % 280 + 280) % 280 - 4;
      const sz = 3 + (i % 3) * 2;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,140,220,0.6)' : 'rgba(120,200,255,0.6)';
      ctx.beginPath(); ctx.moveTo(x, y - sz * 1.6); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz * 1.6); ctx.lineTo(x - sz, y); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - 1, y - sz, 1, sz);
    }
    // motas doradas + reflejos
    ctx.fillStyle = 'rgba(255,200,80,0.85)';
    for (let i = 0; i < 24; i++) {
      const x = ((hash(i, 31) * VW * 1.5 - cx * 0.5) % VW + VW) % VW;
      const y = ((hash(i, 37) * VH - this.t * (6 + hash(i, 5) * 8) - cy * 0.5) % VH + VH) % VH;
      ctx.fillRect(Math.round(x), Math.round(y), 1 + (i % 6 === 0 ? 1 : 0), 1);
    }
  },
  drawBackground(r, cx, cy) {
    if (r.theme === 'day') return this.drawDaySky(r, cx, cy);
    if (r.theme === 'crystal') return this.drawCrystalBg(r, cx, cy);
    if (r.theme === 'forge') return this.drawThemeBg(r, cx, cy, ['#3a1810', '#1a0804'], '#ffb020', 0.12);
    if (r.theme === 'storm') return this.drawThemeBg(r, cx, cy, ['#0c1830', '#040810'], '#7ad8ff', 0.14);
    if (r.theme === 'garden') return this.drawThemeBg(r, cx, cy, ['#102418', '#06100a'], '#6fe080', 0.12);
    if (r.theme === 'final') return this.drawThemeBg(r, cx, cy, ['#2a0810', '#0a0206'], '#ff3a5c', 0.16);
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, r.bg[0]); grd.addColorStop(0.55, shade(r.bg[1], 1.15)); grd.addColorStop(1, r.bg[1]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    // abismo lejano (void)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(VW * 0.5 - cx * 0.02, VH * 0.72 - cy * 0.02, 160, 70, 0, 0, Math.PI * 2); ctx.fill();
    // estrellas / motas lejanas
    ctx.fillStyle = 'rgba(220,200,255,0.55)';
    for (let i = 0; i < 18; i++) {
      const x = ((hash(i, 2) * VW - cx * 0.04) % VW + VW) % VW;
      const y = hash(i, 5) * 110;
      const tw = 0.4 + 0.6 * ((Math.sin(this.t * 2 + i) + 1) * 0.5);
      ctx.globalAlpha = tw; ctx.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
    // capas de parallax: ruinas del abismo
    const layers = [[0.12, 0.38, 90], [0.28, 0.55, 64], [0.48, 0.82, 42]];
    for (const [par, k, spacing] of layers) {
      ctx.fillStyle = shade(r.tint, k * 0.34);
      const ox = -((cx * par) % spacing) - spacing;
      for (let x = ox, i = Math.floor(cx * par / spacing); x < VW + spacing; x += spacing, i++) {
        const hr = hash(i, par * 100 | 0);
        const top = 30 + hr * 100 - (cy * par * 0.3) % 40;
        const w = 10 + hr * 16;
        const rx = Math.round(x), rt = Math.round(top), rw = Math.round(w);
        ctx.fillRect(rx, rt, rw, VH);
        ctx.fillRect(rx - 4, rt, rw + 8, 5);
        if (hr > 0.45) {
          ctx.beginPath(); ctx.arc(rx + spacing / 2 + rw / 2, rt + 12, spacing / 2 - 4, Math.PI, 0);
          ctx.lineWidth = 5; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
        }
        // ventanas huecas
        if (hr > 0.65) {
          ctx.fillStyle = 'rgba(8,4,14,0.55)';
          ctx.fillRect(rx + 2, rt + 18, Math.max(3, rw - 4), 10);
          ctx.fillStyle = shade(r.tint, k * 0.34);
        }
        // antorcha lejana
        if (hr > 0.88) {
          const fx = rx + rw / 2, fy = rt + 14;
          ctx.fillStyle = 'rgba(255,140,60,0.35)'; ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd28a'; ctx.fillRect(fx - 1, fy - 2, 2, 3);
        }
      }
    }
    // motas cercanas
    ctx.fillStyle = 'rgba(200,220,255,0.4)';
    for (let i = 0; i < 28; i++) {
      const hx = hash(i, 7), hy = hash(i, 13);
      const x = ((hx * VW * 1.5 - cx * 0.6 + Math.sin(this.t * 0.5 + i) * 10) % VW + VW) % VW;
      const y = ((hy * VH - this.t * (4 + hx * 8) - cy * 0.6) % VH + VH) % VH;
      ctx.fillRect(Math.round(x), Math.round(y), 1 + (i % 7 === 0 ? 1 : 0), 1);
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
    for (const w of this.props) if (!w.dead) w.draw(ctx);
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
      ctx.fillStyle = '#1c0810'; ctx.fillRect(x + 2, y - 1, 12, d.h * TILE + 2);
      for (let i = 0; i < d.h * TILE; i += 4) {
        ctx.fillStyle = (Math.floor(this.t * 12) + i / 4) % 2 ? '#ff3a5c' : '#ff9ab0';
        ctx.fillRect(x + 4, y + i, 8, 3);
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 7, y + d.h * TILE / 2 - 2, 2, 4);
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
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, r.theme === 'day' ? 'rgba(90,40,0,0.12)' : r.theme === 'crystal' ? 'rgba(60,80,160,0.12)' : r.theme === 'forge' ? 'rgba(90,40,0,0.18)' : r.theme === 'storm' ? 'rgba(20,40,90,0.16)' : r.theme === 'garden' ? 'rgba(20,60,30,0.14)' : r.theme === 'final' ? 'rgba(80,10,20,0.2)' : 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
    if (this.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade * 2)})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.state === 'dying') { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.deadT / 1.2)})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.player.spikeT > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.7 - Math.abs(this.player.spikeT - 0.22) * 3)})`; ctx.fillRect(0, 0, VW, VH); }
  },

  drawObj(o) {
    const x = Math.round(o.x), y = Math.round(o.y);
    if (o.type === 'bench') {
      ctx.fillStyle = '#1c1010'; ctx.fillRect(x - 1, y + 1, o.w + 2, 5);
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(x, y + 2, o.w, 3);
      ctx.fillStyle = '#c09058'; ctx.fillRect(x, y + 1, o.w, 1);
      ctx.fillStyle = '#4a3220'; ctx.fillRect(x + 2, y + 5, 2, 5); ctx.fillRect(x + o.w - 4, y + 5, 2, 5);
      ctx.fillStyle = '#1c1010'; ctx.fillRect(x, y - 8, o.w, 3);
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(x + 1, y - 7, 2, 9); ctx.fillRect(x + o.w - 3, y - 7, 2, 9); ctx.fillRect(x + 1, y - 7, o.w - 2, 2);
      ctx.fillStyle = '#c09058'; ctx.fillRect(x + 1, y - 7, o.w - 2, 1);
      // llama del banco + glow
      const fl = Math.sin(this.t * 8) > 0 ? 1 : 0;
      const fx = x + o.w / 2, fy = y - 12 - fl;
      ctx.fillStyle = 'rgba(255,160,60,0.35)'; ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd28a'; ctx.fillRect(fx - 1, y - 14 - fl, 3, 4);
      ctx.fillStyle = '#ff9a3c'; ctx.fillRect(fx - 1, y - 11, 3, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, y - 14 - fl, 1, 2);
      const p = this.player;
      if (!p.sitting && aabb(p, { x: o.x - 4, y: o.y - 20, w: o.w + 8, h: 30 })) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + o.w / 2 - 1, y - 26 + Math.round(Math.sin(this.t * 5)), 3, 3);
        ctx.fillRect(x + o.w / 2 - 3, y - 24 + Math.round(Math.sin(this.t * 5)), 7, 1);
        o.prompt = true;
      } else o.prompt = false;
    } else if ((o.type === 'vasija' || o.type === 'vasija2')) {
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
    } else if (o.type === 'cargado') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(255,58,92,0.45)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#16203a'; ctx.fillRect(x - 2, y + b, 14, 4);
      ctx.fillStyle = '#ff3a5c'; ctx.fillRect(x - 1, y + 1 + b, 12, 2);
      ctx.fillStyle = '#ffd28a'; ctx.fillRect(x + 8, y - 2 + b, 4, 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 9, y - 1 + b, 2, 4);
    } else if ((o.type === 'orbe' || o.type === 'orbe2' || o.type === 'orbe3')) {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      ctx.fillStyle = 'rgba(255,90,120,0.4)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a0010'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5a78'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y + 3 + b, 2, 2);
    } else if (/^shard\d*$/.test(o.type) || o.type === 'shard') {
      const b = Math.round(Math.sin(this.t * 3) * 2);
      if (this.room.theme !== 'night') { ctx.fillStyle = 'rgba(22,32,58,0.5)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(191,246,255,0.3)'; ctx.beginPath(); ctx.arc(x + 5, y + 6 + b, 9, 0, Math.PI * 2); ctx.fill();
      drawMask(ctx, x, y + b, 10, 12, true, '#ffffff');
    } else if ((o.type === 'cristal' || o.type === 'cristal2' || o.type === 'cristal3')) {
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
      const a = t < 0.35 ? t / 0.35 : t > 2.0 ? Math.max(0, 1 - (t - 2.0) / 0.6) : 1;
      g.globalAlpha = a;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = b.boss ? 'bold 18px Georgia, serif' : '15px Georgia, serif';
      { const bw = g.measureText(b.text).width + 70, by = b.boss ? 70 : 58;
        const gr = g.createLinearGradient(VW / 2 - bw / 2, 0, VW / 2 + bw / 2, 0);
        gr.addColorStop(0, 'rgba(10,6,16,0)'); gr.addColorStop(0.15, 'rgba(10,6,16,0.7)'); gr.addColorStop(0.85, 'rgba(10,6,16,0.7)'); gr.addColorStop(1, 'rgba(10,6,16,0)');
        g.fillStyle = gr; g.fillRect(VW / 2 - bw / 2, by - 16, bw, 34);
        g.strokeStyle = b.boss ? 'rgba(255,58,92,0.7)' : 'rgba(200,192,216,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(VW / 2 - bw / 2 + 20, by + 14); g.lineTo(VW / 2 + bw / 2 - 20, by + 14); g.stroke();
        // diamantes decorativos
        g.fillStyle = b.boss ? '#ff3a5c' : '#ffd28a';
        for (const sd of [-1, 1]) {
          const dx = VW / 2 + sd * (bw / 2 - 14), dy = by;
          g.beginPath(); g.moveTo(dx, dy - 3); g.lineTo(dx + 3, dy); g.lineTo(dx, dy + 3); g.lineTo(dx - 3, dy); g.fill();
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillText(b.text, VW / 2 + 1, (b.boss ? 70 : 58) + 1);
      g.fillStyle = b.boss ? '#ffb0c0' : '#eef0fa'; g.fillText(b.text, VW / 2, b.boss ? 70 : 58);
      g.globalAlpha = 1;
    }
    // barra del jefe
    const bo = this.boss;
    if (bo && bo.state !== 'dormant' && !bo.dead) {
      const w = 260, x = (VW - w) / 2, y = VH - 18;
      g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(x - 3, y - 3, w + 6, 11);
      g.strokeStyle = bo.phase2 ? 'rgba(255,90,120,0.7)' : 'rgba(255,210,138,0.45)'; g.lineWidth = 1; g.strokeRect(x - 2.5, y - 2.5, w + 5, 10);
      g.fillStyle = '#3a0d18'; g.fillRect(x, y, w, 5);
      const hw = w * (bo.hp / bo.maxHp);
      g.fillStyle = bo.phase2 ? '#ff3a5c' : '#d8283f'; g.fillRect(x, y, hw, 5);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, hw, 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 4, hw, 1);
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
      ['Mantén ATACAR y suelta', 'Sable Cargado: onda de energía (Nivel 3)'],
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
      ['Mantén Ataque y suelta', 'Sable Cargado: onda de energía (Nivel 3)'],
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


  uiPanel(g, x, y, w, h, accent) {
    g.fillStyle = 'rgba(6,4,14,0.82)'; g.fillRect(x, y, w, h);
    g.strokeStyle = accent || 'rgba(255,58,92,0.7)'; g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    // esquinas
    g.fillStyle = accent || '#ff3a5c';
    g.fillRect(x, y, 8, 1); g.fillRect(x, y, 1, 8);
    g.fillRect(x + w - 8, y, 8, 1); g.fillRect(x + w - 1, y, 1, 8);
    g.fillRect(x, y + h - 1, 8, 1); g.fillRect(x, y + h - 8, 1, 8);
    g.fillRect(x + w - 8, y + h - 1, 8, 1); g.fillRect(x + w - 1, y + h - 8, 1, 8);
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
    g.font = 'bold 32px Georgia, serif';
    g.fillStyle = '#1a0008'; g.fillText(GAME_TITLE, 318, 37);
    g.fillStyle = '#ff5a78'; g.fillText(GAME_TITLE, 317, 35);
    g.fillStyle = '#ff3a5c'; g.fillText(GAME_TITLE, 316, 34);
    g.font = 'italic 12px Georgia, serif'; g.fillStyle = '#e8ecff'; g.fillText('— ' + GAME_SUB + ' —', 316, 56);
    g.font = '7px sans-serif'; g.fillStyle = '#a898c8'; g.fillText('Kaen, el espadachín carmesí, desciende al reino hueco', 316, 70);
    this.uiPanel(g, 186, 80, 282, 138, 'rgba(255,58,92,0.75)');
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
    g.font = '6px sans-serif'; g.fillStyle = '#6d6488'; g.fillText('Prototipo · arte procedural · Web Audio', 327, 267);
    if (!m || !m.confirm) this.drawSoundButton(g);
  },
  drawPause(g) {
    g.fillStyle = 'rgba(5,4,10,0.82)'; g.fillRect(0, 0, VW, VH);
    this.uiPanel(g, 70, 22, 340, 228, 'rgba(255,58,92,0.7)');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 20px Georgia, serif'; g.fillStyle = '#3a0010'; g.fillText('PAUSA', VW / 2 + 1, 45);
    g.fillStyle = '#ff3a5c'; g.fillText('PAUSA', VW / 2, 44);
    const btns = this.pauseButtons();
    btns.forEach((b, i) => {
      const sel = this.pauseSel === i;
      g.fillStyle = sel ? 'rgba(255,58,92,0.9)' : 'rgba(8,6,16,0.75)'; g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.35)'; g.lineWidth = sel ? 1.2 : 0.7; g.strokeRect(b.x, b.y, b.w, b.h);
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    });
    g.font = '7px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca una opción · ♪ sonido arriba a la izquierda' : '↑↓ elegir · ENTER confirmar · Esc reanudar · M sonido', VW / 2, 230);
    this.drawSoundButton(g);
  },
  drawMapBtn(g, b, sel) {
    g.fillStyle = sel ? 'rgba(255,58,92,0.85)' : 'rgba(8,6,16,0.8)'; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8; g.strokeRect(b.x, b.y, b.w, b.h);
    g.font = 'bold 8px sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
  },
  drawMap(g) {
    g.fillStyle = 'rgba(5,4,10,0.88)'; g.fillRect(0, 0, VW, VH);
    this.uiPanel(g, 8, 8, VW - 16, VH - 16, 'rgba(255,210,138,0.55)');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 14px Georgia, serif'; g.fillStyle = '#ffd28a';
    g.fillText(this.mapZone === 0 ? 'MAPA DEL MUNDO' : ('Nivel ' + this.mapZone + ' · ' + LEVEL_NAMES[this.mapZone]), VW / 2, 22);
    g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8';
    g.fillText('Solo lectura — no puedes viajar desde el mapa', VW / 2, 34);
    if (this.mapZone === 0) this.drawMapOverview(g); else this.drawMapZone(g, this.mapZone);
    // leyenda
    g.font = '6px sans-serif'; g.textAlign = 'left'; g.fillStyle = '#e8ecff';
    const lx = 90, ly = VH - 16;
    g.fillStyle = '#ffd28a'; g.fillRect(lx, ly - 3, 5, 5); g.fillStyle = '#e8ecff'; g.fillText('Aquí', lx + 8, ly);
    g.fillStyle = 'rgba(200,192,216,0.55)'; g.fillRect(lx + 36, ly - 3, 5, 5); g.fillStyle = '#e8ecff'; g.fillText('Visitada', lx + 44, ly);
    g.fillStyle = 'rgba(40,36,60,0.7)'; g.fillRect(lx + 88, ly - 3, 5, 5); g.strokeStyle = 'rgba(160,160,190,0.4)'; g.strokeRect(lx + 88, ly - 3, 5, 5);
    g.fillStyle = '#e8ecff'; g.fillText('Sin visitar', lx + 96, ly);
    g.fillStyle = '#ffd28a'; g.fillRect(lx + 150, ly - 2, 3, 3); g.fillStyle = '#e8ecff'; g.fillText('Banco', lx + 156, ly);
    g.fillStyle = '#ff3a5c'; g.fillRect(lx + 188, ly - 2, 3, 3); g.fillStyle = '#e8ecff'; g.fillText('Jefe', lx + 194, ly);
    g.fillStyle = '#7ad8ff'; g.fillRect(lx + 218, ly - 2, 3, 3); g.fillStyle = '#e8ecff'; g.fillText('Derrotado', lx + 224, ly);
    for (const b of this.mapButtons()) this.drawMapBtn(g, b, false);
    this.drawSoundButton(g);
  },
  drawMapOverview(g) {
    const zones = this.mapZoneHits();
    const themes = { 1: '#6a4a8a', 2: '#ffb020', 3: '#7ad8ff', 4: '#c08030', 5: '#5080c0', 6: '#3a8a40' };
    zones.forEach(z => {
      const rooms = World.rooms.filter(r => r.level === z.lv);
      const vis = rooms.filter(r => r.visited).length;
      g.fillStyle = 'rgba(8,6,16,0.75)'; g.fillRect(z.x, z.y, z.w, z.h);
      g.strokeStyle = themes[z.lv]; g.lineWidth = 1.2; g.strokeRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1);
      g.font = 'bold 9px sans-serif'; g.fillStyle = themes[z.lv]; g.textAlign = 'center';
      g.fillText('Nivel ' + z.lv, z.x + z.w / 2, z.y + 14);
      g.font = '7px sans-serif'; g.fillStyle = '#e8ecff'; g.fillText(LEVEL_SHORT[z.lv], z.x + z.w / 2, z.y + 26);
      // mini esquema
      this.drawRoomSchematic(g, rooms, z.x + 8, z.y + 36, z.w - 16, z.h - 70, false);
      g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8';
      g.fillText(vis + '/' + rooms.length + ' salas', z.x + z.w / 2, z.y + z.h - 22);
      const boss = BOSS_META.find(b => b.level === z.lv);
      g.fillStyle = this.beaten[boss.key] ? '#7ad8ff' : '#ff3a5c';
      g.fillText(this.beaten[boss.key] ? 'Jefe derrotado' : 'Jefe pendiente', z.x + z.w / 2, z.y + z.h - 10);
    });
    g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca una zona para ver sus salas' : 'ENTER o → para detallar · Esc volver', VW / 2, VH - 32);
  },
  drawMapZone(g, lv) {
    const rooms = World.rooms.filter(r => r.level === lv);
    this.drawRoomSchematic(g, rooms, 24, 44, VW - 48, VH - 78, true);
    g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Volver · Vista general' : '← → cambiar zona · Esc volver', VW / 2, VH - 32);
  },
  drawRoomSchematic(g, rooms, x, y, w, h, labeled) {
    if (!rooms.length) return;
    const minX = Math.min(...rooms.map(r => r.ox)), maxX = Math.max(...rooms.map(r => r.ox + r.w));
    const minY = Math.min(...rooms.map(r => r.oy)), maxY = Math.max(...rooms.map(r => r.oy + r.h));
    const sx = w / Math.max(1, maxX - minX), sy = h / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const ox = x + (w - (maxX - minX) * s) / 2, oy = y + (h - (maxY - minY) * s) / 2;
    // conexiones (salas solapadas ortogonalmente)
    g.strokeStyle = 'rgba(200,192,216,0.35)'; g.lineWidth = 1.5;
    for (const a of rooms) for (const b of rooms) {
      if (a.id >= b.id) continue;
      const ax = ox + (a.ox - minX + a.w / 2) * s, ay = oy + (a.oy - minY + a.h / 2) * s;
      const bx = ox + (b.ox - minX + b.w / 2) * s, by = oy + (b.oy - minY + b.h / 2) * s;
      const touch = !(a.ox + a.w < b.ox || b.ox + b.w < a.ox || a.oy + a.h < b.oy || b.oy + b.h < a.oy);
      const near = Math.abs((a.ox + a.w / 2) - (b.ox + b.w / 2)) < (a.w + b.w) / 2 + 2
        && Math.abs((a.oy + a.h / 2) - (b.oy + b.h / 2)) < (a.h + b.h) / 2 + 2;
      if (touch || near) { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    }
    for (const r of rooms) {
      const rx = ox + (r.ox - minX) * s, ry = oy + (r.oy - minY) * s;
      const rw = Math.max(6, r.w * s), rh = Math.max(6, r.h * s);
      const cur = this.room && this.room.id === r.id;
      if (!r.visited) {
        g.fillStyle = 'rgba(30,28,48,0.75)'; g.fillRect(rx, ry, rw, rh);
        g.strokeStyle = 'rgba(120,120,150,0.35)'; g.lineWidth = 0.6; g.strokeRect(rx, ry, rw, rh);
        if (labeled) {
          g.font = '5px sans-serif'; g.fillStyle = 'rgba(160,160,190,0.5)'; g.textAlign = 'center';
          g.fillText('???', rx + rw / 2, ry + rh / 2);
        }
        continue;
      }
      g.fillStyle = cur ? 'rgba(255,210,138,0.75)' : (r.secret ? 'rgba(159,230,255,0.35)' : 'rgba(200,192,216,0.45)');
      g.fillRect(rx, ry, rw, rh);
      g.strokeStyle = cur ? '#ffd28a' : 'rgba(238,240,250,0.7)'; g.lineWidth = cur ? 1.4 : 0.7; g.strokeRect(rx, ry, rw, rh);
      if (r.objs.some(o => o.type === 'bench')) {
        g.fillStyle = '#ffd28a'; g.fillRect(rx + rw / 2 - 1.5, ry + rh - 5, 3, 3);
      }
      const bossObj = r.objs.find(o => o.type === 'boss');
      if (bossObj) {
        const beaten = !!this.beaten[bossObj.boss];
        g.fillStyle = beaten ? '#7ad8ff' : '#ff3a5c';
        g.fillRect(rx + rw / 2 - 2, ry + rh / 2 - 2, 4, 4);
      }
      // salida a otra zona (exit door)
      if (r.doors.some(d => d.kind === 'exit')) {
        g.fillStyle = this.beaten[r.doors.find(d => d.kind === 'exit').boss] ? '#9fe6ff' : '#806020';
        g.fillRect(rx + rw - 4, ry + rh / 2 - 2, 3, 4);
      }
      if (labeled && rw > 28) {
        g.font = '5.5px sans-serif'; g.fillStyle = '#0c0814'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const nm = r.name.length > 14 ? r.name.slice(0, 12) + '…' : r.name;
        g.fillText(nm, rx + rw / 2, ry + 6);
      }
    }
    // marca del jugador
    if (this.room && rooms.includes(this.room) && Math.floor(this.t * 4) % 2) {
      const r = this.room;
      const px = ox + (this.player.cx / TILE - minX) * s;
      const py = oy + (this.player.cy / TILE - minY) * s;
      g.fillStyle = '#ffffff'; g.fillRect(px - 2, py - 2, 4, 4);
    }
  },
  drawCollection(g) {
    g.fillStyle = 'rgba(5,4,10,0.88)'; g.fillRect(0, 0, VW, VH);
    this.uiPanel(g, 8, 8, VW - 16, VH - 16, 'rgba(122,216,255,0.5)');
    const found = COLLECTION.filter(c => this.secrets.has(c.key)).length;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 14px Georgia, serif'; g.fillStyle = '#9fe6ff'; g.fillText('COLECCIÓN', VW / 2, 22);
    g.font = '8px sans-serif'; g.fillStyle = '#ffd28a';
    g.fillText('Secretos ' + found + '/' + COLLECTION.length, VW / 2, 36);
    // lista de secretos (columna izq)
    g.textAlign = 'left';
    COLLECTION.forEach((c, i) => {
      const col = i < 5 ? 0 : 1, row = i % 5;
      const x = 16 + col * 134, y = 48 + row * 36, has = this.secrets.has(c.key);
      g.fillStyle = 'rgba(8,6,16,0.65)'; g.fillRect(x, y - 8, 128, 32);
      g.strokeStyle = has ? c.col : 'rgba(120,120,150,0.35)'; g.lineWidth = 0.8; g.strokeRect(x, y - 8, 128, 32);
      g.fillStyle = has ? c.col : 'rgba(80,80,100,0.8)';
      if (c.ability) {
        g.beginPath(); g.moveTo(x + 12, y - 2); g.lineTo(x + 18, y + 4); g.lineTo(x + 12, y + 10); g.lineTo(x + 6, y + 4); g.fill();
      } else {
        g.beginPath(); g.arc(x + 12, y + 4, 5, 0, Math.PI * 2); g.fill();
        if (has) { g.fillStyle = '#ffffff'; g.fillRect(x + 10, y + 2, 2, 2); }
      }
      g.font = 'bold 7px sans-serif'; g.fillStyle = has ? '#eef0fa' : '#6d6488';
      g.fillText(has ? c.name : '???', x + 24, y);
      g.font = '5.5px sans-serif'; g.fillStyle = has ? '#a898c8' : '#4a4460';
      g.fillText(has ? c.where : 'Aún no descubierto', x + 24, y + 10);
    });
    // jefes (columna der)
    g.font = 'bold 8px sans-serif'; g.fillStyle = '#ffb0c0'; g.textAlign = 'left';
    g.fillText('Jefes', 290, 50);
    BOSS_META.forEach((b, i) => {
      const y = 66 + i * 36, has = !!this.beaten[b.key];
      g.fillStyle = 'rgba(8,6,16,0.65)'; g.fillRect(290, y - 10, 170, 30);
      g.strokeStyle = has ? '#7ad8ff' : 'rgba(255,58,92,0.45)'; g.lineWidth = 0.8; g.strokeRect(290, y - 10, 170, 30);
      g.fillStyle = has ? '#7ad8ff' : '#ff3a5c'; g.fillRect(298, y - 2, 6, 6);
      g.font = 'bold 8px sans-serif'; g.fillStyle = has ? '#eef0fa' : '#6d6488';
      g.fillText(has ? b.name : '???', 310, y - 1);
      g.font = '6px sans-serif'; g.fillStyle = has ? '#a898c8' : '#4a4460';
      g.fillText(has ? ('Derrotado · Nivel ' + b.level) : ('Nivel ' + b.level + ' · pendiente'), 310, y + 9);
    });
    g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca Volver' : 'Esc / ENTER volver a pausa', VW / 2, VH - 32);
    for (const b of this.collectionButtons()) this.drawMapBtn(g, b, false);
    this.drawSoundButton(g);
  },
  drawControlsScreen(g) {
    g.fillStyle = 'rgba(5,4,10,0.88)'; g.fillRect(0, 0, VW, VH);
    this.uiPanel(g, 50, 16, VW - 100, VH - 32, 'rgba(255,58,92,0.55)');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 16px Georgia, serif'; g.fillStyle = '#ff3a5c'; g.fillText('CONTROLES', VW / 2, 36);
    this.drawControls(g, 230, 56, 14);
    g.font = '6.5px sans-serif'; g.fillStyle = '#a898c8'; g.textAlign = 'center';
    g.fillText(IS_TOUCH() ? 'Toca Volver' : 'Esc / ENTER volver a pausa', VW / 2, VH - 32);
    for (const b of this.controlsButtons()) this.drawMapBtn(g, b, false);
    this.drawSoundButton(g);
  },
  drawAbility(g) {
    const a = Math.min(1, this.abilityT / 0.6);
    const cargado = this.abilityKey === 'cargado';
    g.fillStyle = cargado ? `rgba(34,8,14,${0.72 * a})` : `rgba(8,14,34,${0.72 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 10px Georgia, serif'; g.fillStyle = cargado ? '#ff8a9a' : '#aee0ff'; g.fillText('Nueva habilidad', VW / 2, 74);
    const title = cargado ? 'SABLE CARGADO' : 'SALTO CELESTE';
    g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#16203a'; g.fillText(title, VW / 2 + 2, 100);
    g.fillStyle = cargado ? '#ffe0e8' : '#e8fbff'; g.fillText(title, VW / 2, 98);
    g.font = '13px Georgia, serif'; g.fillStyle = '#ffd24a';
    g.fillText(cargado ? 'Mantén ATACAR y suelta' : 'Salta de nuevo en el aire', VW / 2, 128);
    g.font = '8px sans-serif'; g.fillStyle = '#e8ecff';
    if (cargado) {
      g.fillText(IS_TOUCH() ? 'Mantén ATACAR ~0.7 s (el sable brilla) y suelta para disparar una onda.' : 'Mantén Ataque (X / K) ~0.7 s y suelta: una onda de energía atraviesa enemigos.', VW / 2, 152);
      g.fillText('La onda daña una vez y se detiene en las paredes. Los sellos de cristal solo ceden ante ella.', VW / 2, 165);
    } else {
      g.fillText(IS_TOUCH() ? 'Pulsa SALTAR otra vez mientras estás en el aire.' : 'Pulsa Saltar (Z / J / Espacio) otra vez mientras estás en el aire.', VW / 2, 152);
      g.fillText('Se recarga al tocar el suelo, agarrarte a una pared o rebotar con el tajo abajo.', VW / 2, 165);
    }
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
    g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#1a0008'; g.fillText(title, VW / 2 + 2, 98);
    g.fillStyle = '#ffe0a0'; g.fillText(title, VW / 2 + 1, 97);
    g.fillStyle = '#ffd28a'; g.fillText(title, VW / 2, 96);
    g.font = '12px Georgia, serif'; g.fillStyle = '#e8ecff';
    const msgs = {
      1: 'El Guardián Hueco ha caído. Un sello se rompe al este…',
      2: 'El Heraldo del Alba ha caído. Una pluma celeste brilla en la arena…',
      3: 'El Oráculo Prismático se apaga. Un sable de energía late en la arena…',
    };
    g.fillText(msgs[L] || msgs[1], VW / 2, 128);
    g.font = 'italic 11px Georgia, serif'; g.fillStyle = '#aee0ff';
    if (L < 7 && LEVEL_NAMES[L + 1]) g.fillText('Siguiente: Nivel ' + (L + 1) + ' — ' + LEVEL_NAMES[L + 1], VW / 2, 148);
    else g.fillText('El templo vuelve a la luz.', VW / 2, 148);
    if (this.clearT > 1.5 && Math.floor(this.clearT * 2) % 2 === 0) {
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(IS_TOUCH() ? 'Toca para continuar' : 'Pulsa ENTER para continuar', VW / 2, 190);
    }
    g.globalAlpha = 1;
  },
  drawZoneCard(g) {
    const z = this.zoneCard, info = ZONE_INTRO[z.level]; if (!info) return;
    const t = z.t;
    let a = 1;
    if (t < 0.45) a = t / 0.45;
    else if (t > 2.4) a = Math.max(0, 1 - (t - 2.4) / 0.8);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(5,4,10,0.55)'; g.fillRect(0, VH / 2 - 36, VW, 72);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 9px Georgia, serif'; g.fillStyle = '#a898c8';
    g.fillText('Nivel ' + z.level, VW / 2, VH / 2 - 18);
    g.font = 'bold 22px Georgia, serif'; g.fillStyle = '#1a0008'; g.fillText(info.name, VW / 2 + 1, VH / 2 + 2);
    g.fillStyle = '#ffd28a'; g.fillText(info.name, VW / 2, VH / 2);
    g.font = '11px Georgia, serif'; g.fillStyle = '#e8ecff'; g.fillText(info.line, VW / 2, VH / 2 + 22);
    g.globalAlpha = 1;
  },
  drawCredits(g) {
    const a = Math.min(1, this.creditsT / 0.5);
    const page = CREDITS[this.creditsPage] || CREDITS[CREDITS.length - 1];
    g.fillStyle = `rgba(5,4,10,${0.88 * a})`; g.fillRect(0, 0, VW, VH);
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 9px Georgia, serif'; g.fillStyle = '#a898c8';
    g.fillText((this.creditsPage + 1) + ' / ' + CREDITS.length, VW / 2, 40);
    g.font = 'bold 24px Georgia, serif'; g.fillStyle = '#3a0010'; g.fillText(page.title, VW / 2 + 1, 100);
    g.fillStyle = '#ffd28a'; g.fillText(page.title, VW / 2, 98);
    g.font = '14px Georgia, serif'; g.fillStyle = '#e8ecff';
    page.lines.forEach((line, i) => g.fillText(line, VW / 2, 130 + i * 22));
    if (this.creditsT > 1.0 && Math.floor(this.creditsT * 2) % 2 === 0) {
      g.font = 'bold 10px sans-serif'; g.fillStyle = '#ffffff';
      const last = this.creditsPage >= CREDITS.length - 1;
      g.fillText(IS_TOUCH() ? (last ? 'Toca para volver al título' : 'Toca para continuar') : (last ? 'ENTER · título' : 'ENTER · siguiente'), VW / 2, 230);
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
  Sound.music(Game.musicName()); Sound.duck = (Game.state === 'pause' || Game.state === 'map' || Game.state === 'collection' || Game.state === 'controls' || Game.state === 'credits') ? 0.35 : 1; Sound.update();
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
