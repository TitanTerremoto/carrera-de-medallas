/*
 * Vista 3D del juego (presentador). Se registra en script.js con
 * attachView(); el motor le pide animar cada momento del turno:
 *
 *   turnStart → la cámara baja hasta la ficha y aparece el bloque "?"
 *   roll      → la ficha salta, golpea el bloque y sale el número
 *   step      → salta casillero por casillero con el contador encima
 *   afterMove → la casilla destella y salen partículas
 *   overview  → la cámara vuelve a la vista cenital (como el tablero 2D)
 *   react / victory → festejos o desánimo
 *
 * Si el navegador no tiene WebGL, no se registra y el juego sigue en 2D.
 */
import * as THREE from 'three';
import { createStage, overviewPose, closePose } from './scene.js';
import { Piece } from './pieces.js';
import { createFx } from './fx.js';
import { tween, tickTweens, ease, wait, lerp } from './tween.js';

const Game = window.CarreraDeMedallas;
const { CATS, CAT_KEYS, BOARD_LAYOUT, SIDE, MEDALS_TO_WIN } = window.GameConfig;
const PREF_KEY = 'carreraMedallas.cam';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function readCamPref() {
  try {
    return localStorage.getItem(PREF_KEY) === 'top' ? 'top' : 'auto';
  } catch {
    return 'auto';
  }
}

function writeCamPref(value) {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch (err) {
    console.warn('No se pudo guardar la preferencia de cámara:', err);
  }
}

/** Color con el que destella una casilla al caer en ella. */
function squareColor(sq) {
  if (sq.cat) return CATS[sq.cat].color;
  return { start: '#12b886', skip: '#795548', wild: '#f06595', rocket: '#c92a2a', move: sq.steps > 0 ? '#12b886' : '#fa5252' }[sq.type] || '#ffffff';
}

