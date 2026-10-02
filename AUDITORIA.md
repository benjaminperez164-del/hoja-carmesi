# Auditoría técnica — Hoja Carmesí: Ecos del Abismo

| | |
|---|---|
| Auditoría original | 2026-10-02 sobre `d68ef4d` (22 salas, 11 archivos JS) |
| Actualización | 2026-10-02 sobre `c54d4d7` (59 salas, 12 archivos JS, 5.180 líneas de JS) |
| Modo | Solo lectura del juego. Se crean únicamente este archivo y `tests/` |
| Referencias | **Todas las referencias `archivo:línea` de este documento corresponden a `c54d4d7`**, salvo donde se indica |
| Pruebas | `node tests/regresion.mjs` (ver [tests/README.md](tests/README.md)) |

---

## Actualización a c54d4d7 (leer primero)

### U.0 Registro de correcciones

| Bloque | Commit | Hallazgos corregidos | Verificación |
|---|---|---|---|
| 1 · Desbloquear la Galería | `ee8b5e1` | C-02 | Casos C-02 ×3 (progresión del mapa, Pozo→Galería, Cámara del Rayo) en verde |
| 2 · Cierre de jefes | `ecd53ce` | C-01, A-03, B-01, A-06 | Casos C-01 ×9, B-01 ×2, A-03 y A-06 en verde; comprobado que todos fallan con el código anterior |

Estado de la suite tras el Bloque 2: **17 PASA · 8 ROJO ESPERADO · 0 FALLA · 0 ERROR · 0 ANOMALÍA**. Pendientes: A-01 (×3), A-02, A-04, A-05, M-09, M-07.

**Cómo quedó el cierre de jefes (Bloque 2):**
- Una sola tabla de jefes principales: `MAIN_BOSSES` (`main.js:301`).
- `bossDefeated` ya no abre puertas ni programa el sonido de la puerta (`main.js:619-625`).
- `victory()` es el cierre único e idempotente (`main.js:626-652`): abre puertas, suena la puerta, `invulnT = 0`, y muestra pantalla (principales) o aviso (minijefes).
- `MiniBoss` siempre llega a ese cierre (`expand.js:156`).
- Defensa: `resetBossEncounter` (que usan `enterRoom`, la reaparición y la partida nueva) cierra antes al jefe que esté en `dying` (`main.js:527`).
- B-01: `Boss.hurt` devuelve `false` (`boss.js:12`). El resto de jefes ya lo hacía, y la onda del Sable respeta ese `false`.
- A-06: la Tempestad delega los estados que no gestiona antes de sumar temporizadores (`expand.js:209`). No hay otros temporizadores contados dos veces: Forjador, Raíz y Ecos no suman antes de delegar.

### U.1 Qué se revisó y cómo

- **Delta auditado:** `d68ef4d..c54d4d7`, 6 commits: pulido visual, menú de pausa (mapa, colección, controles), Sable Cargado y sellos de cristal, expansión de N1–N3 con N4–N6 y el jefe final Ecos (`js/expand.js`, nuevo), y el arreglo del softlock en los pozos verticales. En total, **+1.833 / −282 líneas en 14 archivos** de código, más 36 capturas nuevas.
- Se comprobó que la copia usada en la auditoría original coincide byte a byte con `d68ef4d` (44 archivos).
- Ejecución: los tests del Bloque 0 sin modificar contra `c54d4d7` → los 8 rojos siguen fallando por la causa documentada; el humo marca ERROR de preparación porque ahora hay 59 salas. Después se adaptaron y ampliaron los tests (U.8).
- **Dos análisis automáticos nuevos**, incorporados a los tests:
  1. **Conectividad del mapa:** inundado del hueco del jugador (1×2 baldosas) sobre la rejilla global desde el banco inicial, sin gravedad. Es una condición necesaria: si marca una sala como inalcanzable, no existe ningún camino físico. Validado con `d68ef4d`, donde solo marca los dos secretos situados detrás de muros rompibles.
  2. **Arenas que encierran:** con las puertas activas, inundado desde el jefe para ver si se alcanza alguna baldosa fuera de la sala.
- Cada hallazgo nuevo con caso de test se reprodujo en Chrome headless. Además se comprobó, en una copia fuera del repositorio, que con correcciones provisionales todos los casos pendientes pasan a verde.

### U.2 Resumen ejecutivo actualizado

La versión actual **arranca sin errores de consola, y las 59 salas cargan y se simulan sin excepciones**, pero **una partida nueva no se puede completar**. La alcoba del Sable Cargado añadida en `44627a5` se construyó encima del único pasillo de entrada a la Galería Suspendida (C-02). Desde el Pozo del Eco el jugador entra en un bolsillo de una baldosa y no puede seguir. Las 53 salas posteriores (todo el N1 a partir de la Galería, y del N2 al N7) son inalcanzables. Además, la ruta pasa por el sello de cristal, que solo rompe el Sable, que se obtiene en el N3: una dependencia circular.

**Ninguno de los 23 hallazgos originales se corrigió.** Uno cambió parcialmente: la pausa ahora tiene mapa, colección y controles (B-05). Varios empeoraron porque la expansión copió los mismos patrones:
- **C-01** afecta ahora a 7 jefes.
- **A-01** afecta también al Sable.
- `main.js` pasó de 1.138 a 1.744 líneas.
- El ciclo de vida de jefe está copiado 5 veces.

La expansión trae 8 hallazgos nuevos:
- **1 crítico:** C-02, la Galería bloqueada.
- **4 altos:**
  - A-03: los 6 minijefes dejan al jugador invulnerable ~99 s.
  - A-04: la Arena Áurea no encierra, y el minijefe se puede saltar.
  - A-05: con el Sable, cada tajo sale al soltar el botón, con un retraso igual al tiempo pulsado.
  - A-06: la Tempestad ejecuta sus avisos y su rugido al doble de velocidad.
- **1 medio:** M-09, bancos dentro de 5 arenas que encierran al reaparecer.
- **2 bajos:** contenido repetido en N4–N6 y el mapa de pausa sin el nivel 7.

**Veredicto:** sigue valiendo la pena corregir y no reescribir, pero **el orden cambia**. Lo primero ahora es desbloquear la Galería (un cambio de datos de pocas líneas en `world.js`). Sin eso no se puede jugar ni probar a mano nada posterior al Pozo del Eco. El resto de bugs graves siguen siendo cambios pequeños y localizados. La deuda técnica creció bastante con la expansión: si se van a añadir más zonas, el refactor del Bloque 8 conviene adelantarlo, porque cada zona nueva hoy se hace copiando y pegando datos y clases.

### U.3 Estado de los 23 hallazgos originales

