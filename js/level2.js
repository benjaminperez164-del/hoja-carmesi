'use strict';
// ---------- Nivel 2: plataformas dinámicas, viento, muro secreto, enemigos y jefe ----------
const OUTLINE = '#1c1018';
// Dibuja una figura con contorno oscuro: fn(ctx, colorFn) se llama 4 veces en silueta y 1 normal
function drawOutlined(ctx, fn, flash) {
  const offs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [ox, oy] of offs) { ctx.save(); ctx.translate(ox, oy); fn(() => OUTLINE); ctx.restore(); }
  fn(c => flash ? '#ffffff' : c);
}

// Plataforma móvil (vaivén suavizado)
class Mover {
  constructor(room, d) {
    this.ax = room.px + d.x * TILE; this.ay = room.py + d.y * TILE;
    this.bx = room.px + d.x2 * TILE; this.by = room.py + d.y2 * TILE;
    this.w = d.w * TILE; this.h = 6; this.period = d.period; this.solid = true;
    this.x = this.ax; this.y = this.ay; this.dx = 0; this.dy = 0; this.kind = 'mover';
  }
  update(dt, t) {
    const k = 0.5 - 0.5 * Math.cos((t / this.period) * Math.PI * 2);
    const nx = this.ax + (this.bx - this.ax) * k, ny = this.ay + (this.by - this.ay) * k;
    this.dx = nx - this.x; this.dy = ny - this.y; this.x = nx; this.y = ny;
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x - 1, y - 1, this.w + 2, this.h + 3);
    ctx.fillStyle = '#b98a4e'; ctx.fillRect(x, y, this.w, this.h);
    ctx.fillStyle = '#f2d27a'; ctx.fillRect(x, y, this.w, 2);
    ctx.fillStyle = '#7a5530'; for (let i = 6; i < this.w; i += 12) ctx.fillRect(x + i, y + 3, 2, 2);
    ctx.fillStyle = '#5ad1ff'; ctx.fillRect(x + this.w / 2 - 2, y + 2, 4, 2);
  }
}

// Losa que se derrumba al pisarla y reaparece
class Crumble {
  constructor(room, d) {
    this.x = room.px + d.x * TILE; this.y = room.py + d.y * TILE; this.w = d.w * TILE; this.h = 8;
    this.solid = true; this.state = 'idle'; this.t = 0; this.dx = 0; this.dy = 0; this.kind = 'crumble';
  }
  update(dt, t, player) {
    this.t += dt;
    if (this.state === 'idle' && player.plat === this) { this.state = 'shake'; this.t = 0; }
    else if (this.state === 'shake' && this.t > 0.42) {
      this.state = 'gone'; this.t = 0; this.solid = false;
      FX.burst(this.x + this.w / 2, this.y + 4, 12, { colors: ['#e6c48a', '#a8804e', OUTLINE], speed: 70, grav: 400, life: 0.6 });
    } else if (this.state === 'gone' && this.t > 2.4) {
      const p = player;
      if (!(p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y)) { this.state = 'idle'; this.solid = true; this.t = 0; }
    }
  }
  draw(ctx) {
    let x = Math.round(this.x), y = Math.round(this.y);
    if (this.state === 'gone') {
      ctx.strokeStyle = 'rgba(60,40,30,0.35)'; ctx.setLineDash([2, 2]); ctx.strokeRect(x + 0.5, y + 0.5, this.w - 1, this.h - 1); ctx.setLineDash([]);
      return;
    }
    if (this.state === 'shake') x += Math.round((Math.random() - 0.5) * 3);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x - 1, y - 1, this.w + 2, this.h + 2);
    ctx.fillStyle = '#e6c48a'; ctx.fillRect(x, y, this.w, this.h);
    ctx.fillStyle = '#fff0c8'; ctx.fillRect(x, y, this.w, 2);
    ctx.fillStyle = '#8a6238';
    for (let i = 5; i < this.w; i += 9) { ctx.fillRect(x + i, y + 2, 1, 3); ctx.fillRect(x + i + 1, y + 5, 1, 2); }
  }
}

