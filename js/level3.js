'use strict';
// ---------- Nivel 3: Templo de Cristal (haces, plataformas intermitentes, bloques de fase, enemigos y jefe) ----------
const C_OUT = '#16203a';

// Longitud de un rayo hasta el primer bloque sólido
function rayLen(x, y, a, max) {
  const dx = Math.cos(a) * 4, dy = Math.sin(a) * 4;
  let l = 0;
  while (l < max) { x += dx; y += dy; l += 4; if (World.solidAt(Math.floor(x / TILE), Math.floor(y / TILE))) break; }
  return l;
}

// Haz de luz temporizado: apagado -> aviso (parpadeo) -> encendido (daña). Determinista con el tiempo de sala.
class Beam {
  constructor(room, d) {
    this.vert = d.dir !== 'h';
    if (this.vert) { this.w = 8; this.h = d.len * TILE; this.x = room.px + d.x * TILE + 4; this.y = room.py + d.y * TILE; }
    else { this.w = d.len * TILE; this.h = 8; this.x = room.px + d.x * TILE; this.y = room.py + d.y * TILE + 4; }
    this.period = d.period; this.phase = d.phase; this.off = d.period * 0.5; this.warnT = 0.5;
    this.k = 0; this.dead = false; this.persistent = true; this.st = 'off';
  }
  get state() { return this.k < this.off ? 'off' : this.k < this.off + this.warnT ? 'warn' : 'on'; }
  get harmful() { return this.state === 'on'; }
  update(dt, game) {
    this.k = ((game.roomT + this.phase) % this.period + this.period) % this.period;
    const s = this.state;
    if (s === 'on' && this.st !== 'on') {
      const p = game.player;
      if (Math.abs(p.cx - (this.x + this.w / 2)) < 200) sfx('beam');
    }
    this.st = s;
  }
  draw(ctx, t) {
    const s = this.state, x = Math.round(this.x), y = Math.round(this.y);
    // emisores (siempre visibles)
    const em = (ex, ey) => { ctx.fillStyle = C_OUT; ctx.fillRect(ex - 6, ey - 4, 12, 8); ctx.fillStyle = s === 'off' ? '#8fa8d8' : '#ff4fb0'; ctx.fillRect(ex - 5, ey - 3, 10, 6); ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - 2, ey - 1, 4, 2); };
    if (this.vert) { em(x + 4, y + 3); em(x + 4, y + this.h - 3); } else { em(x + 3, y + 4); em(x + this.w - 3, y + 4); }
    if (s === 'warn') {
      if (Math.floor(this.k * 16) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,40,140,0.85)';
        if (this.vert) ctx.fillRect(x + 3, y + 6, 2, this.h - 12); else ctx.fillRect(x + 6, y + 3, this.w - 12, 2);
      }
    } else if (s === 'on') {
      const wob = Math.sin(t * 40) > 0 ? 1 : 0;
      if (this.vert) {
        ctx.fillStyle = C_OUT; ctx.fillRect(x - 2 - wob, y + 6, this.w + 4 + wob * 2, this.h - 12);
        ctx.fillStyle = '#ff2f9a'; ctx.fillRect(x - wob, y + 6, this.w + wob * 2, this.h - 12);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y + 6, this.w - 4, this.h - 12);
      } else {
        ctx.fillStyle = C_OUT; ctx.fillRect(x + 6, y - 2 - wob, this.w - 12, this.h + 4 + wob * 2);
        ctx.fillStyle = '#ff2f9a'; ctx.fillRect(x + 6, y - wob, this.w - 12, this.h + wob * 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6, y + 2, this.w - 12, this.h - 4);
      }
    }
  }
}