| ID | Sev. | Estado en c54d4d7 | Archivo:línea actual | Nota / reverificación |
|---|---|---|---|---|
| C-01 | CRÍTICO | **Corregido** (`ecd53ce`) · antes: sigue, ampliado | `main.js:616-623`, `main.js:534-538`, `main.js:624-647`, `boss.js:117-123`, `level2.js:477-483`, `level3.js:353-359`, `expand.js:149-160` | Test: rojo en los 7 jefes con pantalla de nivel (Guardián, Heraldo, Oráculo, Forjador, Tempestad, Raíz, Ecos). Con Ecos, `completed` nunca se escribe y se pierden los créditos |
| A-01 | ALTO | **Sigue, ampliado** | `main.js:673`, `main.js:770`, `player.js:87`, `player.js:92-97`, `player.js:196` | Tests A-01a/b en rojo. Nuevo A-01c: con el Sable, la pulsación de ATACAR durante el hit-stop también se pierde (ni tajo ni carga) |
| A-02 | ALTO | Sigue | `player.js:255-264`, `player.js:68-73`, `main.js:580-593` | Test en rojo (7 golpes de pinchos en 10 s, muere). La sala nueva con bloques de fase (Umbral de Luz) no tiene pinchos debajo: no hay más casos |
| M-01 | MEDIO | Sigue (latente) | `main.js:779` | Revisados los 5 `mover` nuevos (Cresta y los tres puentes de N4–N6): ninguno empuja contra un muro |
| M-02 | MEDIO | Sigue, ampliado | `main.js:1132-1137`, `main.js:1179`, `main.js:1245-1248`, `level2.js:134`, `level2.js:195` | `ChargeSeal.draw` repite el patrón de `BreakWall.draw` |
| M-03 | MEDIO | **Empeora** | 24 asignaciones `this.state =` en `main.js`; `touch.js:152` | 4 estados nuevos (`map`, `collection`, `controls`, `credits`), cada uno con su rama en `update`, `touch.js:55` y `css/touch.css:12-24` |
| M-04 | MEDIO | **Empeora** | `main.js:1-1744` (`Game` en 317-1700) | De 1.138 a 1.744 líneas. Ahora también incluye el mapa, la colección, los créditos y las tarjetas de zona |
| M-05 | MEDIO | **Empeora** | `main.js:42-221` (4 renderizadores, `renderTintTiles` en 102), `boss.js:11-20/110-125`, `level2.js:366-375/471-485`, `level3.js:257-266/347-360`, `expand.js:99-105/149-160`, `expand.js:256-262`, `enemies.js:36-41`, `level2.js:236-241`, `expand.js:16-17`, `level2.js:53`, `level3.js:69` | Ciclo de vida de jefe copiado 5 veces; detección de bordes, 3 veces |
| M-06 | MEDIO | **Empeora** | `main.js:7`, `touch.js:125`, `level2.js:3-9` vs `enemies.js:49`, `Game` global en `boss.js:18,122`, `level2.js:119,187,371,373,482`, `level3.js:91,262,264,358`, `expand.js:103,157-158,261`; `expand.js:518-523` | Nuevo: `expand.js` reconstruye `World.rooms` y `World.byId` desde fuera al cargar (parche sobre `world.js`) |
| M-07 | MEDIO | Sigue | `main.js:345-352`, `main.js:629-633`, `main.js:362-365`, `main.js:356` | Test en rojo con una partida terminada (Ecos vencido). La migración de `completed` ya no es código muerto: ahora rebaja a `false` las partidas que terminaban en N3, a propósito |
| M-08 | MEDIO | **Empeora** | Celeste: `main.js:359, 375, 547, 566, 643-646`; Cargado: `main.js:360, 376, 567, 637-642`; `expand.js:156` vs `main.js:628` | Dos tablas `MAIN` distintas: la de `expand.js` incluye `ecos`, la de `main.js` lo trata aparte |
| B-01 | BAJO | **Corregido** (`ecd53ce`) · antes: sigue, ampliado | `boss.js:12`, `player.js:328`, `level2.js:152` | Test en rojo. La onda del Sable también da energía al golpear al Guardián en `dying` |
| B-02 | BAJO | Sigue | `main.js:1364`, `level2.js:134`, `level2.js:195` | — |
| B-03 | BAJO | Sigue, ampliado | `player.js:220`, `player.js:314`, `boss.js:28,126`, `main.js:1345`, `level2.js:76`/`main.js:780`, `input.js:73` | Nuevo código muerto: el estado `'victory'` ya no se activa nunca (`main.js:751-755`, `864`, `1683-1702`); el resumen de tiempo y secretos no se muestra |
| B-04 | BAJO | Sigue | `main.js:320, 369, 507`, `level2.js:365`, `main.js:338-341`, `enemies.js:44`, `boss.js:126` | Se suman las tablas `MAIN` y los valores de vida de los 10 jefes nuevos, sueltos en `expand.js:183-188` y `expand.js:193-253` |
| B-05 | BAJO | **Cambió (parcial)** | `main.js:456-499`, `main.js:723-750`, `main.js:1410-1427`, `audio.js:5` | La pausa ahora ofrece Reanudar, Mapa, Colección y Controles. Sigue sin «Volver al título», sin volumen y sin remapeo de controles |
| B-06 | BAJO | Sigue | `input.js:29` | — |
| B-07 | BAJO | Sigue | `main.js:1726-1744`, `main.js:553` | — |
| B-08 | BAJO | Sigue | `index.html:21-24`, `manifest.webmanifest` | Sigue sin service worker |
| B-09 | BAJO (sospecha) | Sigue | `audio.js:195` | — |
| B-10 | BAJO | Sigue | raíz, `LEEME.md:62` | Sigue sin LICENSE |
| B-11 | BAJO | Sigue | `player.js:8`, `main.js:240`, `level3.js:19, 62`, `main.js:580` | — |
| B-12 | BAJO (sospecha de diseño) | Sigue, ampliado | `player.js:319-333`, `level2.js:148-157` | La onda comprueba las entidades antes que las paredes en cada paso |

**Resumen:** 0 corregidos · 1 cambió parcialmente (B-05) · 22 siguen presentes, 10 de ellos ampliados o empeorados. Los 5 hallazgos con test se reverificaron en ejecución y siguen fallando por la causa documentada.

### U.4 Hallazgos nuevos

