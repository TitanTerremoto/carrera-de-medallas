/*
 * Escenografía alrededor del tablero: un diorama de Kanto.
 *
 *   Esquina de salida (SE) ...... Pueblo Paleta: casa, cercas, farol, banco
 *   Esquina Monte Moon (SO) ..... montaña con cueva, Clefairy y Zubat
 *   Esquina Centro Pokémon (NO) . Centro Pokémon, Tienda, fuente y Chansey
 *   Esquina Islas Espuma (NE) ... mar animado con islas heladas y Tentacool
 *   Detrás del tablero (N) ...... Liga Pokémon: gimnasio en una colina con banderas
 *   Lados ....................... camino de tierra, hierba alta, árboles, flores,
 *                                 Diglett asomando y Pidgey volando
 *
 * Rendimiento: árboles, hierba, flores y postes con InstancedMesh (una
 * llamada de dibujo por tipo); materiales Lambert; nada de esto proyecta
 * sombras en tiempo real (los edificios traen su sombra pintada); edificios
 * y Pokémon se cargan después del tablero, sin demorar el inicio.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { townModel } from './townmodels.js';

const GROUND_Y = -0.62;
const TOWN_SCALE = 1 / 20; // unidades del mundo por píxel de los modelos de PokeSwap

// Zonas temáticas (centros en el plano XZ). El tablero ocupa |x|,|z| < 6.
const ZONES = {
  pallet: new THREE.Vector2(10.5, 10.5),
  moon: new THREE.Vector2(-12.5, 11.5),
  center: new THREE.Vector2(-11.5, -11.5),
  sea: new THREE.Vector2(17, -17),
  league: new THREE.Vector2(0, -16),
  diglett: new THREE.Vector2(-8.7, 1),
};

/** Generador pseudoaleatorio determinista: el paisaje es siempre el mismo. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** ¿Hay algo en (x, z) que impida poner árboles o flores? */
function blocked(x, z) {
  if (Math.abs(x) < 8 && Math.abs(z) < 8) return true; // tablero + camino
  const p = new THREE.Vector2(x, z);
  if (p.distanceTo(ZONES.sea) < 14.5) return true;
  if (p.distanceTo(ZONES.pallet) < 6) return true;
  if (p.distanceTo(ZONES.moon) < 7.5) return true;
  if (p.distanceTo(ZONES.center) < 7) return true;
  if (p.distanceTo(ZONES.league) < 6) return true;
  if (p.distanceTo(ZONES.diglett) < 1.6) return true;
  return false;
}

/** Facing: rota un objeto para que su frente (+Z) mire al centro del tablero. */
function faceBoard(obj) {
  obj.rotation.y = Math.atan2(-obj.position.x, -obj.position.z);
}

/** Textura de canvas repetible, con píxeles nítidos (estilo DS). */
function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckles(ctx, size, base, colors, count, rand) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 2, 2);
  }
}

const lambert = (color, extra) => new THREE.MeshLambertMaterial({ color, ...(extra || {}) });

// ── Piezas estáticas ──────────────────────────────────────────────────

function buildGround(scene) {
  const rand = seeded(3);
  const grass = canvasTexture(64, (ctx, s) => speckles(ctx, s, '#7fcf6b', ['#6dbb5b', '#93dc7c', '#5fae52'], 260, rand), 60);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 40), lambert('#ffffff', { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  // Camino de tierra alrededor del tablero (marco cuadrado).
  const dirt = canvasTexture(32, (ctx, s) => speckles(ctx, s, '#d9b77e', ['#c9a46a', '#e6c992', '#b8935b'], 90, rand), 1);
  const outer = 7.5;
  const inner = 6.15;
  const shape = new THREE.Shape([new THREE.Vector2(-outer, -outer), new THREE.Vector2(outer, -outer), new THREE.Vector2(outer, outer), new THREE.Vector2(-outer, outer)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-inner, -inner), new THREE.Vector2(-inner, inner), new THREE.Vector2(inner, inner), new THREE.Vector2(inner, -inner)]));
  const pathGeo = new THREE.ShapeGeometry(shape);
  pathGeo.rotateX(-Math.PI / 2);
  // UV en unidades del mundo para que la textura de tierra se repita parejo.
  const pos = pathGeo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 1.5;
    uv[i * 2 + 1] = pos.getZ(i) / 1.5;
  }
  pathGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const path = new THREE.Mesh(pathGeo, lambert('#ffffff', { map: dirt }));
  path.position.y = GROUND_Y + 0.012;
  path.receiveShadow = true;
  scene.add(path);
}

