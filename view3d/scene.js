/*
 * Escena 3D: renderer, luces, entorno, tablero y poses de cámara.
 *
 * El tablero usa las mismas proporciones que el 2D (esquinas de 1,6 y
 * casillas de 1 unidad, 11,2 de lado), así la vista cenital se ve igual al
 * tablero clásico y el panel del turno queda sobre el centro.
 */
import * as THREE from 'three';
import { tileTexture, centerTexture } from './textures.js';
import { buildScenery } from './scenery.js';

const { BOARD_LAYOUT, SIDE } = window.GameConfig;
const { gridPos } = window.GameBoard;

const CELL = [1.6, 1, 1, 1, 1, 1, 1, 1, 1, 1.6]; // anchos de columna/fila
export const BOARD_HALF = 5.6;
const TILE_H = 0.16;
const GAP = 0.06;

/** Centro (en unidades del mundo) de la columna o fila n (1..10). */
function cellCenter(n) {
  let edge = -BOARD_HALF;
  for (let i = 0; i < n - 1; i++) edge += CELL[i];
  return edge + CELL[n - 1] / 2;
}

function inwardOf(row, col) {
  if (row === SIDE + 1 && col !== 1 && col !== SIDE + 1) return 'up';
  if (row === 1 && col !== 1 && col !== SIDE + 1) return 'down';
  if (col === 1 && row !== 1 && row !== SIDE + 1) return 'right';
  if (col === SIDE + 1 && row !== 1 && row !== SIDE + 1) return 'left';
  return null;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6ec6ff');
  g.addColorStop(0.6, '#bfe9ff');
  g.addColorStop(1, '#fff6d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Construye todo y devuelve la API de la escena. */
export async function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  // Resolución inicial moderada; view3d.js la ajusta según el rendimiento real.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#d6f0ff', 30, 70);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight('#ffffff', '#7aa66e', 1.15));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.7);
  sun.position.set(7, 15, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // Base de madera, paño verde y centro con el logo
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_HALF * 2 + 0.7, 0.6, BOARD_HALF * 2 + 0.7),
    new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.7 }),
  );
  base.position.y = -0.3;
  base.receiveShadow = true;
  base.castShadow = true;
  scene.add(base);
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_HALF * 2, BOARD_HALF * 2), new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 1 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.002;
  felt.receiveShadow = true;
  scene.add(felt);
  const inner = BOARD_HALF * 2 - CELL[0] * 2 - GAP;
  const center = new THREE.Mesh(new THREE.PlaneGeometry(inner, inner), new THREE.MeshStandardMaterial({ map: centerTexture(), roughness: 0.9 }));
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.01;
  center.receiveShadow = true;
  scene.add(center);

  // Casillas: caja con canto blanco + cara superior con textura
  const sideMat = new THREE.MeshStandardMaterial({ color: '#f8f9fa', roughness: 0.6 });
  const tiles = await Promise.all(
    BOARD_LAYOUT.map(async (sq, i) => {
      const [row, col] = gridPos(i);
      const w = CELL[col - 1] - GAP;
      const h = CELL[row - 1] - GAP;
      const corner = i % SIDE === 0;
      const x = cellCenter(col);
      const z = cellCenter(row);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, TILE_H, h), sideMat);
      box.position.set(x, TILE_H / 2, z);
      box.castShadow = true;
      box.receiveShadow = true;
      const topMat = new THREE.MeshStandardMaterial({ map: await tileTexture(sq, w, h, inwardOf(row, col), corner), roughness: 0.75, emissive: '#000000' });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(w, h), topMat);
      top.rotation.x = -Math.PI / 2;
      top.position.set(x, TILE_H + 0.002, z);
      top.receiveShadow = true;
      scene.add(box, top);
      return { index: i, box, top, topMat, center: new THREE.Vector3(x, TILE_H, z), w, h, corner };
    }),
  );

  const scenery = buildScenery(scene);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  return {
    THREE,
    renderer,
    scene,
    camera,
    tiles,
    scenery,
    sun,
    resize,
    tileCenter: (i) => tiles[i].center.clone(),
  };
}

/** Pose cenital: el tablero llena el cuadro como en la versión 2D. */
export function overviewPose(aspect) {
  const fov = 30;
  const half = BOARD_HALF * 1.05 * Math.max(1, 1 / aspect);
  const dist = half / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  return { fov, position: new THREE.Vector3(0, dist, 0.02), target: new THREE.Vector3(0, 0, 0) };
}

/**
 * Pose cercana estilo juego de fiesta: desde afuera del tablero, por encima
 * de la ficha, mirando hacia el centro (así se ve el recorrido detrás).
 */
export function closePose(point, zoom = 1) {
  const outward = new THREE.Vector3(point.x, 0, point.z);
  if (outward.lengthSq() < 0.01) outward.set(0, 0, 1);
  outward.normalize();
  const position = point.clone().addScaledVector(outward, 3.4 * zoom).add(new THREE.Vector3(0, 2.7 * zoom, 0));
  const target = point.clone().add(new THREE.Vector3(0, 0.45, 0)).addScaledVector(outward, -0.6);
  return { fov: 44, position, target };
}