| ID | Sev. | Categoría | Archivo:línea | Descripción | Evidencia (resumen) | Corrección propuesta | Esf. |
|---|---|---|---|---|---|---|---|
| C-02 | CRÍTICO | Softlock / progresión | `world.js:100-102` | **Corregido (`ee8b5e1`):** alcoba reubicada en la esquina alta del fondo (`world.js:100-102`). La alcoba del Sable Cargado de la Galería Suspendida ocupa el único pasillo de entrada desde el Pozo del Eco. Una partida nueva no puede pasar de ahí | Ejecución: el borde derecho del jugador no pasa de la baldosa 1 de la Galería con ninguna combinación de salto, dash o habilidades. Conectividad: 45 salas no secretas inalcanzables (53 contando secretas). Introducido en `44627a5` | Mover la alcoba fuera del pasillo, por ejemplo a la pared del fondo encima de la repisa. Mantener el test de conectividad para cualquier sala futura | S |
| A-03 | ALTO | Estados / combate | `expand.js:156-158`, `main.js:619` | **Corregido (`ecd53ce`).** Los 6 minijefes (Umbra, Aureola, Centinela, Capataz, Nube, Espina) no llaman a `victory()`, así que la invulnerabilidad de 99 s de `bossDefeated` nunca se resetea, **aunque el jugador no salga de la sala** | Ejecución: `invulnT` 90,1 diez segundos después de vencer a cada uno | Llamar siempre a `victory()` (que ya ignora a los no principales) y unificar las dos tablas `MAIN` | S |
| A-04 | ALTO | Niveles / combate | `world.js:255-259` | Arena Áurea: las puertas cubren las filas 8-11, pero la abertura llega a la fila 14 a ambos lados. Con el combate activo se sale por debajo y se salta el minijefe | Ejecución: sale en 45 pasos hacia el Pasaje del Alba sin vencerlo. Análisis: es la única de las 13 arenas con fuga | Cerrar las filas 12-14 en x=0 y x=31 (`rect(0,12,1,3)`, `rect(31,12,1,3)`) | S |
| A-05 | ALTO | Input / combate | `player.js:92-105` | Con el Sable Cargado, **todos** los tajos salen al soltar ATACAR: la latencia de cada ataque es igual al tiempo que se mantiene el botón | Ejecución: con un toque de 6 pasos, el tajo sale en el paso 7 con el Sable y en el 1 sin él | Lanzar el tajo al pulsar y cargar en paralelo; soltar con la carga completa dispara la onda | S |
| A-06 | ALTO | Jefes / bucle | `expand.js:211`, `expand.js:232` (y `expand.js:107`) | **Corregido (`ecd53ce`).** `Tempestad.update` incrementa `t`, `st` y `flashT` y luego delega en `MiniBoss.update`, que los vuelve a incrementar. Avisos, rugido, salto y muerte van al doble de velocidad | Ejecución: aviso de disparo de 9 pasos (0,15 s) frente a 18 del Forjador; rugido de 26 frente a 53 | No incrementar antes de delegar, o mover el incremento a un único método | S |
| M-09 | MEDIO | Diseño / estados | Bancos: `world.js:134, 261, 387`, `expand.js:338, 408, 477, 512`; disparador: `expand.js:111, 213`; banco: `main.js:787-795` | 7 arenas tienen el banco dentro. En 5 (banco en x=5 y disparador del jefe en x>4) el combate empieza y la puerta se cierra **nada más reaparecer**: tras morir no se puede salir de la arena hasta ganar, y en el Abismo Carmesí eso significa no volver nunca a explorar. Además, sentarse en mitad del combate cura al jugador y devuelve al jefe a vida llena | Ejecución: 5/7 arenas encierran al reaparecer; jugador de 2 a 8 HP, jefe de 5 a 30 HP | Decidir el diseño (pregunta U.7-1). Técnicamente: banco fuera del rango del disparador (o en la antesala) y no permitir descansar con un jefe activo | S |
| B-13 | BAJO | Contenido / jugabilidad | `expand.js:297-515`, `expand.js:88-178` | N4, N5 y N6 son la misma plantilla. De las 8 salas de cada zona, 6 tienen geometría idéntica en las tres zonas, y la arena y la cámara del jefe solo cambian el identificador del jefe. Los 10 jefes nuevos comparten la IA de `MiniBoss` (embestida, disparo, salto) con, como mucho, un patrón añadido | Comparación automática de las definiciones de sala | Decidir si es un marcador provisional. Si se mantiene, generar las salas con una función con parámetros en lugar de copiarlas | M-L |
| B-14 | BAJO | UI | `main.js:487-493`, `main.js:736-738`, `main.js:274` | El mapa de la pausa solo recorre las zonas 1–6: el Abismo Carmesí (nivel 7) no aparece. `LEVEL_SHORT` llama «Abismo» tanto al nivel 1 como al 7 | Lectura del código | Incluir el nivel 7 y corregir la etiqueta del nivel 1 | S |
| B-15 | BAJO | Pulido / niveles | `world.js:107` | El cartel «↓+Ataque en el aire: rebote» de la Galería Suspendida flota una baldosa por encima de la repisa: su base está en la fila 6 y la repisa empieza en la fila 7. Presente desde `d68ef4d` (`world.js:102` en esa versión). Registrado en el Bloque 2; sin corregir | Mapa ASCII de la Galería (Bloque 1): el cartel `i` queda en el aire sobre la repisa | Cambiar `ty` de 6 a 7 | S |

**Conteo actualizado (32 hallazgos; corregidos: C-01, C-02, A-03, A-06, B-01):**

| Severidad | Originales (siguen o cambiaron) | Nuevos | Total |
|---|---|---|---|
| CRÍTICO | 1 | 1 | **2** |
| ALTO | 2 | 4 | **6** |
| MEDIO | 8 | 1 | **9** |
| BAJO | 12 | 3 | **15** |

### U.5 Detalle de los hallazgos nuevos

#### C-02 · La entrada a la Galería Suspendida está tapada (CRÍTICO)

```js
// world.js:96-102 (Galería Suspendida)
b.box(); b.clear(0, 3, 1, 4); b.clear(39, 8, 1, 4);   // entrada: x=0, filas 3-6
b.rect(0, 7, 8, 10);             // repisa de entrada
// Cámara del Rayo: alcoba sellada a la altura del pecho (solo Sable Cargado)
b.rect(1, 2, 5, 1); b.rect(1, 6, 5, 1); b.rect(1, 3, 1, 4);   // ← x=1, filas 3-6: tapa el pasillo
b.chargeseal(6, 3, 1, 4, 'selloRayo'); b.obj('shard4', 3.5, 6);   // ← x=6, filas 3-6: sello en la misma ruta
```

El Pozo del Eco solo tiene dos salidas: la entrada desde el Pasaje y `clear(19,3,1,4)` hacia la Galería. Tras el cambio, la Galería en las filas 3-6 queda así (`1` = sólido; columnas x=0, 1, 6 y 7): `0110` en las cuatro filas.

- **En ejecución:** desde la cornisa del Pozo, con Salto Celeste y Sable, probando a caminar, saltar, hacer dash y combinarlos, el jugador entra en la sala de la Galería pero su borde derecho no pasa de la baldosa 1.
- **Conectividad:** con el pasillo abierto solo en el análisis y los sellos intactos, la ruta sigue bloqueada (pasa por el interior de la alcoba y el sello de x=6). Abriendo también los sellos, las 59 salas son alcanzables: no hay más bloqueos espaciales en el mapa.

#### A-03 · Los minijefes dejan al jugador invulnerable (ALTO)

