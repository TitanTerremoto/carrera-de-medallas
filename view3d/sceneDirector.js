/*
 * Escenas de las casillas especiales en 3D: Team Rocket (globo con Meowth),
 * Centro Pokémon (Chansey), Dodrio veloz, Diglett, Islas Espuma (Tentacool),
 * Monte Moon (Zubat), Mew en Pueblo Paleta, los Pokémon de los líderes en las
 * medallas directas y Lance con Dragonite en el desafío de la Liga.
 *
 * Decide dónde aparece cada personaje y desde dónde mira la cámara (midiendo
 * choques y visibilidad: rocketShot.js / sceneShot.js) y los anima. Los textos
 * y la lógica del juego quedan en script.js; aquí solo se muestra.
 *
 * `ctx` lo arma view3d.js: fichas, cámara, cartel y modo de cámara.
 */
import * as THREE from 'three';
import { createRocket } from './rocket.js';
import { createVisitors, VISITORS, visitorTop } from './visitors.js';
import { planRocketScene } from './rocketShot.js';
import { planGroundScene, boardAxes } from './sceneShot.js';
import { BOARD_HALF, closePose } from './scene.js';

export function createSceneDirector(scene, fx, ctx) {
  const rocket = createRocket(scene, fx);
  const visitors = createVisitors(scene, fx);
  let shot = null; // plano actual de la escena
  let escortSeat = null; // ficha a la que acompaña Dodrio mientras avanza

  /** Lleva la cámara al plano de la escena (si la cámara no está fija arriba). */
  function sceneShot(pose, ms) {
    shot = pose;
    if (ctx.camPref() === 'top') return null;
    ctx.enterScene();
    return ctx.transitionTo(pose, ms);
  }

  const piecePos = (p) => p.root.position.clone();
  const othersOf = (piece) => ctx.pieces().filter((p) => p !== piece).map(piecePos);

  const director = {
    // ── Team Rocket ──
    async rocketArrive(seat) {
      ctx.showBanner('🚀 ¡Ahí viene el Team Rocket!', '#c92a2a');
      await rocket.ready;
      const layout = rocket.layout();
      const piece = ctx.pieces()[seat];
      if (!layout || !piece) return;
      const plan = planRocketScene({ at: piecePos(piece), others: othersOf(piece), layout, boardHalf: BOARD_HALF });
      if (!plan.checks.visible) console.info('Team Rocket: no hay un plano sin obstáculos; se usa el más alto.');
      piece.faceTowards(plan.hover);
      await Promise.all([rocket.arrive(plan.hover, plan.faceTo), sceneShot(plan.camera, 1500)]);
    },
    /** Se va el globo; blastOff = la víctima defendió su medalla. */
    async rocketLeave(blastOff) {
      // La cámara levanta la vista siguiendo al globo; el próximo turno la
      // lleva a la ficha que sigue (sin pasar por la vista de arriba).
      if (ctx.inScene() && shot) {
        const up = shot.target.clone().add(new THREE.Vector3(0, blastOff ? 3.2 : 2.2, 0));
        ctx.transitionTo({ ...shot, target: up, fov: blastOff ? 54 : 50 }, blastOff ? 1400 : 1600);
      }
      await rocket.leave(blastOff);
    },
    /** La medalla robada vuela de la víctima al ladrón (y el globo se va). */
    async steal(victim, thief, cat) {
      const from = ctx.pieces()[victim];
      const to = ctx.pieces()[thief];
      if (!from || !to) return;
      await rocket.steal(piecePos(from), piecePos(to), cat);
      if (!to.play('happy')) to.play('cry');
      to.jump(0.6, 480, Math.PI * 2);
      director.rocketLeave(false);
    },

    // ── Personajes en el suelo: Chansey, Dodrio, Diglett ──
    async visitorArrive(kind, seat) {
      const piece = ctx.pieces()[seat];
      if (!piece || !VISITORS[kind]) return;
      const { radius } = VISITORS[kind];
      const plan = planGroundScene({ at: piecePos(piece), others: othersOf(piece), radius, height: visitorTop(kind), boardHalf: BOARD_HALF });
      if (!plan.checks.visible) console.info(`${kind}: no hay un plano sin obstáculos; se usa el más alto.`);
      piece.faceTowards(plan.spot);
      await Promise.all([visitors.arrive(kind, plan.spot, plan.faceTo), sceneShot(plan.camera, 1200)]);
      if (kind === 'diglett') {
        // ¡Tropezón! La ficha salta del susto.
        piece.jump(0.5, 380);
        piece.sad();
      }
    },
    visitorLeave() {
      return visitors.leave();
    },
    /** Una medalla nueva aparece sobre la ficha (regalo de Mew). */
    medalGift(seat, cat) {
      const piece = ctx.pieces()[seat];
      if (!piece) return null;
      if (!piece.play('happy')) piece.play('cry');
      piece.jump(0.6, 480, Math.PI * 2);
      return fx.medalCoin(piecePos(piece), cat);
    },
    /** Dodrio corre al lado de la ficha mientras avanza (ver step). */
    visitorEscort(seat) {
      escortSeat = seat;
    },
    /** Paso de la ficha: si Dodrio la acompaña, corre a su lado. */
    escortStep(seat, to, ms) {
      if (escortSeat !== seat) return null;
      const { side } = boardAxes(to);
      return visitors.follow(to.clone().addScaledVector(side, 0.55), ms);
    },
    /** La ficha terminó de moverse: Dodrio se despide. */
    escortEnd(seat) {
      if (escortSeat !== seat) return null;
      escortSeat = null;
      return visitors.leave();
    },

    // ── Monte Moon: tres Zubat atacan ──
    async zubatAttack(seat) {
      const piece = ctx.pieces()[seat];
      if (!piece) return;
      ctx.showBanner('🦇 ¡Una bandada de Zubat!', '#7048e8');
      const at = piecePos(piece);
      ctx.faceOutward(piece);
      const swarm = visitors.zubatSwarm(at, 2400);
      await sceneShot(closePose(at, 0.8), 900);
      piece.sad();
      // La ficha gira mareada mientras los Zubat le dan vueltas.
      await piece.jump(0.25, 600, Math.PI * 4);
      await swarm;
    },

    /** Los personajes «hablan» mientras aparece su texto. */
    characterTalk(on) {
      rocket.talk(on);
      visitors.talk(on);
    },
    characterCry() {
      rocket.cry();
      visitors.cry();
    },

    update(dt, t) {
      rocket.update(dt, t);
      visitors.update(dt, t);
    },
    reset() {
      rocket.reset();
      visitors.reset();
      escortSeat = null;
    },
  };
  return director;
}
