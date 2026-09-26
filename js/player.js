'use strict';
// ---------- Jugador: Kaen, el espadachín carmesí ----------
const P = {
  RUN: 108, DASH: 255, DASH_T: 0.32, AIRDASH_T: 0.24, DASH_CD: 0.08,
  GRAV: 1050, JUMP_V: 392, FALL_MAX: 390, JUMP_CUT: 0.42,
  WALL_SLIDE: 72, WJ_VY: 360, WJ_VX: 150, WJ_LOCK: 0.12,
  COYOTE: 0.1, BUFFER: 0.13, POGO_V: 345,
  HEAL_T: 0.9, HEAL_COST: 33, SOUL_HIT: 11,
};

const ATTACKS = {
  g1: { dur: 0.23, h0: 0.02, h1: 0.12, dmg: 1, box: [2, -15, 30, 24], arc: [-1.9, 0.9], r: 23, th: 8, next: 'g2' },
  g2: { dur: 0.23, h0: 0.02, h1: 0.12, dmg: 1, box: [2, -15, 30, 24], arc: [1.0, -1.7], r: 23, th: 8, next: 'g3' },
  g3: { dur: 0.36, h0: 0.04, h1: 0.16, dmg: 2, box: [0, -20, 38, 32], arc: [-2.5, 1.3], r: 29, th: 11, next: null, lunge: 90 },
  air: { dur: 0.26, h0: 0.02, h1: 0.14, dmg: 1, box: [0, -16, 32, 28], arc: [-2.6, 1.5], r: 24, th: 8 },
  down: { dur: 0.26, h0: 0.0, h1: 0.16, dmg: 1, box: [-14, 0, 28, 30], arc: [-0.3, Math.PI + 0.3], r: 20, th: 8, oy: 10, ox: 0 },
  up: { dur: 0.26, h0: 0.02, h1: 0.14, dmg: 1, box: [-13, -40, 26, 28], arc: [Math.PI - 0.3, Math.PI * 2 + 0.3], r: 21, th: 8, oy: -10, ox: 0 },
};

class Player {
  constructor() {
    this.w = 10; this.h = 22;
    this.maxHp = 5; this.hp = 5; this.soul = 0;
    this.hair = [];
    this.reset(0, 0);
  }
  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.facing = 1; this.onGround = false;
    this.coyote = 0; this.jumpBuf = 0; this.atkBuf = 0;
    this.dashT = 0; this.dashCd = 0; this.groundDash = false; this.airDashUsed = false; this.dashMomentum = false;
    this.wjLock = 0; this.canCut = false; this.wallDir = 0; this.sliding = false;
    this.atk = null; this.atkCd = 0; this.recoilT = 0; this.recoilV = 0;
    this.hurtT = 0; this.invulnT = 0; this.healT = 0; this.healing = false;
    this.sitting = false; this.spikeT = 0; this.dropT = 0;
    this.safe = { x, y }; this.animT = 0; this.trail = []; this.trailTick = 0;
    this.hair = [];
    for (let i = 0; i < 7; i++) this.hair.push({ x: x + 5, y: y + 4, px: x + 5, py: y + 4 });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt(dmg, srcX, game) {
    if (this.invulnT > 0 || this.hp <= 0) return false;
    this.hp -= dmg;
    this.hurtT = 0.28; this.invulnT = 1.3;
    const dir = Math.sign(this.cx - srcX) || -this.facing;
    this.vx = dir * 160; this.vy = -230;
    this.atk = null; this.dashT = 0; this.healT = 0; this.healing = false; this.dashMomentum = false; this.sitting = false;
    FX.stop(9); FX.shake(5, 0.3);
    FX.burst(this.cx, this.cy, 16, { colors: ['#ff3355', '#ffffff', '#ff8899'], speed: 160, life: 0.45 });
    FX.ring(this.cx, this.cy, '#ff4466', 26);
    if (this.hp <= 0) game.playerDied();
    return true;
  }

  pogo() {
    this.vy = -P.POGO_V; this.airDashUsed = false; this.dashMomentum = false; this.canCut = false;
    this.dashT = 0;
  }

