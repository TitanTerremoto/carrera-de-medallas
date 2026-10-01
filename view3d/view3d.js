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
  return { start: '#12b886', skip: '#795548', wild: '#f06595', move: sq.steps > 0 ? '#12b886' : '#fa5252' }[sq.type] || '#ffffff';
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

  // ── Bucle de render ──
  let last = performance.now();
  function frame(now) {
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
    stage.scenery.clouds.rotation.y += dt * 0.01;

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
}

start();
