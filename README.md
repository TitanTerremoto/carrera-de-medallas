# Pokémon: Carrera de Medallas

Juego de mesa de preguntas para 4 jugadores. La pantalla principal (la que
se graba) muestra el tablero 3D. Cada jugador puede jugar desde su celular,
desde otra pestaña o directamente en la pantalla principal.

## Cómo jugar

| Forma | Qué hace falta |
| --- | --- |
| **Celulares en la misma Wi-Fi** | Correr el servidor local en la PC (ver abajo) y abrir la pantalla principal con la **IP de la PC**, por ejemplo `http://192.168.1.9:8765`. «🌐 Crear sala en línea» muestra el enlace para los celulares. No hace falta publicar nada. |
| **Varias pestañas en una PC** | Igual: cada pestaña de `control.html` es un jugador distinto. |
| **Una sola pantalla** | Solo la pantalla principal. Servida por http se ve el 3D; abierta con doble clic, el tablero 2D. |

Los asientos sin dispositivo conectado se juegan desde la pantalla principal.
Si un celular se desconecta, ese asiento vuelve a la pantalla principal
hasta que el celular se reconecta. Al recargar la página, el celular
recupera su asiento automáticamente.

**Desconexiones.** El celular y la pantalla principal se mandan un latido
cada 2 s. Si uno no oye al otro durante 8 s (celular bloqueado, cambio de
Wi-Fi a datos, sin batería), la pantalla principal libera el asiento y el
celular se reconecta solo en cuanto puede, sin perder su lugar. Si un
jugador no responde en su turno, la pantalla principal muestra
**«🎮 Jugar aquí»** para jugar ese turno desde ahí (vale hasta que termina
el turno).

**Celular.** Muestra un tablero mínimo (las 36 casillas, las fichas y, en el
centro, las medallas y aciertos de cada jugador) y debajo solo lo que hay
que hacer: golpear el bloque, responder, elegir… Los textos largos
(explicaciones, reglas) quedan en la pantalla principal.

### Servidor local

```bash
python -m http.server 8765 --directory games/carrera-de-medallas
```

La PC necesita internet: PeerJS usa su servidor público para presentar los
dispositivos (los mensajes del juego viajan directo por la Wi-Fi). Si un
celular no carga la página, revisa que el firewall de Windows permita
Python en redes privadas.

## Bloque de dado

En cada turno, sobre la ficha flota un bloque dorado con los números del
**1 al 10** girando a toda velocidad. Al golpearlo (botón en la pantalla o
tocándolo en el celular) se frena, se rompe en pedazos y el número queda
sobre la ficha. El número lo sortea la pantalla principal en el momento del
golpe: el giro es solo visual, así que no se puede «cazar» un número.

## Recursos Pokémon (uso privado)

Proyecto para jugar entre amigos, sin publicar. Los recursos están en
`assets/` y se descargaron de los repositorios públicos de
[PokeAPI](https://github.com/PokeAPI/sprites) (las imágenes son de
Nintendo / Game Freak / The Pokémon Company):

- `assets/pokemon/`: artwork oficial (256 px, en WebP) de las fichas, de
  los Pokémon que nombran las preguntas y de las casillas especiales.
- `assets/types/`: símbolo de cada tipo (en las opciones como «Fuego/Volador»).
- `assets/badges/`: medallas de gimnasio de Kanto. Tipos → Arcoíris,
  Pokédex → Roca, Habilidades → Trueno, Cambalache → Alma.
- `assets/cries/`: gritos de las ocho fichas (suenan al empezar su turno,
  al ganar una medalla y al ganar la partida).
- `pokedata.js`: lista de nombres y tipos que usa el juego para encontrar
  las imágenes. Si agregas preguntas con otros Pokémon, suma su imagen en
  `assets/pokemon/` y su nombre en `pokedata.js`.

Casillas especiales con lugares de Kanto: Pueblo Paleta (salida), Monte Moon
(pierdes un turno), Centro Pokémon (eliges la categoría), Islas Espuma
(retrocedes 4), Dodrio veloz (avanzas), Diglett (retrocedes) y 2 casillas del
Team Rocket (robas una medalla).

## Modo tester

Bots que juegan solos, para ver cómo avanza una partida sin jugadores:

