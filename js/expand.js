'use strict';
// ---------- Expansión: enemigos, minibosses y jefes (N4–N7) ----------

// Enemigo: Engranaje (Forja) — rueda que rueda y se lanza
class Gear extends Enemy {
  constructor(x, y) {
    super(x - 8, y - 16, 16, 16, 3);
    this.facing = -1; this.speed = 55; this.jumpT = 1.2 + Math.random();
    this.deathColors = ['#ffb020', '#ffffff', '#6a4a2a']; this.spin = 0;
  }
  update(dt, game) {
    this.t += dt; this.spin += dt * 10; if (this.flashT > 0) this.flashT -= dt;
    if (this.knockT > 0) { this.knockT -= dt; this.vx *= 0.9; }
    else {
      this.vx = this.facing * this.speed;
      if (World.rectSolid(this.x + (this.facing > 0 ? this.w : -2), this.y + 4, 2, this.h - 8) ||
          !World.rectSolid(this.x + (this.facing > 0 ? this.w + 2 : -4), this.y + this.h, 4, 2)) this.facing *= -1;
      if ((this.jumpT -= dt) <= 0 && Math.abs(game.player.cx - this.cx) < 80) { this.vy = -280; this.jumpT = 2.2; }
    }
    this.vy = Math.min(this.vy + 1050 * dt, 400);
    moveEntity(this, dt);
  }
  draw(ctx) {
    const x = Math.round(this.x + 8), y = Math.round(this.y + 8), f = this.flashT > 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.spin * this.facing);
    ctx.fillStyle = f ? '#ffffff' : '#3a2a18'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f ? '#ffffff' : '#c08030'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1010'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(Math.cos(a) * 5 - 1, Math.sin(a) * 5 - 1, 3, 3); }
    ctx.fillStyle = '#ffd28a'; ctx.fillRect(-2, -2, 4, 4); ctx.restore();
  }
}

// Enemigo: Centella (Tormenta) — teletransporte corto + chispa
class Spark extends Enemy {
  constructor(x, y) {
    super(x - 6, y - 14, 12, 14, 2);
    this.cd = 0.8 + Math.random(); this.deathColors = ['#7ad8ff', '#ffffff', '#4050a0'];
  }
  update(dt, game) {
    this.t += dt; if (this.flashT > 0) this.flashT -= dt;
    this.facing = Math.sign(game.player.cx - this.cx) || 1;
    this.vy = Math.min(this.vy + 900 * dt, 360); moveEntity(this, dt);
    if ((this.cd -= dt) <= 0 && Math.hypot(game.player.cx - this.cx, game.player.cy - this.cy) < 160) {
      this.cd = 2.0;
      const tx = this.x + this.facing * 48;
      if (!World.rectSolid(tx, this.y, this.w, this.h)) {
        FX.burst(this.cx, this.cy, 8, { colors: this.deathColors, speed: 100, grav: 0 });
        this.x = tx; sfx('dash');
        game.hazards.push(new Seed(this.cx, this.cy, this.facing * 160, -40));
      }
    }
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y), f = this.flashT > 0;
    ctx.fillStyle = f ? '#ffffff' : '#16203a'; ctx.fillRect(x, y + 2, 12, 12);
    ctx.fillStyle = f ? '#ffffff' : '#7ad8ff'; ctx.fillRect(x + 1, y + 3, 10, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + (this.facing > 0 ? 7 : 2), y + 5, 2, 2);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 4, y, 4, 3);
  }
}

