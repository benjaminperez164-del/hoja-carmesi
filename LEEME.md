# Hoja Carmesí — Ecos del Abismo (prototipo vertical slice)

Plataformas de acción 2D: movimiento rápido de espadachín (dash, salto de pared, combo de sable)
mezclado con exploración estilo metroidvania (rebote/pogo, energía para curarse, bancos, máscaras de salud).
Todo el arte es provisional y se dibuja por código (Canvas 2D). Sin dependencias: funciona sin conexión.

## Cómo jugar
- Abre `index.html` directamente en el navegador, o sirve la carpeta:
  `python3 -m http.server 8765` y visita http://localhost:8765/

## Controles
| Tecla | Acción |
|---|---|
| ← → / A D | Moverse |
| Z / J / Espacio | Saltar (mantén para más altura) |
| X / K | Atacar (combo de 3 golpes en suelo; tajo aéreo en el aire) |
| ↓ + Ataque (aire) | Tajo abajo: rebota en enemigos y pinchos |
| ↑ + Ataque (aire) | Tajo hacia arriba |
| C / L | Dash (en suelo, y 1 en el aire) |
| Saltar tocando pared | Salto de pared (con Dash pulsado: salto largo) |
| Saltar en el aire | **Salto Celeste** (doble salto, tras vencer al Heraldo del Alba) |
| ↓ + Saltar sobre plataforma fina | Bajar de la plataforma |
| V / Shift (mantener) | Curar 1 máscara (gasta 1/3 de energía) |
| ↑ / W en un banco | Sentarse: guardar partida, curar y revivir enemigos |
| Enter / Esc / P | Pausa |
| M | Silenciar / activar sonido |
| Mando | A saltar · X atacar · B/RB dash · Y/LB curar · Start pausa |

## Móvil (táctil)
- Los controles táctiles aparecen solo en dispositivos táctiles: joystick flotante a la izquierda
  (toca en cualquier punto del 45 % izquierdo), botones SALTAR / ATACAR / DASH / CURAR (mantener) a la derecha
  ❚❚ (pausa) arriba y ♪ (altavoz: silenciar/activar sonido). Multitáctil: puedes mantener dirección + saltar + dash a la vez; se puede deslizar el pulgar entre botones.
- Título: toca «Continuar» o «Nueva partida». Pausa, «Nivel completado», nueva habilidad y victoria: toca la pantalla para continuar.
- Pulsa SALTAR otra vez en el aire para el Salto Celeste (cuando lo tengas).
- Juega en horizontal (en vertical aparece «Gira tu teléfono» y el juego se pausa).
- Al primer toque intenta pantalla completa y bloqueo horizontal (Android/Chrome). En iPhone (Safari) no hay API de
  pantalla completa: usa «Compartir → Añadir a pantalla de inicio» para jugar sin barras del navegador.
- Para jugar desde el móvil, sirve la carpeta en tu red local (`python3 -m http.server 8765 --bind 0.0.0.0`)
  y abre `http://IP-DE-TU-PC:8765/` en el teléfono.

## Sonido y música
- Todo el audio se genera por código con la Web Audio API (composiciones originales, sin archivos de audio).
- Efectos: combo de sable (3 variantes), tajo aéreo/abajo, dash, salto, doble salto, salto de pared, aterrizaje,
  golpe y muerte de enemigos, daño, curación, banco, rebote, objetos, puertas, avisos de ataque de los jefes,
  muerte de jefe, menús.
- Música chiptune: tema de título, un tema por zona (cueva oscura, amanecer, templo de cristal), tema de jefe por nivel,
  fanfarria de nivel completado y de victoria. Fundido cruzado al cambiar de zona o empezar un combate.
- El audio se activa con el primer toque/tecla (requisito de iOS Safari). Botón «Sonido» en título y pausa,
  altavoz ♪ en móvil y tecla M; la preferencia se guarda en `localStorage` (`hojaCarmesi.audio`).
  La música se detiene si la pestaña queda oculta.

## Reglas de progreso
- Al sentarte en un banco los enemigos derrotados reviven (como en Hollow Knight) y la partida se guarda.
- Fuera de eso los enemigos muertos siguen muertos: morir o volver a entrar en una sala no los revive.
- Al morir reapareces en el último banco; el combate contra el jefe se reinicia por completo (puerta abierta, vida llena).
- Tras derrotar a un jefe su puerta queda abierta.

## Guardado
- Se guarda en `localStorage` (clave `hojaCarmesi.save.v1`) al sentarse en un banco: nivel, banco, máscaras máximas,
  secretos, jefes derrotados, salas visitadas y tiempo (incluye Nivel 3 y el Salto Celeste).