  update(dt, game) {
    const I = Input;
    this.animT += dt;
    // Pinchos: congelado y reaparece en el último suelo seguro
    if (this.spikeT > 0) {
      this.spikeT -= dt;
      if (this.spikeT <= 0) {
        this.x = this.safe.x; this.y = this.safe.y; this.vx = this.vy = 0;
        this.resetHair(); FX.ring(this.cx, this.cy, '#bff6ff', 20);
      }
      return;
    }
    if (this.sitting) {
      this.vx = 0; this.vy = 0;
      if (I.pressed('left') || I.pressed('right') || I.pressed('jump') || I.pressed('down') || I.pressed('attack') || I.pressed('dash')) this.sitting = false;
      this.updateHair(dt);
      return;
    }
    const dir = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    const timers = ['coyote', 'jumpBuf', 'atkBuf', 'dashCd', 'wjLock', 'atkCd', 'recoilT', 'hurtT', 'invulnT', 'dropT'];
    for (const t of timers) if (this[t] > 0) this[t] -= dt;

    if (I.pressed('jump')) this.jumpBuf = P.BUFFER;
    if (I.pressed('attack')) this.atkBuf = 0.15;

    const stunned = this.hurtT > 0;

    // Contacto con pared
    this.wallDir = 0;
    if (!this.onGround) {
      if (World.rectSolid(this.x + this.w, this.y + 5, 2, this.h - 10)) this.wallDir = 1;
      else if (World.rectSolid(this.x - 2, this.y + 5, 2, this.h - 10)) this.wallDir = -1;
    }

    // --- Curación (mantener) ---
    const canHeal = !stunned && this.onGround && this.soul >= P.HEAL_COST && this.hp < this.maxHp && !this.atk && this.dashT <= 0;
    if (I.down('heal') && canHeal) {
      this.healing = true; this.vx = 0;
      this.healT += dt;
      if (Math.random() < 0.6) FX.burst(this.cx + (Math.random() - 0.5) * 20, this.y + this.h, 1, { angle: -Math.PI / 2, spread: 0.3, speed: 60, colors: ['#bff6ff', '#ffffff', '#6fe0ff'], grav: -40, life: 0.6 });
      if (this.healT >= P.HEAL_T) {
        this.healT = 0; this.hp++; this.soul -= P.HEAL_COST;
        FX.ring(this.cx, this.cy, '#bff6ff', 30); FX.burst(this.cx, this.cy, 20, { colors: ['#ffffff', '#bff6ff'], speed: 120, grav: 0 });
        game.flashHud = 0.4;
      }
    } else { this.healing = false; this.healT = 0; }

    if (!this.healing && !stunned) {
      // --- Dash ---
      if (I.pressed('dash') && this.dashCd <= 0 && this.dashT <= 0 && !(this.atk && this.onGround)) {
        if (this.onGround) { this.dashT = P.DASH_T; this.groundDash = true; }
        else if (!this.airDashUsed) { this.dashT = P.AIRDASH_T; this.groundDash = false; this.airDashUsed = true; }
        if (this.dashT > 0) {
          if (dir) this.facing = dir;
          if (this.sliding) this.facing = -this.wallDir || this.facing;
          this.dashMomentum = false; this.atk = this.onGround ? null : this.atk;
          FX.dust(this.cx - this.facing * 6, this.y + this.h, this.facing > 0 ? Math.PI : 0);
        }
      }
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vx = this.facing * P.DASH;
        if (!this.groundDash) this.vy = 0;
        if (this.groundDash && !I.down('dash') && this.dashT < P.DASH_T - 0.08) this.dashT = 0; // dash sostenido
        if (this.groundDash && !this.onGround) { this.dashMomentum = true; this.dashT = 0; } // salir de un borde
        if (dir === -this.facing && this.groundDash) this.dashT = 0;
        if (this.dashT <= 0) { this.dashCd = P.DASH_CD; if (!this.groundDash && !this.dashMomentum) this.vx = dir * P.RUN; }
      } else if (this.wjLock <= 0 && this.recoilT <= 0) {
        const groundCombo = this.atk && this.atk.ground;
        let sp = this.dashMomentum ? P.DASH : P.RUN;
        if (groundCombo) this.vx = this.atk.lungeV || 0;
        else this.vx = dir * sp;
        if (dir && !groundCombo) this.facing = dir;
      }
      if (this.recoilT > 0) this.vx = this.recoilV;

      // --- Saltos ---
      if (this.jumpBuf > 0) {
        const onPlat = this.onGround && I.down('down') && this.standingOnPlatform();
        if (onPlat) { this.dropT = 0.2; this.jumpBuf = 0; this.onGround = false; this.y += 1; }
        else if (this.onGround || this.coyote > 0) {
          if ((this.dashT > 0 && this.groundDash) || I.down('dash')) this.dashMomentum = true;
          this.dashT = 0;
          this.vy = -P.JUMP_V; this.coyote = 0; this.jumpBuf = 0; this.canCut = true;
          if (this.atk && this.atk.ground) this.atk = null;
          FX.dust(this.cx, this.y + this.h);
        } else if (this.wallDir !== 0) {
          this.vy = -P.WJ_VY; this.wjLock = P.WJ_LOCK; this.canCut = true; this.jumpBuf = 0;
          this.dashT = 0; this.airDashUsed = false;
          this.dashMomentum = I.down('dash');
          this.vx = -this.wallDir * (this.dashMomentum ? P.DASH : P.WJ_VX);
          this.facing = -this.wallDir;
          FX.burst(this.wallDir > 0 ? this.x + this.w : this.x, this.cy, 6, { angle: this.wallDir > 0 ? Math.PI : 0, spread: 1.2, speed: 70, colors: ['#c8c0d8', '#ffffff'], grav: 50 });
        }
      }
      if (I.released('jump') && this.vy < 0 && this.canCut) { this.vy *= P.JUMP_CUT; this.canCut = false; }

      // --- Ataques ---
      this.updateAttack(dt, game, dir);
    } else if (stunned) {
      this.vx *= Math.pow(0.02, dt);
    }