- En la configuración: «▶ Ver una partida automática». Los asientos vacíos
  se completan con bots («Bot Pikachu», …); los que ya tienen nombre o un
  celular conectado se respetan.
- Durante una partida: «🤖 Modo tester» en la barra de arriba enciende o
  apaga los bots sobre la partida actual.
- Directo: `index.html?tester=1` (arranca en pausa, listo para «Probar casilla»; «▶ Seguir» deja jugar a los bots).
- **🛠 Debug (emergencias):** sección plegable al final del menú. Permite cambiar la casilla, las medallas, los aciertos y «pierde turno» de cualquier jugador, darle el turno a otro y cerrar un turno trabado (pregunta, escena o animación). Al abrirla, los bots se pausan; cada cambio queda en el registro con 🛠 y se guarda.
- **Tecla P** (en cualquier vista, también en la de grabación): muestra u oculta el menú. Al abrirlo, con la P o con el botón, los bots quedan en pausa: se decide con «Probar casilla» o «▶ Seguir».

**Probar casilla:** en el panel, elige cualquiera de las 36 casillas y toca
«🧪 Ir». El jugador en turno salta a la casilla anterior y avanza 1, así se ve
la llegada y el efecto (pregunta, medalla, Diglett, Team Rocket…). Funciona al
empezar un turno; si los bots están jugando, se pausan. Para el Team Rocket, si
nadie tiene nada que robar, a un rival se le da una medalla de prueba (queda
anotado en el registro con 🧪).

**Escenas de las casillas especiales (3D):** al caer, la cámara va directo a
una escena con un personaje de Cobblemon y la caja de diálogo, sin ventanas:

- **Medalla directa:** el líder habla con su Pokémon (Erika y Tangela, Brock y
  Onix, Lt. Surge y Raichu, Koga y Venomoth) y después aparece la pregunta.
- **Pueblo Paleta:** Mew baja flotando y regala una medalla.
- **Desafío de la Liga:** Lance llega con Dragonite y hace la pregunta final.
- **Islas Espuma:** Tentacool arrastra la ficha 4 casillas hacia atrás.

- **Centro Pokémon:** entra Chansey caminando y pregunta la categoría con
  opciones en la caja (las bloqueadas por la regla de la medalla aparecen
  grises); desde el celular se elige igual que antes.
- **Monte Moon:** tres Zubat dan vueltas en picada alrededor de la ficha, que
  gira mareada; el narrador avisa que pierde su próximo turno.
- **Dodrio veloz:** llega Dodrio corriendo, habla y corre al lado de la ficha
  mientras avanza.
- **Diglett:** asoma del suelo con una nube de tierra, la ficha salta del
  susto, retrocede y Diglett se vuelve a meter.

`view3d/sceneDirector.js` dirige estas escenas; `view3d/visitors.js` anima a
los personajes y `view3d/sceneShot.js` elige dónde se paran y el plano (sin
pisar fichas y con el personaje y la ficha a la vista).

**Escena del Team Rocket:** en vez de ventanas, es una escena con diálogo
estilo juego de fiesta. Baja el globo aerostático del Team Rocket, en bloques
estilo Minecraft como los Pokémon de Cobblemon (lona gris en gajos con la «R»
roja de borde blanco; `view3d/rocket.js`, ~1.400 bloques en un solo
InstancedMesh). El globo se arma a partir de las medidas de Meowth: la canasta
lo rodea con medio bloque de aire y la lona empieza por encima de su cabeza,
así nunca lo tapa. `view3d/rocketShot.js` elige dónde baja (sin caer sobre
ninguna ficha, dentro del tablero) y desde qué ángulo mirar, comprobando que no
haya lona, canasta ni fichas entre la cámara y Meowth o la ficha. Junto a la ficha, la cámara los encuadra lado a lado, y Meowth
(modelo de Cobblemon, `models/decor/meowth.glb`) habla en una caja de diálogo
abajo del tablero: el texto aparece letra por letra, con «bips», mientras
mueve la boca. Se avanza tocando la caja (o con Enter/Espacio) y la víctima se
elige con las opciones dentro de la misma caja (desde el celular, si el
jugador está conectado). La pregunta de defensa sigue siendo una ventana. Si
la víctima falla, la medalla vuela al ladrón mientras Meowth festeja; si
acierta, el globo sale disparado girando y aparece «¡El Team Rocket sale
volando otra vez!». La caja está en `talk.js` y sirve para otros personajes.