// Corriente ascendente: eleva al jugador y recarga su dash aéreo
class Wind {
  constructor(room, d) { this.x = room.px + d.x * TILE; this.y = room.py + d.y * TILE; this.w = d.w * TILE; this.h = d.h * TILE; this.seed = Math.random() * 100; }
  apply(p, dt) {
    if (p.x + p.w > this.x && p.x < this.x + this.w && p.y + p.h > this.y && p.y < this.y + this.h) {
      p.vy = Math.max(p.vy - 1900 * dt, -210); p.airDashUsed = false; p.inWind = true;
    }
  }
  draw(ctx, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = 'rgba(28,16,24,0.35)'; ctx.fillRect(this.x, this.y, 1, this.h); ctx.fillRect(this.x + this.w - 1, this.y, 1, this.h);
    // chevrones ascendentes
    for (let k = 0; k < this.h; k += 28) {
      const yy = this.y + this.h - ((t * 70 + k) % this.h), cx = this.x + this.w / 2;
      ctx.fillStyle = '#1c1018'; ctx.fillRect(cx - 6, yy + 1, 5, 3); ctx.fillRect(cx + 1, yy + 1, 5, 3); ctx.fillRect(cx - 2, yy - 2, 4, 3);
      ctx.fillStyle = '#9dffb0'; ctx.fillRect(cx - 5, yy + 1, 4, 2); ctx.fillRect(cx + 1, yy + 1, 4, 2); ctx.fillRect(cx - 1, yy - 1, 2, 2);
    }
    for (let i = 0; i < this.w / 5; i++) {
      const lx = this.x + 2 + ((i * 37 + this.seed) % (this.w - 4));
      const len = 10 + (i * 13) % 14;
      const ly = this.y + this.h - ((t * (90 + (i * 23) % 50) + i * 57) % (this.h + len));
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(Math.round(lx), Math.round(ly), 1, len);
    }
    ctx.fillStyle = 'rgba(120,200,120,0.9)';
    for (let i = 0; i < 3; i++) {
      const ly = this.y + this.h - ((t * 60 + i * this.h / 3) % this.h);
      ctx.fillRect(Math.round(this.x + this.w / 2 + Math.sin(t * 4 + i) * (this.w / 3)), Math.round(ly), 2, 2);
    }
  }
}

// Muro agrietado: 3 golpes lo rompen y revela un secreto
class BreakWall {
  constructor(room, d) {
    this.room = room; this.d = d; this.id = d.id;
    // zona de impacto algo más ancha que la roca para que el retroceso no impida encadenar golpes
    this.x = room.px + d.x * TILE - 10; this.y = room.py + d.y * TILE; this.w = d.w * TILE + 20; this.h = d.h * TILE;
    this.rx = room.px + d.x * TILE;
    this.hp = 3; this.dead = false; this.contact = 0; this.noSoul = true; this.noRecoil = true; this.flashT = 0;
  }
  get cx() { return this.x + this.w / 2; }
  hurt(dmg, player) {
    this.hp -= 1; this.flashT = 0.1; FX.shake(2, 0.1);
    FX.burst(this.cx, player.cy, 8, { colors: ['#a8804e', '#e6c48a', OUTLINE], speed: 110 });
    if (this.hp <= 0) { this.dead = true; Game.breakWall(this); }
  }
  draw(ctx) {
    // grietas visibles sobre la roca
    ctx.fillStyle = this.flashT > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(40,20,10,0.7)';
    const x = this.rx, y = this.y;
    ctx.fillRect(x + 7, y + 6, 1, 14); ctx.fillRect(x + 8, y + 20, 3, 1); ctx.fillRect(x + 10, y + 21, 1, 12);
    ctx.fillRect(x + 4, y + 34, 5, 1); ctx.fillRect(x + 4, y + 35, 1, 12); ctx.fillRect(x + 9, y + 48, 1, 10);
    if (this.flashT > 0) this.flashT -= 1 / 60;
  }
}

