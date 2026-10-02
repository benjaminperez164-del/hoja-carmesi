# Tests de regresión

Red de seguridad de los Bloques 0 y 0b de [`AUDITORIA.md`](../AUDITORIA.md), actualizada a `c54d4d7` (59 salas). Cada caso reproduce un hallazgo de la auditoría y lleva su ID (C-01, A-01…). Sirve para verificar cada corrección y para detectar regresiones.

## Requisitos

- **Node.js 22 o superior** (usa `WebSocket` y `fetch` nativos).
- **Chrome, Chromium o Edge** instalado. El script lo busca en las rutas habituales de Windows, macOS y Linux. Si está en otro sitio, indica la ruta con la variable `CHROME_PATH`.
- Ninguna dependencia: no hay `package.json` ni `npm install`. El juego no se modifica y sigue funcionando por `file://`.

## Ejecutar

Desde la raíz del proyecto:

```sh
node tests/regresion.mjs
```

| Opción | Efecto |
|---|---|
| `--strict` | Cualquier caso que no sea PASA o INFO hace que el script salga con código 1 (incluidos los rojos esperados) |
| `--solo=<ID o texto>` | Ejecuta solo los casos cuyo ID coincida o cuyo nombre contenga el texto, p. ej. `--solo=C-01` |
| `--seed=<n>` | Cambia la semilla de `Math.random` (por defecto `20261002`) |
| `--json` | Muestra los resultados en JSON en lugar de la tabla |

Ejemplos con otro navegador:

```sh
# Windows (PowerShell)
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; node tests/regresion.mjs
# macOS / Linux
CHROME_PATH=/usr/bin/chromium node tests/regresion.mjs
```

La ejecución completa tarda unos 10 segundos.

## Cómo funciona

- Abre `index.html` por `file://` en Chrome headless, con un perfil temporal que se borra al terminar, y lo controla por CDP (Chrome DevTools Protocol).
- **Es determinista:** pone el juego en modo manual (`GAME.setManual(true)`) y avanza la simulación paso a paso con `GAME.step(n, acciones)`; nunca depende de tiempos reales. Antes de cargar los scripts del juego inyecta un `Math.random` con semilla fija. Así, dos ejecuciones dan exactamente los mismos resultados.
- Cada caso **recarga la página**, de modo que empieza con el estado del juego y el `localStorage` limpios.
- Solo usa ganchos que ya existen en `window.GAME` (`Game`, `World`, `Input`, `FX`, `setManual`, `step`, `warp`, `noEnemies`). Si falta alguno, el script se detiene y lo indica; **no se añaden ganchos al juego desde los tests**.

## Cómo leer la salida

```
 #  ID     Caso                                                Estado
 2  C-01   Salir de la sala durante 'dying' · Guardián         ROJO ESPERADO
           └ estados vistos {play} (esperado incluir levelclear); invulnT 85.09 (esperado ≤ 1,3); …
```

Debajo de cada caso hay una línea de detalle con el valor obtenido y el esperado.

| Estado | Significado | ¿Afecta al código de salida? |
|---|---|---|
| **PASA** | El caso cumple lo esperado | No |
| **ROJO ESPERADO** | Falla porque el hallazgo marcado como pendiente sigue sin corregir, y falla por la causa documentada | Solo con `--strict` |
| **FALLA** | Un caso no pendiente no cumple lo esperado: **regresión** | Sí |
| **ERROR** | No se reprodujo el escenario (preparación fallida), hubo una excepción del juego durante el caso, o un caso pendiente falló por una causa **distinta** a la documentada. El resultado no es fiable | Sí |
| **ANOMALÍA** | Un caso marcado como pendiente **pasa**. O el bug ya está corregido (hay que quitar la marca) o el test no lo está reproduciendo | Sí |
| **INFO** | Medición informativa (rendimiento); nunca falla | No |

Códigos de salida:

| Código | Significado |
|---|---|
| `0` | Todo correcto: sin FALLA, ERROR ni ANOMALÍA; con `--strict`, solo PASA o INFO |
| `1` | Hay algún fallo |
| `3` | No se pudo ejecutar (no se encontró el navegador o Node es demasiado antiguo) |

Antes de dar por bueno un resultado, cada caso **verifica su preparación**: que el jefe llegó a `dying`, que el jugador salió de la sala (o que una puerta se lo impidió), que el jugador estuvo de pie sobre el bloque de fase, que el tajo tocó al jefe, que el hit-stop seguía activo al pulsar, etc. Si la preparación falla, el caso sale como ERROR y nunca como rojo esperado.

## Casos