// Plataforma intermitente: aparece y desaparece con un ciclo fijo (parpadea antes de desaparecer)
class Blink {
  constructor(room, d) {
    this.x = room.px + d.x * TILE; this.y = room.py + d.y * TILE; this.w = d.w * TILE; this.h = 8;
    this.period = d.period; this.phase = d.phase; this.onD = d.period * 0.6;
    this.solid = true; this.dx = 0; this.dy = 0; this.kind = 'blink'; this.k = 0;
  }
  update(dt, t, p) {
    this.k = ((t + this.phase) % this.period + this.period) % this.period;
    const want = this.k < this.onD;
    if (want && !this.solid) {
      if (!(p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y)) this.solid = true;
    } else if (!want) this.solid = false;
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (!this.solid) { ctx.strokeStyle = 'rgba(40,60,120,0.45)'; ctx.setLineDash([2, 2]); ctx.strokeRect(x + 0.5, y + 0.5, this.w - 1, this.h - 1); ctx.setLineDash([]); return; }
    const warn = this.k > this.onD - 0.6 && Math.floor(this.k * 12) % 2 === 0;
    ctx.fillStyle = C_OUT; ctx.fillRect(x - 1, y - 1, this.w + 2, this.h + 2);
    ctx.fillStyle = warn ? '#ffffff' : '#5fd8ff'; ctx.fillRect(x, y, this.w, this.h);
    ctx.fillStyle = warn ? '#ffd0f0' : '#d8f8ff'; ctx.fillRect(x, y, this.w, 2);
    ctx.fillStyle = '#2a8ac8'; for (let i = 4; i < this.w; i += 8) ctx.fillRect(x + i, y + 4, 3, 2);
  }
}

// Cristal resonante: al golpearlo alterna los bloques de fase (dorados <-> azules)
class CrystalSwitch {
  constructor(x, y) { this.x = x - 7; this.y = y - 10; this.w = 14; this.h = 20; this.cd = 0; this.t = 0; this.dead = false; this.contact = 0; this.noSoul = true; this.noRecoil = true; this.flashT = 0; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurt() {
    if (this.cd > 0) return;
    this.cd = 0.35; this.flashT = 0.15;
    Game.togglePhase();
    sfx('switch'); FX.ring(this.cx, this.cy, Game.phaseSet === 'a' ? '#ffc83a' : '#3ad8ff', 26); FX.stop(3);
  }
  update(dt) { this.t += dt; if (this.cd > 0) this.cd -= dt; if (this.flashT > 0) this.flashT -= dt; }
  draw(ctx) {
    const x = Math.round(this.cx), y = Math.round(this.cy + Math.sin(this.t * 3) * 1.5);
    const col = this.flashT > 0 ? '#ffffff' : Game.phaseSet === 'a' ? '#ffc83a' : '#3ad8ff';
    ctx.fillStyle = C_OUT; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 6, y); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 6, 2, 5);
  }
}