    // --- Gravedad y deslizamiento por pared ---
    const airDashing = this.dashT > 0 && !this.groundDash;
    if (!airDashing) {
      let g = P.GRAV;
      if (Math.abs(this.vy) < 50 && I.down('jump') && this.canCut !== false) g *= 0.6; // flotar en el ápice
      this.vy = Math.min(this.vy + g * dt, P.FALL_MAX);
    }
    this.sliding = false;
    if (!stunned && !this.onGround && this.vy > 0 && this.wallDir !== 0 && dir === this.wallDir && this.wjLock <= 0) {
      this.vy = Math.min(this.vy, P.WALL_SLIDE); this.sliding = true; this.dashMomentum = false;
      this.facing = -this.wallDir; this.airDashUsed = false;
      if (Math.random() < 0.3) FX.burst(this.wallDir > 0 ? this.x + this.w : this.x, this.y + 4, 1, { colors: ['#c8c0d8'], speed: 20, grav: -10, life: 0.3 });
    }

    const wasAir = !this.onGround, vyBefore = this.vy;
    moveEntity(this, dt, { dropThrough: this.dropT > 0 });
    if (this.hitWallL || this.hitWallR) { if (!this.onGround) this.dashMomentum = this.dashMomentum && false; }
    if (this.onGround) {
      this.coyote = P.COYOTE; this.airDashUsed = false;
      if (this.dashT <= 0) this.dashMomentum = false;
      if (wasAir && vyBefore > 150) { FX.dust(this.cx - 4, this.y + this.h); FX.dust(this.cx + 4, this.y + this.h); }
      if (this.atk && !this.atk.ground && this.atk.t > this.atk.def.h1) this.atk = null;
      this.recordSafe();
    }

    // Pinchos
    if (World.rectSpike(this.x + 1, this.y + 2, this.w - 2, this.h - 2)) {
      this.invulnT = 0;
      if (this.hurt(1, this.cx - this.facing, game) && this.hp > 0) {
        this.spikeT = 0.45; this.vx = this.vy = 0; this.invulnT = 1.3 + 0.45;
      }
    }