// Enemigo: Brote (Jardín) — planta que escupe semillas en arco
class Sprout extends Enemy {
  constructor(x, y) {
    super(x - 7, y - 18, 14, 18, 3);
    this.cd = 1.5 + Math.random(); this.deathColors = ['#6fe080', '#ffffff', '#2a5a30'];
  }
  knockback() {}
  update(dt, game) {
    this.t += dt; if (this.flashT > 0) this.flashT -= dt;
    this.facing = Math.sign(game.player.cx - this.cx) || 1;
    if ((this.cd -= dt) <= 0 && Math.abs(game.player.cx - this.cx) < 200) {
      this.cd = 2.4;
      game.hazards.push(new Seed(this.cx, this.y + 4, this.facing * 90, -220));
      sfx('shoot');
    }
  }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y), f = this.flashT > 0;
    ctx.fillStyle = f ? '#ffffff' : '#1a3a20'; ctx.fillRect(x + 4, y + 8, 6, 10);
    ctx.fillStyle = f ? '#ffffff' : '#4ec860'; ctx.fillRect(x + 1, y + 2, 12, 8);
    ctx.fillStyle = '#b8ff90'; ctx.fillRect(x + 3, y, 8, 4);
    ctx.fillStyle = '#ff6a8a'; ctx.fillRect(x + 5, y + 4, 4, 3);
  }
}

// ---------- Miniboss genérico ----------
class MiniBoss extends Enemy {
  constructor(x, y, room, opts) {
    super(x - 10, y - 28, 20, 28, opts.hp || 22);
    this.room = room; this.key = opts.key; this.name = opts.name;
    this.state = 'dormant'; this.st = 0; this.facing = -1; this.phase2 = false;
    this.deathColors = opts.colors || ['#ff3a5c', '#ffffff']; this.contact = 1;
    this.col = opts.col || '#ff3a5c'; this.col2 = opts.col2 || '#ffd28a';
  }
  get floorY() { return this.room.py + (this.room.floorRow || 15) * TILE; }
  get arenaL() { return this.room.px + 2 * TILE; }
  get arenaR() { return this.room.px + (this.room.w - 2) * TILE; }
  hurt(dmg, player, type) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    this.hp -= dmg; this.flashT = 0.1; sfx('hit');
    if (!this.phase2 && this.hp <= this.maxHp / 2) { this.phase2 = true; this.set('roar'); FX.shake(5, 0.4); }
    if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
  }
  set(s) { this.state = s; this.st = 0; this.fired = 0; if (s.endsWith('Tel')) sfx('tel'); else if (s === 'roar') sfx('roar'); }
  update(dt, game) {
    const p = game.player; this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    const spd = this.phase2 ? 1.35 : 1; let grav = true;
    switch (this.state) {
      case 'dormant':
        if (p.x > this.room.px + 4 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); }
        break;
      case 'intro':
        this.vx = 0; if (this.st > 1.2) this.set('idle'); break;
      case 'roar':
        this.vx = 0; if (this.st > 0.9) this.set('idle'); break;
      case 'idle': {
        this.facing = Math.sign(p.cx - this.cx) || this.facing; this.vx = 0;
        if (this.st > 0.55 / spd) {
          const r = Math.random();
          if (r < 0.4) this.set('chargeTel');
          else if (r < 0.75) this.set('shotTel');
          else this.set('leapTel');
        }
        break;
      }
      case 'chargeTel':
        this.vx = 0; if (this.st > 0.45 / spd) { this.set('charge'); this.vx = this.facing * 220 * spd; }
        break;
      case 'charge':
        if (World.rectSolid(this.x + (this.vx > 0 ? this.w : -2), this.y + 4, 2, this.h - 8) || this.st > 0.7) this.set('idle');
        break;
      case 'leapTel':
        this.vx = 0; if (this.st > 0.35 / spd) { this.vy = -360; this.vx = this.facing * 140; this.set('leap'); }
        break;
      case 'leap':
        if (this.onGround && this.st > 0.1) { FX.shake(4, 0.2); this.set('idle'); }
        break;
      case 'shotTel':
        this.vx = 0; if (this.st > 0.4 / spd) {
          const n = this.phase2 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx) + (i - (n - 1) / 2) * 0.25;
            game.hazards.push(new Orb(this.cx, this.cy, Math.cos(a) * 150, Math.sin(a) * 150));
          }
          sfx('shoot'); this.set('idle');
        }
        break;
      case 'dying':
        this.vx = 0;
        if (Math.random() < 0.45) FX.burst(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 10, { colors: this.deathColors, speed: 140, grav: 0 });
        if (this.st > 1.5 && !this.dead) {
          this.dead = true;
          FX.burst(this.cx, this.cy, 50, { colors: this.deathColors, speed: 240, life: 0.8 });
          FX.ring(this.cx, this.cy, '#ffffff', 40); FX.shake(8, 0.4);
          const MAIN = { forjador: 1, tempestad: 1, raiz: 1, ecos: 1 };
          if (MAIN[this.key]) Game.victory(this);
          else Game.toast((this.name || 'Enemigo') + ' derrotado', 2.5);
        }
        break;
    }
    if (grav) this.vy = Math.min(this.vy + 1100 * dt, 480);
    moveEntity(this, dt);
  }
  draw(ctx) {
    if (this.state === 'dormant') return;
    const x = Math.round(this.x), y = Math.round(this.y), f = this.flashT > 0;
    const tel = this.state.endsWith('Tel') && Math.floor(this.st * 14) % 2 === 0;
    ctx.save(); ctx.translate(x + this.w / 2, y + this.h); ctx.scale(this.facing, 1);
    const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(a, b, w, h); };
    R(f ? '#ffffff' : '#0a0610', -11, -28, 22, 28);
    R(f || tel ? '#ffffff' : this.col, -9, -26, 18, 24);
    R(f ? '#ffffff' : this.col2, -7, -24, 14, 6);
    R('#1c1018', 2, -18, 4, 4); R('#ffffff', 3, -17, 1, 1);
    R(f ? '#ffffff' : this.col2, -12, -14, 5, 10); R(f ? '#ffffff' : this.col2, 7, -14, 5, 10);
    ctx.restore();
  }
}