// Rayo prismático instantáneo (lo usan el Centinela y el jefe)
class PrismRay {
  constructor(x, y, a, dur, half, big) {
    this.x0 = x; this.y0 = y; this.a = a; this.len = rayLen(x, y, a, 700); this.t = 0; this.dur = dur; this.half = half; this.big = big; this.dead = false;
    const x1 = x + Math.cos(a) * this.len, y1 = y + Math.sin(a) * this.len;
    this.x = Math.min(x, x1); this.y = Math.min(y, y1); this.w = Math.abs(x1 - x) + 1; this.h = Math.abs(y1 - y) + 1;
  }
  get harmful() { return this.t > 0.03; }
  hits(b) {
    const c = Math.cos(this.a), s = Math.sin(this.a), hw = this.half;
    for (let l = 0; l <= this.len; l += 4) {
      const px = this.x0 + c * l, py = this.y0 + s * l;
      if (px > b.x - hw && px < b.x + b.w + hw && py > b.y - hw && py < b.y + b.h + hw) return true;
    }
    return false;
  }
  update(dt) { this.t += dt; if (this.t > this.dur) this.dead = true; }
  draw(ctx) {
    const k = 1 - this.t / this.dur, x1 = this.x0 + Math.cos(this.a) * this.len, y1 = this.y0 + Math.sin(this.a) * this.len;
    ctx.lineCap = 'round';
    const line = (w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(this.x0, this.y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const hw = this.half * 2 * (0.6 + 0.4 * k);
    line(hw + 3, C_OUT); line(hw, '#ff2f9a'); line(Math.max(1, hw * 0.45), '#ffffff');
    ctx.lineCap = 'butt';
  }
}

// ---------- Enemigo: Centinela Prisma (flota y dispara un rayo con aviso) ----------
class Prisma extends Enemy {
  constructor(x, y) { super(x - 8, y - 8, 16, 16, 3); this.hx = this.x; this.hy = this.y; this.state = 'idle'; this.st = 0; this.cd = 1.4 + Math.random(); this.aim = 0; this.deathColors = ['#ff5ad0', '#ffffff', '#7ad8ff']; }
  knockback(dir) { this.kx = dir * 70; this.knockT = 0.12; }
  update(dt, game) {
    const p = game.player;
    this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    if (this.knockT > 0) { this.knockT -= dt; this.x += this.kx * dt; }
    this.x += (this.hx - this.x) * Math.min(1, dt * 2);
    this.y = this.hy + Math.sin(this.t * 2) * 4;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy);
    if (this.state === 'idle') {
      if ((this.cd -= dt) <= 0 && d < 240 && p.hp > 0) { this.state = 'tel'; this.st = 0; this.aim = Math.atan2(dy, dx); sfx('tel'); }
    } else if (this.state === 'tel') {
      if (this.st < 0.55) this.aim = Math.atan2(dy, dx);
      if (this.st > 0.9) { game.hazards.push(new PrismRay(this.cx, this.cy, this.aim, 0.3, 3)); sfx('zap'); this.state = 'idle'; this.cd = 2.6; }
    }
  }
  draw(ctx) {
    const x = Math.round(this.cx), y = Math.round(this.cy), fl = this.flashT > 0;
    if (this.state === 'tel') {
      const len = rayLen(this.cx, this.cy, this.aim, 400), locked = this.st >= 0.55;
      if (!locked || Math.floor(this.st * 20) % 2) {
        ctx.strokeStyle = locked ? 'rgba(255,40,140,0.95)' : 'rgba(255,80,160,0.55)'; ctx.lineWidth = locked ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.aim) * len, y + Math.sin(this.aim) * len); ctx.stroke();
      }
    }
    // halo
    ctx.fillStyle = 'rgba(159,230,255,0.28)'; ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(this.t * 5), 0, Math.PI * 2); ctx.fill();
    drawOutlined(ctx, c => {
      ctx.fillStyle = c('#9fe6ff'); ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 9, y); ctx.fill();
      ctx.fillStyle = c('#e8fbff'); ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.fill();
      ctx.fillStyle = c('#c050e0'); ctx.fillRect(x - 3, y - 1, 6, 4);
      const tel = this.state === 'tel' && Math.floor(this.st * 16) % 2 === 0;
      ctx.fillStyle = c(tel ? '#ffffff' : '#ff2f9a'); ctx.fillRect(x - 1 + Math.round(Math.cos(this.aim)), y, 2, 2);
      ctx.fillStyle = c('#ffffff'); ctx.fillRect(x - 1, y - 1, 1, 1);
    }, fl);
  }
}

