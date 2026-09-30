'use strict';
// ---------- Enemigos ----------
class Enemy {
  constructor(x, y, w, h, hp) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.hp = hp; this.maxHp = hp;
    this.vx = 0; this.vy = 0; this.flashT = 0; this.dead = false; this.knockT = 0; this.t = Math.random() * 10;
    this.contact = 1;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurt(dmg, player, type) {
    this.hp -= dmg; this.flashT = 0.12;
    if (this.hp > 0) sfx('hit');
    const dir = type === 'down' ? 0 : Math.sign(this.cx - player.cx) || player.facing;
    this.knockback(dir, type);
    if (this.hp <= 0) this.die();
  }
  knockback(dir) { this.vx = dir * 140; this.knockT = 0.15; }
  die() {
    this.dead = true; sfx('kill');
    FX.burst(this.cx, this.cy, 18, { colors: this.deathColors || ['#ff9a3c', '#ffffff', '#3a2f4a'], speed: 170, life: 0.55 });
    FX.sparks(this.cx, this.cy, 8, this.deathColors || ['#ffffff', '#ffd28a', '#ff9a3c']);
    FX.ring(this.cx, this.cy, '#ffd28a', 22);
    FX.shake(3, 0.15);
  }
}

// Rastrero: caminante terrestre acorazado
class Walker extends Enemy {
  constructor(x, y) { super(x - 8, y - 13, 16, 13, 3); this.dir = Math.random() < 0.5 ? -1 : 1; this.speed = 32; }
  update(dt, game) {
    this.t += dt; if (this.flashT > 0) this.flashT -= dt;
    if (this.knockT > 0) { this.knockT -= dt; this.vx *= Math.pow(0.01, dt); }
    else {
      // girar en paredes, bordes y pinchos
      const aheadX = this.dir > 0 ? this.x + this.w + 1 : this.x - 1;
      const footY = this.y + this.h + 1;
      const tFront = World.tileAt(Math.floor(aheadX / TILE), Math.floor(footY / TILE));
      const wall = World.rectSolid(aheadX - (this.dir > 0 ? 0 : 1), this.y, 1, this.h - 1);
      const spikeAhead = World.tileAt(Math.floor(aheadX / TILE), Math.floor((this.y + this.h - 2) / TILE)) === T_SPIKE;
      if (this.onGround && (wall || (tFront !== T_SOLID && tFront !== T_PLAT) || spikeAhead)) this.dir *= -1;
      this.vx = this.dir * this.speed;
    }
    this.vy = Math.min(this.vy + 900 * dt, 400);
    moveEntity(this, dt);
    if (this.hitWallL) this.dir = 1; if (this.hitWallR) this.dir = -1;
  }
  draw(ctx) {
    if (this.crystal) return drawOutlined(ctx, c => this.drawCrystal(ctx, c), this.flashT > 0);
    if (this.day) return drawOutlined(ctx, c => this.drawDay(ctx, c), this.flashT > 0);
    const x = Math.round(this.x), y = Math.round(this.y), f = this.flashT > 0;
    const step = Math.floor(this.t * 8) % 2;
    const OL = '#0c0814';
    // contorno
    ctx.fillStyle = OL;
    ctx.fillRect(x, y + 2, 16, 10); ctx.fillRect(x + 2, y, 12, 3);
    ctx.fillRect(x + 1 + step, y + this.h - 4, 5, 4); ctx.fillRect(x + 9 - step, y + this.h - 4, 5, 4);
    const hx0 = this.dir > 0 ? x + 12 : x - 2; ctx.fillRect(hx0, y + 5, 6, 7);
    ctx.fillStyle = f ? '#fff' : '#1a1422';
    ctx.fillRect(x + 2 + step, y + this.h - 3, 3, 3); ctx.fillRect(x + 10 - step, y + this.h - 3, 3, 3);
    ctx.fillStyle = f ? '#fff' : '#4b3a63';
    ctx.fillRect(x + 1, y + 3, 14, 8); ctx.fillRect(x + 3, y + 1, 10, 2);
    ctx.fillStyle = f ? '#fff' : '#8a6eb0';
    ctx.fillRect(x + 3, y + 2, 8, 2); ctx.fillRect(x + 2, y + 4, 3, 2);
    ctx.fillStyle = f ? '#fff' : '#2b2140';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 4, y + 5, 1, 5);
    const hx = this.dir > 0 ? x + 13 : x - 1;
    ctx.fillStyle = f ? '#fff' : '#3a2c50'; ctx.fillRect(hx, y + 6, 4, 5);
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(this.dir > 0 ? hx + 2 : hx, y + 7, 2, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(this.dir > 0 ? hx + 2 : hx, y + 7, 1, 1);
  }
}