El panel (abajo a la izquierda) muestra turnos, aciertos, quién va ganando y
de quién es el turno. Permite pausar, avanzar **un paso** por vez, elegir el
porcentaje de aciertos (50–100 %) y el ritmo: Normal, Rápido o **Turbo** (sin
animaciones: una partida entera en un par de minutos). Los bots usan las
mismas acciones que un celular, así que se prueba el juego real. Nunca juegan
por un asiento con un dispositivo conectado.

## Vista de grabación

«🎥 Vista de grabación» deja el tablero al centro y **cuatro espacios para
cámaras, dos de cada lado**, con el nombre, los aciertos y las medallas de cada
jugador debajo. Las preguntas y avisos aparecen dentro del área de juego
(el tablero) y **nunca tapan las cámaras**. Los espacios
pueden ser un marco neutro o **verde croma**
(«🟩 Fondo verde») para superponer video en la edición. La barra de
opciones solo aparece al pasar el mouse por arriba. También se abre con
`index.html?vista=grabacion`.

## Cámara 3D

- **Automática:** al empezar cada turno, la cámara baja hasta la ficha y
  aparece el bloque «?». La ficha salta, lo golpea y sale el número; avanza
  saltando con el contador encima y, al caer, la casilla destella. Después la
  cámara sube a la vista cenital (igual al tablero 2D) para la pregunta.
- **Siempre arriba:** todo se ve desde la vista cenital.

El botón «🎬 Cámara» aparece en la esquina del tablero al pasar el mouse.

## Escenografía (diorama de Kanto)

Alrededor del tablero 3D (`view3d/scenery.js`):

| Zona | Qué hay |
| --- | --- |
| Esquina de salida | Pueblo Paleta: casa, cercas, farol y banco |
| Esquina de Monte Moon | Montaña con cueva, Clefairy bailando y Zubat volando |
| Esquina del Centro Pokémon | Centro Pokémon, Tienda, fuente y Chansey en la puerta |
| Esquina de Islas Espuma | Mar animado con islas heladas y Tentacool nadando |
| Detrás del tablero | Liga Pokémon: gimnasio en una colina con banderas |
| Lados | Camino de tierra, hierba alta, árboles, flores, Diglett asomando y Pidgey volando |

Al empezar una partida, la cámara hace un recorrido de ~8 s por el diorama
(un clic sobre el tablero lo saltea).

- **Edificios:** son los de PokeSwap (`public/assets/town/models`, modelos de HeartGold/SoulSilver), copiados en `assets/town/` y dibujados por `view3d/townmodels.js`.
- **Pokémon decorativos:** son de Cobblemon, en `models/decor/`.

**Rendimiento:**
- árboles, hierba, flores y postes usan *instancing* (una llamada de dibujo por tipo);
- materiales Lambert;
- la decoración no proyecta sombras en tiempo real (los edificios traen la suya pintada);
- edificios y Pokémon se cargan después del tablero.

Si la PC no sostiene ~45 cuadros por segundo, la calidad baja sola por pasos: resolución 1×, sin sombras dinámicas y sin Pokémon decorativos.

## Fichas 3D

Hay 8 fichas para elegir (sin repetir): Pikachu, Charmander, Squirtle,
Bulbasaur, Emolga, Noibat, Jolteon y Treecko. Los modelos de Cobblemon no
traen las mismas animaciones: Emolga y Noibat vuelan al moverse, Treecko
camina y festeja, y el de Jolteon viene sin animación (es una pose fija; la
ficha igual salta y se balancea).

Los modelos son los del mod **Cobblemon** (estilo Minecraft), descargados de
`https://cobblemon.tools/pokedex/pokemon/<nombre>/models/<nombre>.gltf` para
uso privado. Los originales (`.gltf` de Blockbench, con decenas de
animaciones) están en `tools/models-src/`, que no se publica. El juego usa
`.glb` livianos en `models/`, con solo las animaciones que usa:

```bash
python tools/gltf_to_glb.py tools/models-src/pikachu.gltf --keep ground_idle,ground_run,cry,dance,recoil --out models
```

