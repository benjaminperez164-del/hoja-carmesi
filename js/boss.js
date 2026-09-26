'use strict';
// ---------- Jefe: el Guardián Hueco ----------
class Boss extends Enemy {
  constructor(x, y, room) {
    super(x - 14, y - 36, 28, 36, 36);
    this.room = room; this.name = 'GUARDIÁN HUECO';
    this.state = 'dormant'; this.st = 0; this.facing = -1; this.last = null; this.phase2 = false;
    this.deathColors = ['#ff3a5c', '#ffffff', '#ffb0c0'];
    this.contact = 1;
  }
  hurt(dmg, player, type) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    this.hp -= dmg; this.flashT = 0.1;
    if (!this.phase2 && this.hp <= this.maxHp / 2) {
      this.phase2 = true; this.set('roar'); FX.shake(6, 0.6);
      FX.ring(this.cx, this.cy, '#ff3a5c', 50);
    }
    if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
  }
  set(s) { this.state = s; this.st = 0; this.fired = false; }
  get arenaL() { return this.room.px + 3 * TILE; }
  get arenaR() { return this.room.px + (this.room.w - 1) * TILE; }
  update(dt, game) {
    const p = game.player;
    this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    const spd = this.phase2 ? 1.35 : 1;
    const face = () => { this.facing = Math.sign(p.cx - this.cx) || this.facing; };
    let grav = true;
    switch (this.state) {
      case 'dormant':
        if (p.x > this.room.px + 5 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); }
        break;
      case 'intro':
        face();
        if (this.st > 0.4 && this.st < 1.4) FX.shake(3, 0.1);
        if (this.st > 1.6) this.set('idle');
        break;
      case 'roar':
        this.vx = 0;
        if (this.st < 0.9) FX.shake(4, 0.1);
        if (this.st > 1.0) this.set('idle');
        break;
      case 'idle':
        face(); this.vx = 0;
        if (this.st > (this.phase2 ? 0.35 : 0.65)) {
          const opts = ['charge', 'leap', 'orbs'].filter(o => o !== this.last);
          let pick = opts[(Math.random() * opts.length) | 0];
          if (Math.abs(p.cx - this.cx) < 60 && this.last !== 'leap' && Math.random() < 0.5) pick = 'leap';
          this.last = pick; this.set(pick + 'Tel');
          this.leaps = this.phase2 ? 2 : 1;
        }
        break;
      // --- Patrón 1: embestida ---
      case 'chargeTel':
        face(); this.vx = 0;
        if (Math.random() < 0.5) FX.dust(this.cx - this.facing * 12, this.y + this.h, this.facing > 0 ? Math.PI : 0);
        if (this.st > 0.55 / spd) { this.set('charge'); FX.shake(2, 0.1); }
        break;
      case 'charge':
        this.vx = this.facing * 290 * spd;
        if (Math.random() < 0.7) FX.burst(this.cx - this.facing * 14, this.y + this.h - 2, 1, { colors: ['#ff8aa0', '#ffffff'], speed: 40, grav: -30 });
        if (this.hitWallL || this.hitWallR || this.st > 2) {
          FX.shake(6, 0.3); FX.stop(4);
          FX.burst(this.facing > 0 ? this.x + this.w : this.x, this.cy, 14, { colors: ['#c8c0d8', '#ffffff'], speed: 150 });
          this.vx = 0; this.set('stun');
        }
        break;
      case 'stun':
        this.vx = 0;
        if (this.st > 0.7 / spd) this.set('idle');
        break;
      // --- Patrón 2: salto y onda de choque ---
      case 'leapTel':
        face(); this.vx = 0;
        if (this.st > 0.35 / spd) {
          const t = 0.9, dx = Math.max(this.arenaL + 20, Math.min(this.arenaR - 20, p.cx)) - this.cx;
          this.vx = dx / t; this.vy = -495; this.onGround = false; this.set('leap');
          FX.dust(this.cx, this.y + this.h);
        }
        break;
      case 'leap':
        if (this.st > 0.05 && this.onGround) {
          this.vx = 0; FX.shake(6, 0.3); FX.stop(3);
          FX.burst(this.cx, this.y + this.h, 16, { colors: ['#c8c0d8', '#ff8aa0', '#ffffff'], speed: 140, angle: -Math.PI / 2, spread: 2.4 });
          const gy = this.y + this.h;
          game.hazards.push(new Shockwave(this.cx, gy, -1, spd), new Shockwave(this.cx, gy, 1, spd));
          this.leaps--;
          this.set(this.leaps > 0 ? 'leapTel' : 'stun');
        }
        break;
      // --- Patrón 3: ráfaga de orbes ---
      case 'orbsTel':
        face(); this.vx = 0;
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          FX.parts.push({ x: this.cx + Math.cos(a) * 26, y: this.y + 6 + Math.sin(a) * 26, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.4, t: 0, color: '#ff5ab0', size: 2, grav: 0, drag: 1 });
        }
        if (this.st > 0.6 / spd && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 5 : 3, ox = this.cx + this.facing * 10, oy = this.y + 8;
          const base = Math.atan2(p.cy - oy, p.cx - ox), spread = 0.28;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * spread;
            game.hazards.push(new Orb(ox, oy, Math.cos(a) * 140 * spd, Math.sin(a) * 140 * spd));
          }
          FX.ring(ox, oy, '#ff5ab0', 16); FX.shake(2, 0.1);
        }
        if (this.st > 1.1 / spd) this.set('idle');
        break;
      case 'dying':
        this.vx = 0;
        if (Math.random() < 0.35) {
          const ex = this.x + Math.random() * this.w, ey = this.y + Math.random() * this.h;
          FX.burst(ex, ey, 8, { colors: ['#ff3a5c', '#ffffff', '#ffd28a'], speed: 120, life: 0.4, grav: 0 });
          FX.shake(3, 0.1);
        }
        if (this.st > 1.8 && !this.dead) {
          this.dead = true;
          FX.burst(this.cx, this.cy, 60, { colors: ['#ff3a5c', '#ffffff', '#ffd28a', '#bff6ff'], speed: 260, life: 0.9 });
          FX.ring(this.cx, this.cy, '#ffffff', 60); FX.shake(8, 0.5);
          Game.victory();
        }
        break;
    }
    if (grav) this.vy = Math.min(this.vy + 1100 * dt, 500);
    moveEntity(this, dt);
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const f = this.flashT > 0, tel = this.state.endsWith('Tel') && Math.floor(this.st * 16) % 2 === 0;
    const body = f ? '#ffffff' : (this.phase2 ? '#5a1426' : '#2e2440');
    const plate = f ? '#ffffff' : (this.phase2 ? '#a3243e' : '#6b5a8a');
    const hi = f ? '#ffffff' : (this.phase2 ? '#e0466a' : '#a898c8');
    const crouch = (this.state === 'chargeTel' || this.state === 'leapTel' || this.state === 'stun') ? 3 : 0;
    ctx.save();
    ctx.translate(x + this.w / 2, y + this.h);
    ctx.scale(this.facing, 1);
    const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(a, b, w, h); };
    // capa/sombra
    R(body, -16, -26 + crouch, 10, 24);
    // piernas
    R(body, -9, -10, 6, 10); R(body, 3, -10, 6, 10);
    R(plate, -10, -4, 8, 4); R(plate, 2, -4, 8, 4);
    // torso
    R(body, -11, -28 + crouch, 22, 19);
    R(plate, -10, -27 + crouch, 20, 8); R(hi, -8, -26 + crouch, 12, 2);
    R(plate, -6, -18 + crouch, 12, 6);
    // núcleo
    R(tel ? '#ffffff' : '#ff3a5c', -2, -22 + crouch, 5, 5);
    // cabeza con cuernos
    R(body, -6, -38 + crouch, 13, 11);
    R(plate, -5, -37 + crouch, 11, 5);
    R(hi, -9, -44 + crouch, 3, 8); R(hi, 7, -44 + crouch, 3, 8);
    R(hi, -10, -46 + crouch, 2, 3); R(hi, 9, -46 + crouch, 2, 3);
    R(tel ? '#ffffff' : '#ff3a5c', 2, -33 + crouch, 4, 2);
    // brazo/espada
    if (this.state === 'orbsTel') { R(plate, 6, -40 + crouch, 4, 14); R('#ff5ab0', 5, -46, 6, 6); }
    else if (this.state === 'charge') { R(plate, 8, -22, 14, 4); R('#e8e0ff', 20, -23, 12, 2); }
    else { R(plate, 9, -26 + crouch, 4, 13); R('#e8e0ff', 11, -14 + crouch, 2, 12); }
    ctx.restore();
  }
}

