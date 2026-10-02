#!/usr/bin/env node
// ---------- Red de seguridad de regresión (Bloque 0 de AUDITORIA.md) ----------
// Carga el juego por file:// en Chrome headless, lo controla por CDP con los ganchos window.GAME
// y ejecuta casos deterministas (GAME.setManual + GAME.step, Math.random con semilla fija).
// Sin dependencias: Node >= 22 (WebSocket y fetch nativos) + Chrome/Chromium/Edge.
//
//   node tests/regresion.mjs            sale con 0 si solo fallan los casos marcados como pendientes
//   node tests/regresion.mjs --strict   cualquier caso que no pase da código distinto de 0
//   opciones: --solo=<ID|texto>  --seed=<n>  --json
//   variable de entorno: CHROME_PATH=<ruta al ejecutable>

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GAME_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const ARGS = process.argv.slice(2);
const opt = name => { const a = ARGS.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const STRICT = ARGS.includes('--strict');
const JSON_OUT = ARGS.includes('--json');
const SEED = Number(opt('seed')) || 20261002;
const SOLO = opt('solo');
const GANCHOS_REQUERIDOS = ['Game', 'World', 'Input', 'FX', 'setManual', 'step', 'warp'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Localizar Chrome ----------
function buscarChrome() {
  const env = process.env.CHROME_PATH;
  if (env) {
    if (fs.existsSync(env)) return env;
    throw new Error(`CHROME_PATH apunta a un archivo inexistente: ${env}`);
  }
  const cand = [];
  if (process.platform === 'win32') {
    const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const rel of ['Google/Chrome/Application/chrome.exe', 'Chromium/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'])
      for (const b of bases) cand.push(path.join(b, rel));
  } else if (process.platform === 'darwin') {
    for (const app of ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'])
      cand.push(path.join('/Applications', app), path.join(os.homedir(), 'Applications', app));
  } else {
    const dirs = (process.env.PATH || '').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin', '/snap/bin']);
    for (const n of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge-stable', 'microsoft-edge'])
      for (const d of dirs) cand.push(path.join(d, n));
  }
  const hit = cand.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!hit) throw new Error('No se encontró Chrome, Chromium ni Edge. Indica la ruta con la variable CHROME_PATH.');
  return hit;
}

// ---------- Cliente CDP mínimo ----------
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.waiters = []; this.handlers = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id); m.error ? rej(new Error(`${m.error.message}`)) : res(m.result); return; }
      if (!m.method) return;
      for (const h of this.handlers) h(m);
      this.waiters = this.waiters.filter(w => { if (w.method !== m.method) return true; clearTimeout(w.timer); w.res(m.params); return false; });
    };
  }
  send(method, params = {}, timeout = 60000) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`Tiempo agotado en ${method}`)); }, timeout);
      this.pending.set(id, { res, rej, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, timeout = 20000) {
    return new Promise((res, rej) => { const w = { method, res }; w.timer = setTimeout(() => rej(new Error(`No llegó el evento ${method}`)), timeout); this.waiters.push(w); });
  }
  on(fn) { this.handlers.push(fn); }
}

async function lanzarChrome(exe) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-regresion-'));
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', 'about:blank'];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox');
  const proc = spawn(exe, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; proc.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
  const portFile = path.join(perfil, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    if (proc.exitCode !== null) break;
    try { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]) || null; } catch {}
    if (!port) await sleep(100);
  }
  if (!port) { proc.kill(); throw new Error(`Chrome no abrió el puerto de depuración.\n${stderr}`); }
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!page) await sleep(100);
  }
  if (!page) { proc.kill(); throw new Error('Chrome no expuso ninguna pestaña.'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('No se pudo conectar por WebSocket a Chrome')); });
  const cdp = new CDP(ws);
  const cerrar = async () => {
    try { await cdp.send('Browser.close', {}, 3000); } catch {}
    try { ws.close(); } catch {}
    if (proc.exitCode === null) { await Promise.race([new Promise(r => proc.once('exit', r)), sleep(4000)]); if (proc.exitCode === null) proc.kill(); }
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  };
  return { cdp, cerrar };
}