// ---------- Enemigo: Escudero (escudo frontal) ----------
class Shielder extends Enemy {
  constructor(x, y) {
    super(x - 7, y - 20, 14, 20, 4);
    this.facing = -1; this.turnT = 0; this.state = 'walk'; this.st = 0; this.speed = 26;
    this.deathColors = ['#ffd28a', '#ffffff', '#6a4a2a']; this.shieldFlash = 0;
  }
  hurt(dmg, player, type) {
    const fromFront = Math.sign(player.cx - this.cx) === this.facing;
    if (type !== 'down' && type !== 'up' && fromFront && this.state !== 'bash') {
      this.shieldFlash = 0.15;
      FX.burst(this.cx + this.facing * 8, this.cy, 10, { colors: ['#ffffff', '#bff6ff', '#ffe28a'], speed: 150, grav: 0, life: 0.25 });
      player.recoilT = 0.14; player.recoilV = -player.facing * 190;
      FX.stop(3);
      return false;   // bloqueado
    }
    super.hurt(dmg, player, type);
  }
  knockback(dir) { this.vx = dir * 90; this.knockT = 0.15; }
  update(dt, game) {
    const p = game.player;
    this.t += dt; this.st += dt;
    if (this.flashT > 0) this.flashT -= dt; if (this.shieldFlash > 0) this.shieldFlash -= dt;
    const dx = p.cx - this.cx, near = Math.abs(dx) < 120 && Math.abs(p.cy - this.cy) < 50;
    if (this.knockT > 0) { this.knockT -= dt; this.vx *= Math.pow(0.01, dt); }
    else if (this.state === 'bashTel') {
      this.vx = 0;
      if (this.st > 0.4) { this.state = 'bash'; this.st = 0; }
    } else if (this.state === 'bash') {
      this.vx = this.facing * 170;
      if (this.st > 0.22) { this.state = 'walk'; this.st = 0; }
    } else {
      // gira hacia el jugador con retardo (ventana para esquivar y atacar por detrás)
      if (near && Math.sign(dx) !== this.facing) { this.turnT += dt; if (this.turnT > 0.55) { this.facing *= -1; this.turnT = 0; } }
      else this.turnT = 0;
      const sp = near ? 42 : this.speed;
      this.vx = this.facing * sp;
      if (near && Math.abs(dx) < 46 && Math.sign(dx) === this.facing && this.st > 1.2) { this.state = 'bashTel'; this.st = 0; }
      const aheadX = this.facing > 0 ? this.x + this.w + 1 : this.x - 1;
      const tFront = World.tileAt(Math.floor(aheadX / TILE), Math.floor((this.y + this.h + 1) / TILE));
      const spikeAhead = World.tileAt(Math.floor(aheadX / TILE), Math.floor((this.y + this.h - 2) / TILE)) === T_SPIKE;
      const wall = World.rectSolid(aheadX - (this.facing > 0 ? 0 : 1), this.y, 1, this.h - 1);
      if (this.onGround && (wall || (tFront !== T_SOLID && tFront !== T_PLAT) || spikeAhead)) {
        if (near) this.vx = 0; else this.facing *= -1;
      }
    }
    this.vy = Math.min(this.vy + 900 * dt, 400);
    moveEntity(this, dt);
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y), f = this.facing, flash = this.flashT > 0;
    const step = Math.floor(this.t * 6) % 2, tel = this.state === 'bashTel';
    drawOutlined(ctx, c => {
      ctx.save(); ctx.translate(x + this.w / 2, y); ctx.scale(f, 1);
      const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(a, b, w, h); };
      R('#4a3a2a', -5 + step, 15, 3, 5); R('#4a3a2a', 1 - step, 15, 3, 5);
      R('#b07a3a', -6, 6, 11, 10); R('#e0a85a', -6, 6, 11, 2);
      R('#8a5a2a', -5, -1, 9, 8); R('#d8b070', -4, 0, 7, 2); R('#1c1018', 1, 3, 3, 2);
      R('#e0463c', -7, -4, 6, 3);                            // penacho
      // escudo frontal
      R(this.shieldFlash > 0 ? '#ffffff' : '#9fd0f0', tel ? 6 : 4, 2, 5, 16); R('#e8f6ff', tel ? 6 : 4, 2, 5, 2); R('#ffd24a', tel ? 7 : 5, 8, 3, 3);
      ctx.restore();
    }, flash);
  }
}