```js
// expand.js:152-158 (MiniBoss, estado 'dying')
if (this.st > 1.5 && !this.dead) {
  this.dead = true; …
  const MAIN = { forjador: 1, tempestad: 1, raiz: 1, ecos: 1 };
  if (MAIN[this.key]) Game.victory(this);              // ← solo los principales
  else Game.toast((this.name || 'Enemigo') + ' derrotado', 2.5);
}
// main.js:619 (bossDefeated): this.player.invulnT = 99;  — solo victory() lo devuelve a 0 (main.js:625)
```
`victory()` ya sabe ignorar a los jefes no principales (`main.js:635`, `if (!MAIN[key]) return;`), pero `MiniBoss` decide por su cuenta con otra tabla `MAIN` distinta.

#### A-04 · La Arena Áurea no encierra (ALTO)

```js
// world.js:257-259
b.rect(0, 15, 32, 2); b.rect(0, 0, 1, 8); b.rect(31, 0, 1, 8);   // paredes solo hasta la fila 7
b.door(0, 8, 1, 4);                                              // puertas: filas 8-11
b.clear(31, 8, 1, 4); b.exitDoor(31, 8, 1, 4, 'aureola');        // filas 12-14 quedan abiertas en ambos lados
```
Las otras 12 arenas usan `box()` o paredes hasta la fila 7 con el suelo en la fila 12, así que la puerta cubre toda la abertura.

#### A-05 · Con el Sable Cargado, el tajo sale al soltar (ALTO)

```js
// player.js:92-105
if (this.hasCharge) {
  if (I.pressed('attack')) {
    if (this.atk) this.atkBuf = 0.15;
    else if (!stunned && this.dashT <= 0 && !this.healing) { this.charging = true; this.chargeT = 0; }   // pulsar = solo empezar a cargar
  }
} …
} else if (!I.down('attack')) {
  if (this.chargeT >= 0.7) this.fireWave(game);
  else this.atkBuf = 0.15;                     // ← el tajo normal se pide al SOLTAR
```
El Sable se obtiene al vencer al Oráculo (final del N3), así que afecta a todo el combate de N4 a N7. La pulsación se sigue leyendo con `I.pressed`, de modo que dentro del hit-stop se pierde (A-01c).

#### A-06 · La Tempestad cuenta el tiempo dos veces (ALTO)

```js
// expand.js:211 (Tempestad.update)
const p = game.player; this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
…
// expand.js:232: los estados que no gestiona ('shotTel', 'roar', 'dying', 'leap', 'charge'…) se delegan
MiniBoss.prototype.update.call(this, dt, game);
// expand.js:107 (MiniBoss.update): vuelve a sumar
const p = game.player; this.t += dt; this.st += dt; if (this.flashT > 0) this.flashT -= dt;
```
Consecuencias: un aviso de disparo de 0,15 s en fase 2, que no deja reaccionar, y una animación de muerte más corta. Los otros jefes que heredan de `MiniBoss` (Forjador, Raíz y Ecos) no tienen el problema porque no incrementan antes de delegar.

#### M-09 · Bancos dentro de las arenas (MEDIO)

```js
// expand.js:111 (MiniBoss, estado 'dormant'): el combate empieza si p.x > 4 baldosas
if (p.x > this.room.px + 4 * TILE && p.hp > 0) { game.startBoss(this); this.set('intro'); }
// expand.js:338, 408, 477, 512 y world.js:387: b.obj('bench', 5, 12)  → al reaparecer, p.x ≈ 4,7 baldosas
// main.js:787: sentarse no comprueba si hay un jefe activo → enterRoom() recrea al jefe con vida llena
```
Las dos arenas con el banco en x=4 (Umbría y Áurea) no encierran al reaparecer. Las otras 5 (Centinela, Capataz, Nube, Espina y **Abismo Carmesí**) sí.

#### B-13 · Contenido de N4–N6 por plantilla (BAJO)

Comparando las funciones `build` sin contar objetos ni identificadores:
- Idénticas en las tres zonas: `forjaAtrio`/`techoAtrio`/`jardinAtrio`, `forjaPozo`/`techoPozo`/`jardinPozo`, `forjaSecreto`/`techoSecreto`/`jardinSecreto` y `forjaAntesala`/`techoAntesala`/`jardinAntesala`.
- Idénticas en dos zonas: `forjaRuedas`/`jardinSetos`.
- Arenas, puentes y cámaras de jefe: misma geometría, solo cambian el identificador del jefe o del sello.

Los 10 jefes nuevos son instancias de `MiniBoss` (`expand.js:88-178`, con colores y vida distintos en `expand.js:183-188`). Los 4 principales solo añaden un patrón (pilares, picado, ondas o ráfaga según la forma).

### U.6 Revisión del delta por áreas (A–F)

**A. Funcionamiento.** C-02 (bloqueo total). 59 salas sin excepciones ni errores de consola, y sin solapes entre salas. El arreglo de los pozos verticales de `c54d4d7` es correcto: entrada y salida de los tres pozos al mismo nivel que el suelo, verificado por conectividad. No hay TODO ni funciones vacías. Código muerto nuevo: estado `'victory'` (B-03).

**B. Núcleo.**
- *Loop:* sigue con paso fijo. A-06 es un error de temporizadores en un único jefe.
- *Colisiones:* la Tempestad en `idle` se desplaza sin comprobar colisiones (`expand.js:222`, ±6 px de oscilación), sin efecto visible.
- *Input:* A-05 y A-01c.
- *Estados:* A-03, M-09 y C-01 ampliado.

**C. Rendimiento.** Mejoró: `FX` ahora limita las partículas a 140 (`fx.js:6-13`). Ronda los 2,0-2,5 ms por fotograma en Cascadas, frente a 1,4 ms antes, con más efectos por golpe. El mundo pre-renderiza 59 lienzos de sala; se estiman ~30 MB de canvas (sospecha: medir en móviles de gama baja).

**D. Calidad.** M-03, M-04, M-05, M-06 y M-08 empeoran (ver U.3). Patrones típicos de código generado:
- Dos tablas `MAIN` con contenido distinto.
- Una fábrica de jefes (`BOSS_FACTORY`) junto a un `typeof BOSS_FACTORY !== 'undefined'` defensivo en `main.js:565`.
- 20 entradas casi idénticas en `PICKUPS` (`main.js:232-255`) y la misma lista duplicada en `COLLECTION` (`main.js:276-299`).

**E. Jugabilidad.**
- **Curva:** el daño recibido sigue siendo siempre 1. Los jefes nuevos tienen entre 52 y 80 de vida, y los minijefes entre 24 y 32. Las mejoras se apilan: 12 fragmentos (hasta 17 máscaras), 3 orbes y 3 cristales.
- **Saltos de dificultad:** A-06 (Tempestad injusta), A-04 (minijefe que se puede saltar) y A-05 (combate más lento en N4–N7).
- **Retroalimentación:** buena. Tarjetas de zona, créditos, mapa y colección.
- **Repetición:** B-13.
- **Guardado:** M-07 sigue. La migración de partidas antiguas (Oráculo → Sable, `completed` → `false`) funciona.

**F. Seguridad y publicación.** Sin cambios: sin red y sin claves. Los créditos (`main.js:266-272`) incluyen el nombre del autor. Siguen B-07, B-08 y B-10.