// ---------- Enemigo: Polilla de Luz (se lanza en picado tras un destello) ----------
class Moth extends Enemy {
  constructor(x, y) { super(x - 6, y - 6, 12, 12, 2); this.hx = x; this.hy = y; this.state = 'hover'; this.st = 0; this.cd = 1 + Math.random(); this.deathColors = ['#fff27a', '#ffffff', '#ff9ad8']; }
  knockback(dir, type) { this.vx = (dir || 0) * 160; this.vy = type === 'down' ? 160 : -80; this.knockT = 0.2; if (this.state === 'dive' || this.state === 'tel') { this.state = 'recover'; this.st = 0; } }
  update(dt, game) {
    const p = game.player;
    this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy);
    if (this.knockT > 0) { this.knockT -= dt; this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt); }
    else if (this.state === 'hover') {
      this.vx += ((this.hx + Math.cos(this.t * 0.9) * 22) - this.cx) * 2 * dt - this.vx * 2 * dt;
      this.vy += ((this.hy + Math.sin(this.t * 1.7) * 8) - this.cy) * 2 * dt - this.vy * 2 * dt;
      if ((this.cd -= dt) <= 0 && d < 150 && p.hp > 0) { this.state = 'tel'; this.st = 0; this.tx = p.cx; this.ty = p.cy; sfx('tel'); }
    } else if (this.state === 'tel') {
      this.vx *= 0.8; this.vy = -20;
      if (this.st > 0.5) { const a = Math.atan2(this.ty - this.cy, this.tx - this.cx); this.vx = Math.cos(a) * 240; this.vy = Math.sin(a) * 240; this.state = 'dive'; this.st = 0; }
    } else if (this.state === 'dive') {
      if (this.hitWallL || this.hitWallR || this.hitCeil || this.onGround || this.st > 0.9) { this.state = 'recover'; this.st = 0; this.vx = this.vy = 0; }
    } else if (this.state === 'recover') {
      const hx = this.hx - this.cx, hy = this.hy - this.cy, hd = Math.hypot(hx, hy) || 1;
      this.vx = hx / hd * 70; this.vy = hy / hd * 70;
      if (hd < 6 || this.st > 2.5) { this.state = 'hover'; this.st = 0; this.cd = 1.6; }
    }
    moveEntity(this, dt, { dropThrough: true });
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y + (this.state === 'hover' ? Math.sin(this.t * 9) : 0));
    const tel = this.state === 'tel' && Math.floor(this.st * 20) % 2 === 0, w = Math.floor(this.t * (this.state === 'dive' ? 30 : 14)) % 2;
    if (this.state === 'tel') { ctx.fillStyle = 'rgba(255,240,120,0.45)'; ctx.beginPath(); ctx.arc(x + 6, y + 6, 11, 0, Math.PI * 2); ctx.fill(); }
    drawOutlined(ctx, c => {
      const R = (col, a, b, ww, h) => { ctx.fillStyle = c(col); ctx.fillRect(x + a, y + b, ww, h); };
      if (w) { R('#ffd0f0', -6, -2, 7, 6); R('#ffd0f0', 11, -2, 7, 6); R('#ff7ac8', -5, 0, 3, 2); R('#ff7ac8', 14, 0, 3, 2); }
      else { R('#ffd0f0', -5, 4, 6, 5); R('#ffd0f0', 11, 4, 6, 5); }
      R(tel ? '#ffffff' : '#fff27a', 2, 1, 8, 10); R('#e0a820', 3, 7, 6, 3);
      R('#16203a', 3, 3, 2, 2); R('#16203a', 7, 3, 2, 2);
      R('#fff27a', 3, -2, 1, 3); R('#fff27a', 8, -2, 1, 3);
    }, this.flashT > 0);
  }
}

// Esquirla de cristal que cae del techo (se puede cortar y rebotar en ella)
class CrystalShard extends Seed {
  constructor(x, y) { super(x, y, 0, 280); this.w = 8; this.h = 12; this.x = x - 4; }
  update(dt) {
    this.t += dt; this.y += this.vy * dt;
    if (World.rectSolid(this.x + 2, this.y + this.h - 2, 4, 2) || this.t > 4) { this.dead = true; FX.burst(this.x + 4, this.y + this.h, 6, { colors: ['#9fe6ff', '#ffffff'], speed: 80, grav: 200 }); }
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = C_OUT; ctx.beginPath(); ctx.moveTo(x - 1, y - 1); ctx.lineTo(x + 9, y - 1); ctx.lineTo(x + 4, y + 14); ctx.fill();
    ctx.fillStyle = '#7ad8ff'; ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + 4, y + 11); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y + 1, 1, 5);
  }
}