| Caso | Hallazgo | Comprueba |
|---|---|---|
| HUMO | — | Todas las salas (59 en `c54d4d7`): entrar, simular 3 s y dibujar, con 0 excepciones y 0 errores de consola. Si el número de salas cambia, el detalle lo avisa (constante `SALAS_AUDITADAS`) |
| C-01 ×7 | C-01 | Guardián, Heraldo, Oráculo, Forjador, Tempestad, Raíz y Ecos: tras el golpe final, el jugador camina hacia la salida durante `dying`. Se espera pasar por `levelclear`, `invulnT ≤ 1,3` y, con Ecos (final), `completed: true` en el guardado. Acepta las dos correcciones posibles (puertas cerradas hasta la victoria, o victoria al salir de la sala) |
| B-01 | B-01 | Golpear al Guardián en `dying` no da energía |
| A-01a | A-01 | Pulsar salto en el 2.º paso del hit-stop hace saltar al jugador cuando termina el hit-stop |
| A-01b | A-01 | Soltar el salto durante el hit-stop recorta la altura: debe quedar por debajo del punto medio entre el salto completo y el salto soltado al mismo tiempo sin hit-stop |
| A-01c | A-01 | Con el Sable Cargado, una pulsación de ATACAR dentro del hit-stop produce un tajo |
| A-02 | A-02 | Puente de las Fases: el jugador está de pie sobre un bloque azul (con un punto seguro previo legítimo en el pilar) y la fase cambia. Como mucho 1 golpe de pinchos en 10 s y el HP debe estabilizarse |
| C-02 (mapa) | C-02 | **Progresión del mapa.** Inundado del hueco del jugador (1×2 baldosas) sobre la rejilla global desde el banco inicial, sin gravedad, repetido por etapas hasta un punto fijo. Las puertas de salida de cada jefe están cerradas hasta que se alcanza su sala; los muros agrietados se rompen siempre; los sellos de cristal solo con el Sable, que se obtiene al vencer al Oráculo. Exige: (1) todas las salas no secretas alcanzables por progresión; (2) todas las salas al final; (3) con todo desbloqueado pero los sellos intactos, todas las no secretas siguen alcanzables (ningún sello en una ruta necesaria); (4) sin solapes. Condición necesaria: no modela alturas de salto |
| C-02 (juego) | C-02 | Desde la cornisa de salida del Pozo del Eco, el jugador pasa la repisa de entrada de la Galería Suspendida |
| C-02 (alcoba) | C-02 | Cámara del Rayo: sin el Sable, la celda de shard4 es inalcanzable (análisis) y en el juego ni tajos ni saltos rompen el sello; con el Sable, la onda lanzada en un salto desde la repisa rompe el sello y shard4 se recoge |
| A-03 | A-03 | Los 6 minijefes: 10 s después de vencerlos sin salir de su sala, `invulnT ≤ 1,3` |
| A-04 | A-04 | **Arenas que encierran:** con las puertas activas, ninguna de las arenas de jefe deja salir (análisis por inundado); y en la Arena Áurea, con el combate activo, el jugador no puede salir caminando |
| A-05 | A-05 | Con el Sable Cargado, un toque de ATACAR (6 pasos) produce el tajo en ≤ 2 pasos, como sin el Sable |
| A-06 | A-06 | La Tempestad y el Forjador tienen la misma duración (±1 paso) de aviso de disparo y de rugido en fase 2 |
| M-09 | M-09 | Al reaparecer en un banco situado dentro de una arena, el combate no empieza solo; y sentarse con el jefe activo no lo devuelve a vida llena. **Depende de una decisión de diseño** (AUDITORIA.md, U.7-1): si se decide que el comportamiento actual es intencional, el caso se elimina en vez de quitar la marca |
| M-07 | M-07 | Un guardado de partida terminada (Ecos vencido, `completed: true`) lo conserva tras `continueGame()` + `saveGame()` |
| PERF | — | Milisegundos por fotograma (update + draw) en Cascadas. Solo informativo |

Los casos colocan al jugador lejos de los disparadores de los jefes y de los bancos (por ejemplo, el combate se activa desde x=9-10), para que una corrección que mueva un disparador o un banco no invalide la preparación.

## Al corregir un hallazgo: quitar la marca pendiente

1. Corrige el bug en el juego.
2. Ejecuta `node tests/regresion.mjs`. Los casos de ese hallazgo deberían salir como **ANOMALÍA** (el test pasa pero sigue marcado como pendiente).
3. En `tests/regresion.mjs`, busca el caso y cambia `pendiente: '<ID>'` por `pendiente: null`. Por ejemplo, para C-01:
   ```js
   … pendiente: 'C-01', async run(pg) {    // antes
   … pendiente: null, async run(pg) {      // después
   ```
   Hay que cambiarlo en todos los casos de ese ID: C-01 tiene siete casos generados desde una sola definición; A-01 tiene tres (A-01a, A-01b y A-01c).
4. Vuelve a ejecutar: esos casos deben salir como **PASA**, y desde ese momento cualquier fallo en ellos es una regresión (FALLA).
5. Cuando no quede ninguna marca pendiente, `--strict` debería salir con código 0.

Si después de corregir el bug un caso sale como **ERROR** en lugar de ANOMALÍA, lee el detalle: puede que la corrección cambie el escenario (por ejemplo, que el jugador ya no pueda salir de la sala) y haya que ajustar la preparación del test, no relajar lo que se espera.

## Limitaciones (no automatizado)

- Controles táctiles, mando físico, Safari/iOS y orientación del móvil.
- Audio: el contexto de Web Audio en headless no se escucha; no se verifica el sonido.
- Comparación visual con `screenshots/` y comportamiento a distintas frecuencias de refresco (60/144 Hz).
- Los tests acceden a internos del juego a través de `GAME.Game` (p. ej. `player.safe`, `boss.hurt`, `room.phases`). Si una refactorización renombra esos campos, habrá que actualizar los tests junto con el código.