### U.7 Preguntas abiertas nuevas

1. **Bancos en las arenas (M-09):** ¿el banco dentro de la arena es un punto de control previo al jefe a propósito? Si lo es, ¿se acepta que el jugador quede encerrado tras morir (sobre todo ante Ecos), o el banco debería ir en la antesala?
2. **Alcoba de la Galería (C-02):** ¿dónde quieres la Cámara del Rayo? Opciones: la pared del fondo de la repisa, el techo de la Galería o otra sala del N1.
3. **N4–N6 (B-13):** ¿son plantillas provisionales que se rediseñarán, o el contenido final?
4. **Sable Cargado (A-05):** ¿el tajo debe salir al pulsar (estándar en el género) y la onda al soltar con carga completa? ¿O prefieres un botón separado para la onda?
5. **Minijefes (A-03):** ¿deben mostrar una pantalla propia («Minijefe derrotado») o basta con el aviso actual una vez corregida la invulnerabilidad?

### U.8 Tests adaptados

> Estado en el momento del Bloque 0b. El estado vigente está en U.0.

`node tests/regresion.mjs` → **1 PASA · 20 ROJO ESPERADO · 0 FALLA · 0 ERROR · 1 INFO** (código de salida 0; con `--strict`, 1). Determinista: dos ejecuciones dan resultados idénticos.

| # | ID | Caso | Estado hoy |
|---|---|---|---|
| 1 | HUMO | Las 59 salas × 3 s con dibujo | PASA |
| 2-8 | C-01 | Salir de la sala durante `dying`: Guardián, Heraldo, Oráculo, Forjador, Tempestad, Raíz, Ecos (con `completed`) | ROJO ESPERADO ×7 |
| 9 | B-01 | Golpear al Guardián en `dying` | ROJO ESPERADO |
| 10-11 | A-01a/b | Saltar y soltar el salto en el hit-stop | ROJO ESPERADO ×2 |
| 12 | A-02 | Punto seguro sobre bloque de fase | ROJO ESPERADO |
| 13 | C-02 | Conectividad del mapa | ROJO ESPERADO |
| 14 | C-02 | Del Pozo del Eco a la Galería | ROJO ESPERADO |
| 15 | A-03 | Invulnerabilidad tras los 6 minijefes | ROJO ESPERADO |
| 16 | A-04 | Arenas que encierran (análisis de las 13 + Arena Áurea en ejecución) | ROJO ESPERADO |
| 17 | A-05 | Latencia del tajo con el Sable | ROJO ESPERADO |
| 18 | A-01c | Sable: pulsar ATACAR en el hit-stop | ROJO ESPERADO |
| 19 | A-06 | Duración de los avisos de la Tempestad | ROJO ESPERADO |
| 20 | M-09 | Bancos dentro de las arenas | ROJO ESPERADO |
| 21 | M-07 | `completed` tras `saveGame()` | ROJO ESPERADO |
| 22 | PERF | Rendimiento en Cascadas | INFO |

**Validación:** en una copia fuera del repositorio, con correcciones provisionales de los 11 hallazgos pendientes, los 20 casos pasan a ANOMALÍA (verde) **con las dos estrategias posibles para C-01** (puertas cerradas hasta la victoria, o victoria al salir de la sala), sin ningún ERROR ni FALLA. En el repositorio, los 20 fallan por la causa documentada.

### U.9 Plan de remediación corregido

Cambios respecto al plan original: se añade un **Bloque 1 nuevo y urgente** (desbloquear el mapa), se amplían los Bloques 2, 3 y 5, y se añade un bloque de arenas. Cada bloque sigue siendo independiente y verificable con los tests.

| # | Bloque | Resuelve | Archivos | Verificación | Depende de |
|---|---|---|---|---|---|
| 0 | Red de seguridad | — | `tests/` | Hecho (Bloques 0 y 0b) | — |
| **1** | **Desbloquear la Galería (nuevo, urgente)** — **hecho (`ee8b5e1`)** | **C-02** | `world.js:100-102` | Casos C-02 ×2 en verde (conectividad: 0 inalcanzables no secretas). Recorrido manual del N1 completo | 0 |
| 2 | Cierre correcto de todos los jefes (antes Bloque 1) — **hecho (`ecd53ce`)** | C-01, **A-03**, B-01, **A-06** | `main.js` (`bossDefeated`, `victory`, `enterRoom`), `expand.js:107, 156-158, 211-232`, `boss.js:12` | Casos C-01 ×7, A-03, B-01 y A-06 en verde | 0 |
| 3 | Entrada durante el hit-stop y Sable Cargado (antes Bloque 2) | A-01, **A-05** | `main.js:673`, `player.js:87-116` | Casos A-01a/b/c y A-05 en verde. Manual: combo de 3 golpes y onda cargada | 0 |
| 4 | Punto seguro robusto (antes Bloque 3) | A-02 | `player.js:255-264` | Caso A-02 en verde | 0 |
| **5** | **Arenas (nuevo)** | **A-04, M-09** | `world.js:255-262`, `expand.js:111, 213, 338, 408, 477, 512`, `world.js:134, 387`, `main.js:787` | Casos A-04 y M-09 en verde (M-09 según la respuesta a U.7-1) | 0, 2 |
| 6 | Guardado unificado y habilidades (antes Bloque 4) | M-07, M-08 | `main.js:333-378`, `main.js:547, 566-567, 616-647` | Caso M-07 en verde; las habilidades se conceden en un solo sitio (búsqueda de texto) | 2 |
| 7 | Máquina de estados y pausa (antes Bloque 5) | M-03, B-06, B-05 (resto) | `main.js` (`update`, menús), `touch.js:55, 152`, `css/touch.css` | Búsqueda: `this.state =` solo en `setState`; «Volver al título» y volumen en la pausa | 0 |
| 8 | Separar dibujo y estado; independencia de los FPS (antes Bloque 6) | M-02, B-02 | `main.js:1132-1179, 1364`, `level2.js:134, 195` | Tests en verde sin llamar a `draw()` | 0 |
| 9 | Plataformas móviles con colisión (antes Bloque 7) | M-01 | `main.js:779` | Test de sala sintética | 0 |
| 10 | Refactor por sesiones (antes Bloque 8): 10a renderizador único (4→1); 10b `BossBase` para los 5 ciclos de vida de jefe + `MiniBoss`; 10c salas de N4–N6 generadas por función; 10d `save.js`, `hud.js`, `screens.js`, `menus.js`; `expand.js` integrado en `world.js` | M-04, M-05, M-06, B-03, B-04, B-11, B-13, B-14 | `main.js`, `expand.js`, `world.js`, `boss.js`, `level2.js`, `level3.js` | Todos los tests en verde (incluida la conectividad) y comparación con `screenshots/` | 1-6 |
| 11 | Publicación (antes Bloque 9) | B-07, B-08, B-09, B-10, B-12 | `main.js:1726-1744`, `index.html`, `sw.js`, `LICENSE`, `audio.js:195` | Igual que el original | — |

