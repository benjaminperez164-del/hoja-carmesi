'use strict';
// ---------- Efectos: partículas, sacudida, hit-stop, arcos de corte ----------
const FX = {
  parts: [], slashes: [], rings: [],
  shakeT: 0, shakeMag: 0, hitStop: 0,
  shake(mag, t) { if (mag >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; this.shakeT = t; } },
  stop(frames) { this.hitStop = Math.max(this.hitStop, frames); },
  burst(x, y, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = (opt.angle !== undefined ? opt.angle + (Math.random() - 0.5) * (opt.spread || Math.PI * 2) : Math.random() * Math.PI * 2);
      const sp = (opt.speed || 120) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (opt.life || 0.4) * (0.6 + Math.random() * 0.6), t: 0,
        color: opt.colors ? opt.colors[(Math.random() * opt.colors.length) | 0] : (opt.color || '#fff'),
        size: opt.size || 2, grav: opt.grav !== undefined ? opt.grav : 300, drag: opt.drag || 0.9,
      });
    }
  },
  dust(x, y, dir) {
    this.burst(x, y, 5, { angle: dir === undefined ? -Math.PI / 2 : dir, spread: 1.6, speed: 50, life: 0.35, colors: ['#9a8fb0', '#c8c0d8', '#6d6488'], grav: -20, size: 2 });
  },
  slash(o) { this.slashes.push(Object.assign({ t: 0 }, o)); },
  ring(x, y, color, r) { this.rings.push({ x, y, color, r: r || 20, t: 0, life: 0.3 }); },
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
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of this.slashes) drawSlashArc(ctx, s);
  },
  clear() { this.parts = []; this.slashes = []; this.rings = []; this.shakeT = 0; this.hitStop = 0; },
};

// Arco de corte: media luna que barre de a0 a a1, se desvanece
function drawSlashArc(ctx, s) {
  const k = s.t / s.life;
  const sweep = Math.min(1, k * 3.2);                  // barrido rápido
  const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
  const a0 = s.a0, a1 = s.a0 + (s.a1 - s.a0) * sweep;
  const cx = s.follow ? s.follow.x + s.follow.w / 2 + s.ox : s.x;
  const cy = s.follow ? s.follow.y + s.follow.h / 2 + s.oy : s.y;
  const ccw = s.a1 < s.a0;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  const layers = [
    [s.r, s.thick, s.color2 || '#2fd6ff', 0.55],
    [s.r - 1, s.thick * 0.6, s.color || '#bff6ff', 0.9],
    [s.r - 1, 1.5, '#ffffff', 1],
  ];
  for (const [r, th, col, al] of layers) {
    ctx.globalAlpha = al * fade;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1, ccw);
    ctx.arc(0, 0, Math.max(1, r - th), a1, a0, !ccw);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