// Columna de luz del jefe (aviso y luego daño)
class LightColumn extends SunPillar {
  constructor(x, top, bottom, warn, w) { super(x, top, bottom, warn); this.w = w || 16; this.x = x - this.w / 2; }
  draw(ctx) {
    if (this.t < this.warn) {
      const blink = Math.floor(this.t * 14) % 2;
      ctx.fillStyle = blink ? 'rgba(255,40,140,0.35)' : 'rgba(255,40,140,0.18)'; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = 'rgba(255,40,140,0.9)'; ctx.fillRect(this.x, this.y + this.h - 3, this.w, 3); ctx.fillRect(this.x, this.y, this.w, 2);
    } else {
      const k = 1 - Math.max(0, (this.t - this.warn - 0.3) / 0.25);
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = C_OUT; ctx.fillRect(this.x - 1, this.y, this.w + 2, this.h);
      ctx.fillStyle = '#ff2f9a'; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(this.x + 4, this.y, this.w - 8, this.h);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- Jefe 3: Oráculo Prismático ----------
class Oracle extends Enemy {
  constructor(x, y, room) {
    super(x - 14, y - 40, 28, 40, 52);
    this.room = room; this.key = 'oraculo'; this.name = 'ORÁCULO PRISMÁTICO';
    this.state = 'dormant'; this.st = 0; this.facing = -1; this.last = null; this.phase2 = false; this.contact = 1; this.aim = 0;
    this.deathColors = ['#7ad8ff', '#ffffff', '#ff5ad0'];
  }
  get floorY() { return this.room.py + (this.room.floorRow || 12) * TILE; }
  get hoverY() { return this.floorY - 108; }
  get arenaL() { return this.room.px + TILE; }
  get arenaR() { return this.room.px + (this.room.w - 1) * TILE; }
  hurt(dmg) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    this.hp -= dmg; this.flashT = 0.1; sfx('hit');
    if (!this.phase2 && this.hp <= this.maxHp / 2) {
      this.phase2 = true; this.set('roar'); FX.shake(6, 0.6); FX.ring(this.cx, this.cy, '#ff5ad0', 50); sfx('roar');
      Game.hazards = Game.hazards.filter(h => !(h instanceof CrystalShard));
    }
    if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
  }
  set(s) { this.state = s; this.st = 0; this.fired = 0; if (s.endsWith('Tel')) sfx('tel'); }
  update(dt, game) {
    const p = game.player, r = this.room;
    this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    const spd = this.phase2 ? 1.25 : 1;
    const to = (tx, ty, k) => { this.x += (tx - this.x) * Math.min(1, dt * k); this.y += (ty - this.y) * Math.min(1, dt * k); };
    const clampX = x => Math.max(this.arenaL, Math.min(this.arenaR - this.w, x));
    switch (this.state) {
      case 'dormant':
        this.y = this.hoverY - 30;
        if (p.x > r.px + 5 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); }
        break;
      case 'intro': to(this.x, this.hoverY, 3); if (this.st > 1.8) this.set('idle'); break;
      case 'roar': if (this.st < 0.9) FX.shake(4, 0.1); if (this.st > 1.2) this.set('idle'); break;
      case 'idle': {
        to(clampX(p.cx - this.w / 2 + Math.sin(this.t) * 40), this.hoverY + Math.sin(this.t * 2) * 6, 1.5);
        if (this.st > (this.phase2 ? 0.5 : 0.85)) {
          const pool = ['beam', 'rain', 'dash'];
          if (this.phase2) pool.push('prism', 'prism');
          const opts = pool.filter(o => o !== this.last);
          const pick = opts[(Math.random() * opts.length) | 0];
          this.last = pick; this.set(pick + 'Tel');
        }
        break;
      }
      // Patrón 1: rayo dirigido (sigue al jugador y se fija antes de disparar); en fase 2, dos seguidos
      case 'beamTel':
        to(this.x, this.hoverY, 2);
        if (this.st < 0.6 / spd) this.aim = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        if (this.st > 0.95 / spd) {
          game.hazards.push(new PrismRay(this.cx, this.cy, this.aim, 0.45, 5, true)); sfx('zap'); FX.shake(3, 0.15);
          this.fired++;
          if (this.phase2 && this.fired < 2) this.st = 0.2 / spd; else { this.state = 'beamRec'; this.st = 0; }
        }
        break;
      case 'beamRec': if (this.st > 0.6) this.set('idle'); break;
      // Patrón 2: lluvia de cristales en columnas marcadas en el techo (siempre deja huecos de 2 baldosas)
      case 'rainTel':
        to(this.x, this.hoverY - 16, 2);
        if (!this.fired) {
          this.fired = 1; this.rain = [];
          const off = (Math.random() * 5) | 0;
          for (let c = 1; c < r.w - 1; c++) if ((c + off) % 5 >= 2) this.rain.push(r.px + c * TILE + TILE / 2);
        }
        if (this.st > 0.9 / spd) {
          for (const x of this.rain) game.hazards.push(new CrystalShard(x, r.py + TILE + 2));
          sfx('shatter'); this.state = 'rainRec'; this.st = 0;
        }
        break;
      case 'rainRec': if (this.st > 1.0) this.set('idle'); break;
      // Patrón 3: embestida a ras de suelo desde el lado opuesto (sáltala)
      case 'dashTel':
        if (!this.fired) {
          this.fired = 1;
          const right = p.cx < r.px + r.pw / 2;
          this.tx = right ? this.arenaR - this.w - 2 : this.arenaL + 2; this.dir = right ? -1 : 1;
          FX.ring(this.cx, this.cy, '#ffffff', 30);
        }
        to(this.tx, this.floorY - this.h, 5);
        if (this.st > 0.85 / spd) { this.x = this.tx; this.y = this.floorY - this.h; this.state = 'dash'; this.st = 0; sfx('dash'); }
        break;
      case 'dash':
        this.x += this.dir * 300 * spd * dt; this.y = this.floorY - this.h;
        if (Math.random() < 0.6) FX.burst(this.cx - this.dir * 12, this.floorY - 4, 1, { colors: ['#ffffff', '#7ad8ff'], speed: 40, grav: 0 });
        if (this.x <= this.arenaL || this.x + this.w >= this.arenaR) {
          this.x = clampX(this.x); FX.shake(5, 0.25); sfx('boom'); this.state = 'stun'; this.st = 0;
          if (this.phase2) game.hazards.push(new Shockwave(this.cx, this.floorY, -this.dir, 1));
        }
        break;
      case 'stun': if (this.st > 0.9 / spd) this.set('rise'); break;
      case 'rise': to(this.x, this.hoverY, 3); if (this.st > 0.6) this.set('idle'); break;
      // Patrón 4 (fase 2): columnas de luz en dos oleadas alternas que cubren toda la arena
      case 'prismTel':
        to(this.x, this.hoverY - 24, 2);
        if (!this.fired) {
          this.fired = 1;
          for (let x = this.arenaL, i = 0; x < this.arenaR; x += 32, i++)
            game.hazards.push(new LightColumn(x + 16, r.py + TILE, this.floorY, i % 2 ? 1.9 : 0.9, 32));
        }
        if (this.st > 2.9) this.set('idle');
        break;
      case 'dying':
        this.y = Math.min(this.floorY - this.h, this.y + 60 * dt);
        if (Math.random() < 0.35) {
          FX.burst(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 8, { colors: this.deathColors, speed: 120, life: 0.4, grav: 0 });
          FX.shake(3, 0.1);
        }
        if (this.st > 2.0 && !this.dead) {
          this.dead = true;
          FX.burst(this.cx, this.cy, 70, { colors: ['#7ad8ff', '#ffffff', '#ff5ad0', '#ffd24a'], speed: 280, life: 1.0 });
          FX.ring(this.cx, this.cy, '#ffffff', 70); FX.shake(8, 0.5);
          Game.victory(this);
        }
        break;
    }
    this.facing = Math.sign(p.cx - this.cx) || this.facing;
  }
  draw(ctx) {
    if (this.state === 'dormant') return;
    const r = this.room;
    // avisos
    if (this.state === 'beamTel') {
      const len = rayLen(this.cx, this.cy, this.aim, 700), locked = this.st >= 0.6 / (this.phase2 ? 1.25 : 1);
      if (!locked || Math.floor(this.st * 20) % 2) {
        ctx.strokeStyle = locked ? 'rgba(255,30,130,0.95)' : 'rgba(255,60,150,0.5)'; ctx.lineWidth = locked ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(this.cx + Math.cos(this.aim) * len, this.cy + Math.sin(this.aim) * len); ctx.stroke();
      }
    }
    if (this.state === 'rainTel' && this.rain) {
      const on = Math.floor(this.st * 14) % 2;
      for (const x of this.rain) {
        ctx.fillStyle = C_OUT; ctx.fillRect(x - 4, r.py + TILE, 8, 5);
        ctx.fillStyle = on ? '#ff2f9a' : '#ffffff'; ctx.fillRect(x - 3, r.py + TILE, 6, 4);
      }
    }
    if (this.state === 'dashTel' && Math.floor(this.st * 12) % 2) { ctx.fillStyle = 'rgba(255,40,140,0.35)'; ctx.fillRect(this.arenaL, this.floorY - 6, this.arenaR - this.arenaL, 6); }
    const x = Math.round(this.cx), y = Math.round(this.y), tel = this.state.endsWith('Tel') && Math.floor(this.st * 16) % 2 === 0;
    const p2 = this.phase2, glow = this.state === 'stun' ? 0 : 1;
    // halo
    ctx.fillStyle = p2 ? 'rgba(255,90,208,0.25)' : 'rgba(122,216,255,0.3)'; ctx.beginPath(); ctx.arc(x, y + 20, 26 + Math.sin(this.t * 4) * 2, 0, Math.PI * 2); ctx.fill();
    drawOutlined(ctx, c => {
      // prisma central
      ctx.fillStyle = c(p2 ? '#ff9ae0' : '#9fe6ff'); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x, y + 40); ctx.lineTo(x - 14, y + 16); ctx.fill();
      ctx.fillStyle = c('#e8fbff'); ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + 6, y + 16); ctx.lineTo(x, y + 30); ctx.fill();
      ctx.fillStyle = c(p2 ? '#c02a8a' : '#3a78c8'); ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.lineTo(x - 14, y + 16); ctx.lineTo(x - 5, y + 16); ctx.fill();
      ctx.fillStyle = c('#ffffff'); ctx.fillRect(x - 1, y + 8, 2, 6);
      // ojo
      ctx.fillStyle = c('#16203a'); ctx.fillRect(x - 6, y + 13, 12, 7);
      ctx.fillStyle = c(tel ? '#ffffff' : (glow ? '#ffd24a' : '#806020')); ctx.fillRect(x - 4 + this.facing * 2, y + 15, 4, 3);
      ctx.fillStyle = c('#ffffff'); ctx.fillRect(x - 3 + this.facing * 2, y + 15, 1, 1);
      // corona dorada
      ctx.fillStyle = c('#ffd24a'); ctx.fillRect(x - 8, y - 3, 3, 5); ctx.fillRect(x - 1, y - 7, 3, 7); ctx.fillRect(x + 6, y - 3, 3, 5);
      ctx.fillStyle = c('#fff6c0'); ctx.fillRect(x - 1, y - 7, 3, 2);
      // fragmentos orbitando
      for (let i = 0; i < (p2 ? 4 : 3); i++) {
        const a = this.t * (p2 ? 2.6 : 1.8) + i * Math.PI * 2 / (p2 ? 4 : 3), ox = x + Math.cos(a) * 24, oy = y + 18 + Math.sin(a) * 10;
        ctx.fillStyle = c(p2 ? '#ffd0f0' : '#d8f8ff'); ctx.fillRect(Math.round(ox) - 2, Math.round(oy) - 3, 4, 6);
        ctx.fillStyle = c('#ffffff'); ctx.fillRect(Math.round(ox) - 1, Math.round(oy) - 2, 1, 2);
      }
    }, this.flashT > 0);
  }
}