---

## 0. Reconocimiento (actualizado a c54d4d7)

### Stack y ejecución
- **HTML5 + JavaScript puro + Canvas 2D**, sin motor, sin librerías, sin `package.json` ni build. Audio sintetizado con **Web Audio API**. PWA a medias (manifest, sin service worker).
- Se ejecuta abriendo `index.html` (funciona por `file://`) o sirviendo la carpeta. Los scripts se cargan en orden fijo con `?v=11` como cache-busting manual (`index.html:44-55`).
- Resolución lógica 480×272 escalada a pantalla (`main.js:3`, `main.js:13-29`).

### Estructura
| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `js/input.js` | 75 | Teclado, mando y entrada virtual (táctil) con «latch» por paso |
| `js/audio.js` | 223 | SFX y secuenciador de música chiptune (7 temas de zona, 7 de jefe) |
| `js/world.js` | 521 | Salas de N1–N3 (33 tras la expansión), rejilla, `moveEntity`, `aabb` |
| `js/fx.js` | 119 | Partículas (tope de 140), chispas, anillos, arcos de corte, sacudida, hit-stop |
| `js/player.js` | 518 | Jugador (movimiento, dash, saltos, ataques, Sable Cargado, curación, pelo, dibujo) |
| `js/enemies.js` | 155 | Clase base `Enemy`, `Walker`, `Flyer` |
| `js/boss.js` | 201 | Jefe 1 (`Boss`), `Shockwave`, `Orb` |
| `js/level2.js` | 536 | Plataformas, viento, `ChargeSeal`, `ChargeWave`, `BreakWall`, enemigos del N2, jefe 2 `Herald` |
| `js/level3.js` | 408 | Haces, plataformas intermitentes, cristales de fase, enemigos del N3, jefe 3 `Oracle` |
| `js/expand.js` | 523 | Enemigos de N4–N6, `MiniBoss` y sus 10 instancias, `BOSS_FACTORY`, 26 salas nuevas, reconstrucción de `World` |
| `js/main.js` | 1744 | Pre-render, guardado, objeto `Game` (estado, menús, mapa, colección, créditos, salas, jefes, cámara, update), fondos, HUD, pantallas, bucle, ganchos de depuración |
| `js/touch.js` | 157 | Joystick y botones táctiles, pantalla completa, pausa en vertical |

- **Punto de entrada:** `main.js:1714-1724`.
- **Estados:** `title`, `play`, `pause`, `map`, `collection`, `controls`, `dying`, `levelclear`, `ability`, `credits` (y `victory`, que ya no se usa).
- **Niveles:** 7 zonas / 59 salas, 13 jefes (7 principales y 6 minijefes), 20 objetos coleccionables y 2 habilidades.
- **Guardado:** `localStorage` clave `hojaCarmesi.save.v1` (`main.js:224-229`).

### Ejecución real (c54d4d7)
- `node --check` en los 12 archivos: sin errores de sintaxis.
- Chrome headless por `file://`: 0 errores y 0 excepciones de consola. Las 59 salas se simulan y dibujan sin excepciones.
- Rendimiento: ≈2,0-2,5 ms por fotograma en Cascadas.
- No automatizado: táctil real, mando físico, Safari/iOS y audio audible.

---

## 1. Resumen ejecutivo de la auditoría original (d68ef4d, histórico)

> Se conserva como referencia. El estado actual está en U.2.

El juego (d68ef4d) arrancaba, no daba errores de consola y era jugable de principio a fin. El núcleo era sólido: paso fijo de 60 Hz, colisiones con sub-pasos, entrada con latch, ataques de jefe telegrafiados y conexiones entre salas coherentes. Había 1 hallazgo crítico (salir de la sala del jefe mientras muere se saltaba la victoria), 2 altos (pulsaciones perdidas en el hit-stop y un bucle de pinchos sobre bloques de fase) y deuda técnica concentrada en `main.js`. Veredicto: corregir, no reescribir.

---

## 2. Tabla de hallazgos originales (referencias en c54d4d7)