function makeMini(key, name, colors, col, col2, hp) {
  return function (x, y, room) { return new MiniBoss(x, y, room, { key, name, colors, col, col2, hp }); };
}
const UmbraBoss = makeMini('umbra', 'UMBRA DEL FOSO', ['#6a4a8a', '#ffffff', '#ff3a5c'], '#4a2a6a', '#c8a0ff', 24);
const AureolaBoss = makeMini('aureola', 'AUREOLA ALADA', ['#ffb020', '#ffffff', '#fff4c0'], '#e09020', '#ffe08a', 26);
const CentinelaBoss = makeMini('centinela', 'CENTINELA DE CUARZO', ['#7ad8ff', '#ffffff', '#ff5ad0'], '#3ad0e0', '#e0ffff', 28);
const CapatazBoss = makeMini('capataz', 'CAPATAZ DE BRONCE', ['#ffb020', '#ffffff', '#8a5a20'], '#b07020', '#ffd28a', 30);
const NubeBoss = makeMini('nube', 'NUBE VIVIENTE', ['#7ad8ff', '#ffffff', '#4050a0'], '#5080c0', '#d0e8ff', 30);
const EspinaBoss = makeMini('espina', 'ESPINA MAYOR', ['#6fe080', '#ffffff', '#ff6a8a'], '#2a8a40', '#b0ff90', 32);

// ---------- Jefes principales N4–N6 (patrones distintos, sin rincones seguros) ----------
class Forjador extends MiniBoss {
  constructor(x, y, room) {
    super(x, y, room, { key: 'forjador', name: 'FORJADOR DE ENGRANAJES', colors: ['#ffb020', '#ff3a5c', '#ffffff'], col: '#8a4010', col2: '#ffb020', hp: 52 });
  }
  update(dt, game) {
    if (this.state === 'idle' && this.phase2 && this.st > 0.25 && this.st < 0.35 && !this._pillars) {
      this._pillars = true;
      for (let i = 0; i < 3; i++) game.hazards.push(new SunPillar(this.arenaL + 40 + i * 70, this.room.py + TILE, this.floorY, 0.7 + i * 0.15));
    }
    if (this.state !== 'idle') this._pillars = false;
    MiniBoss.prototype.update.call(this, dt, game);
  }
}

