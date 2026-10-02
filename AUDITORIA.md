# Auditoría técnica — Hoja Carmesí: Ecos del Abismo

Fecha: 2026-10-02 · Alcance: todo el repositorio (11 archivos JS, 3.947 líneas en total) · Modo: solo lectura (el único archivo creado es este).

---

## 0. Reconocimiento (Fase 1)

### Stack y ejecución
- **HTML5 + JavaScript puro + Canvas 2D**, sin motor, sin librerías, sin `package.json` ni build. Audio sintetizado con **Web Audio API**. PWA a medias (manifest, sin service worker).
- Se ejecuta abriendo `index.html` (funciona por `file://`) o sirviendo la carpeta (`python3 -m http.server`). Los scripts se cargan en orden fijo con `?v=5` como cache-busting manual (`index.html:44-54`).
- Resolución lógica 480×272 escalada a pantalla (`main.js:3`, `main.js:13-29`).

### Estructura
| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `js/input.js` | 75 | Teclado, mando y entrada virtual (táctil) con «latch» por paso |
| `js/audio.js` | 206 | SFX y secuenciador de música chiptune (Web Audio) |
| `js/world.js` | 401 | Definición de las 22 salas (datos + constructor), rejilla de baldosas, `moveEntity` (colisión por ejes), `aabb` |
| `js/fx.js` | 89 | Partículas, anillos, arcos de corte, sacudida, hit-stop |
| `js/player.js` | 449 | Jugador (movimiento, dash, saltos, ataques, curación, pelo verlet, dibujo procedural) |
| `js/enemies.js` | 138 | Clase base `Enemy`, `Walker`, `Flyer` |
| `js/boss.js` | 193 | Jefe 1 (`Boss`), `Shockwave`, `Orb` |
| `js/level2.js` | 452 | `Mover`, `Crumble`, `Wind`, `BreakWall`, `Shielder`, `Turret`, `Seed`, `Feather`, `SunPillar`, jefe 2 `Herald` |
| `js/level3.js` | 400 | `Beam`, `Blink`, `CrystalSwitch`, `PrismRay`, `Prisma`, `Moth`, `CrystalShard`, `LightColumn`, jefe 3 `Oracle` |
| `js/main.js` | 1138 | **Todo lo demás**: pre-render de baldosas, guardado, objeto `Game` (estado, menús, salas, jefes, cámara, update), fondos, HUD, pantallas, bucle principal, ganchos de depuración |
| `js/touch.js` | 154 | Joystick/botones táctiles, pantalla completa, pausa en vertical |

- **Punto de entrada:** `main.js:1106-1118` (pre-render de salas + bucle `requestAnimationFrame`).
- **Escenas/estados:** `title`, `play`, `pause`, `dying`, `levelclear`, `ability`, `victory` (string en `Game.state`).
- **Niveles:** 3 niveles / 22 salas en coordenadas globales (`world.js:44-288`), 3 jefes, 5 secretos.
- **Guardado:** `localStorage` clave `hojaCarmesi.save.v1` (`main.js:189-194`).

### Ejecución real
No hay build, así que validé así (scripts en un directorio temporal, fuera del proyecto):
1. `node --check` en los 11 archivos: **sin errores de sintaxis**.
2. **Chrome headless** (CDP) cargando `index.html` por `file://`: **0 errores, 0 advertencias, 0 excepciones en consola**. Arranca en `title`, `newGame` pasa a `play`, y el bucle rAF avanza con normalidad.
3. Recorrido automático de las **22 salas** (entrar, simular 3 s, dibujar) usando los ganchos `window.GAME`: **todas OK, sin excepciones**.
4. Rendimiento: **≈2,6 ms por fotograma** (update + draw) en la sala más cargada (Cascadas), con Chrome headless a 1264×625. Holgado frente a los 16,7 ms disponibles.
5. Reproducción en tiempo de ejecución de los hallazgos C-01, A-01, A-02, M-07 y B-01 (resultados citados en cada uno).

Lo que **no** pude ejecutar: táctil real, mando físico, Safari/iOS y audio audible (el contexto de Web Audio en headless no se escucha). Los hallazgos de esas áreas salen solo del análisis del código.

---

## 1. Resumen ejecutivo

El juego **arranca, no da errores de consola y es jugable de principio a fin**. El núcleo es sorprendentemente sólido para ser código generado: paso fijo de 60 Hz con acumulador, colisiones con sub-pasos que impiden atravesar paredes, entrada con «latch» para no perder pulsaciones cortas, telegrafiado en todos los ataques de jefe y conexiones entre salas coherentes. Los problemas reales son pocos y están localizados: **1 crítico** (salir de la sala del jefe mientras muere se salta la pantalla de victoria, deja al jugador invulnerable ~99 s y, con el jefe final, **pierde el final del juego para siempre**), **2 altos** (las pulsaciones durante el hit-stop se pierden, y un respawn de pinchos sobre bloques de fase que mata al jugador en bucle), además de deuda técnica concentrada en `main.js` (1.138 líneas, objeto `Game` que lo hace todo), código duplicado entre jefes y renderizadores, y estado mutado desde el dibujo.