| ID | Sev. | Categoría | Archivo:línea | Descripción | Evidencia (resumen) | Corrección propuesta | Esf. |
|---|---|---|---|---|---|---|---|
| C-01 | CRÍTICO | Funcionamiento / estados | `main.js:616-647`, `main.js:534-538`, `boss.js:117-123`, `level2.js:477-483`, `level3.js:353-359`, `expand.js:149-160` | Si el jugador sale de la sala del jefe durante la animación de muerte, nunca se llama a `victory()`: no hay pantalla de nivel, queda invulnerable ~99 s y con el jefe final **se pierde el final** | Test: los 7 jefes salen de la sala entre los pasos 89 y 146 sin pasar por `levelclear`; `invulnT` ≈ 85 | No abrir puertas hasta `victory()`, o llamar a `victory()` en `enterRoom` si el jefe estaba en `dying` | S |
| A-01 | ALTO | Input | `main.js:673`, `main.js:770`, `player.js:87`, `player.js:92-97`, `player.js:196` | Las pulsaciones y sueltas durante el hit-stop se pierden (salto, corte de salto, ataque, carga del Sable) | Test: saltar en el hit-stop → `vy=0`; soltar → altura completa; ATACAR con Sable → ni tajo ni carga | No llamar a `Input.update()` en pasos congelados | S |
| A-02 | ALTO | Física / softlock parcial | `player.js:255-264`, `player.js:68-73`, `main.js:580-593` | `recordSafe` guarda como punto seguro un bloque de fase; si la fase cambia, el jugador cae en un bucle de pinchos hasta morir | Test: 7 golpes en 10 s, de 8 HP a muerte | Excluir `room.phaseKeys` en `recordSafe` y validar el suelo al reaparecer | S |
| M-01 | MEDIO | Física (latente) | `main.js:779` | Las plataformas móviles desplazan al jugador sin colisión | `p.x += p.plat.dx; p.y += p.plat.dy;` | Mover con `moveEntity` | S |
| M-02 | MEDIO | Arquitectura | `main.js:1132-1137`, `main.js:1179`, `main.js:1245-1248`, `level2.js:134`, `level2.js:195` | El dibujo modifica estado de juego | `drawObj` calcula `o.near` y `o.prompt`; `draw` decrementa `flashT` | Calcular en `update(dt)` | S |
| M-03 | MEDIO | Máquina de estados | 24 asignaciones `this.state =` en `main.js`, `touch.js:152` | Estados asignados desde muchos sitios, uno fuera del bucle | `Game.state = 'pause'` desde `Touch.sync` | `Game.setState(s)` con `enter`/`exit` | M |
| M-04 | MEDIO | Calidad / SRP | `main.js:1-1744` | `main.js` lo hace casi todo | 1.744 líneas; `Game` ocupa 317-1700 | Dividir en módulos sin cambiar comportamiento | M-L |
| M-05 | MEDIO | Duplicación | Ver U.3 | 4 renderizadores casi iguales, ciclo de vida de jefe ×5, detección de bordes ×3, AABB escrito a mano | Ver detalle | Paleta por tema, `BossBase`, `groundAhead()` | M |
| M-06 | MEDIO | Acoplamiento / globales | Ver U.3 | Todo global, dependiente del orden de carga; `screen` oculta `window.screen`; `expand.js` reconstruye `World` desde fuera | Ver detalle | Pasar `game`; utilidades comunes; integrar `expand.js` | S-M |
| M-07 | MEDIO | Guardado | `main.js:345-352`, `main.js:629-633`, `main.js:356` | `saveGame()` reescribe todo sin `completed`, así que el «juego completado» se pierde al sentarse en un banco | Test con una partida terminada: `completed` → `undefined` | Un único `buildSave()` | S |
| M-08 | MEDIO | Progresión | Ver U.3 | Habilidades concedidas en varios sitios (parches para tapar C-01); `secrets` mezcla muros, objetos y habilidades; dos tablas `MAIN` | 5 sitios para Celeste y 4 para el Sable | `grantAbility()`; separar conjuntos | S |
| B-01 | BAJO | Combate | `boss.js:12`, `player.js:328`, `level2.js:152` | El Guardián devuelve `undefined` en estados invulnerables y golpearlo mientras muere da energía (también con la onda) | Test: energía 0 → 11 | `return false;` | S |
| B-02 | BAJO | Loop / FPS | `main.js:1364`, `level2.js:134`, `level2.js:195` | Animaciones avanzadas por fotograma de render | `s.t += 1 / 60` en `draw` | Avanzar en `update(dt)` | S |
| B-03 | BAJO | Código muerto | `player.js:220`, `player.js:314`, `boss.js:28,126`, `main.js:1345`, `level2.js:76`, `input.js:73`, `main.js:751-755, 864, 1683-1702` | Ternario con ramas idénticas, `x && false`, variables sin uso y estado `'victory'` inalcanzable | Ver detalle | Eliminar | S |
| B-04 | BAJO | Números mágicos | `main.js:320, 369, 507`, `level2.js:365`, `main.js:338-341`, `enemies.js:44`, `boss.js:126`, `expand.js:156, 183-188` | Respawn repetido, `31*TILE` fijo, mejoras y vidas sueltas | — | Constantes con nombre | S |
| B-05 | BAJO | UX | `main.js:456-499`, `audio.js:5` | **Parcialmente resuelto:** la pausa tiene mapa, colección y controles; faltan «Volver al título», volumen y remapeo | — | Completar el menú | S-M |
| B-06 | BAJO | Input | `input.js:29` | Al perder el foco el juego sigue corriendo | — | Pausar en `blur` | S |
| B-07 | BAJO | Publicación | `main.js:1726-1744`, `main.js:553` | Ganchos de depuración expuestos | — | Solo con `?debug` | S |
| B-08 | BAJO | PWA | `index.html:21-24`, `manifest.webmanifest` | Sin service worker | — | SW o no prometer modo offline | S |
| B-09 | BAJO (sospecha) | Audio | `audio.js:195` | `setTargetAtTime` en cada fotograma | — | Perfilar 30 min | S |
| B-10 | BAJO | Licencias | raíz, `LEEME.md:62` | Sin LICENSE; vocabulario muy cercano a Hollow Knight | — | Añadir licencia; revisar nombres | S |
| B-11 | BAJO | Nomenclatura | `player.js:8`, `main.js:240`, `level3.js:19, 62`, `main.js:580` | `soul`/«energía»/«alma»; `phase` con tres significados | — | Renombrar | S |
| B-12 | BAJO (sospecha de diseño) | Combate | `player.js:319-333`, `level2.js:148-157` | Los ataques (y la onda) atraviesan paredes | — | Decidir (pregunta 2) | S |

---

## 3. Detalle y evidencia de los hallazgos originales (código de c54d4d7)

### C-01 · Salir de la sala del jefe durante su muerte se salta la victoria (CRÍTICO)

```js
// main.js:616-622
bossDefeated(b) {
  this.beaten[b.key || 'guardian'] = true; this.slowT = 1.8;
  this.hazards = this.hazards.filter(h => h.persistent); this.player.invulnT = 99;
  this.syncDoors();          // ← abre las puertas YA
  this.saveGame();
```
```js
// boss.js:117-122 (igual en level2.js:477-482, level3.js:353-358, expand.js:152-157)
if (this.st > 1.8 && !this.dead) { this.dead = true; … Game.victory(this); }
```
```js
// main.js:536-538 y 565: al cambiar de sala el jefe se destruye y, como ya figura en beaten, no se recrea
this.resetBossEncounter();
this.room = World.cur = room;
this.enemies = []; this.hazards = []; this.objs = []; this.boss = null;
…
else if (o.type === 'boss' && !this.beaten[o.boss]) this.boss = …
```
Reproducción actual (tests C-01): los 7 jefes con pantalla de nivel permiten salir durante `dying` (entre 89 y 146 pasos) sin pasar por `levelclear`. `invulnT` se queda en ≈85 s. Con Ecos, `completed` nunca se guarda y los créditos no aparecen. La Celeste y el Sable se recuperan al volver gracias a los parches de M-08.

### A-01 · Pulsaciones perdidas durante el hit-stop (ALTO)

```js
// main.js:671-673 y 770
update(dt) {
  this.t += dt;
  Input.update();                    // ← consume el latch
  …
  if (FX.hitStop > 0) { FX.hitStop--; FX.update(dt * 0.25); return; }   // ← sale sin llamar a player.update
```
`pressed()` solo vale `true` durante un paso. El jugador lo lee en `player.js:87` (salto), `player.js:93-97` (ataque y carga del Sable) y `player.js:196` (corte de salto).

### A-02 · Punto seguro sobre bloque de fase (ALTO)

```js
// player.js:255-264
recordSafe() {
  if (this.plat) return;            // excluye plataformas dinámicas, pero no los bloques de fase (están en la rejilla)
  …
  if ((a === T_SOLID || a === T_PLAT) && (b === T_SOLID || b === T_PLAT)) { this.safe.x = this.x; this.safe.y = this.y; }
}
```
Los bloques de fase se escriben en la rejilla como `T_SOLID` (`main.js:586`). Al tocar pinchos, `player.js:70-71` devuelve al jugador a `safe` sin comprobar que el suelo siga ahí.

### M-01 · Plataforma móvil sin colisión (MEDIO, latente)
```js
// main.js:779
if (p.plat && p.plat.solid && p.spikeT <= 0) { p.x += p.plat.dx; p.y += p.plat.dy; }
```

### M-02 · Estado mutado en el dibujo (MEDIO)
```js
// main.js:1132-1136 (drawObj): calcula o.prompt   · main.js:1179: calcula o.near
// main.js:1245-1248 (drawHUD): los lee
// level2.js:134 (ChargeSeal.draw) y level2.js:195 (BreakWall.draw)
if (this.flashT > 0) this.flashT -= 1 / 60;
```