/** Mar de las Islas Espuma: playa, agua animada e islas heladas. */
function buildSea(scene) {
  const rand = seeded(11);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(14.5, 40), lambert('#f1dfae'));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(ZONES.sea.x, GROUND_Y + 0.008, ZONES.sea.y);
  scene.add(sand);

  const waterTex = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#3d9be0';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5fb4ef';
    for (let i = 0; i < 18; i++) ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 6 + Math.floor(rand() * 8), 2);
    ctx.fillStyle = '#d6f0ff';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 4, 1);
  }, 10);
  const water = new THREE.Mesh(new THREE.CircleGeometry(13.2, 40), lambert('#ffffff', { map: waterTex }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(ZONES.sea.x, GROUND_Y + 0.03, ZONES.sea.y);
  scene.add(water);

  // Islas: rocas heladas (icosaedros aplastados con "nieve" encima).
  const rock = lambert('#9fb4c7', { flatShading: true });
  const snow = lambert('#f4fbff', { flatShading: true });
  for (const [dx, dz, r] of [[-3, 4, 1.6], [2, 1, 2.1], [-1, -4, 1.3], [4.5, -3, 1.1]]) {
    const isle = new THREE.Group();
    const base = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rock);
    base.scale.set(1, 0.55, 1);
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.62, 0), snow);
    cap.scale.set(1, 0.5, 1);
    cap.position.y = r * 0.35;
    isle.add(base, cap);
    isle.position.set(ZONES.sea.x + dx, GROUND_Y + 0.1, ZONES.sea.y + dz);
    isle.rotation.y = rand() * Math.PI;
    scene.add(isle);
  }
  return {
    update(dt) {
      waterTex.offset.x += dt * 0.02;
      waterTex.offset.y += dt * 0.008;
    },
  };
}

/** Monte Moon: montaña de roca con la boca de la cueva mirando al tablero. */
function buildMountain(scene) {
  const parts = [];
  for (const [dx, dz, r, h] of [[0, 0, 5, 6.5], [-3.5, 2.5, 3.8, 4.6], [3.2, 2.8, 3.2, 3.8], [-1, 4.5, 3.4, 4.2]]) {
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    g.translate(dx, h / 2, dz);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const mountain = new THREE.Mesh(geo, lambert('#a08670', { flatShading: true }));
  mountain.position.set(ZONES.moon.x - 1.5, GROUND_Y, ZONES.moon.y + 1.5);
  scene.add(mountain);
  // Cueva: semicírculo oscuro en la ladera que mira al tablero.
  const cave = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#1d1410' }));
  cave.position.set(ZONES.moon.x + 2.4, GROUND_Y + 0.02, ZONES.moon.y - 2.2);
  faceBoard(cave);
  scene.add(cave);
  return { caveFront: new THREE.Vector3(ZONES.moon.x + 3.1, GROUND_Y, ZONES.moon.y - 3) };
}

/** Colina de la Liga Pokémon con banderas que flamean. */
function buildLeagueHill(scene) {
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6, 1.4, 9), lambert('#6fbf5f', { flatShading: true }));
  hill.position.set(ZONES.league.x, GROUND_Y + 0.7, ZONES.league.y);
  scene.add(hill);
  const flags = [];
  const flagMat = lambert('#ae3ec9', { side: THREE.DoubleSide });
  const poleMat = lambert('#e9ecef');
  for (const dx of [-3.4, 3.4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), poleMat);
    pole.position.set(ZONES.league.x + dx, GROUND_Y + 1.4 + 1.6, ZONES.league.y + 1.6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), flagMat);
    flag.geometry.translate(0.6, 0, 0);
    flag.position.set(ZONES.league.x + dx, GROUND_Y + 1.4 + 2.8, ZONES.league.y + 1.6);
    scene.add(pole, flag);
    flags.push(flag);
  }
  return {
    top: new THREE.Vector3(ZONES.league.x, GROUND_Y + 1.4, ZONES.league.y + 0.6),
    update(dt, t) {
      flags.forEach((f, i) => {
        f.rotation.y = Math.sin(t * 2.2 + i) * 0.35;
      });
    },
  };
}