// Variante diurna: escarabajo dorado
Walker.prototype.drawDay = function (ctx, c) {
  const x = Math.round(this.x), y = Math.round(this.y), step = Math.floor(this.t * 8) % 2;
  const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(x + a, y + b, w, h); };
  R('#3a2a1a', 2 + step, this.h - 3, 3, 3); R('#3a2a1a', 10 - step, this.h - 3, 3, 3);
  R('#d89a2a', 1, 3, 14, 8); R('#d89a2a', 3, 1, 10, 2); R('#ffd86a', 3, 2, 8, 2);
  R('#fff0b0', 4, 3, 6, 1);
  R('#a8641a', 4, 5, 1, 5); R('#a8641a', 8, 5, 1, 5); R('#a8641a', 12, 5, 1, 5);
  const hx = this.dir > 0 ? 13 : -1;
  R('#6a3a1a', hx, 6, 4, 5); R('#ff3a2a', this.dir > 0 ? hx + 2 : hx, 7, 2, 2); R('#ffffff', this.dir > 0 ? hx + 2 : hx, 7, 1, 1);
};

// Variante del templo: escarabajo de amatista
Walker.prototype.drawCrystal = function (ctx, c) {
  const x = Math.round(this.x), y = Math.round(this.y), step = Math.floor(this.t * 8) % 2;
  const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(x + a, y + b, w, h); };
  R('#2a2050', 2 + step, this.h - 3, 3, 3); R('#2a2050', 10 - step, this.h - 3, 3, 3);
  R('#9a5ae0', 1, 3, 14, 8); R('#9a5ae0', 3, 1, 10, 2); R('#e0c0ff', 3, 2, 8, 2);
  R('#ffffff', 4, 3, 5, 1);
  R('#6a2ab0', 4, 5, 1, 5); R('#6a2ab0', 8, 5, 1, 5); R('#6a2ab0', 12, 5, 1, 5);
  const hx = this.dir > 0 ? 13 : -1;
  R('#4a2a80', hx, 6, 4, 5); R('#ffd24a', this.dir > 0 ? hx + 2 : hx, 7, 2, 2); R('#ffffff', this.dir > 0 ? hx + 2 : hx, 7, 1, 1);
};