**Veredicto: vale la pena corregir; no hace falta reescribir.** Los 3 bugs graves se arreglan en 1-2 sesiones con cambios de pocas líneas. La refactorización de `main.js` conviene hacerla de forma incremental y solo si el juego va a crecer (más niveles o jefes), porque hoy la deuda no está bloqueando nada.

---

## 2. Tabla de hallazgos

| ID | Sev. | Categoría | Archivo:línea | Descripción | Evidencia (resumen) | Corrección propuesta | Esf. |
|---|---|---|---|---|---|---|---|
| C-01 | CRÍTICO | Funcionamiento / estados | `main.js:423-444`, `main.js:347-351`, `boss.js:117-122`, `level2.js:398-403`, `level3.js:350-355` | Si el jugador sale de la sala del jefe durante la animación de muerte, nunca se llama a `victory()`: no aparece «Nivel completado» ni «Victoria», queda invulnerable ~99 s y con el Oráculo **el final no se puede volver a ver ni se marca `completed`** | Reproducido: sale en 137 pasos (Guardián), 119 (Heraldo) y 146 (Oráculo); en ningún caso se pasa por `levelclear`/`victory`; `invulnT` sigue en 89-95 s | No abrir puertas hasta `victory()`, o llamar a `victory()` en `enterRoom` si el jefe estaba en `dying`; reiniciar `invulnT` en ambos casos | S |
| A-01 | ALTO | Input | `main.js:469`, `main.js:514`, `player.js:85-86`, `player.js:168` | Las pulsaciones y sueltas de botones durante el hit-stop (4-10 pasos tras cada golpe) se pierden: no se puede encadenar el combo ni cortar el salto en esa ventana | Reproducido: saltar durante el hit-stop → `vy=0`, sigue en el suelo (control sin hit-stop: `vy=-374`). Soltar salto durante el hit-stop → `canCut` sigue activo | No llamar a `Input.update()` en pasos congelados (el latch conserva la pulsación) o almacenar los «pressed» hasta consumirlos | S |
| A-02 | ALTO | Física / softlock parcial | `player.js:227-236`, `player.js:66-73`, `main.js:387-399` | `recordSafe` guarda como punto seguro un bloque de fase (baldosa de la rejilla). Si la fase cambia, el respawn de pinchos te deja en el aire sobre pinchos → bucle de daño hasta morir | Reproducido en Puente de las Fases: punto seguro en (19.7, 8), se cambia la fase → 7 golpes de pinchos en 10 s sin pulsar nada, de 8 HP a muerte | Excluir `room.phaseKeys` en `recordSafe`, y al reaparecer comprobar que hay suelo; si no, usar el punto seguro anterior o la entrada de la sala | S |
| M-01 | MEDIO | Física (latente) | `main.js:523` | Las plataformas móviles desplazan al jugador sin comprobar colisiones; hoy ningún recorrido choca con paredes, pero una sala nueva podría empotrarlo en un muro | `p.x += p.plat.dx; p.y += p.plat.dy;` sin `rectSolid` | Mover al jugador con `moveEntity` usando `dx/dy` de la plataforma, o validar con `rectSolid` | S |
| M-02 | MEDIO | Arquitectura | `main.js:795-799`, `main.js:829`, `main.js:886-889`, `level2.js:118` | Funciones de dibujo que modifican estado de juego (`o.prompt`, `o.near`, `flashT`): la lógica depende de que se dibuje y de los FPS | `drawObj` calcula `o.near`/`o.prompt` y el HUD los lee; `BreakWall.draw` resta `1/60` a `flashT` | Calcular proximidad en `update`; decrementar timers en `update(dt)` | S |
| M-03 | MEDIO | Máquina de estados | `touch.js:149`, `main.js:253, 274, 322, 435, 437, 455, 485, 492, 495, 501, 510, 548` | `Game.state` se asigna directamente desde 13 sitios, uno de ellos fuera del bucle (rAF propio de `touch.js`). No hay transiciones centralizadas (entrada/salida de estado) | `Game.state = 'pause'` desde `Touch.sync` | Método `Game.setState(s)` con hooks `enter/exit`; `touch.js` solo pide la pausa | M |
| M-04 | MEDIO | Calidad / SRP | `main.js:1-1138` | `main.js` mezcla pre-render de baldosas, guardado, menú, lógica de salas y jefes, cámara, fondos, HUD, 5 pantallas y ganchos de depuración | 1.138 líneas, objeto `Game` de ~890 líneas | Separar en `tiles.js`, `save.js`, `hud.js`, `screens.js`, `game.js` sin cambiar comportamiento | M |
| M-05 | MEDIO | Duplicación | `main.js:42-186`, `boss.js:11-20/110-123`, `level2.js:287-296/392-404`, `level3.js:254-263/344-356`, `enemies.js:34-40`, `level2.js:160-166` | Tres renderizadores de baldosas casi idénticos; el ciclo de vida de jefe (`hurt`/`set`/fase 2/muerte) copiado 3 veces; detección de bordes copiada en `Walker`/`Shielder` | Ver detalle | Paleta por tema + un solo renderizador; clase `BossBase` con `hurt`, `set`, `dying`; helper `groundAhead()` | M |
| M-06 | MEDIO | Acoplamiento / globales | `main.js:7-11`, `level2.js:3-9`, `enemies.js:48-49`, `boss.js:18,121`, `level2.js:110,292,294`, `level3.js:91,259,261` | Todo es global y depende del orden de carga; `const screen` oculta `window.screen`; `enemies.js` usa `drawOutlined` definido en `level2.js`; los jefes usan el global `Game` aunque reciben `game` | Ver detalle | Pasar `game` en lugar de usar el global; mover utilidades de dibujo a un archivo común; renombrar `screen` | S-M |
| M-07 | MEDIO | Guardado | `main.js:231-238`, `main.js:435`, `main.js:246`, `main.js:242` | Dos escritores con esquemas distintos: `saveGame()` reescribe todo **sin** `completed`, así que el «¡juego completado!» desaparece al sentarse en un banco. Hay dos campos de versión (`v:1`, `ver:2`, y `ver` no se lee nunca) y la «migración» de `completed` no hace nada | Reproducido: `completed: true` → `continueGame()` + `saveGame()` → `completed: undefined` | Un único `buildSave()` que incluya `completed` (o lo derive de `beaten.oraculo`); quitar `ver`; derivar `maxHp` de los secretos | S |
| M-08 | MEDIO | Lógica de progresión | `main.js:245, 255, 360, 376, 439-442`; `main.js:205` | El Salto Celeste se concede en 5 sitios distintos (parches para tapar C-01). `secrets` mezcla muros rotos, objetos y habilidades | `// Salvaguarda: en el Nivel 3 siempre se tiene el Salto Celeste…` | Tras arreglar C-01, una sola función `grantAbility()`; separar `abilities`, `pickups` y `walls` | S |
| B-01 | BAJO | Combate | `boss.js:12`, `player.js:292` | El Guardián devuelve `undefined` (no `false`) en `dormant`/`intro`/`dying`, así que golpearlo mientras muere da energía; los otros jefes devuelven `false` | Reproducido: energía 0 → 11 golpeando al Guardián en `dying` | `return false;` en `Boss.hurt` | S |
| B-02 | BAJO | Loop / FPS | `main.js:987-991`, `level2.js:118` | Animaciones avanzadas por fotograma de render, no por paso: el arco del título va 2,4× más rápido a 144 Hz | `for (const s of FX.slashes) { s.t += 1 / 60; …}` dentro de `draw` | Avanzar en `update(dt)` | S |
| B-03 | BAJO | Código muerto / artefactos de IA | `player.js:192`, `player.js:278`, `boss.js:28,125`, `main.js:971`, `level2.js:71`, `input.js:73` | Ternario con ramas idénticas, `x = x && false`, variable `grav` siempre `true`, `const r` sin uso, `inWind`/`usingPad` que no se leen nunca | Ver detalle | Eliminar | S |
| B-04 | BAJO | Números mágicos | `main.js:212,250,320`, `level2.js:286`, `main.js:226-228`, `enemies.js:43`, `boss.js:125` | Respawn por defecto repetido 3 veces; `arenaR = 31*TILE` fijo en el Heraldo (los demás usan `room.w`); valores de mejoras y gravedad de enemigos sueltos | `this.respawn = { room: 'santuario', tx: 14, ty: 15 }` ×3 | Constantes con nombre (`DEFAULT_RESPAWN`, `UPGRADES`, `E.GRAV`) | S |
| B-05 | BAJO | UX / pulido | `main.js:495`, `main.js:1036-1044`, `audio.js:5` | La pausa no permite volver al título ni reiniciar; `prefs.vol` existe pero no hay control de volumen; los controles no se pueden configurar | La pausa solo reanuda o silencia | Menú de pausa con «Volver al título» y volumen | S-M |
| B-06 | BAJO | Input / estados | `input.js:29` | En escritorio, al perder el foco se sueltan las teclas pero el juego sigue corriendo (el jugador recibe daño sin poder reaccionar) | El handler de `blur` no pausa | Pausar en `blur` si `state === 'play'` | S |
| B-07 | BAJO | Publicación | `main.js:1120-1138`, `main.js:366` | Los ganchos de depuración (`warp`, `noEnemies`, `setManual`) están expuestos en producción | `window.GAME = { … warp(roomId, tx, ty) …}` | Activarlos solo con `?debug` | S |
| B-08 | BAJO | Publicación / PWA | `index.html:21-24`, `manifest.webmanifest:13-16` | Instalada como PWA no funciona sin conexión (no hay service worker). El icono «maskable» reutiliza el de 512 px (sospecha: sin zona segura) | No existe ningún `serviceWorker.register` | SW mínimo de caché, o dejar de prometer modo offline; icono maskable propio | S |
| B-09 | BAJO (sospecha) | Audio / memoria | `audio.js:178` | `setTargetAtTime` en cada fotograma podría acumular eventos de automatización en algunas implementaciones | 60 llamadas/s sin `cancelScheduledValues` | Confirmar con perfilado de 30 min; aplicar solo cuando cambie `duck` | S |
| B-10 | BAJO | Licencias / identidad | `LEEME.md:53`, raíz | No hay archivo de licencia. Mecánicas, nombres y vocabulario muy cercanos a Hollow Knight («Reino Hueco», máscaras, alma, bancos; el LEEME lo cita) | `(como en Hollow Knight)` | Añadir LICENSE; revisar la nomenclatura antes de publicar comercialmente | S |
| B-11 | BAJO | Nomenclatura | `player.js:8`, `main.js:201-202`, `level3.js:19`, `main.js:387` | El mismo concepto con nombres distintos (`soul`/«energía»/«alma») y un mismo nombre para conceptos distintos (`phase` = fase del jefe, bloque de fase y desfase de un haz) | Ver detalle | Renombrar (`energy`, `phaseOffset`, `phaseBlocks`) | S |
| B-12 | BAJO (sospecha de diseño) | Combate | `player.js:283-297` | Los hitboxes de ataque atraviesan paredes: se puede golpear el interruptor de Puente de las Fases a través de la barrera | `checkHits` solo usa `aabb`, sin comprobar `rectSolid` | Decidir si es intencional (ver pregunta 2) | S |