Si cambias una animación en `models.json` o en `view3d/scenery.js`, vuelve a
generar ese `.glb` con la animación nueva en `--keep`.

Three.js (`vendor/three/`) está minificado con esbuild.

`models/models.json` dice qué archivo usa cada ficha y qué animación del
modelo corresponde a cada momento del juego:

| Clave | Cuándo se usa |
| --- | --- |
| `idle` | En reposo. |
| `move` | Mientras salta de casilla en casilla. |
| `cry` | Al empezar su turno. |
| `happy` | Al acertar y al ganar (si no tiene, usa `cry`). |
| `sad` | Al fallar. |

Los párpados de estos modelos tapan los ojos en reposo, así que el juego los
oculta y hace su propio parpadeo cada pocos segundos; también oculta las
expresiones alternativas ("emote") de Pikachu.

**Cámara.** Los cambios de plano son de tipo grúa: la cámara gira alrededor
de lo que mira (inclinación y giro), acerca o aleja con zoom parejo y frena
suave; desde la vista cenital no da vueltas. Si llega un movimiento nuevo, el
anterior se abandona en vez de pelearse con él.

El juego ajusta el tamaño según la pose de reposo y apoya el modelo sobre
la base. `rotationY` (en grados) corrige hacia dónde mira: los de Cobblemon
usan 180. Si un modelo falta o no carga, se usa la figura de juguete incluida
(las fichas nuevas, que no tienen figura propia, muestran la de Pikachu).

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Pantalla principal: configuración, tablero, ventanas y «Cómo jugar». |
| `talk.js` | Caja de diálogo de personajes (texto letra por letra, opciones). |
| `view3d/sceneDirector.js` · `visitors.js` · `sceneShot.js` · `rocket.js` · `rocketShot.js` | Escenas de las casillas especiales: personajes, globo, cámara y choques. |
| `control.html` · `control.js` · `control.css` | Control del jugador (celular u otra pestaña). |
| `script.js` | Reglas, turnos, preguntas, aciertos, medallas, guardado, victoria y acciones remotas. |
| `board.js` | Tablero 2D, dado del panel y leyenda. |
| `view3d/` | Tablero 3D: escena, fichas, efectos, cámara e interpolaciones. |
| `net-protocol.js` · `net-host.js` | Protocolo y sala en línea (lado de la pantalla principal). |
| `recording.js` | Vista de grabación con los espacios de cámara. |
| `tester.js` | Modo tester: bots que juegan solos. |
| `setup.js` | Configuración de jugadores (local o desde dispositivos). |
| `questions.js` | Preguntas escritas a mano (~24 por categoría) y el banco `liga` del desafío final. |
| `questions-<categoría>.js` | 500 preguntas por categoría generadas desde datos de PokeAPI (no editar a mano). |
| `tools/question-gen/` · `tools/pokeapi-data/` | Generadores (Python, sin dependencias) y los CSV de PokeAPI que usan. |
| `pokedata.js` · `assets/` | Nombres, tipos y recursos Pokémon (artwork, tipos, medallas, gritos). |
| `config.js` | Categorías, colores y recorrido del tablero (36 casillas). |
| `art.js` · `dom.js` · `sound.js` | Imágenes de fichas y medallas, Poké Ball, utilidades de interfaz, sonidos y gritos. |
| `vendor/` | PeerJS 1.5.5 y Three.js 0.186.1 (licencia MIT), copiados para no depender de un CDN. |

## Seguridad y autoridad

- La pantalla principal guarda la partida y decide todo. Los dispositivos
  solo envían intenciones (lanzar, responder, elegir, continuar), y solo se
  aceptan las del jugador en turno.
- Los dispositivos no reciben la respuesta correcta hasta después de
  responder. El banco de preguntas sí es público (`questions.js` se publica
  junto al juego), así que alguien decidido podría consultarlo.
- PeerJS usa su servidor público solo para presentar los dispositivos. Los
  mensajes de la partida viajan directo entre ellos (WebRTC). Entre redes
  muy restrictivas (algunos datos móviles) la conexión directa puede fallar.

## Publicar una versión nueva

Los archivos propios se cargan con `?v=N` para que los navegadores no usen
una copia vieja guardada. Al publicar cambios, sube ese número en
`index.html` (etiquetas `<script>`/`<link>` y el `importmap`) y en
`control.html`.