/** Árboles (redondos y pinos), hierba alta, flores y colinas lejanas, todo instanciado. */
function buildVegetation(scene) {
  const rand = seeded(29);
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();

  // Puntos válidos para árboles: anillo alrededor del tablero, lejos de las zonas.
  const spots = [];
  for (let tries = 0; spots.length < 190 && tries < 4000; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 8.8 + Math.pow(rand(), 0.7) * 26;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!blocked(x, z)) spots.push([x, z, 0.75 + rand() * 0.6]);
  }

  function instanced(geo, mat, list, place) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((item, i) => {
      place(tmp, item, i);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  }

  const round = spots.filter((_, i) => i % 3 !== 0);
  const pines = spots.filter((_, i) => i % 3 === 0);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.17, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = lambert('#8d5a32');
  instanced(trunkGeo, trunkMat, spots, (o, [x, z, s]) => {
    o.position.set(x, GROUND_Y, z);
    o.scale.set(s, s * 0.9, s);
  });
  // Copas redondas con leves variaciones de color.
  const crownGeo = new THREE.IcosahedronGeometry(0.75, 0);
  const crowns = instanced(crownGeo, lambert('#ffffff', { flatShading: true }), round, (o, [x, z, s]) => {
    o.position.set(x, GROUND_Y + 1.25 * s, z);
    o.scale.set(s, s * 1.05, s);
    o.rotation.set(rand(), rand() * 6, rand());
  });
  round.forEach((_, i) => crowns.setColorAt(i, color.set(['#3fa84a', '#4cb956', '#36964a', '#5cc160'][i % 4])));
  crowns.instanceColor.needsUpdate = true;
  // Pinos: dos conos apilados en una sola geometría.
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(0.7, 1.2, 7).translate(0, 1.2, 0),
    new THREE.ConeGeometry(0.5, 1, 7).translate(0, 1.85, 0),
  ]);
  const pineMesh = instanced(pineGeo, lambert('#ffffff', { flatShading: true }), pines, (o, [x, z, s]) => {
    o.position.set(x, GROUND_Y, z);
    o.scale.setScalar(s);
    o.rotation.y = rand() * 6;
  });
  pines.forEach((_, i) => pineMesh.setColorAt(i, color.set(['#2f8a46', '#277a3e', '#33944b'][i % 3])));
  pineMesh.instanceColor.needsUpdate = true;

  // Hierba alta como en las rutas de los juegos: dos planos cruzados con
  // briznas pixeladas (textura con transparencia), una sola llamada de dibujo.
  const bladeTex = canvasTexture(32, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = 1 + i * 3.4;
      const h = 18 + Math.floor(rand() * 13);
      ctx.fillStyle = i % 2 ? '#2f8f3a' : '#3fae46';
      ctx.fillRect(Math.floor(x), s - h, 3, h);
      ctx.fillStyle = '#7ad66a'; // punta clara
      ctx.fillRect(Math.floor(x) + 1, s - h, 1, 4);
    }
  }, 1);
  bladeTex.wrapS = bladeTex.wrapT = THREE.ClampToEdgeWrapping;
  const plane = () => new THREE.PlaneGeometry(0.62, 0.48).translate(0, 0.24, 0);
  const tuftGeo = mergeGeometries([plane(), plane().rotateY(Math.PI / 2)]);
  const tufts = [];
  for (const [cx, cz] of [[3.5, 9.6], [-3.2, 9.8], [9.8, -0.5], [9.6, 4.6], [-9.8, -4], [-4.5, -9.6], [9.6, -6.2]]) {
    for (let k = 0; k < 22; k++) {
      const x = cx + (rand() - 0.5) * 2.6;
      const z = cz + (rand() - 0.5) * 1.8;
      if (Math.abs(x) < 7.7 && Math.abs(z) < 7.7) continue;
      tufts.push([x, z]);
    }
  }
  instanced(tuftGeo, lambert('#ffffff', { map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide }), tufts, (o, [x, z]) => {
    o.position.set(x, GROUND_Y, z);
    o.rotation.y = rand() * 6;
    o.scale.setScalar(0.9 + rand() * 0.5);
  });

  // Flores.
  const flowerSpots = [];
  for (let tries = 0; flowerSpots.length < 170 && tries < 3000; tries++) {
    const x = (rand() - 0.5) * 44;
    const z = (rand() - 0.5) * 44;
    if (!blocked(x, z)) flowerSpots.push([x, z]);
  }
  const flowers = instanced(new THREE.IcosahedronGeometry(0.09, 0), lambert('#ffffff'), flowerSpots, (o, [x, z]) => {
    o.position.set(x, GROUND_Y + 0.08, z);
  });
  flowerSpots.forEach((_, i) => flowers.setColorAt(i, color.set(['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff', '#74c0fc'][i % 5])));
  flowers.instanceColor.needsUpdate = true;

  // Colinas y montañas lejanas, en una sola geometría (se pierden en la niebla).
  const hills = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 40 + rand() * 10;
    const h = 5 + rand() * 9;
    hills.push(new THREE.ConeGeometry(6 + rand() * 6, h, 6).translate(Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r));
  }
  scene.add(new THREE.Mesh(mergeGeometries(hills), lambert('#7fb88a', { flatShading: true })));

  return { update() {} };
}