**Conteo:** CRÍTICO 1 · ALTO 2 · MEDIO 8 · BAJO 12 · **Total 23**

---

## 3. Detalle y evidencia de cada hallazgo

### C-01 · Salir de la sala del jefe durante su muerte se salta la victoria (CRÍTICO)

`bossDefeated` abre las puertas en el mismo instante en que empieza la animación de muerte y deja al jugador invulnerable ~99 s, esperando a que `victory()` lo resetee:

```js
// main.js:423-430
bossDefeated(b) {
  this.beaten[b.key || 'guardian'] = true; this.slowT = 1.8;
  this.hazards = this.hazards.filter(h => h.persistent); this.player.invulnT = 99;
  this.syncDoors();          // ← abre la puerta de bloqueo y la de salida YA
  this.saveGame();
```

`victory()` solo la llama el propio jefe al terminar `dying` (1,8-2,0 s después):

```js
// boss.js:117-122 (igual en level2.js:398-403 y level3.js:350-355)
if (this.st > 1.8 && !this.dead) {
  this.dead = true; …
  Game.victory(this);
}
```

Pero al cruzar a otra sala, `enterRoom` destruye al jefe, y como ya figura en `beaten` no se vuelve a crear:

```js
// main.js:349-351, 375
this.resetBossEncounter();
this.room = World.cur = room;
this.enemies = []; this.hazards = []; this.objs = []; this.boss = null;
…
else if (o.type === 'boss' && !this.beaten[o.boss]) this.boss = …
```

