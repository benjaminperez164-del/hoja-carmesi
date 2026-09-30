'use strict';
// ---------- Efectos: partículas, sacudida, hit-stop, arcos de corte ----------
const FX = {
  parts: [], slashes: [], rings: [],
  shakeT: 0, shakeMag: 0, hitStop: 0,
  MAX: 140,
  shake(mag, t) { if (mag >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; this.shakeT = t; } },
  stop(frames) { this.hitStop = Math.max(this.hitStop, frames); },
  burst(x, y, n, opt) {
    opt = opt || {};
    const room = this.MAX - this.parts.length;
    if (room <= 0) return;
    n = Math.min(n, room);
    for (let i = 0; i < n; i++) {
      const a = (opt.angle !== undefined ? opt.angle + (Math.random() - 0.5) * (opt.spread || Math.PI * 2) : Math.random() * Math.PI * 2);
      const sp = (opt.speed || 120) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (opt.life || 0.4) * (0.6 + Math.random() * 0.6), t: 0,
        color: opt.colors ? opt.colors[(Math.random() * opt.colors.length) | 0] : (opt.color || '#fff'),
        size: opt.size || 2, grav: opt.grav !== undefined ? opt.grav : 300, drag: opt.drag || 0.9,
        shape: opt.shape || 0,   // 0 cuadro · 1 chispa · 2 orbe
      });
    }
  },
  dust(x, y, dir) {
    this.burst(x, y, 6, { angle: dir === undefined ? -Math.PI / 2 : dir, spread: 1.8, speed: 55, life: 0.4, colors: ['#9a8fb0', '#c8c0d8', '#6d6488', '#e8e0f0'], grav: -25, size: 2, shape: 0 });
  },
  sparks(x, y, n, colors) {
    this.burst(x, y, n || 10, { speed: 200, life: 0.35, colors: colors || ['#ffffff', '#bff6ff', '#fff3a0'], grav: 80, size: 2, drag: 0.88, shape: 1 });
  },
  soul(x, y) {
    this.burst(x, y, 8, { speed: 70, life: 0.7, colors: ['#bff6ff', '#ffffff', '#7ad8ff'], grav: -40, size: 2, shape: 2, drag: 0.92 });
    this.ring(x, y, '#bff6ff', 16);
  },
  slash(o) { this.slashes.push(Object.assign({ t: 0 }, o)); },
  ring(x, y, color, r) { this.rings.push({ x, y, color, r: r || 20, t: 0, life: 0.35 }); },
  update(dt) {
    for (const p of this.parts) {
      p.t += dt; p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    for (const s of this.slashes) s.t += dt;
    this.slashes = this.slashes.filter(s => s.t < s.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter(r => r.t < r.life);
    if (this.shakeT > 0) this.shakeT -= dt; else this.shakeMag = 0;
  },
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 8);
    return [Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m)];
  },
  draw(ctx) {
    for (const p of this.parts) {
      const a = Math.max(0, 1 - p.t / p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size, x = Math.round(p.x), y = Math.round(p.y);
      if (p.shape === 1) {          // chispa (rombo)
        ctx.beginPath(); ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s + 1); ctx.lineTo(x - s, y); ctx.fill();
      } else if (p.shape === 2) {   // orbe suave
        ctx.beginPath(); ctx.arc(x, y, s + a, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 1, 1);
      } else {
        ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.2 - k;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.25 + k * 1.1), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.35; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of this.slashes) drawSlashArc(ctx, s);
  },
  clear() { this.parts = []; this.slashes = []; this.rings = []; this.shakeT = 0; this.hitStop = 0; },
};

// Arco de corte: media luna con núcleo blanco y destello
function drawSlashArc(ctx, s) {
  const k = s.t / s.life;
  const sweep = Math.min(1, k * 3.4);
  const fade = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
  const a0 = s.a0, a1 = s.a0 + (s.a1 - s.a0) * sweep;
  const cx = s.follow ? s.follow.x + s.follow.w / 2 + s.ox : s.x;
  const cy = s.follow ? s.follow.y + s.follow.h / 2 + s.oy : s.y;
  const ccw = s.a1 < s.a0;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  const layers = [
    [s.r + 2, s.thick + 3, s.color2 || '#2fd6ff', 0.28],
    [s.r, s.thick, s.color2 || '#2fd6ff', 0.55],
    [s.r - 1, s.thick * 0.55, s.color || '#bff6ff', 0.95],
    [s.r - 1, 1.6, '#ffffff', 1],
  ];
  for (const [r, th, col, al] of layers) {
    ctx.globalAlpha = al * fade;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1, ccw);
    ctx.arc(0, 0, Math.max(1, r - th), a1, a0, !ccw);
    ctx.closePath(); ctx.fill();
  }
  // tip spark
  if (fade > 0.4) {
    const tip = ccw ? a1 : a1;
    const tx = Math.cos(tip) * (s.r - 1), ty = Math.sin(tip) * (s.r - 1);
    ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(tx, ty - 2); ctx.lineTo(tx + 2, ty); ctx.lineTo(tx, ty + 2); ctx.lineTo(tx - 2, ty); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