/** Cercas de Pueblo Paleta (postes y travesaños instanciados). */
function buildFences(scene) {
  const tmp = new THREE.Object3D();
  const posts = [];
  const rails = [];
  // Cerca en L alrededor del pueblo.
  const runs = [
    [[7.9, 14.2], [14.2, 14.2]],
    [[14.2, 14.2], [14.2, 7.9]],
  ];
  for (const [[x0, z0], [x1, z1]] of runs) {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.9);
    for (let i = 0; i <= n; i++) posts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    rails.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), Math.atan2(x1 - x0, z1 - z0)]);
  }
  const wood = lambert('#f8f0e3');
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0, 0.275, 0), wood, posts.length);
  posts.forEach(([x, z], i) => {
    tmp.position.set(x, GROUND_Y, z);
    tmp.updateMatrix();
    postMesh.setMatrixAt(i, tmp.matrix);
  });
  scene.add(postMesh);
  for (const [x, z, len, rot] of rails) {
    for (const y of [0.22, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, len), wood);
      rail.position.set(x, GROUND_Y + y, z);
      rail.rotation.y = rot;
      scene.add(rail);
    }
  }
}

function buildClouds(scene) {
  const rand = seeded(5);
  const puffs = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cx = Math.cos(a) * 26;
    const cz = Math.sin(a) * 26;
    const cy = 8 + rand() * 4;
    for (let k = 0; k < 4; k++) {
      puffs.push(new THREE.IcosahedronGeometry(0.9 + rand() * 0.7, 0).translate(cx + k * 1 - 1.5, cy + rand() * 0.4, cz + rand() * 0.6));
    }
  }
  const clouds = new THREE.Mesh(mergeGeometries(puffs), lambert('#ffffff', { flatShading: true, emissive: '#dfefff', emissiveIntensity: 0.25 }));
  scene.add(clouds);
  return clouds;
}

// ── Edificios y Pokémon (se cargan en segundo plano) ──────────────────

async function placeBuilding(scene, id, x, z, opts = {}) {
  const b = await townModel(id, TOWN_SCALE * (opts.scale || 1));
  b.position.set(x, opts.y ?? GROUND_Y, z);
  if (opts.rotationY != null) b.rotation.y = opts.rotationY;
  else faceBoard(b);
  b.traverse((m) => {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
  });
  scene.add(b);
  return b;
}

const gltfLoader = new GLTFLoader();

/**
 * Pokémon decorativo de Cobblemon: ojos abiertos (sin párpados ni
 * expresiones alternativas), tamaño ajustado y una animación en bucle.
 */
async function critter(name, height, clip) {
  const gltf = await gltfLoader.loadAsync(`models/decor/${name}.glb`);
  const model = gltf.scene;
  model.traverse((n) => {
    const nm = (n.name || '').toLowerCase();
    if (nm.startsWith('eyelid') || nm.includes('emote')) n.visible = false;
  });
  const mixer = new THREE.AnimationMixer(model);
  const anim = gltf.animations.find((a) => a.name.endsWith(`.${clip}`)) || gltf.animations[0];
  if (anim) mixer.clipAction(anim).play();
  mixer.update(0);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(height / (size.y || 1));
  box.setFromObject(model, true);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  const holder = new THREE.Group();
  const turn = new THREE.Group(); // los modelos de Cobblemon miran hacia -Z
  turn.rotation.y = Math.PI;
  turn.add(model);
  holder.add(turn);
  return { root: holder, mixer };
}

/**
 * Crea toda la escenografía. Devuelve { update(dt, t), loadExtras(), setDetail(level) }.
 */