**Reproducción (Chrome headless + `window.GAME`)**: se golpea al jefe con 1 HP y se mantiene la dirección hacia la salida.

| Jefe | Pasos hasta salir | Estados vistos | `invulnT` restante | Consecuencia |
|---|---|---|---|---|
| Guardián | 137 (2,3 s) | solo `play` | 89,1 s | Sin «NIVEL 1 COMPLETADO» |
| Heraldo | 119 (2,0 s) | solo `play` | 94,8 s | Sin pantalla de nivel; la pluma se recupera gracias a un parche (M-08) |
| Oráculo | 146 (2,4 s) | solo `play` | — | Sin pantalla de victoria; `completed` nunca se guarda; al volver, el jefe no existe → **el final se pierde para siempre en esa partida** |

Encaja en CRÍTICO porque rompe la progresión de forma irreversible (el final) y deja un estado roto visible (el jugador parpadea e ignora el daño durante 99 s).
**Corrección (S):** la opción más simple es no llamar a `syncDoors()` en `bossDefeated` y moverlo a `victory()`. Como alternativa, en `enterRoom`, si `this.boss?.state === 'dying'`, llamar antes a `this.victory(this.boss)`.

### A-01 · Pulsaciones perdidas durante el hit-stop (ALTO)

```js
// main.js:467-469 y 514
update(dt) {
  this.t += dt;
  Input.update();                    // ← consume el latch y calcula pressed/released
  …
  if (FX.hitStop > 0) { FX.hitStop--; FX.update(dt * 0.25); return; }   // ← sale sin llamar a player.update
```

`pressed()` solo vale `true` durante un paso, y el jugador solo lo lee en `player.update` (`player.js:85-86`: `jumpBuf`, `atkBuf`; `player.js:168`: corte de salto). Cada golpe provoca entre 4 y 10 pasos de hit-stop (`player.js:299`, `player.js:50`), justo la ventana en la que el jugador pulsa para encadenar el combo.

**Reproducción:** saltar sin hit-stop da `vy = -374,5`. Con `FX.hitStop = 5` y salto en el 2.º paso congelado da `vy = 0` y sigue en el suelo. Soltar el salto durante el hit-stop deja `canCut = true`, así que el salto sale a altura máxima aunque se haya soltado.
**Corrección (S):** mover `Input.update()` después del bloque de hit-stop. El latch de `input.js` conserva la pulsación hasta el siguiente paso real.