- Partidas antiguas: si ya habías vencido al Heraldo del Alba, al pulsar «Continuar» recibes el Salto Celeste automáticamente.
- En el título aparece «Continuar» si hay partida guardada, y «Nueva partida» (pide confirmación si ya hay una guardada).
  Se elige con ↑↓/←→ + Enter/Z, o tocando.

## Mapa
### Nivel 1 · Reino Hueco (nocturno)
Santuario Caído (banco) → Pasaje de Espinas → Pozo del Eco (requiere salto de pared) →
Galería Suspendida (foso de pinchos: requiere rebote; banco) → Cámara del Guardián (jefe).
Secreto: Cripta Olvidada (bajo el Santuario) con un Fragmento de máscara (+1 salud máxima).
Secreto nuevo (requiere Salto Celeste): hueco en el techo del Pasaje de Espinas, sobre la plataforma alta de la derecha →
**Nicho Celeste** con otro Fragmento de máscara.
Al vencer al Guardián Hueco aparece «NIVEL 1 COMPLETADO» y se abre la salida este de su cámara.

### Nivel 2 · Cumbres del Alba (diurno, ruinas en acantilados)
Mirador del Alba (banco, plataforma móvil) → Puente de los Vientos (plataformas que se desmoronan, plataforma móvil
sobre espinas) → Cascadas Gemelas (corriente de aire ascendente, elevador) → Jardín Colgante →
Terrazas del Viento (dos corrientes de aire sobre un foso; banco antes del jefe) → Santuario del Sol (jefe).
Secreto: en Cascadas Gemelas, un muro agrietado a la izquierda de la cornisa alta (3 golpes) lleva al Nido Oculto,
donde espera el **Cristal del Alba** (más energía por golpe y curación más rápida).
Secreto nuevo (requiere Salto Celeste): repisa alta sobre la plataforma central del Jardín Colgante →
**Vasija de Energía** (curar cuesta menos: 4 curas con el orbe lleno).

Enemigos nuevos:
- **Escudero**: su escudo frontal bloquea los tajos. Golpéalo por la espalda, o con tajo abajo/arriba. Embiste con el escudo tras un aviso.
- **Búho Pétreo**: torreta que avisa y dispara semillas; las semillas se pueden cortar o usar para rebotar.
- Reaparecen Escarabajos dorados y Gaviotas (versiones diurnas de los enemigos del nivel 1).

Jefe: **Heraldo del Alba** (44 de vida). Estocada con lanza, picado desde el cielo (marca en el suelo que sigue
y luego se fija), abanico de plumas; en fase 2 (50 %): picado con ondas de choque, doble abanico y pilares de luz.
Vencerlo otorga la pluma del **Salto Celeste** y abre la salida este hacia el Nivel 3.
La arena del Santuario del Sol está al mismo nivel que la entrada (no hay cornisa segura).

### Nivel 3 · Templo de Cristal (luminoso)
Atrio de Cristal (banco, plataforma intermitente sobre púas) → Galería de los Haces (rayos de luz con ritmo) →
Pozo Prismático (ascenso con plataformas intermitentes y doble salto) → Puente de las Fases (cristales que alternan
bloques dorados/azules) → Claustro de Cuarzo (techo bajo: rebota en las púas de cristal) → Antecámara de Luz (banco) →
Corazón del Templo (jefe).
Secreto: en el Pozo Prismático, muro de cristal agrietado a la izquierda de la cornisa media → **Relicario de Luz**
(Fragmento de máscara).

Enemigos nuevos:
- **Centinela Prisma**: cristal flotante que apunta (línea de aviso) y dispara un rayo.
- **Polilla de Luz**: revolotea, destella y se lanza en picado.
- Reaparecen los escarabajos (versión amatista).

Jefe: **Oráculo Prismático** (52 de vida). Rayo apuntado (sigue al jugador y luego se fija), lluvia de cristales
(columnas marcadas en el techo, siempre con huecos), embestida por el suelo de lado a lado; en fase 2 (50 %): doble rayo,
embestida con ondas de choque y columnas de luz alternas en toda la arena. Vencerlo termina el juego.
La entrada está al nivel de la arena y los ataques cubren toda la sala.

## Archivos
- `index.html` — punto de entrada
- `js/input.js` teclado + mando · `js/world.js` salas y colisiones · `js/fx.js` partículas, sacudida, hit-stop
- `js/touch.js` + `css/touch.css` controles táctiles, aviso de orientación · `manifest.webmanifest` + `icons/` app instalable
- `js/player.js` personaje · `js/enemies.js` enemigos · `js/boss.js` jefe nivel 1 · `js/level2.js` plataformas, viento, enemigos y jefe del nivel 2 · `js/level3.js` haces, plataformas intermitentes, cristales de fase, enemigos y jefe del nivel 3 · `js/audio.js` sonido y música (Web Audio) · `js/main.js` bucle, cámara, HUD, pantallas
