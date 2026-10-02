/*
 * Puesta en escena de un personaje que visita una casilla (Chansey, Dodrio,
 * Diglett…): dónde se para y desde dónde mira la cámara, midiendo choques y
 * visibilidad igual que con el globo del Team Rocket (rocketShot.js).
 *
 * - El personaje no puede pisar ninguna ficha y queda dentro del tablero.
 * - La cámara tiene que ver sin obstáculos al personaje y a la ficha.
 *
 * Funciones puras (sin escena), así se pueden probar aparte.
 */
import * as THREE from 'three';

export const PIECE_RADIUS = 0.36; // ficha + base, visto desde arriba
export const PIECE_HEIGHT = 0.95;
export const SAME_TILE = 0.75; // fichas más cerca que esto están en la misma casilla

/** ¿El segmento a→b atraviesa algún obstáculo? (muestreo cada ~5 cm; se deja libre el final: es el objetivo) */
export function blocked(a, b, obstacles) {
  const len = a.distanceTo(b);
  const steps = Math.max(8, Math.ceil(len / 0.05));
  const p = new THREE.Vector3();
  for (let i = 1; i < steps * 0.94; i++) {
    p.lerpVectors(a, b, i / steps);
    if (obstacles.some((hit) => hit(p))) return true;
  }
  return false;
}

/** Obstáculo: cilindro vertical (una ficha, un personaje). */
export const cylinder = (c, radius, height) => (p) => p.y <= c.y + height && Math.hypot(p.x - c.x, p.z - c.z) <= radius;

/** Ejes de la ficha: hacia el centro del tablero y de costado. */
export function boardAxes(at) {
  const inward = new THREE.Vector3(-at.x, 0, -at.z);
  if (inward.lengthSq() < 0.01) inward.set(0, 0, -1);
  inward.normalize();
  return { inward, side: new THREE.Vector3(-inward.z, 0, inward.x) };
}

/**
 * Busca un plano perpendicular a la línea ficha–personaje desde el que se vean
 * los dos. `shots`: [distancia, altura, giro en grados]. Si ninguno queda
 * limpio, usa el último (el más alto).
 */
export function pickShot({ at, spot, inward, targets, shots, targetHeight, fov }) {
  const mid = at.clone().lerp(spot, 0.5);
  const pair = spot.clone().sub(at).setY(0);
  if (pair.lengthSq() < 1e-4) pair.copy(inward);
  pair.normalize();
  const across = new THREE.Vector3(-pair.z, 0, pair.x);
  if (across.dot(inward) > 0) across.negate(); // del lado de afuera del tablero
  const up = new THREE.Vector3(0, 1, 0);
  const make = ([dist, height, turn]) => {
    const dir = across.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(turn));
    return { fov, position: mid.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, height, 0)), target: mid.clone().add(new THREE.Vector3(0, targetHeight, 0)) };
  };
  for (let i = 0; i < shots.length; i++) {
    const cam = make(shots[i]);
    if (targets.every(({ point, obstacles }) => !blocked(cam.position, point, obstacles))) return { camera: cam, tried: i + 1, clear: true };
  }
  return { camera: make(shots[shots.length - 1]), tried: shots.length, clear: false };
}

// Lugares para el personaje: [hacia el centro, de costado] desde la ficha.
const SPOTS = [[0.55, 0.85], [0.55, -0.85], [1.0, 0], [0.9, 1.2], [0.9, -1.2], [1.5, 0.6], [1.5, -0.6], [2, 0]];

/**
 * @param at        posición de la ficha
 * @param others    posiciones de las otras fichas
 * @param radius    radio del personaje (visto desde arriba)
 * @param height    alto del personaje
 * @param boardHalf medio lado del tablero
 */
export function planGroundScene({ at, others, radius, height, boardHalf }) {
  const { inward, side } = boardAxes(at);
  const pieces = [at, ...others];
  const needed = radius + PIECE_RADIUS + 0.08;
  let spot = null;
  for (const [a, b] of SPOTS) {
    const s = at.clone().addScaledVector(inward, a).addScaledVector(side, b);
    const inside = Math.abs(s.x) < boardHalf - radius && Math.abs(s.z) < boardHalf - radius;
    if (inside && pieces.every((p) => Math.hypot(p.x - s.x, p.z - s.z) >= needed)) {
      spot = s;
      break;
    }
  }
  if (!spot) spot = at.clone().addScaledVector(inward, 2);
  spot.y = at.y;

  const visitor = cylinder(spot, radius, height);
  const pieceObs = pieces.map((c) => cylinder(c, PIECE_RADIUS, PIECE_HEIGHT));
  const farOthers = others.filter((o) => Math.hypot(o.x - at.x, o.z - at.z) >= SAME_TILE).map((c) => cylinder(c, PIECE_RADIUS, PIECE_HEIGHT));
  // Planos más cerca y más bajos que los del globo: los personajes son chicos.
  const shots = [];
  for (const [dist, h] of [[3, 0.9], [3.5, 1.3], [4.2, 1.9]]) for (const turn of [0, 30, -30, 60, -60, 180]) shots.push([dist, h, turn]);
  shots.push([5.2, 3, 0]);
  const { camera, tried, clear } = pickShot({
    at,
    spot,
    inward,
    shots,
    fov: 46,
    targetHeight: Math.max(0.4, height * 0.55),
    targets: [
      { point: spot.clone().setY(spot.y + height * 0.8), obstacles: pieceObs },
      { point: spot.clone().setY(spot.y + height * 0.45), obstacles: pieceObs },
      { point: at.clone().setY(at.y + PIECE_HEIGHT * 0.6), obstacles: [visitor, ...farOthers] },
    ],
  });
  return { spot, camera, faceTo: at.clone().lerp(camera.position, 0.5), checks: { shotsTried: tried, visible: clear } };
}