### A-02 · Punto seguro sobre bloque de fase → bucle de pinchos (ALTO)

```js
// player.js:227-236
recordSafe() {
  if (this.plat) return;            // excluye plataformas dinámicas (Mover/Crumble/Blink)…
  …
  if ((a === T_SOLID || a === T_PLAT) && (b === T_SOLID || b === T_PLAT)) { this.safe.x = this.x; this.safe.y = this.y; }
}
```

Los bloques de fase **no** son objetos dinámicos: se escriben en la rejilla como `T_SOLID` (`main.js:393`), así que cuentan como suelo seguro. Al tocar pinchos, `player.js:68-70` te devuelve a `safe` sin comprobar que el suelo siga ahí.

**Reproducción:** en Puente de las Fases, con la fase azul, de pie sobre el bloque (19,8) (desde ahí se alcanza el cristal con un tajo hacia la izquierda), se alterna la fase: 7 golpes de pinchos en 10 s sin ninguna entrada, de 8 HP a `dying`. Con habilidad se puede escapar (doble salto hacia el pilar), así que no es un bloqueo total, pero es una trampa que mata sin culpa del jugador.
**Corrección (S):** en `recordSafe`, ignorar las baldosas incluidas en `World.cur.phaseKeys`. Al reaparecer, si `!World.rectSolid(x, y+h, w, 1)`, usar el último punto seguro válido.

### M-01 · Plataforma móvil sin colisión (MEDIO, latente)

```js
// main.js:523
if (p.plat && p.plat.solid && p.spikeT <= 0) { p.x += p.plat.dx; p.y += p.plat.dy; }
```
Revisé los 4 `mover` actuales (`world.js:125, 138, 151`): ninguno empuja al jugador contra un muro, así que hoy no se manifiesta. Sí ocurrirá al diseñar salas nuevas.

### M-02 · Estado mutado en el dibujo (MEDIO)

```js
// main.js:795-799 (dentro de drawObj)
if (!p.sitting && aabb(p, {...})) { …; o.prompt = true; } else o.prompt = false;
// main.js:829
o.near = Math.abs(this.player.cx - (x + 4)) < 30 && …;
// main.js:886-889 (HUD) lee o.near / o.prompt
// level2.js:118 (BreakWall.draw)
if (this.flashT > 0) this.flashT -= 1 / 60;
```

### M-03 · Máquina de estados dispersa (MEDIO)

Hay 13 asignaciones directas a `Game.state` (lista en la tabla). La más delicada:
```js
// touch.js:149 — se ejecuta en un requestAnimationFrame propio, fuera de Game.update
if (document.body.classList.contains('touch') && isPortrait() && Game.state === 'play') { Game.state = 'pause'; releaseAll(); }
```
No causa bugs hoy, pero cualquier lógica de entrada o salida de estado (detener timers, música, input) tendrá que duplicarse en cada sitio.

### M-05 · Duplicación (MEDIO)

- `renderRoomTiles` / `renderDayTiles` / `renderCrystalTiles` (`main.js:42-186`): ~140 líneas con la misma estructura (ladrillos, bordes, pinchos, plataformas), cambian solo los colores.
- Ciclo de vida de jefe repetido:
```js
// boss.js:14-18
if (!this.phase2 && this.hp <= this.maxHp / 2) { this.phase2 = true; this.set('roar'); FX.shake(6, 0.6); FX.ring(...); }
if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
// level2.js:290-294 y level3.js:257-261: idéntico salvo color
```
- Detección de borde/pared/pinchos: `enemies.js:35-40` y `level2.js:160-164`, el mismo bloque.
- AABB escrito a mano en lugar de `aabb()`: `level2.js:48`, `level3.js:69`.

### M-06 · Globales y acoplamiento (MEDIO)

```js
// main.js:7 — oculta window.screen en todo el ámbito global
const screen = document.getElementById('screen');
// touch.js:122 — tuvo que esquivarlo explícitamente
const o = window.screen && window.screen.orientation;
```
- `enemies.js:48-49` (`Walker.draw`) llama a `drawOutlined`, definido en `level2.js:5`, que se carga después. Funciona solo porque el dibujo ocurre más tarde.
- Los jefes reciben `game` en `update(dt, game)` pero usan el global `Game` en `boss.js:18,121`, `level2.js:110,292,294` y `level3.js:91,259,261`.
- Nota: pasar a módulos ES **rompe la ejecución por `file://`** (ver pregunta 10).

### M-07 · Guardado con dos escritores (MEDIO)

```js
// main.js:232-236 — no incluye completed
Save.write({ v: 1, ver: 2, level: …, respawn: …, maxHp: …, secrets: […], beaten: …, playTime: …, visited: … });
// main.js:435 — único sitio que añade completed
Save.write(Object.assign(Save.load() || {}, { v: 1, completed: true }));
// main.js:246 — no hace nada: borra de la copia local d, que se descarta
if (d.completed && !this.beaten.oraculo) delete d.completed;
```
**Reproducción:** con un guardado que tiene `completed: true`, al hacer `continueGame()` + `saveGame()` (sentarse en un banco) queda `completed: undefined`, y el título deja de mostrar «¡juego completado!».
Además, `maxHp` se guarda como número en lugar de derivarse de `shard*` en `secrets`. Un guardado sin `maxHp` (`main.js:242`, `|| 5`) pierde las máscaras aunque los fragmentos estén recogidos.