// ---------- Enemigo: Búho Pétreo (dispara semillas) ----------
class Turret extends Enemy {
  constructor(x, y) { super(x - 7, y - 14, 14, 14, 3); this.cd = 1.2 + Math.random(); this.tel = 0; this.deathColors = ['#bfe36a', '#ffffff', '#4a3a2a']; }
  knockback() {}
  update(dt, game) {
    const p = game.player;
    this.t += dt; if (this.flashT > 0) this.flashT -= dt;
    this.facing = Math.sign(p.cx - this.cx) || 1;
    const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    if (this.tel > 0) {
      this.tel -= dt;
      if (this.tel <= 0) {
        const ox = this.cx + this.facing * 6, oy = this.y + 6;
        const a = Math.atan2(p.cy - oy, p.cx - ox);
        game.hazards.push(new Seed(ox, oy, Math.cos(a) * 125, Math.sin(a) * 125));
        this.cd = 2.2;
      }
    } else if ((this.cd -= dt) <= 0 && d < 230 && p.hp > 0) this.tel = 0.55;
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y), glow = this.tel > 0 && Math.floor(this.tel * 16) % 2 === 0;
    drawOutlined(ctx, c => {
      const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(x + a, y + b, w, h); };
      R('#7d8a96', 1, 3, 12, 11); R('#aab8c4', 2, 3, 10, 3); R('#5a6672', 3, 10, 8, 4);
      R('#7d8a96', 1, 0, 3, 3); R('#7d8a96', 10, 0, 3, 3);   // orejas
      R(glow ? '#ffffff' : '#ffb020', 3, 5, 3, 3); R(glow ? '#ffffff' : '#ffb020', 8, 5, 3, 3);
      R('#1c1018', this.facing > 0 ? 5 : 4, 6, 1, 1); R('#1c1018', this.facing > 0 ? 10 : 9, 6, 1, 1);
      R('#e0a020', 6, 8, 2, 2);
    }, this.flashT > 0);
  }
}

// Proyectil destruible (se puede cortar y rebotar sobre él)
class Seed {
  constructor(x, y, vx, vy) { this.w = 8; this.h = 8; this.x = x - 4; this.y = y - 4; this.vx = vx; this.vy = vy; this.t = 0; this.dead = false; this.hittable = true; this.noSoul = true; this.contact = 0; }
  get cx() { return this.x + 4; }
  hurt() { this.dead = true; FX.burst(this.x + 4, this.y + 4, 8, { colors: ['#bfe36a', '#ffffff'], speed: 90, grav: 0 }); }
  update(dt) {
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (World.rectSolid(this.x + 2, this.y + 2, 4, 4) || this.t > 5) { this.dead = true; FX.burst(this.x + 4, this.y + 4, 5, { colors: ['#bfe36a', OUTLINE], speed: 60, grav: 0 }); }
  }
  draw(ctx) {
    const x = Math.round(this.x + 4), y = Math.round(this.y + 4);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6fbf2a'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8ff9a'; ctx.fillRect(x - 2, y - 2, 2, 2);
  }
}

// Pluma del jefe (destruible)
class Feather extends Seed {
  constructor(x, y, vx, vy) { super(x, y, vx, vy); this.a = Math.atan2(vy, vx); }
  draw(ctx) {
    ctx.save(); ctx.translate(Math.round(this.x + 4), Math.round(this.y + 4)); ctx.rotate(this.a);
    ctx.fillStyle = OUTLINE; ctx.fillRect(-7, -3, 14, 6);
    ctx.fillStyle = '#ffb020'; ctx.fillRect(-6, -2, 12, 4);
    ctx.fillStyle = '#fff4c0'; ctx.fillRect(-2, -1, 7, 2);
    ctx.restore();
  }
}