class Shockwave {
  constructor(x, gy, dir, spd) { this.w = 12; this.h = 14; this.x = x - 6; this.y = gy - this.h; this.vx = dir * 170 * spd; this.t = 0; this.dead = false; }
  update(dt) {
    this.t += dt; this.x += this.vx * dt;
    if (World.rectSolid(this.x, this.y, this.w, this.h - 2) || this.t > 3) this.dead = true;
    if (Math.random() < 0.5) FX.burst(this.x + this.w / 2, this.y + this.h, 1, { colors: ['#ff8aa0', '#ffffff'], speed: 40, angle: -Math.PI / 2, spread: 1, grav: 200 });
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const flick = Math.floor(this.t * 20) % 2;
    ctx.fillStyle = '#ff3a5c'; ctx.fillRect(x + 1, y + 4, this.w - 2, this.h - 4);
    ctx.fillStyle = flick ? '#ffffff' : '#ffb0c0'; ctx.fillRect(x + 3, y, this.w - 6, this.h);
  }
}

class Orb {
  constructor(x, y, vx, vy) { this.w = 8; this.h = 8; this.x = x - 4; this.y = y - 4; this.vx = vx; this.vy = vy; this.t = 0; this.dead = false; }
  update(dt) {
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (World.rectSolid(this.x + 2, this.y + 2, 4, 4) || this.t > 5) {
      this.dead = true; FX.burst(this.x + 4, this.y + 4, 6, { colors: ['#ff5ab0', '#ffffff'], speed: 80, grav: 0 });
    }
  }
  draw(ctx) {
    const x = Math.round(this.x + 4), y = Math.round(this.y + 4);
    ctx.fillStyle = 'rgba(255,90,176,0.35)'; ctx.beginPath(); ctx.arc(x, y, 6 + Math.sin(this.t * 30), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5ab0'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}