### M-08 · Habilidad concedida en 5 sitios (MEDIO)

```js
// main.js:245  migración en continueGame
// main.js:255  aviso + guardado
// main.js:360  «Salvaguarda: en el Nivel 3 siempre se tiene el Salto Celeste…»
// main.js:376  reaparición del objeto 'celeste' si beaten.heraldo
// main.js:439-442  generación en victory()
```
Son parches acumulados alrededor de C-01. `secrets` (`main.js:205`, `main.js:267`, `main.js:542`) guarda a la vez IDs de muros (`muroCascada`), objetos (`shard`) y habilidades (`celeste`).

### B-03 · Código muerto y artefactos de IA (BAJO)

```js
// player.js:278 — las dos ramas del ternario son iguales
y: (this.atk.type === 'down' ? this.y + this.h : this.y + this.h) + by
// player.js:192 — equivale a «= false»
if (this.hitWallL || this.hitWallR) { if (!this.onGround) this.dashMomentum = this.dashMomentum && false; }
// boss.js:28 / 125 — grav nunca se pone a false
let grav = true; … if (grav) this.vy = …
// main.js:971 — variable sin uso
const r = World.byId.guardian;
// level2.js:71 / main.js:524 — p.inWind se escribe y nunca se lee
// input.js:73 — usingPad se expone y nunca se lee
```
También `djT` y `plat` se usan en `Player` sin inicializarse en `reset()` (`player.js:81`, `player.js:219`).

### B-11 · Nomenclatura (BAJO)
`soul` en el código, «energía» en la UI (`main.js:201-202`), «alma» en los comentarios (`main.js:836`). `phase` significa tres cosas: `boss.phase2`, `room.phases` (bloques) y `Beam.phase` (desfase temporal, `level3.js:19`).

---

## 4. Revisión por área (Fase 2): lo que se comprobó

**A. Funcionamiento.** No hay referencias rotas, assets inexistentes ni excepciones (22 salas probadas). No hay TODO, FIXME ni funciones vacías o simuladas. Revisé a mano las aberturas de las 22 salas: todas coinciden con su vecina. Softlocks: solo A-02 (parcial). El resto de mecanismos que podrían encerrar al jugador (bloques de fase, plataformas intermitentes, losas) esperan a que el jugador salga antes de volverse sólidos (`main.js:398`, `level3.js:69`, `level2.js:48`).

**B. Núcleo.**
- *Loop:* paso fijo de 1/60 con acumulador, tope de 0,1 s y máximo de 5 pasos por fotograma (`main.js:1108-1117`). La simulación **no** depende de los FPS, salvo los detalles cosméticos de B-02.
- *Colisiones:* sub-pasos de 4 px (`world.js:344, 357`). Velocidades máximas por paso: dash 4,25 px, caída 6,5 px, jefe en picado 9,3 px (con posición directa contra `floorY`). No se atraviesan paredes. Los proyectiles se mueven ≤3,2 px por paso contra muros de 16 px.
- *Input:* el latch evita perder pulsaciones cortas; `blur` y `visibilitychange` sueltan las teclas; hay mando y multitáctil. Fallos: A-01, B-06, sin controles configurables (B-05).
- *Estados:* C-01, M-03.

**C. Rendimiento.** ≈2,6 ms/fotograma. Las entidades y proyectiles se vacían al cambiar de sala (`main.js:351`). Los listeners se registran una sola vez y no hay temporizadores huérfanos (solo un `setTimeout` puntual en `main.js:429`). Se crean arrays con `filter` y gradientes en cada paso: churn menor, no merece la pena tocarlo a esta escala. Lienzos pre-renderizados: ~12.300 baldosas, unos 12,6 MB de memoria de canvas, aceptable. No hay assets externos en tiempo de juego (los iconos solo los usa el manifest). `screenshots/` (2,9 MB) no se carga nunca.

**D. Calidad.** M-04, M-05, M-06, B-03, B-04, B-11.