// Pilar de luz: aviso y luego daño
class SunPillar {
  constructor(x, top, bottom, warn) { this.cxp = x; this.w = 16; this.x = x - 8; this.y = top; this.h = bottom - top; this.t = 0; this.warn = warn; this.dead = false; }
  get harmful() { return this.t > this.warn && this.t < this.warn + 0.4; }
  update(dt) {
    this.t += dt;
    if (this.t > this.warn && this.t - dt <= this.warn) { FX.shake(3, 0.15); FX.burst(this.cxp, this.y + this.h, 12, { colors: ['#fff4c0', '#ffb020'], speed: 120, angle: -Math.PI / 2, spread: 1.2 }); }
    if (this.t > this.warn + 0.55) this.dead = true;
  }
  draw(ctx) {
    if (this.t < this.warn) {
      const blink = Math.floor(this.t * 14) % 2;
      ctx.fillStyle = blink ? 'rgba(255,90,40,0.9)' : 'rgba(255,180,40,0.7)';
      ctx.fillRect(Math.round(this.cxp) - 1, this.y, 2, this.h);
      ctx.fillStyle = 'rgba(255,90,40,0.9)'; ctx.fillRect(Math.round(this.cxp) - 7, this.y + this.h - 3, 14, 3);
    } else {
      const k = 1 - Math.max(0, (this.t - this.warn - 0.3) / 0.25);
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = OUTLINE; ctx.fillRect(this.x - 1, this.y, this.w + 2, this.h);
      ctx.fillStyle = '#ffb020'; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#fff8d8'; ctx.fillRect(this.x + 4, this.y, this.w - 8, this.h);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- Jefe 2: Heraldo del Alba ----------
class Herald extends Enemy {
  constructor(x, y, room) {
    super(x - 12, y - 34, 24, 34, 44);
    this.room = room; this.key = 'heraldo'; this.name = 'HERALDO DEL ALBA';
    this.state = 'dormant'; this.st = 0; this.facing = -1; this.last = null; this.phase2 = false; this.fly = false;
    this.deathColors = ['#ffb020', '#ffffff', '#fff4c0']; this.contact = 1; this.homeY = this.y;
  }
  get floorY() { return this.room.py + 15 * TILE; }
  get arenaL() { return this.room.px + 3 * TILE; }
  get arenaR() { return this.room.px + 31 * TILE; }
  hurt(dmg, player, type) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying' || this.state === 'diveUp' || this.state === 'diveMark') return false;
    this.hp -= dmg; this.flashT = 0.1;
    if (!this.phase2 && this.hp <= this.maxHp / 2) {
      this.phase2 = true; this.set('roar'); FX.shake(6, 0.6); FX.ring(this.cx, this.cy, '#ffb020', 50);
      Game.hazards = Game.hazards.filter(h => !(h instanceof Feather));
    }
    if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
  }
  set(s) { this.state = s; this.st = 0; this.fired = 0; }
  update(dt, game) {
    const p = game.player;
    this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    const spd = this.phase2 ? 1.3 : 1;
    const face = () => { this.facing = Math.sign(p.cx - this.cx) || this.facing; };
    let grav = true;
    const flyTo = (tx, ty, k) => { this.x += (tx - this.x) * Math.min(1, dt * k); this.y += (ty - this.y) * Math.min(1, dt * k); this.vx = this.vy = 0; grav = false; };
    switch (this.state) {
      case 'dormant':
        this.y = this.room.py - 60; grav = false;
        if (p.x > this.room.px + 5 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); }
        break;
      case 'intro':
        grav = false; face();
        if (this.st < 0.9) this.y += (this.floorY - this.h - this.y) * Math.min(1, dt * 5);
        else { this.y = this.floorY - this.h; if (this.st < 1.0) { FX.shake(5, 0.3); FX.dust(this.cx, this.floorY); } }
        if (this.st > 1.8) this.set('idle');
        break;
      case 'roar':
        this.vx = 0; if (this.st < 0.9) FX.shake(4, 0.1);
        if (this.st > 1.1) this.set('idle');
        break;
      case 'idle': {
        face(); this.vx = 0;
        if (this.st > (this.phase2 ? 0.45 : 0.75)) {
          const pool = ['lunge', 'dive', 'feathers'];
          if (this.phase2) pool.push('pillars', 'pillars');
          const opts = pool.filter(o => o !== this.last);
          const pick = opts[(Math.random() * opts.length) | 0];
          this.last = pick; this.set(pick + 'Tel');
        }
        break;
      }
      // Patrón 1: estocada con lanza
      case 'lungeTel':
        face(); this.vx = 0;
        if (this.st > 0.6 / spd) { this.set('lunge'); FX.dust(this.cx, this.y + this.h, this.facing > 0 ? Math.PI : 0); }
        break;
      case 'lunge':
        this.vx = this.facing * 320 * spd;
        if (Math.random() < 0.7) FX.burst(this.cx - this.facing * 12, this.cy, 1, { colors: ['#fff4c0', '#ffb020'], speed: 30, grav: 0 });
        if (this.hitWallL || this.hitWallR || this.st > 1.6) { this.vx = 0; FX.shake(4, 0.2); this.set('stun'); }
        break;
      case 'stun':
        this.vx = 0; if (this.st > 0.65 / spd) this.set('idle');
        break;
      // Patrón 2: picado desde el cielo (marca en el suelo)
      case 'diveTel':
        this.vx = 0;
        if (this.st > 0.3) { this.set('diveUp'); FX.dust(this.cx, this.y + this.h); }
        break;
      case 'diveUp':
        flyTo(this.x, this.room.py - 70, 6);
        if (this.st > 0.55) { this.set('diveMark'); this.markX = p.cx; }
        break;
      case 'diveMark':
        grav = false; this.vx = this.vy = 0;
        if (this.st < 0.75 / spd) this.markX += (p.cx - this.markX) * Math.min(1, dt * 6);
        this.x = Math.max(this.arenaL, Math.min(this.arenaR - this.w, this.markX - this.w / 2));
        if (this.st > 1.05 / spd) { this.set('dive'); }
        break;
      case 'dive':
        grav = false; this.vy = 560; this.vx = 0;
        break;
      case 'diveLand':
        this.vx = 0; if (this.st > 0.7 / spd) this.set('idle');
        break;
      // Patrón 3: abanico de plumas
      case 'feathersTel':
        face(); flyTo(this.x, this.floorY - this.h - 70, 5);
        if (this.st > 0.7 / spd && this.fired < (this.phase2 ? 2 : 1) && this.st > 0.7 / spd + this.fired * 0.55) {
          const n = this.phase2 ? 7 : 5, ox = this.cx, oy = this.cy;
          const base = Math.atan2(p.cy - oy, p.cx - ox), spread = 0.22;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * spread + (this.fired % 2 ? spread / 2 : 0);
            game.hazards.push(new Feather(ox, oy, Math.cos(a) * 150, Math.sin(a) * 150));
          }
          FX.ring(ox, oy, '#ffb020', 18); this.fired++;
        }
        if (this.st > 0.7 / spd + (this.phase2 ? 1.4 : 0.9)) this.set('fall');
        break;
      case 'fall':
        this.vx = 0; if (this.onGround && this.st > 0.1) this.set('idle');
        break;
      // Patrón 4 (fase 2): pilares de luz
      case 'pillarsTel':
        this.vx = 0; face();
        if (!this.fired) {
          this.fired = 1;
          const xs = [p.cx, p.cx - 72, p.cx + 72, this.phase2 && Math.random() < 0.5 ? p.cx + 144 : p.cx - 144];
          for (const x of xs) if (x > this.arenaL && x < this.arenaR) game.hazards.push(new SunPillar(x, this.room.py, this.floorY, 0.85));
        }
        if (this.st > 1.5) this.set('idle');
        break;
      case 'dying':
        this.vx = 0; grav = !this.onGround;
        if (Math.random() < 0.35) {
          FX.burst(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 8, { colors: ['#ffb020', '#ffffff', '#fff4c0'], speed: 120, life: 0.4, grav: 0 });
          FX.shake(3, 0.1);
        }
        if (this.st > 1.8 && !this.dead) {
          this.dead = true;
          FX.burst(this.cx, this.cy, 60, { colors: ['#ffb020', '#ffffff', '#fff4c0', '#5ad1ff'], speed: 260, life: 0.9 });
          FX.ring(this.cx, this.cy, '#ffffff', 60); FX.shake(8, 0.5);
          Game.victory(this);
        }
        break;
    }
    if (this.state === 'dive') {
      this.y += this.vy * dt;
      if (this.y + this.h >= this.floorY) {
        this.y = this.floorY - this.h; this.set('diveLand'); FX.shake(7, 0.3); FX.stop(3);
        FX.burst(this.cx, this.floorY, 18, { colors: ['#fff4c0', '#ffb020', '#ffffff'], speed: 150, angle: -Math.PI / 2, spread: 2.6 });
        if (this.phase2) { game.hazards.push(new Shockwave(this.cx, this.floorY, -1, 1), new Shockwave(this.cx, this.floorY, 1, 1)); }
      }
      return;
    }
    if (grav) { this.vy = Math.min(this.vy + 1100 * dt, 500); moveEntity(this, dt); }
  }
  drawMarker(ctx) {
    if (this.state !== 'diveMark' && this.state !== 'dive') return;
    const locked = this.state === 'dive' || this.st > 0.75 / (this.phase2 ? 1.3 : 1);
    const x = Math.round(this.x + this.w / 2), y = this.floorY;
    ctx.fillStyle = locked ? (Math.floor(this.t * 20) % 2 ? '#ff3a2a' : '#ffffff') : 'rgba(255,120,40,0.85)';
    ctx.fillRect(x - 14, y - 2, 28, 2); ctx.fillRect(x - 1, y - 10, 2, 8);
    ctx.fillStyle = 'rgba(28,16,24,0.35)'; ctx.fillRect(x - 12, y - 1, 24, 1);
  }
  draw(ctx) {
    this.drawMarker(ctx);
    if (this.state === 'dormant') return;
    const x = Math.round(this.x), y = Math.round(this.y), f = this.facing;
    const tel = this.state.endsWith('Tel') && Math.floor(this.st * 16) % 2 === 0;
    const wing = this.state === 'diveUp' || this.state === 'feathersTel' || this.state === 'intro' ? Math.floor(this.t * 14) % 2 : 0;
    const p2 = this.phase2;
    drawOutlined(ctx, c => {
      ctx.save(); ctx.translate(x + this.w / 2, y + this.h); ctx.scale(f, 1);
      const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(a, b, w, h); };
      // alas
      R(p2 ? '#ff8a3a' : '#fff4d8', -18, -34 - wing * 4, 10, 16); R(p2 ? '#ffb020' : '#ffd88a', -20, -22 - wing * 4, 8, 10);
      // piernas
      R('#6a4a8a', -6, -10, 5, 10); R('#6a4a8a', 2, -10, 5, 10); R('#ffd24a', -7, -3, 6, 3); R('#ffd24a', 1, -3, 6, 3);
      // cuerpo
      R('#f2f0ff', -8, -26, 16, 17); R(p2 ? '#ffb020' : '#ffd24a', -8, -26, 16, 3); R('#6a4a8a', -8, -14, 16, 3);
      R(tel ? '#ffffff' : '#5ad1ff', -2, -21, 4, 4);
      // cabeza con yelmo de pico
      R('#f2f0ff', -5, -35, 11, 9); R(p2 ? '#ffb020' : '#ffd24a', -5, -36, 11, 2); R('#ffd24a', 6, -31, 5, 3);
      R(tel ? '#ffffff' : '#1c1018', 2, -32, 3, 2);
      R(p2 ? '#ff5a2a' : '#ffd24a', -3, -40, 3, 4);
      // lanza
      if (this.state === 'lunge' || this.state === 'lungeTel') { R('#8a6a4a', 2, -20, 22, 2); R('#e8f6ff', 24, -22, 6, 6); }
      else { R('#8a6a4a', 9, -40, 2, 38); R('#e8f6ff', 8, -46, 4, 7); }
      ctx.restore();
    }, this.flashT > 0);
  }
}
