'use strict';
// ---------- Mundo: salas interconectadas en coordenadas globales ----------
const TILE = 16;
const T_EMPTY = 0, T_SOLID = 1, T_SPIKE = 2, T_PLAT = 3;

function makeRoom(def) {
  const r = Object.assign({ objs: [], doors: [], visited: false, level: 1, theme: 'night', movers: [], crumbles: [], winds: [], falls: [], walls: [] }, def);
  r.grid = [];
  for (let y = 0; y < r.h; y++) r.grid.push(new Uint8Array(r.w));
  const set = (x, y, w, h, t) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      if (i >= 0 && j >= 0 && i < r.w && j < r.h) r.grid[j][i] = t;
  };
  const api = {
    rect: (x, y, w, h) => set(x, y, w, h, T_SOLID),
    clear: (x, y, w, h) => set(x, y, w, h, T_EMPTY),
    spikes: (x, y, w) => set(x, y, w, 1, T_SPIKE),
    plat: (x, y, w) => set(x, y, w, 1, T_PLAT),
    obj: (type, tx, ty, extra) => r.objs.push(Object.assign({ type, tx, ty }, extra || {})),
    door: (x, y, w, h) => r.doors.push({ x, y, w, h, active: false, kind: 'lock' }),
    // Puerta de salida: cerrada hasta derrotar al jefe indicado
    exitDoor: (x, y, w, h, boss) => r.doors.push({ x, y, w, h, active: true, kind: 'exit', boss }),
    mover: (x, y, w, x2, y2, period) => r.movers.push({ x, y, w, x2, y2, period }),
    crumble: (x, y, w) => r.crumbles.push({ x, y, w }),
    wind: (x, y, w, h) => r.winds.push({ x, y, w, h }),
    fall: (x, y, w, h) => r.falls.push({ x, y, w, h }),
    breakwall: (x, y, w, h, id) => { set(x, y, w, h, T_SOLID); r.walls.push({ x, y, w, h, id }); },
    box() { set(0, 0, r.w, 1, T_SOLID); set(0, 0, 1, r.h, T_SOLID); set(r.w - 1, 0, 1, r.h, T_SOLID); },
  };
  r.build(api);
  r.px = r.ox * TILE; r.py = r.oy * TILE; r.pw = r.w * TILE; r.ph = r.h * TILE;
  return r;
}

