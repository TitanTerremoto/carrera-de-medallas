/*
 * Puesta en escena del Team Rocket: dónde baja el globo y desde dónde mira la
 * cámara, midiendo choques y visibilidad.
 *
 * - El globo no puede aterrizar encima de ninguna ficha: se prueban lugares
 *   alrededor de la ficha que cayó y se elige el primero con espacio, dentro
 *   del tablero.
 * - La cámara tiene que ver sin obstáculos a Meowth (cabeza y pecho) y a la
 *   ficha: se prueban ángulos y distancias y se descarta todo plano en el que
 *   la lona, la canasta u otra ficha se interponga.
 *
 * Función pura (sin escena), así se puede probar aparte.
 */
import * as THREE from 'three';
import { blocked, PIECE_RADIUS, PIECE_HEIGHT, SAME_TILE } from './sceneShot.js';

const CLEARANCE = 0.12; // aire mínimo entre la canasta y una ficha
// Lugares para el globo: [hacia el centro, hacia el costado] desde la ficha.
const SPOTS = [[0.9, 1.2], [0.9, -1.2], [1.5, 0], [1.3, 1.7], [1.3, -1.7], [2, 0.9], [2, -0.9], [2.4, 0]];
// Planos de cámara: [distancia, altura sobre el medio, giro (grados) respecto
// del plano de frente, del lado de afuera del tablero]. Se prueban en orden.
const SHOTS = [];
for (const [dist, height] of [[4.3, 1.3], [4.8, 1.8], [5.6, 2.4]]) {
  for (const turn of [0, 30, -30, 60, -60, 180]) SHOTS.push([dist, height, turn]);
}
SHOTS.push([6.5, 3.4, 0]); // último recurso: alto, ve por encima de todo

/**
 * @param at       posición de la ficha que cayó
 * @param others   posiciones de las otras fichas
 * @param layout   medidas del globo (rocket.layout())
 * @param boardHalf medio lado del tablero
 * @returns { hover, faceTo, camera: { position, target, fov } | null, checks }
 */
export function planRocketScene({ at, others, layout, boardHalf }) {
  const inward = new THREE.Vector3(-at.x, 0, -at.z);
  if (inward.lengthSq() < 0.01) inward.set(0, 0, -1);
  inward.normalize();
  const side = new THREE.Vector3(-inward.z, 0, inward.x);
  const needed = layout.basketRadius + PIECE_RADIUS + CLEARANCE;
  const pieces = [at, ...others];

  // 1) Lugar del globo: sin fichas debajo de la canasta y dentro del tablero.
  let hover = null;
  for (const [a, b] of SPOTS) {
    const spot = at.clone().addScaledVector(inward, a).addScaledVector(side, b);
    const inside = Math.abs(spot.x) < boardHalf - layout.basketRadius && Math.abs(spot.z) < boardHalf - layout.basketRadius;
    if (inside && pieces.every((p) => Math.hypot(p.x - spot.x, p.z - spot.z) >= needed)) {
      hover = spot;
      break;
    }
  }
  if (!hover) hover = at.clone().addScaledVector(inward, 2.4); // tablero lleno: hacia el centro
  hover.y = at.y + 0.1;
  // La lona tiene que pasar por encima de las fichas cercanas.
  const envelopeClear = hover.y + layout.envelopeBottomY > at.y + PIECE_HEIGHT;

  // 2) Obstáculos para la vista: lona, canasta y fichas.
  const insideEnvelope = (p) => {
    const y = p.y - hover.y;
    return y >= layout.envelopeBottomY && y <= layout.envelopeTopY && Math.hypot(p.x - hover.x, p.z - hover.z) <= layout.envelopeRadiusAt(y);
  };
  const insideBasket = (p) => {
    const y = p.y - hover.y;
    return y >= 0 && y <= layout.rimY && Math.hypot(p.x - hover.x, p.z - hover.z) <= layout.basketRadius;
  };
  const insidePiece = (c) => (p) => p.y <= c.y + PIECE_HEIGHT && Math.hypot(p.x - c.x, p.z - c.z) <= PIECE_RADIUS;
  const meowthHead = hover.clone().setY(hover.y + layout.meowthHeadY - 0.1);
  const meowthChest = hover.clone().setY(hover.y + layout.meowthChestY);
  const pieceHead = at.clone().setY(at.y + PIECE_HEIGHT * 0.6);
  const toMeowth = [insideEnvelope, ...pieces.map(insidePiece)];
  // Las fichas de la misma casilla están pegadas a la que cayó: ningún ángulo
  // las esquiva del todo, así que no cuentan para verla (a Meowth sí lo tapan).
  const toPiece = [insideEnvelope, insideBasket, ...others.filter((o) => Math.hypot(o.x - at.x, o.z - at.z) >= SAME_TILE).map(insidePiece)];

  // 3) Plano: perpendicular a la línea ficha–globo, probando ángulos hasta
  //    que se vean los dos enteros.
  const mid = at.clone().lerp(hover, 0.5);
  const pair = hover.clone().sub(at).setY(0).normalize();
  const across = new THREE.Vector3(-pair.z, 0, pair.x);
  if (across.dot(inward) > 0) across.negate(); // del lado de afuera del tablero
  let camera = null;
  let tried = 0;
  let clearLast = false;
  const up = new THREE.Vector3(0, 1, 0);
  for (const [dist, height, turn] of SHOTS) {
    tried++;
    const dir = across.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(turn));
    const position = mid.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, height, 0));
    const clear =
      !blocked(position, meowthHead, toMeowth) && !blocked(position, meowthChest, toMeowth) && !blocked(position, pieceHead, toPiece);
    if (clear) {
      clearLast = true;
      // Se apunta algo por debajo del centro para que la caja de diálogo no los tape.
      camera = { fov: 50, position, target: mid.clone().add(new THREE.Vector3(0, 0.85, 0)) };
      break;
    }
  }
  if (!camera) {
    // Ningún plano limpio (tablero muy lleno): el más alto, que ve por encima.
    const [dist, height] = SHOTS[SHOTS.length - 1];
    camera = { fov: 50, position: mid.clone().addScaledVector(across, dist).add(new THREE.Vector3(0, height, 0)), target: mid.clone().add(new THREE.Vector3(0, 0.85, 0)) };
  }
  const faceTo = at.clone().lerp(camera.position, 0.5);
  return { hover, faceTo, camera, checks: { envelopeClear, shotsTried: tried, visible: tried < SHOTS.length || clearLast } };
}