class Tempestad extends MiniBoss {
  constructor(x, y, room) {
    super(x, y, room, { key: 'tempestad', name: 'TEMPESTAD ALADA', colors: ['#7ad8ff', '#ffffff', '#4050ff'], col: '#2040a0', col2: '#7ad8ff', hp: 56 });
    this.hoverY = 0;
  }
  update(dt, game) {
    const p = game.player; this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
    if (this.state === 'dormant') {
      if (p.x > this.room.px + 4 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); this.hoverY = this.floorY - this.h - 50; }
      return;
    }
    if (this.state === 'intro') {
      this.y += (this.hoverY - this.y) * Math.min(1, dt * 4); this.vy = 0;
      if (this.st > 1.5) this.set('idle'); return;
    }
    if (this.state === 'idle') {
      this.facing = Math.sign(p.cx - this.cx) || this.facing;
      this.x += Math.sin(this.t * 2) * 40 * dt; this.y += (this.hoverY - this.y) * Math.min(1, dt * 3); this.vy = 0;
      if (this.st > 0.7) { const r = Math.random(); this.set(r < 0.5 ? 'shotTel' : 'diveTel'); }
      return;
    }
    if (this.state === 'diveTel') { this.vy = 0; if (this.st > 0.4) { this.vy = 420; this.set('dive'); } return; }
    if (this.state === 'dive') {
      moveEntity(this, dt);
      if (this.y + this.h >= this.floorY) { this.y = this.floorY - this.h; this.vy = -300; FX.shake(6, 0.25); this.set('idle'); this.hoverY = this.floorY - this.h - 50; }
      return;
    }
    MiniBoss.prototype.update.call(this, dt, game);
  }
}

class RaizViva extends MiniBoss {
  constructor(x, y, room) {
    super(x, y, room, { key: 'raiz', name: 'RAÍZ PRIMIGENIA', colors: ['#6fe080', '#ffffff', '#ffd28a'], col: '#1a5a28', col2: '#6fe080', hp: 60 });
  }
  update(dt, game) {
    if (this.state === 'idle' && this.phase2 && this.st > 0.25 && this.st < 0.35 && !this._wave) {
      this._wave = true;
      for (const dir of [-1, 1]) game.hazards.push(new Shockwave(this.cx, this.floorY, dir, 1.1));
    }
    if (this.state !== 'idle') this._wave = false;
    MiniBoss.prototype.update.call(this, dt, game);
  }
}

// ---------- Jefe final ----------
class EcosFinal extends MiniBoss {
  constructor(x, y, room) {
    super(x, y, room, { key: 'ecos', name: 'ECOS DEL ABISMO', colors: ['#ff3a5c', '#7ad8ff', '#ffb020', '#ffffff'], col: '#5a1028', col2: '#ff3a5c', hp: 80 });
    this.form = 0;
  }
  hurt(dmg, player, type) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    this.hp -= dmg; this.flashT = 0.1; sfx('hit');
    if (this.hp <= this.maxHp * 0.66 && this.form < 1) { this.form = 1; this.phase2 = true; this.set('roar'); this.col = '#2040a0'; this.col2 = '#7ad8ff'; FX.shake(7, 0.5); }
    if (this.hp <= this.maxHp * 0.33 && this.form < 2) { this.form = 2; this.set('roar'); this.col = '#1a5a28'; this.col2 = '#ffb020'; FX.shake(7, 0.5); }
    if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
  }
  update(dt, game) {
    if (this.state === 'idle' && this.st > 0.25 && this.st < 0.35 && !this._burst) {
      this._burst = true;
      if (this.form === 0) {
        for (let i = 0; i < 2; i++) game.hazards.push(new Orb(this.cx, this.cy, (i ? 1 : -1) * 130, -40));
      } else if (this.form === 1) {
        for (let i = 0; i < 3; i++) game.hazards.push(new SunPillar(this.arenaL + 50 + i * 80, this.room.py + TILE, this.floorY, 0.6 + i * 0.2));
      } else {
        for (const dir of [-1, 1]) game.hazards.push(new Shockwave(this.cx, this.floorY, dir, 1.2));
        game.hazards.push(new Orb(this.cx, this.cy, this.facing * 160, -80));
      }
    }
    if (this.state !== 'idle') this._burst = false;
    MiniBoss.prototype.update.call(this, dt, game);
  }
}