const ROOM_DEFS = [
  { id: 'santuario', name: 'Santuario Caído', ox: 0, oy: 0, w: 30, h: 17,
    bg: ['#1b1830', '#0c0b18'], tint: '#3a3560',
    build(b) {
      b.box(); b.rect(0, 15, 30, 2);
      b.clear(29, 11, 1, 4);          // salida derecha -> Pasaje
      b.clear(4, 15, 3, 2);           // agujero -> Cripta
      b.plat(11, 9, 4); b.plat(18, 6, 4);
      b.obj('bench', 14, 15);
      b.obj('sign', 5, 13, { text: '↓ Cripta' });
    } },
  { id: 'cripta', name: 'Cripta Olvidada', ox: 0, oy: 17, w: 30, h: 17,
    bg: ['#10202a', '#060d12'], tint: '#244452',
    build(b) {
      b.box(); b.rect(0, 0, 30, 3); b.clear(4, 0, 3, 3);
      b.rect(0, 0, 4, 9); b.rect(7, 3, 1, 6);  // pozo para subir con salto de pared
      b.rect(0, 15, 30, 2);
      b.spikes(10, 15, 5); b.spikes(18, 15, 7);
      b.plat(4, 11, 3); b.plat(11, 11, 3); b.plat(20, 10, 4);
      b.rect(25, 6, 4, 1);
      b.obj('shard', 26.5, 6);
      b.obj('flyer', 15, 6); b.obj('flyer', 22, 4);
      b.obj('walker', 26.5, 15);
    } },
  { id: 'pasaje', name: 'Pasaje de Espinas', ox: 30, oy: 0, w: 40, h: 17,
    bg: ['#221626', '#0e0810'], tint: '#553048',
    build(b) {
      b.box(); b.rect(0, 15, 40, 2);
      b.clear(0, 11, 1, 4); b.clear(39, 11, 1, 4);
      b.spikes(9, 15, 3); b.spikes(22, 15, 4);
      b.plat(8, 11, 5); b.plat(20, 10, 3); b.plat(25, 7, 4);
      b.rect(15, 12, 2, 3);
      b.rect(32, 10, 2, 5);            // muro alto: requiere salto de pared
      b.obj('walker', 5, 15); b.obj('walker', 28, 15); b.obj('walker', 36, 15);
      b.obj('flyer', 20, 5);
    } },
  { id: 'pozo', name: 'Pozo del Eco', ox: 70, oy: -17, w: 20, h: 34,
    bg: ['#141c30', '#070a14'], tint: '#2c3c66',
    build(b) {
      b.box(); b.rect(0, 32, 20, 2);
      b.clear(0, 28, 1, 4);            // entrada desde el Pasaje
      b.clear(19, 3, 1, 4);            // salida superior -> Galería
      b.rect(13, 7, 6, 1);
      b.rect(9, 12, 2, 16);            // columna central
      b.rect(15, 26, 4, 1); b.rect(1, 20, 4, 1); b.rect(15, 14, 4, 1); b.rect(1, 9, 4, 1);
      b.obj('flyer', 10, 6); b.obj('flyer', 5, 16);
      b.obj('sign', 3, 31, { text: '↑ Salta en la pared' });
    } },
  { id: 'galeria', name: 'Galería Suspendida', ox: 90, oy: -17, w: 40, h: 17,
    bg: ['#261a14', '#0f0906'], tint: '#5a3a26',
    build(b) {
      b.box(); b.clear(0, 3, 1, 4); b.clear(39, 8, 1, 4);
      b.rect(0, 7, 8, 10);             // repisa de entrada
      b.rect(8, 16, 26, 1); b.spikes(8, 15, 26);   // foso de pinchos: requiere rebote (pogo)
      b.rect(34, 12, 6, 5);
      b.obj('bench', 36.5, 12);
      b.obj('flyer', 14, 8); b.obj('flyer', 21, 6); b.obj('flyer', 28, 9);
      b.obj('sign', 5, 6, { text: '↓+Ataque en el aire: rebote' });
    } },
  { id: 'guardian', name: 'Cámara del Guardián', ox: 130, oy: -17, w: 30, h: 17,
    bg: ['#2a0d14', '#0d0306'], tint: '#6a1c2c', boss: true,
    build(b) {
      b.box(); b.rect(0, 15, 30, 2); b.clear(0, 8, 1, 4);
      b.rect(0, 12, 3, 3);
      b.door(0, 8, 1, 4);
      b.clear(29, 11, 1, 4); b.exitDoor(29, 11, 1, 4, 'guardian');   // camino al Nivel 2
      b.plat(7, 10, 3); b.plat(20, 10, 3);
      b.obj('boss', 20, 15, { boss: 'guardian' });
    } },
  // =================== NIVEL 2: CUMBRES DEL ALBA ===================
  { id: 'mirador', name: 'Mirador del Alba', ox: 160, oy: -17, w: 30, h: 17, level: 2, theme: 'day',
    build(b) {
      b.rect(0, 15, 30, 2); b.rect(0, 0, 1, 11);
      b.rect(20, 9, 10, 8); b.rect(29, 0, 1, 5);          // acantilado y salida (filas 5-8)
      b.mover(16, 13, 3, 16, 9, 3.6);                       // plataforma vertical
      b.fall(3, 0, 3, 15);
      b.obj('bench', 7, 15);
      b.obj('walker', 12, 15, { day: true });
      b.obj('shield', 25, 9);
      b.obj('sign', 11, 15, { text: 'Escudero: golpéalo por detrás o desde arriba' });
    } },
  { id: 'puente', name: 'Puente de los Vientos', ox: 190, oy: -17, w: 44, h: 17, level: 2, theme: 'day',
    build(b) {
      b.rect(0, 0, 1, 5); b.rect(0, 9, 5, 8);
      b.spikes(5, 15, 34); b.rect(5, 16, 34, 1);            // zarzas: rebota con el tajo abajo
      b.crumble(7, 10, 3); b.crumble(12, 9, 3); b.crumble(17, 10, 2);
      b.rect(21, 11, 3, 6);
      b.mover(25, 10, 3, 34, 10, 5);
      b.rect(38, 9, 6, 8); b.rect(43, 0, 1, 5);
      b.obj('turret', 22.5, 11);
      b.obj('flyer', 30, 5, { day: true });
      b.obj('sign', 2.5, 9, { text: 'Las losas agrietadas se derrumban' });
    } },
  { id: 'cascadas', name: 'Cascadas Gemelas', ox: 234, oy: -34, w: 24, h: 34, level: 2, theme: 'day',
    build(b) {
      b.rect(0, 0, 1, 22); b.breakwall(0, 3, 1, 4, 'muroCascada');   // muro agrietado secreto
      b.rect(0, 26, 5, 8);
      b.rect(23, 0, 1, 3); b.rect(23, 7, 1, 27);
      b.rect(0, 32, 24, 2); b.spikes(5, 31, 18); b.rect(5, 32, 18, 2);
      b.wind(7, 6, 3, 25);                                  // corriente ascendente
      b.mover(14, 28, 3, 14, 14, 5);
      b.rect(1, 7, 3, 1);                                   // repisa del muro secreto (dash desde la corriente)
      b.rect(10, 11, 4, 1); b.plat(15, 9, 2); b.rect(18, 7, 5, 1);
      b.fall(4, 0, 2, 26); b.fall(19, 0, 3, 31);
      b.obj('turret', 21, 7);
      b.obj('flyer', 17, 19, { day: true });
    } },
  { id: 'nido', name: 'Nido Oculto', ox: 214, oy: -34, w: 20, h: 16, level: 2, theme: 'day', secret: true,
    build(b) {
      b.rect(0, 0, 20, 1); b.rect(0, 0, 1, 16);
      b.rect(19, 0, 1, 3); b.rect(19, 7, 1, 9);
      b.rect(15, 7, 4, 9);
      b.rect(0, 14, 15, 2); b.spikes(4, 13, 11);
      b.rect(1, 10, 3, 4);
      b.crumble(10, 9, 2); b.crumble(6, 10, 2);
      b.obj('cristal', 2.5, 10);
      b.obj('flyer', 9, 5, { day: true });
    } },
  { id: 'jardin', name: 'Jardín Colgante', ox: 258, oy: -34, w: 40, h: 17, level: 2, theme: 'day',
    build(b) {
      b.rect(0, 0, 1, 3); b.rect(0, 7, 5, 10);
      b.rect(0, 15, 40, 2); b.spikes(12, 15, 3); b.spikes(23, 15, 3);
      b.plat(8, 10, 4); b.plat(18, 9, 4); b.plat(29, 11, 3);
      b.rect(33, 7, 7, 10); b.rect(39, 0, 1, 3);
      b.fall(36, 0, 2, 7);
      b.obj('shield', 17, 15); b.obj('shield', 28, 15);
      b.obj('turret', 20, 9);
      b.obj('flyer', 10, 5, { day: true });
    } },
  { id: 'terrazas', name: 'Terrazas del Viento', ox: 298, oy: -34, w: 30, h: 17, level: 2, theme: 'day',
    build(b) {
      b.rect(0, 0, 1, 3); b.rect(0, 7, 7, 10);
      b.spikes(7, 15, 14); b.rect(7, 16, 14, 1);
      b.wind(9, 6, 3, 9); b.wind(15, 6, 3, 9);
      b.rect(21, 12, 9, 5); b.rect(29, 0, 1, 8);
      b.obj('bench', 25, 12);
      b.obj('flyer', 13, 3, { day: true });
      b.obj('sign', 3, 7, { text: 'Las corrientes te elevan y recargan el dash' });
    } },
  { id: 'sol', name: 'Santuario del Sol', ox: 328, oy: -34, w: 32, h: 17, level: 2, theme: 'day', boss: true,
    build(b) {
      b.rect(0, 0, 1, 8); b.rect(0, 12, 3, 5);
      b.rect(0, 15, 32, 2); b.rect(31, 0, 1, 17);
      b.door(0, 8, 1, 4);
      b.plat(7, 10, 3); b.plat(22, 10, 3);
      b.obj('boss', 22, 15, { boss: 'heraldo' });
    } },
];