// ---------- Página: carga, registro de consola, evaluación ----------
// Math.random con semilla (mulberry32), inyectado antes de los scripts del juego: no se toca ningún archivo del juego
const semilla = seed => `(() => { let a = ${seed >>> 0}; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

function crearPagina(cdp) {
  const registro = [];
  cdp.on(m => {
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; registro.push({ tipo: 'excepcion', texto: d.exception?.description || d.text }); }
    else if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.type, texto = m.params.args.map(a => a.value ?? a.description).join(' ');
      if (t === 'error' || t === 'assert') registro.push({ tipo: 'error', texto }); else if (t === 'warning') registro.push({ tipo: 'aviso', texto });
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error') registro.push({ tipo: 'error', texto: `${e.text} ${e.url || ''}`.trim() }); else if (e.level === 'warning') registro.push({ tipo: 'aviso', texto: e.text });
    }
  });
  const evaluar = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    registro,
    // Ejecuta en la página una función autocontenida (sin variables externas) con un argumento JSON
    ejecutar: (fn, arg) => evaluar(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`),
    // Recarga limpia: estado del juego desde cero, simulación en modo manual, localStorage vacío
    async cargar() {
      registro.length = 0;
      const cargado = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: GAME_URL });
      await cargado;
      for (let i = 0; i < 100; i++) { if (await evaluar(`typeof window.GAME === 'object' && !!window.GAME && !!window.GAME.Game`)) break; await sleep(50); }
      const faltan = await evaluar(`${JSON.stringify(GANCHOS_REQUERIDOS)}.filter(k => !window.GAME || !(k in window.GAME))`);
      if (faltan.length) throw new Error(`Faltan ganchos en window.GAME: ${faltan.join(', ')} (no se añaden al juego; hay que decidirlo)`);
      await evaluar(`GAME.setManual(true); try { localStorage.clear(); } catch (e) {} true`);
    },
  };
}

// ---------- Casos ----------
// Cada caso devuelve { prep: { ok, motivo }, ok, razon, detalle }. razon (solo casos pendientes): el fallo coincide con la causa
// documentada en la auditoría; si un caso pendiente falla por otra causa se informa como ERROR, no como rojo esperado.
// prep.ok = false significa que el escenario no se reprodujo
// (el resultado sería engañoso) y se informa como ERROR aunque el caso esté marcado como pendiente.
// pendiente: '<ID>' marca un rojo esperado: el bug de la auditoría sigue sin corregir. Quitar la marca al corregirlo.