async function start() {
  if (!Game || !webglAvailable()) return;
  const stageEl = document.getElementById('stage3d');
  document.body.classList.add('has-3d');
  let stage;
  try {
    stage = await createStage(stageEl.querySelector('.stage-canvas'));
  } catch (err) {
    console.warn('No se pudo iniciar el tablero 3D; se usa el 2D.', err);
    document.body.classList.remove('has-3d');
    return;
  }
  const { scene, camera, renderer, tiles } = stage;
  const fx = createFx(scene);

  // ── Cámara ──
  const cam = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
  let mode = 'overview'; // 'overview' | 'close'
  let camPref = readCamPref(); // 'auto' | 'top'
  let transitioning = 0;
  let followSeat = null;
  let orbit = null;

  function setPose(pose) {
    cam.position.copy(pose.position);
    cam.target.copy(pose.target);
    cam.fov = pose.fov;
  }
  setPose(overviewPose(camera.aspect));

  async function transitionTo(pose, ms) {
    const from = { p: cam.position.clone(), t: cam.target.clone(), f: cam.fov };
    transitioning++;
    try {
      await tween(ms, (k) => {
        cam.position.lerpVectors(from.p, pose.position, k);
        cam.target.lerpVectors(from.t, pose.target, k);
        cam.fov = lerp(from.f, pose.fov, k);
      }, ease.inOut);
    } finally {
      transitioning--;
    }
  }

  function setMode(next) {
    mode = next;
    stageEl.classList.toggle('cam-close', next === 'close');
  }

  async function goClose(seat, ms = 1000) {
    if (camPref === 'top' || !pieces[seat]) return;
    followSeat = seat;
    orbit = null;
    if (mode === 'close') return;
    setMode('close');
    await transitionTo(closePose(pieces[seat].root.position), ms);
  }

  async function goOverview(ms = 900) {
    followSeat = null;
    orbit = null;
    if (mode === 'overview') return;
    setMode('overview');
    await transitionTo(overviewPose(camera.aspect), ms);
  }

  // ── Fichas ──
  let pieces = [];
  let players = [];

  function rebuildPieces(statePlayers) {
    for (const p of pieces) scene.remove(p.root);
    pieces = statePlayers.map((pl, i) => {
      const piece = new Piece(pl.creature, pl.color);
      piece.root.position.copy(slotPosition(i, statePlayers));
      piece.home = piece.root.position.clone();
      scene.add(piece.root);
      return piece;
    });
    players = statePlayers.map((p) => `${p.creature}|${p.color}`);
  }

  /** Posición de la ficha `seat` dentro de su casilla, sin taparse con otras. */
  function slotPosition(seat, statePlayers) {
    const pos = statePlayers[seat].pos;
    const center = stage.tileCenter(pos);
    const mates = statePlayers.map((p, i) => (p.pos === pos ? i : -1)).filter((i) => i >= 0);
    if (mates.length === 1) return center;
    const k = mates.indexOf(seat);
    const d = pos % SIDE === 0 ? 0.36 : 0.22;
    const offsets = [[-d, -d], [d, -d], [-d, d], [d, d]];
    return center.add(new THREE.Vector3(offsets[k][0], 0, offsets[k][1]));
  }

  /** Mirada hacia afuera del tablero (hacia la cámara cercana). */
  function faceOutward(piece) {
    const p = piece.root.position;
    piece.facing = Math.atan2(p.x, p.z);
  }

  // ── Cola de animaciones del turno (se ejecutan en orden) ──
  let chain = Promise.resolve();
  function enqueue(fn) {
    const run = chain.then(fn).catch((err) => console.error('Error en una animación 3D:', err));
    chain = run;
    return run;
  }

  const banner = document.getElementById('stageBanner');
  function showBanner(text, color) {
    banner.textContent = text;
    banner.style.setProperty('--pc', color);
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  let lastState = null;
  let introDone = false;

  /**
   * Recorrido de presentación al empezar una partida (estilo juego de
   * fiesta): la cámara da una vuelta alta mostrando el diorama de Kanto y
   * baja al primer turno. No se repite al retomar una partida avanzada.
   */
  async function introFlyover() {
    introDone = true;
    if (camPref === 'top' || document.hidden || window.GameSpeed?.turbo) return;
    showBanner('¡Bienvenidos a Kanto!', '#ef476f');
    setMode('close');
    followSeat = null;
    orbit = null;
    const start = Math.PI * 0.25;
    const pose = (a, r, h) => ({ fov: 46, position: new THREE.Vector3(Math.sin(a) * r, h, Math.cos(a) * r), target: new THREE.Vector3(0, 0, 0) });
    // Un clic sobre el tablero saltea el recorrido.
    let skip = false;
    const onSkip = () => {
      skip = true;
    };
    stageEl.addEventListener('pointerdown', onSkip, { once: true });
    transitioning++;
    try {
      await transitionTo(pose(start, 22, 11), 1200);
      // Vuelta completa alrededor del tablero, acercándose un poco.
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 7000);
          const p = pose(start + k * Math.PI * 2, 22 - k * 4, 11 - k * 3);
          cam.position.copy(p.position);
          cam.target.copy(p.target);
          cam.fov = p.fov;
          if (k >= 1 || skip || document.hidden) resolve();
          else requestAnimationFrame(step);
        };
        step();
      });
    } finally {
      transitioning--;
      stageEl.removeEventListener('pointerdown', onSkip);
    }
  }

  const api = {
    sync(state) {
      lastState = state;
      if (!state) {
        for (const p of pieces) scene.remove(p.root);
        pieces = [];
        players = [];
        fx.hideBlock();
        fx.hideCounter();
        orbit = null;
        setMode('overview');
        followSeat = null;
        setPose(overviewPose(camera.aspect));
        return;
      }
      const sig = state.players.map((p) => `${p.creature}|${p.color}`);
      if (sig.join() !== players.join()) rebuildPieces(state.players);
      state.players.forEach((pl, i) => {
        const piece = pieces[i];
        piece.home = slotPosition(i, state.players);
        piece.setActive(i === state.current && state.phase !== 'over');
      });
      if (state.phase !== 'over' && orbit) orbit = null;
    },

    turnStart(seat) {
      return enqueue(async () => {
        const piece = pieces[seat];
        if (!piece || !lastState) return;
        // Partida recién empezada: primero el recorrido por el diorama.
        if (!introDone && lastState.log.length <= 1) await introFlyover();
        introDone = true;
        const pl = lastState.players[seat];
        // En Pueblo Paleta con 4 medallas no hay bloque: toca el desafío final.
        const finalTurn = pl.pos === 0 && CAT_KEYS.filter((c) => pl.medals[c]).length >= MEDALS_TO_WIN;
        showBanner(finalTurn ? `🏆 ¡${pl.name} desafía a la Liga Pokémon!` : `¡Turno de ${pl.name}!`, pl.color);
        fx.hideCounter();
        await goClose(seat, 1100);
        faceOutward(piece);
        if (!finalTurn) fx.showBlock(piece.root);
        if (!piece.play('cry')) piece.jump(0.35, 360);
      });
    },

    roll(seat, n) {
      return enqueue(async () => {
        const piece = pieces[seat];
        if (!piece) return;
        await goClose(seat, 700);
        if (!fx.block.visible) await fx.showBlock(piece.root);
        faceOutward(piece);
        const jump = piece.jump(0.85, 460);
        await wait(300);
        window.GameSound.play('hit');
        await fx.hitBlock(n, lastState.players[seat].color);
        await jump;
        await wait(250);
      });
    },

    beforeMove(seat) {
      return enqueue(async () => {
        fx.hideBlock();
        await goClose(seat, 600);
      });
    },

    step(seat, pos, remaining) {
      return enqueue(async () => {
        const piece = pieces[seat];
        if (!piece) return;
        // De paso cruza por el centro de la casilla (puede atravesar a otras
        // fichas); en el último salto cae directo en su lugar y las fichas que
        // ya estaban se corren a la vez para hacerle espacio.
        let to = stage.tileCenter(pos);
        if (remaining === 0 && lastState) {
          to = slotPosition(seat, lastState.players);
          lastState.players.forEach((pl, i) => {
            if (i !== seat && pl.pos === pos && pieces[i]) pieces[i].home = slotPosition(i, lastState.players);
          });
        }
        await piece.hop(to, 260);
        piece.home = to.clone();
        fx.ring(to, '#ffffff');
        if (remaining > 0) fx.setCounter(remaining, lastState.players[seat].color, piece.root);
        else fx.hideCounter();
      });
    },

    afterMove(seat, pos) {
      return enqueue(async () => {
        const piece = pieces[seat];
        if (!piece) return;
        const sq = BOARD_LAYOUT[pos];
        const color = squareColor(sq);
        fx.hideCounter();
        faceOutward(piece);
        fx.ring(tiles[pos].center, color);
        fx.burst(tiles[pos].center.clone().add(new THREE.Vector3(0, 0.2, 0)), [color, '#ffffff'], 18, 2);
        await fx.flashTile(tiles[pos], color);
      });
    },

    overview() {
      return enqueue(async () => {
        fx.hideBlock();
        fx.hideCounter();
        await goOverview(900);
      });
    },

    react(seat, { correct, medal }) {
      const piece = pieces[seat];
      if (!piece) return;
      const at = piece.root.position.clone();
      if (correct) {
        if (!piece.play('happy')) piece.play('cry');
        piece.jump(0.7, 520, Math.PI * 2);
        fx.burst(at.clone().add(new THREE.Vector3(0, 0.6, 0)), ['#ffd43b', '#ffffff', '#69db7c'], 20, 2.2);
      } else {
        piece.sad();
      }
      if (medal) fx.medalCoin(at, medal);
    },

    victory(seat) {
      return enqueue(async () => {
        const piece = pieces[seat];
        if (!piece) return;
        fx.hideBlock();
        fx.hideCounter();
        const colors = [...CAT_KEYS.map((c) => CATS[c].color), '#f8c630', '#ffffff'];
        fx.confetti(piece.root.position, colors);
        if (camPref !== 'top') {
          setMode('close');
          await transitionTo(closePose(piece.root.position, 0.9), 1000);
          orbit = { seat, angle: Math.atan2(cam.position.x - piece.root.position.x, cam.position.z - piece.root.position.z) };
        }
        // Salta de alegría mientras dure la celebración.
        for (let i = 0; i < 6 && lastState && lastState.phase === 'over'; i++) {
          if (i % 2 === 0 && !piece.play('happy')) piece.play('cry');
          await piece.jump(0.8, 480, i % 2 ? Math.PI * 2 : 0);
          await wait(150);
        }
      });
    },
  };

  // ── Botón de cámara: automática (3D en el turno) o siempre cenital ──
  const camBtn = document.getElementById('btnCamMode');
  function renderCamBtn() {
    camBtn.textContent = camPref === 'auto' ? '🎬 Cámara: automática' : '🗺 Cámara: siempre arriba';
  }
  camBtn.addEventListener('click', () => {
    camPref = camPref === 'auto' ? 'top' : 'auto';
    writeCamPref(camPref);
    renderCamBtn();
    if (camPref === 'top') goOverview(700);
    else if (lastState && lastState.phase === 'idle') goClose(lastState.current, 900);
  });
  renderCamBtn();

  // ── Calidad automática ──
  // Si la PC no llega a ~45 cuadros por segundo, se baja la calidad por pasos:
  // 1) resolución 1×, 2) sin sombras dinámicas, 3) sin Pokémon decorativos.
  let qualityLevel = 0;
  let slowTime = 0;
  let sampleTime = 0;
  function adaptQuality(dt) {
    if (document.hidden || qualityLevel >= 3) return;
    sampleTime += dt;
    if (dt > 1 / 45) slowTime += dt;
    if (sampleTime < 4) return;
    const slowShare = slowTime / sampleTime;
    sampleTime = 0;
    slowTime = 0;
    if (slowShare < 0.5) return;
    qualityLevel++;
    if (qualityLevel === 1) {
      renderer.setPixelRatio(1);
      stage.resize();
    } else if (qualityLevel === 2) {
      stage.sun.castShadow = false;
    } else if (qualityLevel === 3) {
      stage.scenery.setDetail(0);
    }
    console.info(`Calidad 3D reducida al nivel ${qualityLevel} para mantener la fluidez.`);
  }

  // ── Bucle de render ──
  // Tope de 60 cuadros por segundo: en monitores de 120/144 Hz no se gasta GPU
  // de más (la PC que transmite también está codificando el video).
  const FRAME_MS = 1000 / 60;
  let last = performance.now();
  function frame(now) {
    if (now - last < FRAME_MS - 2) {
      requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    tickTweens(now);
    for (const p of pieces) {
      p.update(dt, t);
      // Las fichas en reposo se acomodan suavemente en su lugar.
      if (!p.busy && p.home) p.root.position.lerp(p.home, 1 - Math.exp(-dt * 8));
    }
    fx.update(dt, camera);
    stage.scenery.update(dt, t);
    adaptQuality(dt);

    if (orbit && pieces[orbit.seat]) {
      orbit.angle += dt * 0.35;
      const c = pieces[orbit.seat].root.position;
      cam.position.set(c.x + Math.sin(orbit.angle) * 3.6, c.y + 2.2, c.z + Math.cos(orbit.angle) * 3.6);
      cam.target.copy(c).add(new THREE.Vector3(0, 0.5, 0));
    } else if (mode === 'close' && followSeat != null && !transitioning && pieces[followSeat]) {
      // Seguimiento suave de la ficha mientras salta.
      const pose = closePose(pieces[followSeat].root.position);
      const k = 1 - Math.exp(-dt * 3.5);
      cam.position.lerp(pose.position, k);
      cam.target.lerp(pose.target, k);
    } else if (mode === 'overview' && !transitioning) {
      setPose(overviewPose(camera.aspect));
    }

    camera.position.copy(cam.position);
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  Game.attachView(api);
  // Edificios y Pokémon decorativos: después del tablero, sin demorar el inicio.
  stage.scenery.loadExtras().catch((err) => console.warn('No se pudo cargar parte de la escenografía:', err));
}

start();