// Zumbador: volador que persigue
class Flyer extends Enemy {
  constructor(x, y) { super(x - 6, y - 6, 12, 12, 2); this.hx = x; this.hy = y; this.aggro = false; this.deathColors = ['#7cff9a', '#ffffff', '#2f5a3a']; }
  knockback(dir, type) {
    this.vx = (dir || 0) * 200; this.vy = type === 'down' ? 160 : (type === 'up' ? -160 : -40); this.knockT = 0.22;
  }
  update(dt, game) {
    this.t += dt; if (this.flashT > 0) this.flashT -= dt;
    const p = game.player;
    const dx = p.cx - this.cx, dy = (p.cy - 4) - this.cy, d = Math.hypot(dx, dy);
    if (!this.aggro && d < 130 && game.player.hp > 0) { this.aggro = true; FX.ring(this.cx, this.cy, '#7cff9a', 12); }
    if (this.aggro && d > 260) this.aggro = false;
    if (this.knockT > 0) { this.knockT -= dt; this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt); }
    else if (this.aggro) {
      const acc = 220, max = 72;
      this.vx += (dx / (d || 1)) * acc * dt; this.vy += (dy / (d || 1)) * acc * dt + Math.sin(this.t * 6) * 30 * dt;
      const sp = Math.hypot(this.vx, this.vy); if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    } else {
      this.vx += ((this.hx + Math.cos(this.t * 0.8) * 20) - this.cx) * 2 * dt - this.vx * 2 * dt;
      this.vy += ((this.hy + Math.sin(this.t * 1.6) * 6) - this.cy) * 2 * dt - this.vy * 2 * dt;
    }
    moveEntity(this, dt, { dropThrough: true });
  }
  draw(ctx) {
    if (this.day) return drawOutlined(ctx, c => this.drawDay(ctx, c), this.flashT > 0);
    const x = Math.round(this.x), y = Math.round(this.y + Math.sin(this.t * 10) * 1), f = this.flashT > 0;
    const wing = Math.floor(this.t * 20) % 2;
    const OL = '#0c1410';
    ctx.fillStyle = OL;
    if (wing) { ctx.fillRect(x - 5, y - 2, 8, 5); ctx.fillRect(x + 9, y - 2, 8, 5); }
    else { ctx.fillRect(x - 4, y + 2, 7, 5); ctx.fillRect(x + 9, y + 2, 7, 5); }
    ctx.fillRect(x, y, 12, 12);
    ctx.fillStyle = f ? '#fff' : 'rgba(190,255,210,0.85)';
    if (wing) { ctx.fillRect(x - 4, y - 1, 6, 3); ctx.fillRect(x + 10, y - 1, 6, 3); }
    else { ctx.fillRect(x - 3, y + 3, 5, 3); ctx.fillRect(x + 10, y + 3, 5, 3); }
    ctx.fillStyle = f ? '#fff' : '#2e4a36'; ctx.fillRect(x + 1, y + 1, 10, 10);
    ctx.fillStyle = f ? '#fff' : '#5a9a68'; ctx.fillRect(x + 2, y + 2, 8, 4);
    ctx.fillStyle = this.aggro ? '#ff4d6d' : '#7cff9a';
    const look = Math.sign(this.vx) || 1;
    ctx.fillRect(x + 5 + look * 2, y + 5, 2, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 5 + look * 2, y + 5, 1, 1);
    ctx.fillStyle = f ? '#fff' : '#1b2b20'; ctx.fillRect(x + 5, y + 11, 2, 2);
    if (this.aggro) { ctx.fillStyle = 'rgba(255,77,109,0.35)'; ctx.beginPath(); ctx.arc(x + 6, y + 6, 9, 0, Math.PI * 2); ctx.fill(); }
  }
}

// Variante diurna: gaviota de las cumbres
Flyer.prototype.drawDay = function (ctx, c) {
  const x = Math.round(this.x), y = Math.round(this.y + Math.sin(this.t * 10)), wing = Math.floor(this.t * 16) % 2;
  const R = (col, a, b, w, h) => { ctx.fillStyle = c(col); ctx.fillRect(x + a, y + b, w, h); };
  if (wing) { R('#e8eef8', -5, -1, 7, 3); R('#e8eef8', 10, -1, 7, 3); R('#3a4a5a', -5, -1, 2, 2); R('#3a4a5a', 15, -1, 2, 2); }
  else { R('#e8eef8', -4, 5, 6, 3); R('#e8eef8', 10, 5, 6, 3); }
  R('#ffffff', 1, 2, 10, 8); R('#c8d4e4', 2, 7, 8, 3); R('#ffffff', 3, 3, 4, 1);
  const look = Math.sign(this.vx) || 1;
  R('#ffb020', look > 0 ? 10 : -1, 5, 3, 2);
  R(this.aggro ? '#ff2a2a' : '#1c1018', look > 0 ? 7 : 3, 4, 2, 2);
  R('#ffffff', look > 0 ? 7 : 3, 4, 1, 1);
};
