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
const SALAS_AUDITADAS = 59;   // salas en c54d4d7 (22 en d68ef4d)
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
  { id: 'HUMO', nombre: `Humo: todas las salas × 3 s con dibujo`, pendiente: null, async run(pg) {
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
    // El número de salas es informativo: si cambia, el detalle lo indica para revisar el resto de casos
    const prep = { ok: r.total > 0, motivo: 'el mundo no tiene salas' };
    return {
      prep, ok: malas.length === 0 && errores.length === 0,
      detalle: `${r.total - malas.length}/${r.total} salas sin excepciones${r.total !== SALAS_AUDITADAS ? ` (la auditoría se hizo con ${SALAS_AUDITADAS}: revisa los casos)` : ''}; ${errores.length} errores/excepciones de consola (esperado 0)` +
        (malas.length ? ` · fallan: ${malas.map(m => `${m.sala} (${m.error})`).join('; ')}` : '') +
        (errores.length ? ` · consola: ${errores.slice(0, 3).map(e => e.texto).join(' | ')}` : ''),
    };
  } },

  ...[
    { jefe: 'guardian', nombre: 'Guardián', sala: 'guardian', tx: 22, ty: 15, dir: 'right', previos: [], fin: 'levelclear' },
    { jefe: 'heraldo', nombre: 'Heraldo', sala: 'sol', tx: 26, ty: 12, dir: 'right', previos: ['guardian'], fin: 'levelclear' },
    { jefe: 'oraculo', nombre: 'Oráculo', sala: 'corazon', tx: 9, ty: 12, dir: 'left', previos: ['guardian', 'heraldo'], fin: 'levelclear' },
    { jefe: 'forjador', nombre: 'Forjador', sala: 'yunque', tx: 24, ty: 12, dir: 'right', previos: [], fin: 'levelclear' },
    { jefe: 'tempestad', nombre: 'Tempestad', sala: 'ojoTormenta', tx: 28, ty: 12, dir: 'right', previos: [], fin: 'levelclear' },
    { jefe: 'raiz', nombre: 'Raíz Primigenia', sala: 'camaraRaiz', tx: 24, ty: 12, dir: 'right', previos: ['ecos'], fin: 'levelclear' },
    { jefe: 'ecos', nombre: 'Ecos (final)', sala: 'abismoFinal', tx: 9, ty: 12, dir: 'left', previos: ['raiz'], fin: 'levelclear', completado: true },
  ].map(cfg => ({ id: 'C-01', nombre: `Salir de la sala durante 'dying' · ${cfg.nombre}`, pendiente: 'C-01', async run(pg) {
    const r = await pg.ejecutar(cfg => {
      const G = GAME.Game;
      GAME.noEnemies = true;                     // gancho existente: aísla el caso de enemigos en las salas vecinas
      // previos: jefes marcados como vencidos para que la sala vecina no active su propio combate
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
    const okEstado = r.estados.includes(cfg.fin), okInv = r.invulnT <= 1.3, okComp = !cfg.completado || r.completed === true;
    return {
      prep, ok: okEstado && okInv && okComp, razon: !!r.salio && !okEstado,
      detalle: `estados vistos {${r.estados.join(', ')}} (esperado incluir ${cfg.fin}); invulnT ${r.invulnT} (esperado ≤ 1,3)` +
        (cfg.completado ? `; completed ${r.completed} (esperado true)` : '') +
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

  { id: 'C-02', nombre: 'Mapa: progresión completa sin sellos en la ruta', pendiente: null, async run(pg) {
    // Inundado del hueco del jugador (1×2 baldosas) sobre la rejilla global, SIN gravedad (condición necesaria de alcanzabilidad),
    // repetido por etapas de la historia hasta un punto fijo:
    //  - Puertas de salida de un jefe: cerradas hasta que se alcanza su sala (se asume que el jefe se vence). Puertas de bloqueo: abiertas.
    //  - Muros agrietados: siempre rompibles (solo piden el tajo normal). Bloques de fase: transitables (hay cristal para alternarlos).
    //  - Sellos de cristal: solo transitables con el Sable Cargado, que se obtiene al vencer al Oráculo (Salto Celeste: Heraldo).
    // Comprobaciones: (1) todas las salas no secretas se alcanzan por progresión; (2) al final, todas las salas;
    // (3) con todo desbloqueado pero los sellos INTACTOS, siguen alcanzables todas las no secretas: ningún sello está en una ruta necesaria.
    const r = await pg.ejecutar(() => {
      const W = GAME.World, rooms = W.rooms, cells = new Map(), owner = new Map(), solapes = new Set();
      const sello = new Set(), puertaSalida = new Map(), jefeDeSala = new Map();
      const GANA = { heraldo: 'celeste', oraculo: 'cargado' };
      for (const r of rooms) {
        for (const w of r.walls) if (w.charge) for (let j = w.y; j < w.y + w.h; j++) for (let i = w.x; i < w.x + w.w; i++) sello.add((r.ox + i) + ',' + (r.oy + j));
        for (const d of r.doors) if (d.kind === 'exit') for (let j = d.y; j < d.y + d.h; j++) for (let i = d.x; i < d.x + d.w; i++) puertaSalida.set((r.ox + i) + ',' + (r.oy + j), d.boss);
        const b = r.objs.find(o => o.type === 'boss'); if (b) jefeDeSala.set(r.id, b.boss);
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const k = (r.ox + x) + ',' + (r.oy + y);
          if (owner.has(k)) { solapes.add(owner.get(k) + '/' + r.id); continue; }
          owner.set(k, r.id); cells.set(k, r.phaseKeys.has(x + ',' + y) ? 0 : r.grid[y][x]);   // los muros rompibles ya son 1 en la rejilla
        }
      }
      const esMuroAgrietado = new Set(); for (const r of rooms) for (const w of r.walls) if (!w.charge) for (let j = w.y; j < w.y + w.h; j++) for (let i = w.x; i < w.x + w.w; i++) esMuroAgrietado.add((r.ox + i) + ',' + (r.oy + j));
      const flood = (vencidos, habil, sellosRompibles) => {
        const libre = (x, y) => { const k = x + ',' + y; if (!cells.has(k)) return false;
          if (puertaSalida.has(k) && !vencidos.has(puertaSalida.get(k))) return false;
          if (sello.has(k)) return sellosRompibles && habil.has('cargado');
          if (esMuroAgrietado.has(k)) return true;
          return cells.get(k) !== 1; };
        const s = W.byId.santuario, x0 = s.ox + 14, y0 = s.oy + 14, seen = new Set([x0 + ',' + y0]), q = [[x0, y0]];
        while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (!seen.has(k) && libre(nx, ny) && libre(nx, ny - 1)) { seen.add(k); q.push([nx, ny]); } } }
        const alc = new Set(); for (const k of seen) alc.add(owner.get(k)); return alc;
      };
      const vencidos = new Set(), habil = new Set(), etapas = [], primeraEtapa = new Map();
      for (let etapa = 0; etapa < 50; etapa++) {
        const alc = flood(vencidos, habil, true);
        for (const id of alc) if (!primeraEtapa.has(id)) primeraEtapa.set(id, etapa);
        const nuevos = [...alc].map(id => jefeDeSala.get(id)).filter(k => k && !vencidos.has(k));
        etapas.push({ etapa, salas: alc.size, vence: nuevos });
        if (!nuevos.length) break;
        for (const k of nuevos) { vencidos.add(k); if (GANA[k]) habil.add(GANA[k]); }
      }
      const final = flood(vencidos, habil, true), sinSellos = flood(vencidos, habil, false);
      const sable = etapas.findIndex(e => e.vence.includes('oraculo'));
      return { salas: rooms.length, solapes: [...solapes], etapas: etapas.length, etapaSable: sable,
        porProgresion: rooms.filter(r => !r.secret && !primeraEtapa.has(r.id)).map(r => r.id),
        alFinal: rooms.filter(r => !final.has(r.id)).map(r => r.id),
        dependenDeSello: rooms.filter(r => !r.secret && !sinSellos.has(r.id)).map(r => r.id),
        jefes: vencidos.size };
    });
    const lista = a => a.length ? `${a.length} (${a.slice(0, 4).join(', ')}${a.length > 4 ? ', …' : ''})` : '0';
    const ok = !r.solapes.length && !r.porProgresion.length && !r.alFinal.length && !r.dependenDeSello.length;
    return { prep: { ok: r.salas > 0, motivo: 'sin salas' }, ok,
      detalle: `${r.etapas} etapas, ${r.jefes} jefes vencidos, Sable ${r.etapaSable >= 0 ? `en la etapa ${r.etapaSable + 1}` : "no obtenido"}; no secretas inalcanzables por progresión: ${lista(r.porProgresion)}; ` +
        `inalcanzables al final: ${lista(r.alFinal)}; no secretas que dependen de un sello: ${lista(r.dependenDeSello)}; solapes: ${r.solapes.length} (esperado 0 en todo)` };
  } },

  { id: 'C-02', nombre: 'Del Pozo del Eco a la Galería Suspendida', pendiente: null, async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, gal = GAME.World.byId.galeria;
      GAME.noEnemies = true;
      G.newGame(); G.secrets.add('celeste'); G.secrets.add('cargado'); G.applyUpgrades();   // con todas las habilidades
      GAME.warp('pozo', 16, 7); G.state = 'play'; const p = G.player; p.sitting = false;
      GAME.step(10, []);
      const inicio = { sala: G.room.id, enSuelo: p.onGround };
      let entro = false, maxX = -99;
      const salas = new Set();
      const gestos = [['right'], ['right', 'jump'], ['right', 'dash'], ['right', 'jump', 'dash']];
      for (const g of gestos) for (let i = 0; i < 90; i++) {
        GAME.step(1, i % 30 < 12 ? g : ['right']); salas.add(G.room.id);
        if (G.room === gal) { entro = true; maxX = Math.max(maxX, (p.x + p.w) / 16 - gal.ox); }
      }
      return { inicio, entro, maxX: +maxX.toFixed(2), salas: [...salas] };
    });
    const prep = { ok: r.inicio.sala === 'pozo' && r.inicio.enSuelo && r.entro, motivo: `inicio en ${r.inicio.sala} (en suelo=${r.inicio.enSuelo}); entró en la Galería=${r.entro}` };
    const ok = r.maxX >= 8 || r.salas.includes('viaSombra');
    return { prep, ok, razon: r.maxX <= 1.5,
      detalle: `borde derecho máximo dentro de la Galería: baldosa ${r.maxX} (esperado ≥ 8, pasada la repisa de entrada); salas recorridas: ${r.salas.join(' → ')}` };
  } },

  { id: 'C-02', nombre: 'Cámara del Rayo: solo con el Sable Cargado', pendiente: null, async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, W = GAME.World, gal = W.byId.galeria, out = {};
      const muro = gal.walls.find(w => w.id === 'selloRayo'), sh = gal.objs.find(o => o.type === 'shard4');
      if (!muro || !muro.charge || !sh) return { prep: false, motivo: `sello selloRayo=${!!muro}, de cristal=${!!(muro && muro.charge)}, shard4=${!!sh}` };
      // 1) Análisis: con todas las puertas abiertas y muros agrietados rotos, ¿se llega a la celda de shard4 sin romper el sello?
      const celda = (gal.ox + Math.floor(sh.tx)) + ',' + (gal.oy + sh.ty - 1);
      const tipo = (x, y, conSello) => { const rr = W.rooms.find(q => x >= q.ox && y >= q.oy && x < q.ox + q.w && y < q.oy + q.h); if (!rr) return 1;
        const lx = x - rr.ox, ly = y - rr.oy, w = rr.walls.find(w => lx >= w.x && ly >= w.y && lx < w.x + w.w && ly < w.y + w.h);
        if (w) return (w.charge && !conSello) ? 1 : 0; if (rr.phaseKeys.has(lx + ',' + ly)) return 0; return rr.grid[ly][lx]; };
      const llega = conSello => { const s = W.byId.santuario, x0 = s.ox + 14, y0 = s.oy + 14, seen = new Set([x0 + ',' + y0]), q = [[x0, y0]];
        while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (!seen.has(k) && tipo(nx, ny, conSello) !== 1 && tipo(nx, ny - 1, conSello) !== 1) { seen.add(k); q.push([nx, ny]); } } }
        return seen.has(celda); };
      out.analisisSinSable = llega(false); out.analisisConSable = llega(true);
      GAME.noEnemies = true;
      // 2) Juego sin Sable (con Salto Celeste): tajos normales y saltos contra el sello desde la repisa
      G.newGame(); G.secrets.add('celeste'); G.applyUpgrades();
      GAME.warp('galeria', 6.5, 7); G.state = 'play'; let p = G.player; p.sitting = false; GAME.step(5, []);
      out.sinSableInicio = { enSuelo: p.onGround, x: +(p.x / 16 - gal.ox).toFixed(2) };
      const gestos = [['left', 'attack'], ['jump'], ['jump', 'attack'], ['left', 'jump'], ['up', 'attack'], ['left', 'jump', 'attack']];
      for (const g of gestos) for (let i = 0; i < 40; i++) { GAME.step(1, i % 10 < 3 ? g : (i % 10 < 6 ? ['jump'] : [])); }
      out.sinSable = { sello: G.secrets.has('selloRayo'), shard4: G.secrets.has('shard4') };
      // 3) Juego con Sable: cargar mirando al oeste, saltar desde la repisa y soltar cerca del ápice; luego entrar con salto (y Salto Celeste)
      G.newGame(); G.secrets.add('celeste'); G.secrets.add('cargado'); G.applyUpgrades();
      GAME.warp('galeria', 6.5, 7); G.state = 'play'; p = G.player; p.sitting = false; GAME.step(5, []);
      GAME.step(1, ['left']); GAME.step(3, []);                      // mirar al oeste sin salir de la repisa
      out.conSableInicio = { enSuelo: p.onGround, mira: p.facing, tiene: !!p.hasCharge };
      GAME.step(1, ['attack']); GAME.step(45, ['attack']);           // carga (≥ 0,7 s)
      out.cargaLista = p.charging && p.chargeT >= 0.7;
      GAME.step(1, ['attack', 'jump']); GAME.step(18, ['attack', 'jump']);   // salto manteniendo la carga
      GAME.step(1, ['jump']);                                         // suelta ATACAR cerca del ápice → onda
      GAME.step(40, []);
      out.selloRoto = G.secrets.has('selloRayo');
      for (let intento = 0; intento < 3 && !G.secrets.has('shard4'); intento++) {
        GAME.step(1, ['left', 'jump']); GAME.step(14, ['left', 'jump']); GAME.step(1, ['left']);
        GAME.step(1, ['left', 'jump']); GAME.step(14, ['left', 'jump']); GAME.step(30, ['left']); GAME.step(30, ['right']); GAME.step(30, []);
      }
      out.shard4 = G.secrets.has('shard4');
      return { prep: true, ...out };
    });
    if (!r.prep) return { prep: { ok: false, motivo: r.motivo } };
    const prep = { ok: r.sinSableInicio.enSuelo && r.conSableInicio.enSuelo && r.conSableInicio.mira === -1 && r.conSableInicio.tiene && r.cargaLista,
      motivo: `inicio sin Sable ${JSON.stringify(r.sinSableInicio)}, con Sable ${JSON.stringify(r.conSableInicio)}, carga lista=${r.cargaLista}` };
    const ok = !r.analisisSinSable && r.analisisConSable && !r.sinSable.sello && !r.sinSable.shard4 && r.selloRoto && r.shard4;
    return { prep, ok,
      detalle: `análisis: shard4 alcanzable sin Sable=${r.analisisSinSable}, con Sable=${r.analisisConSable}; juego sin Sable: sello roto=${r.sinSable.sello}, shard4=${r.sinSable.shard4}; ` +
        `juego con Sable: sello roto=${r.selloRoto}, shard4=${r.shard4} (esperado: false/true; false/false; true/true)` };
  } },

  { id: 'A-03', nombre: 'Invulnerabilidad tras vencer a los 6 minijefes', pendiente: 'A-03', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, W = GAME.World, res = [];
      GAME.noEnemies = true;
      for (const [sala, key] of [['arenaUmbra', 'umbra'], ['arenaAureo', 'aureola'], ['arenaCentinela', 'centinela'], ['arenaCapataz', 'capataz'], ['arenaNube', 'nube'], ['arenaEspina', 'espina']]) {
        G.newGame(); G.secrets.add('celeste'); G.applyUpgrades();
        const b0 = W.byId[sala].objs.find(o => o.type === 'boss');
        GAME.warp(sala, b0.tx - 6, b0.ty); G.state = 'play'; const p = G.player; p.sitting = false; p.maxHp = p.hp = 30;
        let n = 0; while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
        const b = G.boss;
        if (!b || b.state !== 'idle') { res.push({ key, prep: false, motivo: `no llegó a idle (${b ? b.state : 'sin jefe'})` }); continue; }
        b.hp = 1; b.hurt(1, p, 'g1');
        const enDying = b.state === 'dying';
        GAME.step(600, []);                         // se queda en la sala, sin moverse: 10 s
        res.push({ key, prep: enDying && b.dead && G.room.id === sala, motivo: `dying=${enDying}, animación terminada=${b.dead}, sala=${G.room.id}`, invulnT: +p.invulnT.toFixed(1) });
      }
      return res;
    });
    const malPrep = r.find(x => !x.prep);
    if (malPrep) return { prep: { ok: false, motivo: `${malPrep.key}: ${malPrep.motivo}` } };
    const malos = r.filter(x => x.invulnT > 1.3);
    return { prep: { ok: true }, ok: !malos.length, razon: malos.length > 0,
      detalle: `invulnT 10 s después de vencerlos sin salir de la sala: ${r.map(x => `${x.key} ${x.invulnT}`).join(' · ')} (esperado ≤ 1,3)` };
  } },

  { id: 'A-04', nombre: 'Las puertas de las arenas encierran al jugador', pendiente: 'A-04', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, W = GAME.World;
      // 1) Análisis: puertas activas como sólidas, inundado 1×2 desde el jefe; ¿se alcanza algo fuera de la sala?
      const fugas = [];
      for (const r of W.rooms) {
        const b = r.objs.find(o => o.type === 'boss'); if (!b) continue;
        const tipo = (x, y) => { const rr = W.rooms.find(q => x >= q.ox && y >= q.oy && x < q.ox + q.w && y < q.oy + q.h); if (!rr) return 1;
          const lx = x - rr.ox, ly = y - rr.oy; if (rr === r && r.doors.some(d => lx >= d.x && ly >= d.y && lx < d.x + d.w && ly < d.y + d.h)) return 1; return rr.grid[ly][lx]; };
        const x0 = r.ox + Math.floor(b.tx), y0 = r.oy + b.ty - 1, seen = new Set([x0 + ',' + y0]), q = [[x0, y0]];
        let fuga = false;
        while (q.length && !fuga) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k) || tipo(nx, ny) === 1 || tipo(nx, ny - 1) === 1) continue; seen.add(k);
          if (nx < r.ox || nx >= r.ox + r.w || ny < r.oy || ny >= r.oy + r.h) { fuga = true; break; } q.push([nx, ny]); } }
        if (fuga) fugas.push(r.id);
      }
      // 2) Juego: Arena Áurea, combate activo, caminar hacia la salida
      GAME.noEnemies = true; G.newGame(); GAME.warp('arenaAureo', 27, 15); G.state = 'play'; const p = G.player; p.sitting = false; p.maxHp = p.hp = 30;
      let n = 0; while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
      const activo = !!(G.boss && G.boss.state === 'idle'), puertas = W.byId.arenaAureo.doors.every(d => d.active);
      let salio = null; for (let i = 0; i < 300; i++) { GAME.step(1, ['right']); if (G.room.id !== 'arenaAureo') { salio = i + 1; break; } }
      return { fugas, activo, puertas, salio, sala: G.room.id, vencida: !!G.beaten.aureola };
    });
    const prep = { ok: r.activo && r.puertas, motivo: `combate activo=${r.activo}, puertas cerradas=${r.puertas}` };
    return { prep, ok: !r.fugas.length && !r.salio, razon: r.fugas.includes('arenaAureo') && !!r.salio,
      detalle: `arenas con fuga con las puertas cerradas: ${r.fugas.length ? r.fugas.join(', ') : 'ninguna'}; Arena Áurea: ${r.salio ? `salió en el paso ${r.salio} hacia ${r.sala} sin vencer al jefe` : 'no pudo salir'} (esperado: ninguna fuga)` };
  } },

  { id: 'A-05', nombre: 'Con Sable Cargado, el tajo sale al pulsar', pendiente: 'A-05', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game;
      const medir = conSable => {
        G.newGame(); const p = G.player; p.sitting = false; if (conSable) G.secrets.add('cargado'); G.applyUpgrades(); GAME.step(20, []);
        const enSuelo = p.onGround, tiene = !!p.hasCharge;
        GAME.step(1, ['attack']); let pasos = 1;
        for (let i = 0; i < 5 && !p.atk; i++) { GAME.step(1, ['attack']); pasos++; }    // mantiene 6 pasos (~100 ms, un toque normal)
        while (!p.atk && pasos < 40) { GAME.step(1, []); pasos++; }
        return { enSuelo, tiene, pasos: p.atk ? pasos : null };
      };
      return { sin: medir(false), con: medir(true) };
    });
    const prep = { ok: r.sin.enSuelo && r.con.enSuelo && r.con.tiene && r.sin.pasos === 1, motivo: `control sin Sable: tajo en ${r.sin.pasos} pasos; con Sable activo=${r.con.tiene}` };
    return { prep, ok: r.con.pasos !== null && r.con.pasos <= 2, razon: r.con.pasos !== null && r.con.pasos > 2,
      detalle: `pasos desde la pulsación hasta el tajo con un toque de 6 pasos: con Sable ${r.con.pasos}, sin Sable ${r.sin.pasos} (esperado ≤ 2)` };
  } },

  { id: 'A-01c', nombre: 'Con Sable Cargado, pulsar ATACAR en el hit-stop', pendiente: 'A-01', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, FX = GAME.FX;
      G.newGame(); const p = G.player; p.sitting = false; G.secrets.add('cargado'); G.applyUpgrades(); GAME.step(20, []);
      FX.hitStop = 5; GAME.step(1, []); const hs = FX.hitStop;
      GAME.step(1, ['attack']);                    // pulsación corta dentro del hit-stop
      let ataco = false, cargo = false;
      for (let i = 0; i < 30; i++) { GAME.step(1, []); if (p.atk) ataco = true; if (p.charging) cargo = true; }
      return { hs, tiene: !!p.hasCharge, ataco, cargo };
    });
    const prep = { ok: r.hs > 0 && r.tiene, motivo: `hit-stop al pulsar=${r.hs}, Sable activo=${r.tiene}` };
    return { prep, ok: r.ataco, razon: !r.ataco && !r.cargo,
      detalle: `tras pulsar en el hit-stop: tajo=${r.ataco}, carga iniciada=${r.cargo} (esperado: tajo)` };
  } },

  { id: 'A-06', nombre: 'Tempestad: avisos con la misma duración que otros jefes', pendiente: 'A-06', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, out = {};
      // se entra por x=10: lejos del jefe (x=16) y más allá de cualquier disparador razonable
      for (const [sala, key] of [['ojoTormenta', 'tempestad'], ['yunque', 'forjador']]) {
        GAME.noEnemies = true; G.newGame(); GAME.warp(sala, 10, 12); G.state = 'play'; const p = G.player; p.sitting = false; p.maxHp = p.hp = 999;
        let n = 0; while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
        const b = G.boss; if (!b || b.state !== 'idle') { out[key] = null; continue; }
        const dur = { shotTel: [], roar: [] }; let cur = null, len = 0;
        b.hp = Math.floor(b.maxHp / 2) + 1; b.hurt(1, p, 'g1');          // pasa a fase 2: rugido y luego ataques
        for (let i = 0; i < 3000; i++) { p.hp = 999; p.invulnT = 5; GAME.step(1, []);
          if (b.state === cur) len++; else { if (dur[cur]) dur[cur].push(len); cur = b.state; len = 1; } }
        out[key] = { roar: dur.roar[0] || null, shotTel: dur.shotTel[0] || null };
      }
      return out;
    });
    const t = r.tempestad, f = r.forjador;
    if (!t || !f || !t.shotTel || !f.shotTel || !t.roar || !f.roar) return { prep: { ok: false, motivo: `no se midieron los dos jefes: ${JSON.stringify(r)}` } };
    const ok = Math.abs(t.shotTel - f.shotTel) <= 1 && Math.abs(t.roar - f.roar) <= 1;
    return { prep: { ok: true }, ok, razon: t.shotTel * 2 <= f.shotTel + 1,
      detalle: `pasos de aviso de disparo (fase 2): Tempestad ${t.shotTel}, Forjador ${f.shotTel}; rugido: Tempestad ${t.roar}, Forjador ${f.roar} (esperado: iguales ±1)` };
  } },

  { id: 'M-09', nombre: 'Bancos dentro de arenas: sin encierro ni reinicio del jefe', pendiente: 'M-09', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, W = GAME.World, res = [];
      GAME.noEnemies = true;
      for (const r of W.rooms) {
        const bn = r.objs.find(o => o.type === 'bench'), bo = r.objs.find(o => o.type === 'boss');
        if (!bn || !bo) continue;
        G.newGame(); G.respawn = { room: r.id, tx: bn.tx, ty: bn.ty }; G.spawnAtRespawn(); G.state = 'play';
        GAME.step(30, []);
        res.push({ sala: r.id, tx: bn.tx, jefe: G.boss ? G.boss.state : 'ninguno', bloqueo: r.doors.some(d => d.kind === 'lock' && d.active) });
      }
      // sentarse en mitad del combate (Arena del Capataz)
      G.newGame(); GAME.warp('arenaCapataz', 9, 12); G.state = 'play'; const p = G.player; p.sitting = false; p.maxHp = 8; p.hp = 2;   // activa el combate lejos del banco
      let n = 0; while (n < 400 && !(G.boss && G.boss.state === 'idle')) { GAME.step(1, []); n++; }
      const activo = !!(G.boss && G.boss.state === 'idle');
      if (activo) { G.boss.hp = 5; p.x = W.byId.arenaCapataz.px + 5 * 16 - 5; p.vx = 0; GAME.step(5, []); GAME.step(1, ['up']); }
      return { res, activo, hp: p.hp, jefeHp: G.boss ? G.boss.hp : null };
    });
    if (!r.res.length || !r.activo) return { prep: { ok: false, motivo: `arenas con banco: ${r.res.length}; combate activo en el Capataz=${r.activo}` } };
    const encierran = r.res.filter(x => x.bloqueo);
    const reinicia = r.jefeHp !== 5;
    return { prep: { ok: true }, ok: !encierran.length && !reinicia, razon: encierran.length > 0 || reinicia,
      detalle: `al reaparecer, el combate empieza y cierra la puerta en ${encierran.length}/${r.res.length} arenas (${encierran.map(x => x.sala).join(', ')}); ` +
        `sentarse en combate: jugador ${r.hp} HP, jefe ${r.jefeHp} HP (esperado: 0 encierros y el jefe sigue en 5)` };
  } },

  { id: 'M-07', nombre: 'completed sobrevive a continueGame + saveGame', pendiente: 'M-07', async run(pg) {
    const r = await pg.ejecutar(() => {
      const G = GAME.Game, KEY = 'hojaCarmesi.save.v1';
      localStorage.setItem(KEY, JSON.stringify({ v: 1, level: 3, respawn: { room: 'antecamara', tx: 15, ty: 12 }, maxHp: 5,
        beaten: { guardian: true, heraldo: true, oraculo: true, forjador: true, tempestad: true, raiz: true, ecos: true }, secrets: ['celeste', 'cargado'], visited: ['antecamara'], playTime: 600, completed: true }));
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