**E. Jugabilidad y balance (según los valores del código).**
- Jugador: 5 máscaras (+3 fragmentos = 8), invulnerabilidad de 1,3 s tras recibir daño, todo el daño recibido es 1 (contacto, proyectiles, pinchos, jefes).
- Ofensiva: 1 de daño por tajo (2 el tercer golpe del combo) → combo completo = 4 de daño en ~0,8 s.
- Energía: 11 por golpe y curar cuesta 33 (3 curas con el orbe lleno, una cada 3 golpes). Con el Cristal: 17 por golpe y 0,62 s de curación. Con la Vasija: 24 (4 curas).
- Enemigos: 2-4 HP. Jefes: 36 → 44 → 52 HP con fase 2 al 50 %.
- Curva: la dificultad sube solo por patrones y velocidad (fase 2 ×1,25-1,35). El daño nunca aumenta y la invulnerabilidad es generosa, así que el nivel 3 probablemente se sienta más fácil de lo que parece. Morir solo cuesta volver al banco (sin pérdida de recursos). Ver preguntas 3 y 6.
- Retroalimentación: buena. Hay SFX para cada acción, hit-stop, sacudida, partículas, barra de jefe, carteles, toasts, pantallas de pausa, muerte, nivel y victoria, y minimapa.
- Guardado: existe y es robusto ante JSON corrupto (`main.js:191`), pero tiene los problemas de M-07. Los objetos recogidos no se guardan hasta el siguiente banco (ver pregunta 4).

**F. Seguridad y publicación.** No hay llamadas de red, claves ni tablas de puntuación. `localStorage` es manipulable, pero es irrelevante en un juego local. No hay librerías de terceros: todo el arte y el audio son procedurales. Pendiente: B-07, B-08, B-10.

---

## 5. Lo que está bien hecho

- Bucle de paso fijo correcto, con protección contra la espiral de la muerte.
- Colisión por ejes con sub-pasos: no se atraviesan paredes.
- Sensación de control trabajada: coyote time, buffer de salto, corte de salto, flotación en el ápice, dash sostenido, pogo y salto de pared.
- Entrada con latch, multitáctil y mando. Se sueltan las teclas al perder el foco.
- Todos los ataques de jefe están telegrafiados (marcas, parpadeo, líneas de aviso) y la lluvia de cristales siempre deja huecos.
- Los bloques que reaparecen esperan a que el jugador salga (no lo aplastan).
- Lectura del guardado envuelta en `try/catch` con validación de versión y de sala.
- Audio desbloqueado correctamente en iOS, suspendido con la pestaña oculta, preferencia de silencio persistente.
- Sin dependencias, sin errores de consola, todas las salas conectadas.
- Ganchos de prueba deterministas (`GAME.setManual`, `step`): permitieron reproducir todos los bugs de este informe y son una buena base para tests de regresión.

---

## 6. Plan de remediación por bloques

Orden pensado para que cada bloque sea independiente, quepa en una sesión y se pueda verificar. Primero lo que rompe la partida, después la deuda que estorba al seguir desarrollando y al final el pulido.

### Bloque 0 · Red de seguridad (tests de regresión)
- **Objetivo:** tener un script de regresión reproducible antes de tocar nada.
- **Resuelve:** ningún hallazgo directamente; es la base para verificar los demás.
- **Archivos:** nuevo `tests/regresion.mjs` (Chrome headless + CDP con los ganchos `window.GAME`, como el usado en esta auditoría) y opcionalmente `tests/README.md`.
- **Verificación:** el script recorre las 22 salas sin excepciones y **falla** hoy en los casos de C-01, A-01, A-02, M-07 y B-01 (estado rojo esperado).

### Bloque 1 · Cierre correcto del combate contra jefes
- **Objetivo:** que la victoria siempre se dispare y el jugador no quede invulnerable.
- **Resuelve:** C-01, B-01 (y prepara M-08).
- **Archivos:** `main.js` (`bossDefeated`, `victory`, `enterRoom`), `boss.js:12`.
- **Verificación:** el test «salir durante `dying`» de los 3 jefes ve `levelclear`/`victory`, `invulnT ≤ 1,3` y `completed: true` tras el Oráculo. Golpear al Guardián moribundo no da energía. Partida manual completa de un jefe.

### Bloque 2 · Entrada durante el hit-stop
- **Objetivo:** no perder ninguna pulsación ni suelta.
- **Resuelve:** A-01.
- **Archivos:** `main.js` (`update`, orden de `Input.update()` respecto al hit-stop y a `dying`).
- **Verificación:** test «saltar en el paso 2 del hit-stop» → el jugador salta al terminar. Soltar el salto durante el hit-stop recorta la altura. Manual: el combo de 3 golpes se encadena siempre al machacar el botón.

### Bloque 3 · Punto seguro robusto
- **Objetivo:** que el respawn de pinchos siempre aterrice sobre suelo existente.
- **Resuelve:** A-02.
- **Archivos:** `player.js` (`recordSafe`, respawn de pinchos), lectura de `room.phaseKeys`.
- **Verificación:** test `phaseLoop` → como mucho 1 golpe de pinchos y el HP no sigue bajando. Manual en Puente de las Fases, Atrio y Relicario.

### Bloque 4 · Guardado unificado y progresión de habilidades
- **Objetivo:** un único formato de guardado y una única vía para conceder habilidades.
- **Resuelve:** M-07, M-08.
- **Archivos:** `main.js` (`Save`, `saveGame`, `continueGame`, `victory`, `enterRoom`, `applyUpgrades`).
- **Verificación:** `completed` sobrevive a un banco; un guardado antiguo (v1 sin `maxHp`) carga con las máscaras correctas; el Salto Celeste solo se concede en `grantAbility()` (búsqueda de texto); los tests de los bloques 1-3 siguen en verde.
- **Depende de:** Bloque 1 (sin C-01 arreglado, los parches de M-08 aún hacen falta).