    // Estela de dash (imágenes residuales)
    if (this.dashT > 0 || this.dashMomentum) {
      if (++this.trailTick % 3 === 0) this.trail.push({ x: this.x, y: this.y, f: this.facing, anim: this.anim(), t: 0 });
    }
    for (const t of this.trail) t.t += dt;
    this.trail = this.trail.filter(t => t.t < 0.22);
    this.updateHair(dt);
  }

  standingOnPlatform() {
    const ty = Math.round((this.y + this.h) / TILE);
    const x0 = Math.floor(this.x / TILE), x1 = Math.floor((this.x + this.w - 0.001) / TILE);
    let plat = false;
    for (let tx = x0; tx <= x1; tx++) { const t = World.tileAt(tx, ty); if (t === T_SOLID) return false; if (t === T_PLAT) plat = true; }
    return plat;
  }

  recordSafe() {
    const ty = Math.round((this.y + this.h) / TILE);
    const l = Math.floor((this.x - 10) / TILE), r = Math.floor((this.x + this.w + 10) / TILE);
    for (let tx = l; tx <= r; tx++) {
      if (World.tileAt(tx, ty) === T_SPIKE || World.tileAt(tx, ty - 1) === T_SPIKE) return;
    }
    const a = World.tileAt(Math.floor(this.x / TILE), ty), b = World.tileAt(Math.floor((this.x + this.w - 0.01) / TILE), ty);
    if ((a === T_SOLID || a === T_PLAT) && (b === T_SOLID || b === T_PLAT)) { this.safe.x = this.x; this.safe.y = this.y; }
  }

  startAttack(type) {
    const def = ATTACKS[type];
    this.atk = { type, def, t: 0, hit: new Set(), ground: type[0] === 'g', pogoed: false, lungeV: 0 };
    FX.slash({
      follow: this, ox: def.ox !== undefined ? def.ox : this.facing * 5, oy: def.oy !== undefined ? def.oy : -2,
      a0: this.facing > 0 ? def.arc[0] : Math.PI - def.arc[0],
      a1: this.facing > 0 ? def.arc[1] : Math.PI - def.arc[1],
      r: def.r, thick: def.th, life: def.dur * 0.9,
      color: type === 'g3' ? '#e8fdff' : '#bff6ff', color2: type === 'g3' ? '#5ff0ff' : '#2fd6ff',
    });
    this.atkBuf = 0;
  }

  updateAttack(dt, game, dir) {
    const I = Input;
    if (this.atk) {
      const a = this.atk; a.t += dt;
      if (a.def.lunge) a.lungeV = (a.t < 0.1 && this.onGround) ? this.facing * a.def.lunge : 0;
      if (a.t >= a.def.h0 && a.t <= a.def.h1) this.checkHits(game);
      // encadenar combo
      if (a.ground && a.def.next && this.atkBuf > 0 && a.t >= a.def.dur * 0.42) { this.startAttack(a.def.next); return; }
      if (a.t >= a.def.dur) {
        if (a.type === 'g3') this.atkCd = 0.14;
        this.atk = null;
      }
      if (a.ground && !this.onGround) this.atk = null;
    }
    if (!this.atk && this.atkBuf > 0 && this.atkCd <= 0) {
      if (this.onGround) { if (this.dashT > 0) { this.dashT = 0; } this.startAttack('g1'); }
      else if (I.down('down')) this.startAttack('down');
      else if (I.down('up')) this.startAttack('up');
      else this.startAttack('air');
    }
  }

  hitbox() {
    const d = this.atk.def;
    const [bx, by, bw, bh] = d.box;
    const cx = this.cx, cy = this.y + this.h;  // ancla en los pies (y) y centro (x)
    if (this.atk.type === 'down' || this.atk.type === 'up') return { x: cx + bx, y: (this.atk.type === 'down' ? this.y + this.h : this.y + this.h) + by, w: bw, h: bh };
    const x = this.facing > 0 ? cx + bx : cx - bx - bw;
    return { x, y: cy + by - 6, w: bw, h: bh };
  }

  checkHits(game) {
    const hb = this.hitbox();
    const a = this.atk;
    let hitSomething = false;
    for (const e of game.hittables()) {
      if (e.dead || a.hit.has(e) || !aabb(hb, e)) continue;
      a.hit.add(e);
      e.hurt(a.def.dmg, this, a.type);
      hitSomething = true;
      this.soul = Math.min(99, this.soul + P.SOUL_HIT);
      const hx = (Math.max(hb.x, e.x) + Math.min(hb.x + hb.w, e.x + e.w)) / 2;
      const hy = (Math.max(hb.y, e.y) + Math.min(hb.y + hb.h, e.y + e.h)) / 2;
      FX.burst(hx, hy, 10, { colors: ['#ffffff', '#bff6ff', '#fff3a0'], speed: 190, life: 0.25, grav: 0, size: 2 });
      FX.ring(hx, hy, '#ffffff', 12);
    }
    if (hitSomething) {
      FX.stop(a.type === 'g3' ? 6 : 4); FX.shake(a.type === 'g3' ? 3 : 2, 0.12);
      if (a.type === 'down') { if (!a.pogoed) { a.pogoed = true; this.pogo(); } }
      else if (a.type !== 'up') { this.recoilT = 0.07; this.recoilV = -this.facing * 110; }
    }
    // rebote en pinchos
    if (a.type === 'down' && !a.pogoed && World.rectSpike(hb.x, hb.y, hb.w, hb.h)) {
      a.pogoed = true; this.pogo();
      FX.burst(this.cx, hb.y + hb.h * 0.6, 10, { colors: ['#ffffff', '#fff3a0', '#bff6ff'], speed: 150, life: 0.25, grav: 0 });
      FX.stop(3); FX.shake(2, 0.1);
    }
  }

  // ---------- Pelo (cadena verlet) ----------
  resetHair() { for (const h of this.hair) { h.x = h.px = this.cx; h.y = h.py = this.y + 4; } }
  updateHair(dt) {
    const hx = this.cx - this.facing * 3, hy = this.y + 3 + (this.sitting ? 5 : 0);
    const hs = this.hair;
    hs[0].x = hx; hs[0].y = hy;
    for (let i = 1; i < hs.length; i++) {
      const h = hs[i];
      const vx = (h.x - h.px) * 0.86, vy = (h.y - h.py) * 0.86;
      h.px = h.x; h.py = h.y;
      h.x += vx - this.facing * 12 * dt; h.y += vy + 120 * dt * dt * 60 * 0.05;
    }
    for (let k = 0; k < 3; k++) for (let i = 1; i < hs.length; i++) {
      const a = hs[i - 1], b = hs[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, L = 2.6;
      const f = (d - L) / d; b.x -= dx * f; b.y -= dy * f;
    }
  }

  anim() {
    if (this.sitting) return 'sit';
    if (this.hurtT > 0) return 'hurt';
    if (this.healing) return 'heal';
    if (this.atk) return this.atk.type;
    if (this.dashT > 0) return this.groundDash ? 'dash' : 'airdash';
    if (this.sliding) return 'wall';
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    if (Math.abs(this.vx) > 1) return 'run';
    return 'idle';
  }

  draw(ctx) {
    // estela
    for (const t of this.trail) {
      ctx.globalAlpha = 0.45 * (1 - t.t / 0.22);
      drawKaen(ctx, t.x + this.w / 2, t.y + this.h, t.f, t.anim, this.animT, '#ff3a5c');
    }
    ctx.globalAlpha = 1;
    if (this.spikeT > 0 && this.spikeT < 0.3) return;
    if (this.invulnT > 0 && this.hurtT <= 0 && Math.floor(this.invulnT * 20) % 2 === 0) return;
    // pelo (detrás)
    const hs = this.hair;
    ctx.strokeStyle = '#d9dcef'; ctx.lineCap = 'round';
    for (let i = 1; i < hs.length; i++) {
      ctx.lineWidth = Math.max(1.5, 4.5 - i * 0.5);
      ctx.beginPath(); ctx.moveTo(Math.round(hs[i - 1].x), Math.round(hs[i - 1].y)); ctx.lineTo(Math.round(hs[i].x), Math.round(hs[i].y)); ctx.stroke();
    }
    ctx.strokeStyle = '#9ea3c4'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(hs[1].x), Math.round(hs[1].y + 1));
    for (let i = 2; i < hs.length; i++) ctx.lineTo(Math.round(hs[i].x), Math.round(hs[i].y + 1));
    ctx.stroke();
    const flash = this.hurtT > 0 && Math.floor(this.hurtT * 30) % 2 === 0 ? '#ffffff' : null;
    drawKaen(ctx, this.cx, this.y + this.h, this.facing, this.anim(), this.animT, flash);
    if (this.healing) {
      const k = this.healT / P.HEAL_T;
      ctx.strokeStyle = '#bff6ff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 16, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// Dibujo procedural del personaje (origen: centro de los pies)
function drawKaen(ctx, fx, fy, facing, anim, t, solid) {
  ctx.save();
  ctx.translate(Math.round(fx), Math.round(fy));
  ctx.scale(facing, 1);
  const C = solid ? { red: solid, red2: solid, dark: solid, white: solid, grey: solid, eye: solid, skin: solid, gem: solid }
    : { red: '#d8283f', red2: '#8e1428', dark: '#241c30', white: '#eef0fa', grey: '#9aa0bc', eye: '#5ff0ff', skin: '#f2c9a8', gem: '#37e0ff' };
  const R = (c, x, y, w, h) => { ctx.fillStyle = C[c]; ctx.fillRect(x, y, w, h); };
  let bob = 0, lean = 0, legA = 0, legB = 0, crouch = 0, armUp = false;
  switch (anim) {
    case 'run': { const s = Math.sin(t * 16); legA = Math.round(s * 3); legB = -legA; bob = Math.abs(s) > 0.7 ? -1 : 0; lean = 1; break; }
    case 'dash': lean = 3; crouch = 2; legA = 4; legB = -4; break;
    case 'airdash': lean = 3; legA = 3; legB = -3; break;
    case 'jump': legA = 2; legB = -1; crouch = 1; break;
    case 'fall': legA = -1; legB = 2; break;
    case 'wall': legA = 1; legB = -2; break;
    case 'hurt': lean = -2; legA = -2; legB = 2; break;
    case 'heal': crouch = 3; break;
    case 'sit': crouch = 6; break;
    case 'g1': case 'g2': case 'g3': lean = 2; legA = 3; legB = -3; crouch = 1; break;
    case 'up': armUp = true; break;
    default: bob = Math.sin(t * 3) > 0.6 ? -1 : 0;
  }
  const by = bob + crouch; // desplazamiento del torso
  // piernas
  if (anim === 'sit') {
    R('red2', -5, -7, 9, 3); R('red', 3, -7, 3, 7); R('white', 3, -2, 4, 2);
  } else {
    R('red2', -4 + legB, -9 + Math.max(0, crouch - 1), 3, 9 - Math.max(0, crouch - 1));
    R('red2', -5 + legB, -4, 4, 4);
    R('dark', 0 + legA, -9 + Math.max(0, crouch - 1), 3, 6);
    R('red', 0 + legA, -5, 4, 5); R('white', 0 + legA, -5, 4, 1);
  }
  // torso
  const tx = lean;
  R('dark', -4 + tx, -17 + by, 8, 8);
  R('red', -4 + tx, -17 + by, 8, 5);
  R('red2', -4 + tx, -13 + by, 8, 1);
  R('gem', -1 + tx, -16 + by, 2, 2);
  R('grey', -3 + tx, -11 + by, 6, 1);
  // hombrera trasera
  R('white', -6 + tx, -18 + by, 4, 3); R('grey', -6 + tx, -16 + by, 4, 1);
  // cabeza
  const hx = tx + (lean > 1 ? 1 : 0);
  R('red', -4 + hx, -25 + by, 8, 7);
  R('skin', 0 + hx, -22 + by, 4, 4);
  R('eye', 2 + hx, -21 + by, 1, 2);
  R('white', -4 + hx, -26 + by, 6, 2);   // cresta
  R('red2', -4 + hx, -19 + by, 3, 1);
  R('gem', 1 + hx, -24 + by, 2, 1);
  // brazo delantero y empuñadura
  if (armUp) { R('red', 1 + tx, -22 + by, 3, 6); R('grey', 1 + tx, -25 + by, 2, 3); }
  else if (anim === 'wall') { R('red', -6 + tx, -17 + by, 3, 5); }
  else if (anim.startsWith('g') || anim === 'air' || anim === 'down') { R('red', 2 + tx, -16 + by, 5, 3); R('grey', 6 + tx, -17 + by, 2, 4); }
  else { R('red', 1 + tx, -16 + by, 3, 6); R('white', 1 + tx, -11 + by, 3, 2); }
  // hombrera delantera
  R('white', 0 + tx, -18 + by, 4, 3);
  ctx.restore();
}