export function buildScenery(scene) {
  buildGround(scene);
  const sea = buildSea(scene);
  const mountain = buildMountain(scene);
  const league = buildLeagueHill(scene);
  const vegetation = buildVegetation(scene);
  buildFences(scene);
  const clouds = buildClouds(scene);

  const animated = []; // { mixer, move(dt, t) }
  let extrasLoaded = false;
  let showCritters = true;

  async function loadExtras() {
    if (extrasLoaded) return;
    extrasLoaded = true;
    const jobs = [
      // Pueblo Paleta
      placeBuilding(scene, 'mrpokemon', ZONES.pallet.x + 1.2, ZONES.pallet.y + 1.2),
      placeBuilding(scene, 'lamp', ZONES.pallet.x - 2.6, ZONES.pallet.y - 0.6),
      placeBuilding(scene, 'bench-1', ZONES.pallet.x - 0.8, ZONES.pallet.y - 2.8),
      // Centro Pokémon y Tienda
      placeBuilding(scene, 'pokecenter', ZONES.center.x - 0.6, ZONES.center.y - 0.6),
      placeBuilding(scene, 'mart', ZONES.center.x - 4.6, ZONES.center.y + 4.2),
      placeBuilding(scene, 'fountain', ZONES.center.x + 3.1, ZONES.center.y + 3.1, { scale: 0.8 }),
      placeBuilding(scene, 'lamp', ZONES.center.x + 1.6, ZONES.center.y - 3.6),
      // Liga Pokémon en la colina
      placeBuilding(scene, 'gym', league.top.x, league.top.z, { y: league.top.y, rotationY: 0 }),
    ];
    const results = await Promise.allSettled(jobs);
    results.filter((r) => r.status === 'rejected').forEach((r) => console.warn('No se pudo cargar un edificio:', r.reason));

    const critters = [
      // Chansey en la puerta del Centro Pokémon
      ['chansey', 0.9, 'ground_idle', (o) => {
        o.position.set(ZONES.center.x + 1.8, GROUND_Y, ZONES.center.y + 1.8);
        faceBoard(o);
      }],
      // Clefairy bailando frente a la cueva de Monte Moon
      ['clefairy', 0.6, 'happy', (o) => {
        o.position.copy(mountain.caveFront);
        faceBoard(o);
      }],
      // Zubat dando vueltas frente a la cueva
      ['zubat', 0.6, 'air_fly', (o, t) => {
        const a = t * 0.9;
        o.position.set(mountain.caveFront.x + Math.cos(a) * 2.2, GROUND_Y + 2.4 + Math.sin(t * 2) * 0.3, mountain.caveFront.z + Math.sin(a) * 2.2);
        o.rotation.y = -a;
      }],
      // Tentacool nadando entre las islas
      ['tentacool', 0.6, 'water_swim', (o, t) => {
        const a = t * 0.35;
        o.position.set(ZONES.sea.x + Math.cos(a) * 5.5, GROUND_Y - 0.05 + Math.sin(t * 2.4) * 0.05, ZONES.sea.y + Math.sin(a) * 5.5);
        o.rotation.y = -a;
      }],
      // Pidgey volando alto alrededor del tablero
      ['pidgey', 0.5, 'air_fly', (o, t) => {
        const a = t * 0.22 + 1;
        o.position.set(Math.cos(a) * 13, 5 + Math.sin(t * 0.7) * 0.6, Math.sin(a) * 13);
        o.rotation.y = -a;
      }],
      // Diglett asomando de su agujero junto a la casilla de Diglett
      ['diglett', 0.45, 'ground_idle', (o, t) => {
        const cycle = (t % 6) / 6;
        const up = cycle < 0.15 ? cycle / 0.15 : cycle < 0.7 ? 1 : cycle < 0.8 ? 1 - (cycle - 0.7) / 0.1 : 0;
        o.position.set(ZONES.diglett.x, GROUND_Y - 0.45 + up * 0.45, ZONES.diglett.y);
        faceBoard(o);
      }],
    ];
    // Agujero de Diglett
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), new THREE.MeshBasicMaterial({ color: '#3b2a1c' }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(ZONES.diglett.x, GROUND_Y + 0.02, ZONES.diglett.y);
    scene.add(hole);

    for (const [name, h, clip, move] of critters) {
      try {
        const c = await critter(name, h, clip);
        move(c.root, 0);
        c.root.visible = showCritters;
        scene.add(c.root);
        animated.push({ root: c.root, mixer: c.mixer, move });
      } catch (err) {
        console.warn(`No se pudo cargar el Pokémon decorativo ${name}:`, err);
      }
    }
  }

  return {
    clouds,
    loadExtras,
    /** Detalle 0 = mínimo (sin Pokémon decorativos), 1 = completo. */
    setDetail(level) {
      showCritters = level > 0;
      for (const a of animated) a.root.visible = showCritters;
    },
    update(dt, t) {
      sea.update(dt);
      league.update(dt, t);
      vegetation.update(dt, t);
      clouds.rotation.y += dt * 0.01;
      if (!showCritters) return;
      for (const a of animated) {
        a.mixer.update(dt);
        a.move(a.root, t);
      }
    },
  };
}