### Bloque 5 · Máquina de estados centralizada y opciones de pausa
- **Objetivo:** transiciones de estado en un solo sitio, y que la pausa sea útil.
- **Resuelve:** M-03, B-06, B-05.
- **Archivos:** `main.js` (`setState`, `drawPause`, menú de pausa), `touch.js:149`, `input.js` / `audio.js` (volumen).
- **Verificación:** búsqueda de `\.state = '` → solo dentro de `setState`; perder el foco en escritorio pausa; desde la pausa se puede volver al título; girar el móvil a vertical sigue pausando.

### Bloque 6 · Separar lógica y dibujo; independencia de FPS
- **Objetivo:** que `draw()` no modifique estado.
- **Resuelve:** M-02, B-02.
- **Archivos:** `main.js` (`drawObj`, `drawHUD`, `drawTitleBg`), `level2.js` (`BreakWall`).
- **Verificación:** el test de regresión corre sin llamar a `draw()` y los carteles y avisos de banco se siguen calculando; manual a 60 y 144 Hz (o con throttling de CPU) con la misma velocidad de animación en el título.

### Bloque 7 · Plataformas móviles con colisión
- **Objetivo:** que una plataforma nunca empotre al jugador en un muro.
- **Resuelve:** M-01.
- **Archivos:** `main.js:523`, `world.js` (`moveEntity` o un helper).
- **Verificación:** test con una sala de prueba en la que un `mover` atraviesa una pared → el jugador es empujado o se suelta, pero nunca queda dentro de baldosas sólidas.

### Bloque 8 · Refactor de `main.js` y deduplicación (dividir en 3 sesiones)
- **8a:** sacar el pre-render de baldosas a `tiles.js` con un solo renderizador y una paleta por tema (M-05, parte de M-04).
- **8b:** clase `BossBase` con `hurt`/`set`/fase 2/`dying`; los jefes reciben `game` en lugar del global (M-05, M-06).
- **8c:** `save.js`, `hud.js`, `screens.js`; renombrar `screen`; mover `drawOutlined` y `OUTLINE` a un archivo común; constantes con nombre; eliminar código muerto (M-04, M-06, B-03, B-04, B-11).
- **Verificación de cada sesión:** los tests de regresión en verde, comparación visual con `screenshots/` en las mismas salas y 0 errores de consola.
- **Depende de:** Bloques 0-4. Conviene hacerlo solo si el juego va a crecer (pregunta 7).

### Bloque 9 · Preparación para publicar
- **Objetivo:** dejarlo listo para distribuirlo.
- **Resuelve:** B-07, B-08, B-09, B-10, B-12 (según las respuestas a las preguntas).
- **Archivos:** `main.js:1120-1138`, `index.html`, nuevo `sw.js`, `manifest.webmanifest`, nuevo `LICENSE`, `audio.js:178`.
- **Verificación:** `window.GAME` no existe sin `?debug`; Lighthouse PWA con modo offline correcto (si se decide hacer SW); perfil de memoria de audio estable durante 30 min.

---

## 7. Preguntas abiertas (decisiones de diseño)

1. **Victoria del jefe:** ¿prefieres que las puertas sigan cerradas hasta que termine la animación de muerte (más simple), o que se pueda salir y la pantalla de victoria aparezca igual?
2. **Golpear a través de paredes (B-12):** ¿es intencional poder activar el cristal de Puente de las Fases a través de la barrera azul? Si no lo es, ¿hay otra forma prevista de volver atrás desde el lado este con la fase azul activa?
3. **Penalización por morir:** ahora mismo morir solo te devuelve al banco. ¿Quieres una penalización (perder energía, una «sombra» a recuperar, etc.)?
4. **Persistencia de objetos:** los fragmentos y el Cristal recogidos no se guardan hasta el siguiente banco (si se cierra la pestaña, se pierden). ¿Es intencional (estilo Hollow Knight) o deben guardarse al recogerlos?
5. **Plataforma de publicación:** ¿GitHub Pages (hay `.nojekyll`), itch.io, PWA instalable o tiendas? Decide si hace falta service worker y modo offline real.
6. **Curva de dificultad:** ¿es intencional que todo el daño sea 1 en los tres niveles y que la dificultad dependa solo de los patrones?
7. **Futuro del proyecto:** ¿habrá más niveles o jefes? Si no, el Bloque 8 (refactor) se puede posponer indefinidamente.
8. **Opciones:** ¿hacen falta controles configurables, volumen separado de música y SFX, o accesibilidad (reducir sacudida y destellos)?
9. **Identidad y licencia:** ¿se va a publicar comercialmente? En ese caso conviene revisar nombres como «Reino Hueco» o «máscaras» y elegir licencia.
10. **Ejecución por `file://`:** ¿es requisito mantener que el juego funcione abriendo `index.html` directamente? Si lo es, no se pueden usar módulos ES y la refactorización tendrá que seguir con scripts clásicos (con un espacio de nombres para no contaminar el global).