const World = {
  rooms: ROOM_DEFS.map(makeRoom),
  byId: {},
  cur: null,
  dyn: [],       // plataformas móviles / que se derrumban (solo superficie superior)
  roomAtTile(tx, ty) {
    const c = this.cur;
    if (c && tx >= c.ox && ty >= c.oy && tx < c.ox + c.w && ty < c.oy + c.h) return c;
    for (const r of this.rooms)
      if (tx >= r.ox && ty >= r.oy && tx < r.ox + r.w && ty < r.oy + r.h) return r;
    return null;
  },
  roomAtPx(x, y) { return this.roomAtTile(Math.floor(x / TILE), Math.floor(y / TILE)); },
  tileAt(tx, ty) {
    const r = this.roomAtTile(tx, ty);
    if (!r) return T_SOLID;
    const lx = tx - r.ox, ly = ty - r.oy;
    for (const d of r.doors)
      if (d.active && lx >= d.x && ly >= d.y && lx < d.x + d.w && ly < d.y + d.h) return T_SOLID;
    return r.grid[ly][lx];
  },
  solidAt(tx, ty) { return this.tileAt(tx, ty) === T_SOLID; },
  // ¿Hay algo sólido en el rectángulo (px)?
  rectSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (this.solidAt(tx, ty)) return true;
    return false;
  },
  // Pinchos: hitbox en la mitad inferior de la baldosa
  rectSpike(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (this.tileAt(tx, ty) === T_SPIKE) {
        const sx = tx * TILE + 2, sy = ty * TILE + 7, sw = TILE - 4, sh = TILE - 7;
        if (x < sx + sw && x + w > sx && y < sy + sh && y + h > sy) return true;
      }
    return false;
  },
};
World.rooms.forEach(r => World.byId[r.id] = r);