const BOSS_FACTORY = {
  guardian: (x, y, room) => new Boss(x, y, room),
  heraldo: (x, y, room) => new Herald(x, y, room),
  oraculo: (x, y, room) => new Oracle(x, y, room),
  umbra: (x, y, room) => new UmbraBoss(x, y, room),
  aureola: (x, y, room) => new AureolaBoss(x, y, room),
  centinela: (x, y, room) => new CentinelaBoss(x, y, room),
  forjador: (x, y, room) => new Forjador(x, y, room),
  tempestad: (x, y, room) => new Tempestad(x, y, room),
  raiz: (x, y, room) => new RaizViva(x, y, room),
  ecos: (x, y, room) => new EcosFinal(x, y, room),
  capataz: (x, y, room) => new CapatazBoss(x, y, room),
  nube: (x, y, room) => new NubeBoss(x, y, room),
  espina: (x, y, room) => new EspinaBoss(x, y, room),
};

// ---- EXTRA_ROOMS (N4–N7) ----
const EXTRA_ROOMS = [
  { id: 'forjaAtrio', name: 'Atrio de la Forja', ox: 876, oy: -51, w: 30, h: 17, level: 4, theme: 'forge',
    build(b) {
      b.rect(0, 0, 30, 2); b.rect(0, 2, 1, 6); b.rect(29, 2, 1, 6);
      b.rect(0, 12, 30, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 6, 12);
      b.obj('sign', 12, 12, { text: 'Forja de Engranajes: el metal aún arde' });
      b.obj('gear', 22, 12);
    } },
  { id: 'forjaRuedas', name: 'Sala de Ruedas', ox: 906, oy: -51, w: 36, h: 17, level: 4, theme: 'forge',
    build(b) {
      b.rect(0, 0, 36, 2); b.rect(0, 2, 1, 6); b.rect(35, 2, 1, 6);
      b.rect(0, 12, 36, 5); b.spikes(10, 12, 4); b.spikes(22, 12, 4);
      b.plat(12, 9, 3); b.plat(20, 8, 4); b.plat(28, 9, 3);
      b.obj('gear', 14, 9); b.obj('walker', 24, 8); b.obj('gear', 30, 12);
    } },
  { id: 'forjaPozo', name: 'Pozo de Escoria', ox: 942, oy: -68, w: 24, h: 34, level: 4, theme: 'forge',
    build(b) {
      b.rect(0, 0, 24, 1); b.rect(0, 1, 1, 20); b.rect(23, 1, 1, 3); b.rect(23, 8, 1, 26);
      b.rect(0, 29, 24, 5); b.spikes(4, 29, 14);
      b.plat(4, 22, 3); b.plat(10, 16, 3); b.plat(16, 10, 4); b.rect(1, 8, 4, 1);
      b.clear(12, 0, 3, 1);
      b.obj('gear', 12, 16); b.obj('flyer', 8, 12);
      b.obj('sign', 3, 29, { text: '↑ Escala con paciencia' });
    } },
  { id: 'forjaSecreto', name: 'Cofre de Bronce', ox: 948, oy: -76, w: 14, h: 8, level: 4, theme: 'forge', secret: true,
    build(b) {
      b.rect(0, 0, 14, 1); b.rect(0, 0, 1, 8); b.rect(13, 0, 1, 8);
      b.obj('shard10', 7, 8);
    } },
  { id: 'arenaCapataz', name: 'Arena del Capataz', ox: 966, oy: -51, w: 32, h: 17, level: 4, theme: 'forge', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 1, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'capataz');
      b.obj('boss', 16, 12, { boss: 'capataz' });
      b.obj('bench', 5, 12);
    } },
  { id: 'forjaPuente', name: 'Puente de Magma', ox: 998, oy: -51, w: 40, h: 17, level: 4, theme: 'forge',
    build(b) {
      b.rect(0, 0, 40, 1); b.rect(0, 1, 1, 2); b.rect(39, 1, 1, 2);
      b.rect(0, 12, 6, 5); b.rect(34, 12, 6, 5);
      b.spikes(6, 15, 28); b.rect(6, 16, 28, 1);
      b.plat(10, 10, 3); b.plat(18, 9, 4); b.plat(28, 10, 3);
      b.mover(14, 11, 3, 24, 11, 5);
      b.chargeseal(36, 4, 1, 4, 'selloForja'); b.rect(37, 3, 2, 1); b.rect(37, 7, 2, 1); b.obj('vasija2', 37.5, 7);
      b.obj('gear', 20, 9); b.obj('walker', 30, 10);
      b.obj('sign', 2, 12, { text: 'El Forjador aguarda más adelante' });
    } },
  { id: 'forjaAntesala', name: 'Antesala del Yunque', ox: 1038, oy: -51, w: 28, h: 17, level: 4, theme: 'forge',
    build(b) {
      b.rect(0, 0, 28, 1); b.rect(0, 1, 1, 2); b.rect(27, 1, 1, 7);
      b.rect(0, 12, 28, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 14, 12);
      b.obj('sign', 8, 12, { text: 'Descansa. Más allá no hay refugio.' });
      b.obj('gear', 22, 12);
    } },
  { id: 'yunque', name: 'Cámara del Yunque', ox: 1066, oy: -51, w: 32, h: 17, level: 4, theme: 'forge', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 0, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'forjador');
      b.obj('boss', 16, 12, { boss: 'forjador' });
    } },
  { id: 'techoAtrio', name: 'Mirador de la Tormenta', ox: 1098, oy: -51, w: 30, h: 17, level: 5, theme: 'storm',
    build(b) {
      b.rect(0, 0, 30, 2); b.rect(0, 2, 1, 6); b.rect(29, 2, 1, 6);
      b.rect(0, 12, 30, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 6, 12);
      b.obj('sign', 12, 12, { text: 'Techos de la Tormenta: el cielo se abre' });
      b.obj('spark', 22, 12);
    } },
  { id: 'techoAntenas', name: 'Bosque de Antenas', ox: 1128, oy: -51, w: 36, h: 17, level: 5, theme: 'storm',
    build(b) {
      b.rect(0, 0, 36, 2); b.rect(0, 2, 1, 6); b.rect(35, 2, 1, 6);
      b.rect(0, 12, 36, 5); b.spikes(8, 12, 5); b.spikes(20, 12, 5);
      b.plat(10, 9, 3); b.plat(18, 8, 4); b.plat(28, 9, 3);
      b.wind(14, 4, 4, 8);
      b.obj('spark', 12, 9); b.obj('flyer', 22, 5); b.obj('spark', 30, 12);
    } },
  { id: 'techoPozo', name: 'Pozo de Nubes', ox: 1164, oy: -68, w: 24, h: 34, level: 5, theme: 'storm',
    build(b) {
      b.rect(0, 0, 24, 1); b.rect(0, 1, 1, 20); b.rect(23, 1, 1, 3); b.rect(23, 8, 1, 26);
      b.rect(0, 29, 24, 5); b.spikes(4, 29, 14);
      b.plat(4, 22, 3); b.plat(10, 16, 3); b.plat(16, 10, 4); b.rect(1, 8, 4, 1);
      b.clear(12, 0, 3, 1);
      b.obj('spark', 12, 16); b.obj('flyer', 8, 12);
    } },
  { id: 'techoSecreto', name: 'Nido Eléctrico', ox: 1170, oy: -76, w: 14, h: 8, level: 5, theme: 'storm', secret: true,
    build(b) {
      b.rect(0, 0, 14, 1); b.rect(0, 0, 1, 8); b.rect(13, 0, 1, 8);
      b.obj('orbe3', 7, 8);
    } },
  { id: 'arenaNube', name: 'Arena de la Nube', ox: 1188, oy: -51, w: 32, h: 17, level: 5, theme: 'storm', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 1, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'nube');
      b.obj('boss', 16, 12, { boss: 'nube' });
      b.obj('bench', 5, 12);
    } },
  { id: 'techoPuente', name: 'Puente Relámpago', ox: 1220, oy: -51, w: 40, h: 17, level: 5, theme: 'storm',
    build(b) {
      b.rect(0, 0, 40, 1); b.rect(0, 1, 1, 2); b.rect(39, 1, 1, 2);
      b.rect(0, 12, 6, 5); b.rect(34, 12, 6, 5);
      b.spikes(6, 15, 28); b.rect(6, 16, 28, 1);
      b.plat(10, 10, 3); b.plat(18, 9, 4); b.plat(28, 10, 3);
      b.mover(14, 11, 3, 24, 11, 5);
      b.chargeseal(36, 4, 1, 4, 'selloTormenta'); b.rect(37, 3, 2, 1); b.rect(37, 7, 2, 1); b.obj('shard11', 37.5, 7);
      b.obj('spark', 20, 9); b.obj('turret', 30, 10);
      b.obj('sign', 2, 12, { text: 'La Tempestad aguarda en el ojo' });
    } },
  { id: 'techoAntesala', name: 'Antesala del Vendaval', ox: 1260, oy: -51, w: 28, h: 17, level: 5, theme: 'storm',
    build(b) {
      b.rect(0, 0, 28, 1); b.rect(0, 1, 1, 2); b.rect(27, 1, 1, 7);
      b.rect(0, 12, 28, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 14, 12);
      b.obj('sign', 8, 12, { text: 'Descansa. El vendaval no perdona.' });
      b.obj('spark', 22, 12);
    } },
  { id: 'ojoTormenta', name: 'Ojo de la Tormenta', ox: 1288, oy: -51, w: 32, h: 17, level: 5, theme: 'storm', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 0, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'tempestad');
      b.obj('boss', 16, 12, { boss: 'tempestad' });
    } },
  { id: 'jardinAtrio', name: 'Claro Subterráneo', ox: 1320, oy: -51, w: 30, h: 17, level: 6, theme: 'garden',
    build(b) {
      b.rect(0, 0, 30, 2); b.rect(0, 2, 1, 6); b.rect(29, 2, 1, 6);
      b.rect(0, 12, 30, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 6, 12);
      b.obj('sign', 12, 12, { text: 'Jardín de Luz: la raíz recuerda' });
      b.obj('sprout', 22, 12);
    } },
  { id: 'jardinSetos', name: 'Setos de Luz', ox: 1350, oy: -51, w: 36, h: 17, level: 6, theme: 'garden',
    build(b) {
      b.rect(0, 0, 36, 2); b.rect(0, 2, 1, 6); b.rect(35, 2, 1, 6);
      b.rect(0, 12, 36, 5); b.spikes(10, 12, 4); b.spikes(22, 12, 4);
      b.plat(12, 9, 3); b.plat(20, 8, 4); b.plat(28, 9, 3);
      b.obj('sprout', 14, 9); b.obj('walker', 24, 8); b.obj('sprout', 30, 12);
    } },
  { id: 'jardinPozo', name: 'Pozo Verde', ox: 1386, oy: -68, w: 24, h: 34, level: 6, theme: 'garden',
    build(b) {
      b.rect(0, 0, 24, 1); b.rect(0, 1, 1, 20); b.rect(23, 1, 1, 3); b.rect(23, 8, 1, 26);
      b.rect(0, 29, 24, 5); b.spikes(4, 29, 14);
      b.plat(4, 22, 3); b.plat(10, 16, 3); b.plat(16, 10, 4); b.rect(1, 8, 4, 1);
      b.clear(12, 0, 3, 1);
      b.obj('sprout', 12, 16); b.obj('flyer', 8, 12);
    } },
  { id: 'jardinSecreto', name: 'Pétalo Oculto', ox: 1392, oy: -76, w: 14, h: 8, level: 6, theme: 'garden', secret: true,
    build(b) {
      b.rect(0, 0, 14, 1); b.rect(0, 0, 1, 8); b.rect(13, 0, 1, 8);
      b.obj('shard12', 7, 8);
    } },
  { id: 'arenaEspina', name: 'Arena de Espinas', ox: 1410, oy: -51, w: 32, h: 17, level: 6, theme: 'garden', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 1, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'espina');
      b.obj('boss', 16, 12, { boss: 'espina' });
      b.obj('bench', 5, 12);
    } },
  { id: 'jardinPuente', name: 'Puente de Raíces', ox: 1442, oy: -51, w: 40, h: 17, level: 6, theme: 'garden',
    build(b) {
      b.rect(0, 0, 40, 1); b.rect(0, 1, 1, 2); b.rect(39, 1, 1, 2);
      b.rect(0, 12, 6, 5); b.rect(34, 12, 6, 5);
      b.spikes(6, 15, 28); b.rect(6, 16, 28, 1);
      b.plat(10, 10, 3); b.plat(18, 9, 4); b.plat(28, 10, 3);
      b.mover(14, 11, 3, 24, 11, 5);
      b.chargeseal(36, 4, 1, 4, 'selloJardin'); b.rect(37, 3, 2, 1); b.rect(37, 7, 2, 1); b.obj('cristal3', 37.5, 7);
      b.obj('sprout', 20, 9); b.obj('moth', 30, 6);
      b.obj('sign', 2, 12, { text: 'La Raíz Primigenia late al este' });
    } },
  { id: 'jardinAntesala', name: 'Antesala Primigenia', ox: 1482, oy: -51, w: 28, h: 17, level: 6, theme: 'garden',
    build(b) {
      b.rect(0, 0, 28, 1); b.rect(0, 1, 1, 2); b.rect(27, 1, 1, 7);
      b.rect(0, 12, 28, 5); b.clear(0, 8, 1, 4);
      b.obj('bench', 14, 12);
      b.obj('sign', 8, 12, { text: 'Descansa. Luego, el abismo.' });
      b.obj('sprout', 22, 12);
    } },
  { id: 'camaraRaiz', name: 'Cámara de la Raíz', ox: 1510, oy: -51, w: 32, h: 17, level: 6, theme: 'garden', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 32, 1); b.rect(0, 1, 1, 7); b.rect(31, 0, 1, 7);
      b.rect(0, 12, 32, 5);
      b.door(0, 8, 1, 4);
      b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'raiz');
      b.obj('boss', 16, 12, { boss: 'raiz' });
    } },
  { id: 'abismoFinal', name: 'Abismo Carmesí', ox: 1542, oy: -51, w: 36, h: 17, level: 7, theme: 'final', boss: true, floorRow: 12,
    build(b) {
      b.rect(0, 0, 36, 1); b.rect(0, 1, 1, 7); b.rect(35, 0, 1, 17);
      b.rect(0, 12, 36, 5);
      b.door(0, 8, 1, 4);
      b.obj('boss', 18, 12, { boss: 'ecos' });
      b.obj('bench', 5, 12);
      b.obj('sign', 10, 12, { text: 'Aquí terminan todos los ecos' });
    } },
];

// Reconstruir el mundo con salas nuevas (expand.js carga después de world.js)
(function rebuildWorld() {
  for (const def of EXTRA_ROOMS) ROOM_DEFS.push(def);
  World.rooms = ROOM_DEFS.map(makeRoom);
  World.byId = {};
  for (const r of World.rooms) World.byId[r.id] = r;
})();