## Bancos de preguntas generados

`questions-tipos.js`, `questions-pokedex.js`, `questions-habilidades.js` y
`questions-cambalache.js` (500 cada uno) se generan con los scripts de
`tools/question-gen/` a partir de los CSV oficiales de PokeAPI en
`tools/pokeapi-data/` (nombres en español). Cada generador verifica que
haya una sola opción correcta según los datos y que no haya preguntas
repetidas. Para regenerarlos:

```bash
python games/carrera-de-medallas/tools/question-gen/gen_tipos.py
```

(Igual con `gen_pokedex.py`, `gen_habilidades.py` y `gen_cambalache.py`.)
Los valores son los actuales de PokeAPI (por ejemplo, potencias revisadas en
la 6.ª generación).

## Agregar preguntas

Suma un objeto a la categoría que corresponda en `questions.js`:

```js
{
  q: 'Enunciado',
  correct: 'Respuesta correcta',
  wrong: ['Incorrecta 1', 'Incorrecta 2', 'Incorrecta 3'],
  explain: 'Explicación breve',
}
```

## Reglas

- **Objetivo:** conseguir las **4 medallas de gimnasio** (Tipos, Pokédex, Habilidades y Cambalache) y vencer el **desafío de la Liga Pokémon**.
- **Aciertos:** son de cada jugador, se conservan entre turnos y **un error no los borra**. Con 2 aciertos, la próxima pregunta normal es **por la medalla** de su categoría. Acierte o falle esa pregunta, los aciertos vuelven a 0. Si con 2 aciertos cae en una categoría cuya medalla ya tiene, **pierde el turno** (sin pregunta) y conserva sus aciertos; en el Centro Pokémon solo puede elegir categorías cuya medalla le falta.
- **Medalla directa:** si aciertas, ganas esa medalla. Los aciertos no suben ni se borran. Si ya la tienes, se avisa y no hay pregunta.
- **Mew en Pueblo Paleta:** cada vez que la ficha cruza o cae en la salida avanzando (dado o Dodrio), Mew le regala una medalla al azar entre las que le faltan. Retroceder (Diglett, Islas Espuma) no cuenta. El regalo se guarda en el momento: recargar no lo repite.
- **Desafío de la Liga:** apenas un jugador junta las 4 medallas (pregunta, Team Rocket o Mew), llega **Lance** con Dragonite y hace la pregunta final del banco `liga` (Alto Mando, campeones, líderes, legendarios y míticos). Si acierta, gana. Si falla, al empezar su próximo turno Lance le pregunta otra vez, sin tirar el dado. Si el Team Rocket le roba una medalla, vuelve a jugar normal.
- **Tiempo:** hay 20 segundos para responder cada pregunta (también el desafío final). Si se acaba, cuenta como respuesta incorrecta. El reloj lo lleva la pantalla principal; el celular muestra la misma cuenta regresiva.
- **Centro Pokémon:** eliges la categoría y la pregunta cuenta como una normal.
- **Team Rocket (2 casillas):** eliges a un rival que tenga alguna medalla que tú no tengas; sale al azar una de esas. El rival la defiende con una pregunta de esa categoría (20 s, responde desde su dispositivo): si acierta la conserva; si falla, pasa a ser tuya. No toca los aciertos. Si nadie tiene nada para robarte, no pasa nada. Si le robas la 4.ª medalla a alguien, Lance llega al instante.
- **Avance/retroceso:** después de moverte se aplica la nueva casilla (como máximo 3 movimientos encadenados por turno).
- **Monte Moon:** pierdes tu próximo turno.
- **Guardado:** el turno en curso también se guarda. Si se recarga la pantalla principal, se retoma el mismo evento: no se puede volver a tirar ni cambiar la pregunta.

Duración estimada (simulación de 20.000 partidas con las reglas actuales: Mew, Lance al instante, escenas). Con ritmo «en vivo» (gente que charla y piensa, ~30 s por pregunta): **~35 min** con 60 % de aciertos y **~31 min** con 70 % (1 de cada 10 partidas pasa de ~44 min). Con jugadores rápidos baja a ~20–25 min. Una partida tiene unos 40–55 turnos en total.