// Movimiento con colisión por ejes (entidades AABB con x,y,w,h,vx,vy)
function moveEntity(e, dt, opts) {
  opts = opts || {};
  e.hitWallL = e.hitWallR = e.hitCeil = false;
  const wasGround = e.onGround; e.onGround = false;
  if (opts.dyn) e.plat = null;
  // eje X
  let dx = e.vx * dt;
  const stepX = Math.sign(dx);
  while (dx !== 0) {
    const s = Math.abs(dx) > 4 ? stepX * 4 : dx;
    if (World.rectSolid(e.x + s, e.y, e.w, e.h)) {
      // pegarse a la pared
      if (s > 0) { e.x = Math.floor((e.x + e.w + s) / TILE) * TILE - e.w; e.hitWallR = true; }
      else { e.x = Math.floor((e.x + s) / TILE + 1) * TILE; e.hitWallL = true; }
      e.vx = 0; break;
    }
    e.x += s; dx -= s;
  }
  // eje Y
  let dy = e.vy * dt;
  const stepY = Math.sign(dy);
  while (dy !== 0) {
    const s = Math.abs(dy) > 4 ? stepY * 4 : dy;
    const ny = e.y + s;
    let blocked = World.rectSolid(e.x, ny, e.w, e.h);
    // plataformas de un sentido
    if (!blocked && s > 0 && !opts.dropThrough) {
      const feetOld = e.y + e.h, feetNew = ny + e.h;
      const ty = Math.floor((feetNew - 0.001) / TILE);
      if (feetOld <= ty * TILE + 0.01) {
        const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.001) / TILE);
        for (let tx = x0; tx <= x1; tx++) if (World.tileAt(tx, ty) === T_PLAT) { blocked = true; break; }
      }
    }
    if (!blocked && s > 0 && opts.dyn && !opts.dropThrough) {
      const feetOld = e.y + e.h, feetNew = ny + e.h;
      for (const p of World.dyn) {
        if (!p.solid || e.x >= p.x + p.w || e.x + e.w <= p.x) continue;
        if (feetOld <= p.y + 0.5 && feetNew >= p.y) { e.y = p.y - e.h; e.onGround = true; e.plat = p; e.vy = 0; dy = 0; break; }
      }
      if (e.plat) break;
    }
    if (blocked) {
      if (s > 0) { e.y = Math.floor((e.y + e.h + s) / TILE) * TILE - e.h; e.onGround = true; }
      else { e.y = Math.floor((e.y + s) / TILE + 1) * TILE; e.hitCeil = true; }
      e.vy = 0; break;
    }
    e.y += s; dy -= s;
  }
  // comprobar suelo si no nos movimos verticalmente
  if (!e.onGround && e.vy >= 0) {
    if (World.rectSolid(e.x, e.y + e.h, e.w, 1)) e.onGround = true;
    else if (!opts.dropThrough && (e.y + e.h) % TILE < 0.01) {
      const ty = Math.round((e.y + e.h) / TILE);
      const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.001) / TILE);
      for (let tx = x0; tx <= x1; tx++) if (World.tileAt(tx, ty) === T_PLAT) { e.onGround = true; break; }
    }
  }
  if (!e.onGround && e.vy >= 0 && opts.dyn && !opts.dropThrough) {
    for (const p of World.dyn) {
      if (p.solid && e.x < p.x + p.w && e.x + e.w > p.x && Math.abs(e.y + e.h - p.y) < 1) { e.onGround = true; e.plat = p; e.y = p.y - e.h; break; }
    }
  }
  e.justLanded = e.onGround && !wasGround;
}

function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