### M-03 · Máquina de estados dispersa (MEDIO)
```js
// touch.js:152 — en un requestAnimationFrame propio, fuera de Game.update
if (document.body.classList.contains('touch') && isPortrait() && Game.state === 'play') { Game.state = 'pause'; releaseAll(); }
```
Cada estado nuevo (mapa, colección, controles, créditos) obliga a tocar `main.js` (`update` y `draw`), `touch.js:55` y `css/touch.css:12-24`.

### M-05 · Duplicación (MEDIO)
- Renderizadores de baldosas: `main.js:42-221` (cuatro funciones).
- Ciclo de vida de jefe repetido 5 veces:
```js
// boss.js:14-18, level2.js:369-373, level3.js:260-264, expand.js:102-103 y expand.js:259-261: el mismo bloque
if (!this.phase2 && this.hp <= this.maxHp / 2) { this.phase2 = true; this.set('roar'); FX.shake(…); … }
if (this.hp <= 0) { this.hp = 0; this.set('dying'); Game.bossDefeated(this); }
```
- Detección de bordes: `enemies.js:36-41`, `level2.js:236-241` y `expand.js:16-17`.
- AABB escrito a mano: `level2.js:53` y `level3.js:69`.

### M-06 · Globales y acoplamiento (MEDIO)
```js
// main.js:7 — oculta window.screen;  touch.js:125 tiene que usar window.screen explícitamente
const screen = document.getElementById('screen');
// expand.js:518-523 — modifica el mundo de world.js al cargar
(function rebuildWorld() { for (const def of EXTRA_ROOMS) ROOM_DEFS.push(def); World.rooms = ROOM_DEFS.map(makeRoom); … })();
```
`enemies.js:49` usa `drawOutlined`, definido en `level2.js:5`. Los jefes usan el global `Game` aunque reciben `game` (ver U.3).

### M-07 · Guardado con dos escritores (MEDIO)
```js
// main.js:346-350 — no incluye completed
Save.write({ v: 1, ver: 3, level: …, respawn: …, maxHp: …, secrets: […], beaten: …, playTime: …, visited: … });
// main.js:631-632 — único sitio que escribe completed (al vencer a Ecos)
Save.write(Object.assign(cur, { v: 1, completed: true, beaten: …, secrets: […], playTime: this.playTime }));
```
`maxHp` se sigue guardando como número (`main.js:356`, `|| 5`), en lugar de derivarse de los 12 `shard*` de `secrets`.

### M-08 · Habilidades concedidas en varios sitios (MEDIO)
Ver la lista de líneas en U.3. Hay dos tablas `MAIN`: `expand.js:156` (`{ forjador, tempestad, raiz, ecos }`) y `main.js:628` (`{ guardian … raiz }`, con `ecos` tratado aparte en `main.js:629`).

### B-03 · Código muerto (BAJO)
```js
// player.js:314 — ramas idénticas:      (this.atk.type === 'down' ? this.y + this.h : this.y + this.h)
// player.js:220 — equivale a «= false»: this.dashMomentum = this.dashMomentum && false
// boss.js:28 / 126 — grav siempre true · main.js:1345 — const r sin uso
// level2.js:76 / main.js:780 — p.inWind no se lee · input.js:73 — usingPad no se lee
// main.js:751-755, 864, 1683-1702 — el estado 'victory' ya no se asigna en ningún sitio
```

### B-11 · Nomenclatura (BAJO)
`soul` en el código, «energía» en la UI (`main.js:240`), «alma» en comentarios. `phase` significa tres cosas: `boss.phase2`, `room.phases` y `Beam.phase`/`Blink.phase` (`level3.js:19, 62`).

---

## 4. Revisión por área (auditoría original, vigente salvo lo indicado en U.6)

- **A. Funcionamiento:** sin referencias rotas ni excepciones. *Actualización:* C-02 rompe la progresión.
- **B. Núcleo:** paso fijo de 1/60 con acumulador (`main.js:1714-1724`); colisiones con sub-pasos de 4 px (`world.js`, `moveEntity`), sin atravesar paredes.
- **C. Rendimiento:** holgado; entidades y proyectiles se vacían al cambiar de sala (`main.js:538`); listeners únicos.
- **D. Calidad:** ver M-03 a M-08 y B-03, B-04 y B-11.
- **E. Jugabilidad:** todo el daño recibido es 1, con invulnerabilidad de 1,3 s. Energía: 11 por golpe y curar cuesta 33. La dificultad sube solo por patrones. Buena retroalimentación. *Actualización:* ver U.6-E.
- **F. Seguridad:** sin red ni claves; sin licencia.

---

## 5. Lo que está bien hecho

- Bucle de paso fijo con protección contra la espiral de la muerte.
- Colisión por ejes con sub-pasos.
- Sensación de control trabajada: coyote time, buffer, corte de salto, pogo y salto de pared.
- Entrada con latch, multitáctil y mando.
- Ataques de jefe telegrafiados (salvo A-06) y bloques que esperan a que el jugador salga.
- Lectura del guardado robusta; migración de partidas antiguas al añadir el Sable y la expansión.
- **Nuevo:** tope de partículas en `FX`; arreglo correcto de los pozos verticales en `c54d4d7`; menú de pausa con mapa y colección; sin solapes entre las 59 salas.
- Ganchos de prueba deterministas (`GAME.setManual`, `step`, `warp`): permitieron reproducir los 11 hallazgos con test.

---

## 6. Plan de remediación

**Sustituido por el plan corregido de U.9.** Cambios principales:
- Nuevo Bloque 1 (C-02, urgente).
- El cierre de jefes incluye A-03 y A-06.
- El Bloque de entrada incluye el Sable (A-05).
- Nuevo bloque de arenas (A-04, M-09).
- El refactor incorpora `expand.js` y las salas de plantilla (B-13).

---

## 7. Preguntas abiertas (originales, vigentes)

1. **Victoria del jefe:** ¿puertas cerradas hasta el final de la animación de muerte, o se puede salir y la victoria aparece igual? Los tests aceptan ambas.
2. **Golpear a través de paredes (B-12):** ¿es intencional? Ahora también afecta a la onda del Sable.
3. **Penalización por morir:** sigue siendo solo volver al banco.
4. **Persistencia de objetos:** los objetos recogidos no se guardan hasta el siguiente banco.
5. **Plataforma de publicación:** decide si hace falta un service worker.
6. **Curva de dificultad:** todo el daño sigue siendo 1 en los 7 niveles.
7. **Futuro del proyecto:** con 59 salas y planes de más zonas, el refactor (Bloque 10) gana prioridad.
8. **Opciones:** controles configurables, volumen y accesibilidad.
9. **Identidad y licencia:** ¿publicación comercial?
10. **Ejecución por `file://`:** ¿sigue siendo requisito? Condiciona el refactor (no se podrían usar módulos ES).

Las preguntas nuevas están en U.7.