const CASOS = [
  { id: 'HUMO', nombre: 'Humo: 22 salas × 3 s con dibujo', pendiente: null, async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, rooms = GAME.World.rooms, res = [];
      G.newGame();
      for (const r of rooms) {
        try {
          // primer hueco con suelo debajo y aire encima
          let tx = 3, ty = 3;
          busca: for (let y = 1; y < r.h - 1; y++) for (let x = 2; x < r.w - 2; x++)
            if (r.grid[y][x] === 0 && r.grid[y - 1][x] === 0 && r.grid[y + 1][x] === 1) { tx = x + 0.5; ty = y + 1; break busca; }
          GAME.warp(r.id, tx, ty); G.state = 'play';
          for (let i = 0; i < 180; i++) {
            G.player.hp = G.player.maxHp = 99;
            GAME.step(1, []);
            if (G.state !== 'play') G.state = 'play';
            if (i % 10 === 0) G.draw();
          }
          G.draw();
          res.push({ sala: r.id, ok: true });
        } catch (e) { res.push({ sala: r.id, ok: false, error: String(e && e.message || e) }); }
      }
      return { total: rooms.length, res };
    });
    const malas = r.res.filter(x => !x.ok);
    const errores = pg.registro.filter(e => e.tipo === 'excepcion' || e.tipo === 'error');
    const prep = { ok: r.total === 22, motivo: `se esperaban 22 salas y hay ${r.total}` };
    return {
      prep, ok: malas.length === 0 && errores.length === 0,
      detalle: `${r.total - malas.length}/${r.total} salas sin excepciones; ${errores.length} errores/excepciones de consola (esperado 0)` +
        (malas.length ? ` · fallan: ${malas.map(m => `${m.sala} (${m.error})`).join('; ')}` : '') +
        (errores.length ? ` · consola: ${errores.slice(0, 3).map(e => e.texto).join(' | ')}` : ''),
    };
  } },

  ...[
    { jefe: 'guardian', nombre: 'Guardián', sala: 'guardian', tx: 22, ty: 15, dir: 'right', previos: [], fin: 'levelclear' },
    { jefe: 'heraldo', nombre: 'Heraldo', sala: 'sol', tx: 26, ty: 12, dir: 'right', previos: ['guardian'], fin: 'levelclear' },
    { jefe: 'oraculo', nombre: 'Oráculo', sala: 'corazon', tx: 9, ty: 12, dir: 'left', previos: ['guardian', 'heraldo'], fin: 'victory' },
  ].map(cfg => ({ id: 'C-01', nombre: `Salir de la sala durante 'dying' · ${cfg.nombre}`, pendiente: 'C-01', async run(pg) {
    const r = await pg.ejecutar(cfg => {
      const G = GAME.Game;
      GAME.noEnemies = true;                     // gancho existente: aísla el caso de enemigos en las salas vecinas
      G.newGame();
      for (const k of cfg.previos) G.beaten[k] = true;
      G.secrets.add('celeste'); G.applyUpgrades(); G.syncDoors();
      GAME.warp(cfg.sala, cfg.tx, cfg.ty); G.state = 'play';
      const p = G.player; p.sitting = false; p.maxHp = p.hp = 20;
      let n = 0;
      while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
      const b = G.boss;
      if (!b || b.state !== 'idle') return { prep: false, motivo: `el jefe no llegó a 'idle' tras la intro (estado: ${b ? b.state : 'sin jefe'})` };
      b.hp = 1; b.hurt(1, p, 'g1');              // golpe final por la vía real: Boss.hurt -> Game.bossDefeated
      if (b.state !== 'dying' || !G.beaten[cfg.jefe]) return { prep: false, motivo: `tras el golpe final el jefe está en '${b.state}' y beaten.${cfg.jefe}=${!!G.beaten[cfg.jefe]}` };
      const sala = G.room.id, estados = new Set([G.state]);
      let salio = null, puertaCerrada = false, soloPlay = true;
      for (let i = 0; i < 900; i++) {
        if (G.boss && G.boss.state === 'dying' && G.room.id === sala && G.room.doors.some(d => d.active)) puertaCerrada = true;
        GAME.step(1, (!salio && soloPlay) ? [cfg.dir] : []);   // camina hacia la salida hasta salir o hasta que cambie el estado
        estados.add(G.state); if (G.state !== 'play') soloPlay = false;
        if (!salio && G.room.id !== sala) salio = i + 1;
      }
      let completed;
      try { completed = (JSON.parse(localStorage.getItem('hojaCarmesi.save.v1')) || {}).completed; } catch (e) {}
      return { prep: true, salio, puertaCerrada, estados: [...estados], invulnT: +G.player.invulnT.toFixed(2), completed: completed === undefined ? 'undefined' : completed, salaFinal: G.room.id };
    }, cfg);
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    // Escenario válido si el jugador salió durante 'dying' o si una puerta se lo impidió (corrección alternativa: puertas cerradas hasta victory)
    const prep = { ok: !!r.salio || r.puertaCerrada, motivo: 'el jugador no salió de la sala y ninguna puerta estaba cerrada durante dying' };
    const okEstado = r.estados.includes(cfg.fin), okInv = r.invulnT <= 1.3, okComp = cfg.jefe !== 'oraculo' || r.completed === true;
    return {
      prep, ok: okEstado && okInv && okComp, razon: !!r.salio && !okEstado,
      detalle: `estados vistos {${r.estados.join(', ')}} (esperado incluir ${cfg.fin}); invulnT ${r.invulnT} (esperado ≤ 1,3)` +
        (cfg.jefe === 'oraculo' ? `; completed ${r.completed} (esperado true)` : '') +
        `; ${r.salio ? `salió en el paso ${r.salio} hacia ${r.salaFinal}` : 'puerta cerrada durante dying'}`,
    };
  } })),

  { id: 'B-01', nombre: "Golpear al Guardián en 'dying' no da energía", pendiente: 'B-01', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game;
      GAME.noEnemies = true;
      G.newGame(); GAME.warp('guardian', 22, 15); G.state = 'play';
      const p = G.player; p.sitting = false; p.maxHp = p.hp = 20;
      let n = 0;
      while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
      const b = G.boss;
      if (!b || b.state !== 'idle') return { prep: false, motivo: `el jefe no llegó a 'idle' (estado: ${b ? b.state : 'sin jefe'})` };
      b.hp = 1; b.hurt(1, p, 'g1');
      if (b.state !== 'dying') return { prep: false, motivo: `el jefe no entró en 'dying' (estado: ${b.state})` };
      // jugador pegado al jefe, mirando hacia él, sin acciones en curso
      p.soul = 0; p.atk = null; p.atkCd = 0; p.atkBuf = 0; p.dashT = 0; p.recoilT = 0; p.hurtT = 0; p.healing = false;
      p.x = b.x - p.w - 6; p.y = b.y + b.h - p.h; p.vx = p.vy = 0; p.facing = 1;
      let golpeado = false, enDying = true;
      GAME.step(1, ['attack']);
      for (let i = 0; i < 30; i++) {
        if (p.atk && p.atk.hit.has(b)) { golpeado = true; enDying = enDying && b.state === 'dying'; }
        GAME.step(1, []);
      }
      return { prep: golpeado && enDying, motivo: golpeado ? 'el jefe salió de dying antes del golpe' : 'el tajo no llegó a tocar al jefe', energia: p.soul, estadoJefe: b.state };
    });
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    return { prep: { ok: true }, ok: r.energia === 0, razon: r.energia > 0, detalle: `energía tras golpear al jefe en dying: ${r.energia} (esperado 0)` };
  } },

  { id: 'A-01a', nombre: 'Pulsar salto en el 2.º paso del hit-stop', pendiente: 'A-01', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, FX = GAME.FX;
      G.newGame(); const p = G.player; p.sitting = false;
      GAME.step(30, []);
      if (!p.onGround) return { prep: false, motivo: 'el jugador no está en el suelo al empezar' };
      // control: sin hit-stop, el mismo gesto produce un salto
      GAME.step(1, ['jump']); const vyControl = p.vy;
      GAME.step(150, []);
      if (vyControl >= 0 || !p.onGround) return { prep: false, motivo: `el salto de control no funcionó (vy=${vyControl.toFixed(1)}) o no volvió al suelo` };
      const y0 = p.y;
      FX.hitStop = 5;
      GAME.step(1, []);                          // 1.er paso congelado
      const hsAlPulsar = FX.hitStop;
      GAME.step(1, ['jump']);                    // 2.º paso congelado: pulsar
      let k = 0; while (FX.hitStop > 0 && k < 20) { GAME.step(1, []); k++; }
      GAME.step(4, []);                          // unos pasos tras el hit-stop
      return { prep: hsAlPulsar > 0, motivo: 'el hit-stop ya había terminado al pulsar', subida: +(y0 - p.y).toFixed(1), vy: +p.vy.toFixed(1), vyControl: +vyControl.toFixed(1) };
    });
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    return { prep: { ok: true }, ok: r.subida > 2, razon: r.subida <= 2, detalle: `subida tras el hit-stop ${r.subida} px, vy ${r.vy} (esperado: salta, como el control con vy ${r.vyControl})` };
  } },

  { id: 'A-01b', nombre: 'Soltar salto durante el hit-stop recorta la altura', pendiente: 'A-01', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, FX = GAME.FX;
      G.newGame(); const p = G.player; p.sitting = false;
      GAME.step(30, []);
      const alSuelo = () => { let k = 0; GAME.step(2, []); while (!p.onGround && k < 300) { GAME.step(1, []); k++; } return p.onGround; };
      // modo: 'alto' (mantener), 'corto' (soltar tras 4 pasos), 'hitstop' (soltar tras 4 pasos, durante un hit-stop)
      const medir = modo => {
        if (!alSuelo()) return { error: 'no volvió al suelo' };
        const y0 = p.y; let minY = p.y, info = {};
        GAME.step(1, ['jump']);
        if (modo === 'alto') { for (let i = 0; i < 120 && !(i > 3 && p.onGround); i++) { GAME.step(1, ['jump']); minY = Math.min(minY, p.y); } }
        else {
          GAME.step(3, ['jump']);
          if (modo === 'hitstop') {
            FX.hitStop = 4;
            GAME.step(1, ['jump']);                // congelado, aún pulsado
            info = { hs: FX.hitStop, vy: p.vy, canCut: p.canCut };
            GAME.step(1, []);                      // congelado: se suelta
            info.hsAlSoltar = FX.hitStop;
          } else GAME.step(1, []);
          for (let i = 0; i < 120 && !p.onGround; i++) { GAME.step(1, []); minY = Math.min(minY, p.y); }
        }
        return { altura: +(y0 - minY).toFixed(1), info };
      };
      const alto = medir('alto'), corto = medir('corto'), hs = medir('hitstop');
      return { alto, corto, hs };
    });
    const { alto, corto, hs } = r;
    const err = [alto, corto, hs].find(x => x.error);
    if (err) return { prep: { ok: false, motivo: err.error } };
    const diferenciable = alto.altura - corto.altura > 20;
    const soltoEnHitStop = hs.info.hsAlSoltar > 0 && hs.info.vy < 0 && hs.info.canCut;
    if (!diferenciable) return { prep: { ok: false, motivo: `el corte de salto no es medible: alto ${alto.altura} px vs corto ${corto.altura} px` } };
    if (!soltoEnHitStop) return { prep: { ok: false, motivo: `no se soltó durante un hit-stop en subida (hit-stop ${hs.info.hsAlSoltar}, vy ${hs.info.vy})` } };
    const umbral = (alto.altura + corto.altura) / 2;
    return { prep: { ok: true }, ok: hs.altura < umbral, razon: hs.altura >= umbral,
      detalle: `altura soltando en hit-stop ${hs.altura} px (esperado < ${umbral.toFixed(1)}; salto completo ${alto.altura}, soltando sin hit-stop ${corto.altura})` };
  } },

  { id: 'A-02', nombre: 'Punto seguro sobre bloque de fase + cambio de fase', pendiente: 'A-02', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game;
      GAME.noEnemies = true;
      G.newGame(); G.secrets.add('celeste'); G.applyUpgrades();
      GAME.warp('puenteFase', 20, 8); G.state = 'play'; G.setPhase('b');
      const p = G.player, room = G.room; p.sitting = false; p.maxHp = p.hp = 8;
      // warp() -> reset() fija el punto seguro donde se teletransporta; se sustituye por uno legítimo (encima del pilar 15-16)
      // para que solo recordSafe() del juego pueda llevarlo al bloque de fase
      const pilar = { x: room.px + 15.5 * 16 - p.w / 2, y: room.py + 8 * 16 - p.h };
      p.safe.x = pilar.x; p.safe.y = pilar.y;
      const tx = 20, ty = 8, bloque = room.phases.find(b => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h);
      let enBloque = 0;
      for (let i = 0; i < 20; i++) { GAME.step(1, []); if (p.onGround && bloque && bloque.solid) enBloque++; }
      if (!bloque || bloque.set !== 'b' || enBloque < 20)
        return { prep: false, motivo: `el jugador no estuvo 20 pasos de pie sobre el bloque azul (${tx},${ty}) (pasos en él: ${enBloque})` };
      const stx = Math.floor((p.safe.x + p.w / 2) / 16) - room.ox, sty = Math.round((p.safe.y + p.h) / 16) - room.oy;
      const safeEnBloque = stx >= bloque.x && stx < bloque.x + bloque.w && sty === bloque.y;
      G.togglePhase();                            // equivale a golpear el cristal desde el bloque azul
      if (bloque.solid || room.grid[ty][tx] !== 0) return { prep: false, motivo: 'el bloque bajo el jugador no desapareció al cambiar de fase' };
      const hp0 = p.hp; let golpes = 0, prev = 0, hpMitad = null, murio = false;
      for (let i = 0; i < 600; i++) {
        GAME.step(1, []);
        if (p.spikeT > 0 && prev <= 0) golpes++;
        prev = p.spikeT;
        if (i === 299) hpMitad = p.hp;
        if (G.state === 'dying') { murio = true; break; }
      }
      return { prep: true, tx, ty, hp0, hpMitad, hpFin: p.hp, golpes, murio, safeEnBloque, stx, sty };
    });
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    const estable = !r.murio && r.hpMitad === r.hpFin;
    return { prep: { ok: true }, ok: r.golpes <= 1 && estable, razon: r.safeEnBloque && r.golpes > 1,
      detalle: `golpes de pinchos en 10 s: ${r.golpes} (esperado ≤ 1); HP ${r.hp0} → ${r.murio ? 'muerto' : `${r.hpMitad} (5 s) → ${r.hpFin} (10 s)`} (esperado estable); ` +
        `recordSafe ${r.safeEnBloque ? `guardó el punto seguro sobre el bloque de fase (${r.stx},${r.sty})` : `dejó el punto seguro en (${r.stx},${r.sty}), fuera del bloque`}` };
  } },

  { id: 'M-07', nombre: 'completed sobrevive a continueGame + saveGame', pendiente: 'M-07', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, KEY = 'hojaCarmesi.save.v1';
      localStorage.setItem(KEY, JSON.stringify({ v: 1, level: 3, respawn: { room: 'antecamara', tx: 15, ty: 12 }, maxHp: 5,
        beaten: { guardian: true, heraldo: true, oraculo: true }, secrets: ['celeste'], visited: ['antecamara'], playTime: 600, completed: true }));
      const antes = JSON.parse(localStorage.getItem(KEY)).completed;
      G.continueGame();
      const cargo = G.state === 'play' && G.room && G.room.id === 'antecamara';
      G.saveGame();                               // lo mismo que ocurre al sentarse en un banco
      const despues = JSON.parse(localStorage.getItem(KEY)).completed;
      return { prep: antes === true && cargo, motivo: `guardado previo completed=${antes}, partida cargada=${cargo}`, despues: despues === undefined ? 'undefined' : despues };
    });
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    return { prep: { ok: true }, ok: r.despues === true, razon: r.despues === 'undefined', detalle: `completed tras saveGame(): ${r.despues} (esperado true)` };
  } },

  { id: 'PERF', nombre: 'Rendimiento en Cascadas (informativo)', pendiente: null, informativo: true, async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game;
      G.newGame(); GAME.warp('cascadas', 10, 31); G.state = 'play';
      for (let i = 0; i < 60; i++) { G.player.hp = 99; GAME.step(1, []); G.draw(); }   // calentamiento
      const t0 = performance.now();
      for (let i = 0; i < 600; i++) { G.player.hp = G.player.maxHp = 99; GAME.step(1, []); if (G.state !== 'play') G.state = 'play'; G.draw(); }
      return { ms: (performance.now() - t0) / 600 };
    });
    return { prep: { ok: true }, ok: true, detalle: `${r.ms.toFixed(2)} ms por fotograma (update + draw, 600 fotogramas, Chrome headless; presupuesto 16,7 ms)` };
  } },
];

