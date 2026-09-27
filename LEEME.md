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
| ↓ + Saltar sobre plataforma fina | Bajar de la plataforma |
| V / Shift (mantener) | Curar 1 máscara (gasta 1/3 de energía) |
| ↑ / W en un banco | Sentarse: guardar partida, curar y revivir enemigos |
| Enter / Esc / P | Pausa |
| Mando | A saltar · X atacar · B/RB dash · Y/LB curar · Start pausa |

## Móvil (táctil)
- Los controles táctiles aparecen solo en dispositivos táctiles: joystick flotante a la izquierda
  (toca en cualquier punto del 45 % izquierdo), botones SALTAR / ATACAR / DASH / CURAR (mantener) a la derecha
  y ❚❚ (pausa) arriba. Multitáctil: puedes mantener dirección + saltar + dash a la vez; se puede deslizar el pulgar entre botones.
- Título: toca «Continuar» o «Nueva partida». Pausa, «Nivel 1 completado» y victoria: toca la pantalla para continuar.
- Juega en horizontal (en vertical aparece «Gira tu teléfono» y el juego se pausa).
- Al primer toque intenta pantalla completa y bloqueo horizontal (Android/Chrome). En iPhone (Safari) no hay API de
  pantalla completa: usa «Compartir → Añadir a pantalla de inicio» para jugar sin barras del navegador.
- Para jugar desde el móvil, sirve la carpeta en tu red local (`python3 -m http.server 8765 --bind 0.0.0.0`)
  y abre `http://IP-DE-TU-PC:8765/` en el teléfono.

## Reglas de progreso
- Al sentarte en un banco los enemigos derrotados reviven (como en Hollow Knight) y la partida se guarda.
- Fuera de eso los enemigos muertos siguen muertos: morir o volver a entrar en una sala no los revive.
- Al morir reapareces en el último banco; el combate contra el jefe se reinicia por completo (puerta abierta, vida llena).
- Tras derrotar a un jefe su puerta queda abierta.

## Guardado
- Se guarda en `localStorage` (clave `hojaCarmesi.save.v1`) al sentarse en un banco: nivel, banco, máscaras máximas,
  secretos, jefes derrotados, salas visitadas y tiempo.
- En el título aparece «Continuar» si hay partida guardada, y «Nueva partida» (pide confirmación si ya hay una guardada).
  Se elige con ↑↓/←→ + Enter/Z, o tocando.

## Mapa
### Nivel 1 · Reino Hueco (nocturno)
Santuario Caído (banco) → Pasaje de Espinas → Pozo del Eco (requiere salto de pared) →
Galería Suspendida (foso de pinchos: requiere rebote; banco) → Cámara del Guardián (jefe).
Secreto: Cripta Olvidada (bajo el Santuario) con un Fragmento de máscara (+1 salud máxima).
Al vencer al Guardián Hueco aparece «NIVEL 1 COMPLETADO» y se abre la salida este de su cámara.

### Nivel 2 · Cumbres del Alba (diurno, ruinas en acantilados)
Mirador del Alba (banco, plataforma móvil) → Puente de los Vientos (plataformas que se desmoronan, plataforma móvil
sobre espinas) → Cascadas Gemelas (corriente de aire ascendente, elevador) → Jardín Colgante →
Terrazas del Viento (dos corrientes de aire sobre un foso; banco antes del jefe) → Santuario del Sol (jefe).
Secreto: en Cascadas Gemelas, un muro agrietado a la izquierda de la cornisa alta (3 golpes) lleva al Nido Oculto,
donde espera el **Cristal del Alba** (más energía por golpe y curación más rápida).

Enemigos nuevos:
- **Escudero**: su escudo frontal bloquea los tajos. Golpéalo por la espalda, o con tajo abajo/arriba. Embiste con el escudo tras un aviso.
- **Búho Pétreo**: torreta que avisa y dispara semillas; las semillas se pueden cortar o usar para rebotar.
- Reaparecen Escarabajos dorados y Gaviotas (versiones diurnas de los enemigos del nivel 1).

Jefe: **Heraldo del Alba** (44 de vida). Estocada con lanza, picado desde el cielo (marca en el suelo que sigue
y luego se fija), abanico de plumas; en fase 2 (50 %): picado con ondas de choque, doble abanico y pilares de luz.
Vencerlo termina el juego.

## Archivos
- `index.html` — punto de entrada
- `js/input.js` teclado + mando · `js/world.js` salas y colisiones · `js/fx.js` partículas, sacudida, hit-stop
- `js/touch.js` + `css/touch.css` controles táctiles, aviso de orientación · `manifest.webmanifest` + `icons/` app instalable
- `js/player.js` personaje · `js/enemies.js` enemigos · `js/boss.js` jefe nivel 1 · `js/level2.js` plataformas, viento, enemigos y jefe del nivel 2 · `js/main.js` bucle, cámara, HUD, pantallas