// ---------- Ejecución ----------
function clasificar(caso, res) {
  if (caso.informativo) return 'INFO';
  if (!res.prep.ok) return 'ERROR';
  if (res.ok) return caso.pendiente ? 'ANOMALÍA' : 'PASA';
  if (caso.pendiente && res.razon === false) return 'ERROR';
  return caso.pendiente ? 'ROJO ESPERADO' : 'FALLA';
}

async function main() {
  const [mayor] = process.versions.node.split('.').map(Number);
  if (mayor < 22 || typeof WebSocket === 'undefined') { console.error(`Se necesita Node >= 22 (WebSocket nativo). Versión actual: ${process.versions.node}`); process.exit(3); }
  let exe, chrome;
  try { exe = buscarChrome(); chrome = await lanzarChrome(exe); }
  catch (e) { console.error(`No se pudo iniciar el navegador: ${e.message}`); process.exit(3); }
  const { cdp, cerrar } = chrome;
  const resultados = [];
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: semilla(SEED) });
    const pg = crearPagina(cdp);
    const casos = SOLO ? CASOS.filter(c => c.id === SOLO || c.nombre.toLowerCase().includes(SOLO.toLowerCase())) : CASOS;
    for (const caso of casos) {
      let res;
      try {
        await pg.cargar();
        res = await caso.run(pg);
        // una excepción del juego durante un caso invalida el resultado (salvo en HUMO, que ya la cuenta como fallo)
        const exc = pg.registro.filter(e => e.tipo === 'excepcion');
        if (caso.id !== 'HUMO' && exc.length && res.prep.ok) res.prep = { ok: false, motivo: `excepción del juego durante el caso: ${exc[0].texto.split('\n')[0]}` };
      } catch (e) { res = { prep: { ok: false, motivo: `error del arnés: ${e.message.split('\n')[0]}` } }; }
      const estado = clasificar(caso, res);
      let detalle = res.prep.ok ? res.detalle : `PREPARACIÓN FALLIDA: ${res.prep.motivo}`;
      if (res.prep.ok && !res.ok && caso.pendiente && res.razon === false) detalle = `FALLA POR UNA CAUSA DISTINTA A LA DOCUMENTADA: ${detalle}`;
      resultados.push({ n: resultados.length + 1, id: caso.id, nombre: caso.nombre, pendiente: caso.pendiente, estado, detalle: estado === 'ANOMALÍA' ? `${detalle} · el caso está marcado pendiente: '${caso.pendiente}' pero PASA (¿bug corregido o test que no lo reproduce?)` : detalle });
    }
  } finally { await cerrar(); }

  if (JSON_OUT) { console.log(JSON.stringify({ seed: SEED, navegador: exe, resultados }, null, 2)); }
  else imprimir(exe);

  const malos = STRICT ? resultados.filter(r => !['PASA', 'INFO'].includes(r.estado)) : resultados.filter(r => ['FALLA', 'ERROR', 'ANOMALÍA'].includes(r.estado));
  process.exit(malos.length ? 1 : 0);

  function imprimir(exe) {
    const color = process.stdout.isTTY && !process.env.NO_COLOR;
    const C = { PASA: 32, 'ROJO ESPERADO': 33, FALLA: 31, ERROR: 31, 'ANOMALÍA': 35, INFO: 36 };
    const pinta = (s, e) => color ? `\x1b[${C[e]}m${s}\x1b[0m` : s;
    const wN = Math.max(...resultados.map(r => r.nombre.length), 4), wI = Math.max(...resultados.map(r => r.id.length), 2);
    console.log(`\nHoja Carmesí · regresión · semilla ${SEED} · ${path.basename(exe)}${STRICT ? ' · --strict' : ''}\n`);
    console.log(` #  ${'ID'.padEnd(wI)}  ${'Caso'.padEnd(wN)}  Estado`);
    console.log(` ${'-'.repeat(wI + wN + 22)}`);
    for (const r of resultados) {
      console.log(`${String(r.n).padStart(2)}  ${r.id.padEnd(wI)}  ${r.nombre.padEnd(wN)}  ${pinta(r.estado, r.estado)}`);
      console.log(`    ${' '.repeat(wI)}  └ ${r.detalle}`);
    }
    const cuenta = e => resultados.filter(r => r.estado === e).length;
    console.log(`\nResumen: ${cuenta('PASA')} PASA · ${cuenta('ROJO ESPERADO')} ROJO ESPERADO · ${cuenta('FALLA')} FALLA · ${cuenta('ERROR')} ERROR · ${cuenta('ANOMALÍA')} ANOMALÍA · ${cuenta('INFO')} INFO`);
  }
}

main().catch(e => { console.error(e); process.exit(3); });
