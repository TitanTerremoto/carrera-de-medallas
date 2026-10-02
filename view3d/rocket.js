/*
 * Team Rocket en 3D: el globo aerostático con la «R», en bloques (estilo
 * Minecraft, como los Pokémon de Cobblemon), y Meowth en la canasta, que
 * «habla» moviendo la boca mientras aparece su texto.
 *
 * El globo se arma a partir de las medidas de Meowth: la canasta lo rodea con
 * holgura y la lona empieza por encima de su cabeza, así nunca lo tapa.
 *
 *   ready                  promesa: modelo cargado y globo armado
 *   layout()               medidas para ubicarlo sin chocar (unidades del mundo)
 *   arrive(hover, faceTo)  baja del cielo hasta `hover` mirando hacia `faceTo`
 *   talk(on) · cry()       boca que se mueve / grito con su animación
 *   steal(from, to, cat)   la medalla vuela de la víctima al ladrón
 *   leave(blastOff)        se va; con blastOff sale disparado girando y
 *                          desaparece con un destello («¡…sale volando otra vez!»)
 *
 * Todo pasa por tween(): con la ventana oculta o en turbo se salta al final.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tween, ease, wait } from './tween.js';
import { medalTexture } from './textures.js';

const SCALE = 0.6; // unidades del mundo por unidad del globo
const V = 0.12; // lado de cada bloque (unidades del globo)
const MEOWTH_HEIGHT = 1.3;
const WALL_BLOCKS = 3; // alto de la pared de la canasta: Meowth asoma ~70 %
const HEAD_GAP = 0.3; // aire entre la cabeza de Meowth y la boca de la lona
// Radio de la lona por capa (en bloques), de la boca a la cima: forma de gota.
const ENVELOPE_RADII = [2.5, 3, 4, 5, 6, 6.8, 7.4, 7.9, 8.2, 8.4, 8.5, 8.4, 8.2, 7.8, 7.2, 6.4, 5.4, 4.2, 2.8, 1.6];
// «R» del Team Rocket (1 = rojo); el borde blanco se calcula alrededor.
const R_PIXELS = ['111110', '110011', '110011', '110011', '111110', '111100', '110110', '110011', '110011'];
// Cuánto se corren los nodos de la boca para abrirla (de la animación «cry»).
const MOUTH_OPEN = { lips: new THREE.Vector3(0, 0.031, 0), opening: new THREE.Vector3(0, 0, -0.006) };

/**
 * Busca el hueso `name` hijo de `parent` (las mallas repiten los nombres y el
 * cargador les agrega «_1», «_2»…; el hueso es el que tiene hijos).
 */
function bone(model, name, parent) {
  const base = (n) => n.name.replace(/_\d+$/, '');
  let found = null;
  model.traverse((n) => {
    if (!found && base(n) === name && n.parent && base(n.parent) === parent && n.children.length) found = n;
  });
  return found;
}

/** Meowth de Cobblemon: ojos abiertos, tamaño ajustado, boca controlable y sus medidas. */
async function loadMeowth() {
  const gltf = await new GLTFLoader().loadAsync('models/decor/meowth.glb');
  const model = gltf.scene;
  model.traverse((n) => {
    const nm = (n.name || '').toLowerCase();
    if (nm.startsWith('eyelid') || nm.includes('emote')) n.visible = false;
    if (n.isMesh) n.castShadow = true;
  });
  const mixer = new THREE.AnimationMixer(model);
  const clip = (suffix) => gltf.animations.find((a) => a.name.endsWith(`.${suffix}`));
  const idle = clip('ground_idle');
  if (idle) mixer.clipAction(idle).play();
  const cry = clip('cry') ? mixer.clipAction(clip('cry')) : null;
  if (cry) {
    cry.setLoop(THREE.LoopOnce, 1);
    cry.clampWhenFinished = false;
  }
  mixer.update(0);
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.multiplyScalar(MEOWTH_HEIGHT / (box.getSize(new THREE.Vector3()).y || 1));
  box.setFromObject(model, true);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  const size = box.getSize(new THREE.Vector3());
  // Ancho del cuerpo sin los bigotes (sobresalen pero no necesitan lugar en la canasta).
  model.updateWorldMatrix(true, true);
  const body = new THREE.Box3();
  model.traverse((n) => {
    if (n.isMesh && !/whisker/i.test(n.name) && !/whisker/i.test(n.parent?.name || '')) body.expandByObject(n, true);
  });
  const bodySize = body.isEmpty() ? size : body.getSize(new THREE.Vector3());
  const turn = new THREE.Group(); // los modelos de Cobblemon miran hacia -Z
  turn.rotation.y = Math.PI;
  turn.add(model);
  const lips = bone(model, 'mouth_lips', 'head');
  const opening = bone(model, 'mouth_opening', 'head');
  return {
    root: turn,
    mixer,
    cry,
    // Mitad del ancho del cuerpo: define la canasta.
    halfWidth: Math.max(bodySize.x, bodySize.z) / 2,
    height: size.y,
    head: bone(model, 'head', 'torso'),
    mouth: lips && opening ? { lips, opening, lipsBase: lips.position.clone(), openingBase: opening.position.clone() } : null,
  };
}

/** Juntador de bloques: posición (en bloques) y color de cada uno. */
function blockList() {
  const list = [];
  return {
    add: (x, y, z, color, size = 1) => list.push({ x, y, z, color, size }),
    list,
  };
}

/** Lona: cáscara de bloques en gajos grises, cima con abertura y la «R» al frente. */
function addEnvelope(blocks, baseLayer) {
  const GORES = 16;
  const DARK = new THREE.Color('#2f343b');
  const LIGHT = new THREE.Color('#6a737f');
  const shell = new Map(); // "x,layer" → z más al frente (para la «R»)
  const cells = [];
  ENVELOPE_RADII.forEach((r, layer) => {
    const top = layer >= ENVELOPE_RADII.length - 2;
    const span = Math.ceil(r);
    for (let x = -span; x <= span; x++) {
      for (let z = -span; z <= span; z++) {
        const d = Math.hypot(x, z);
        if (d > r) continue;
        const onShell = d > r - 1.5;
        const cap = top && d > 1.1; // tapa de arriba, con la abertura al medio
        if (!onShell && !cap) continue;
        cells.push({ x, z, layer, d });
        if (z > 0) {
          const key = `${x},${layer}`;
          if (!shell.has(key) || shell.get(key) < z) shell.set(key, z);
        }
      }
    }
  });
  // «R» con borde blanco, centrada en la panza (capas 6 a 14).
  const rows = R_PIXELS.length;
  const cols = R_PIXELS[0].length;
  const isR = (c, r) => r >= 0 && r < rows && c >= 0 && c < cols && R_PIXELS[r][c] === '1';
  const decal = new Map();
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      let color = null;
      if (isR(c, r)) color = '#e03b2f';
      else {
        for (let dr = -1; dr <= 1 && !color; dr++) for (let dc = -1; dc <= 1 && !color; dc++) if (isR(c + dc, r + dr)) color = '#ffffff';
      }
      if (!color) continue;
      const x = c - Math.floor(cols / 2);
      const layer = 14 - r;
      decal.set(`${x},${layer}`, color);
    }
  }
  for (const { x, z, layer } of cells) {
    const key = `${x},${layer}`;
    let color;
    if (decal.has(key) && shell.get(key) === z) color = decal.get(key);
    else {
      const sector = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * GORES) % 2;
      color = (sector ? LIGHT : DARK).clone().offsetHSL(0, 0, ((layer % 3) - 1) * 0.012).getStyle();
    }
    blocks.add(x, baseLayer + layer, z, color);
  }
  return { bottom: baseLayer, mouthRadius: ENVELOPE_RADII[0] };
}

/** Canasta de bloques de madera, hueca, con lugar para Meowth. */
function addBasket(blocks, inner) {
  const outer = inner + 1;
  for (let x = -outer; x <= outer; x++) {
    for (let z = -outer; z <= outer; z++) {
      const wood = (x + z) % 2 === 0 ? '#8a5a2b' : '#744a22';
      blocks.add(x, 0, z, wood); // piso
      const wall = Math.max(Math.abs(x), Math.abs(z)) === outer;
      if (!wall) continue;
      for (let y = 1; y <= WALL_BLOCKS; y++) blocks.add(x, y, z, y === WALL_BLOCKS ? '#5c3d1e' : wood);
    }
  }
  return outer;
}

/** Cuerdas de bloquecitos de las esquinas de la canasta a la boca de la lona. */
function addRopes(blocks, outer, mouthLayer, mouthRadius) {
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of corners) {
    const from = new THREE.Vector3(sx * outer, WALL_BLOCKS + 1, sz * outer);
    const to = new THREE.Vector3(sx * mouthRadius * 0.7, mouthLayer, sz * mouthRadius * 0.7);
    const steps = Math.ceil(from.distanceTo(to) * 2);
    for (let i = 0; i <= steps; i++) {
      const p = from.clone().lerp(to, i / steps);
      blocks.add(p.x, p.y, p.z, '#3b2a1c', 0.4);
    }
  }
}

/** Arma el globo alrededor de Meowth y devuelve el grupo y sus medidas (unidades del globo). */
function buildBalloon(meowth) {
  const blocks = blockList();
  // Canasta: Meowth adentro con medio bloque de aire por lado.
  const inner = Math.ceil((meowth.halfWidth + V * 0.5) / V);
  const outer = addBasket(blocks, inner);
  // Meowth parado en el piso; la lona empieza por encima de su cabeza.
  const floorTop = V; // el piso ocupa la capa 0
  const headTop = floorTop + meowth.height;
  const baseLayer = Math.ceil((headTop + HEAD_GAP) / V);
  const env = addEnvelope(blocks, baseLayer);
  addRopes(blocks, outer, baseLayer, env.mouthRadius);

  const geo = new THREE.BoxGeometry(V, V, V);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), blocks.list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  blocks.list.forEach((b, i) => {
    s.setScalar(b.size);
    m.compose(new THREE.Vector3(b.x * V, b.y * V + V / 2, b.z * V), q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.set(b.color));
  });
  mesh.castShadow = true;
  mesh.computeBoundingSphere();

  const g = new THREE.Group();
  g.add(mesh);
  meowth.root.position.y = floorTop;
  g.add(meowth.root);
  g.scale.setScalar(SCALE);
  return {
    group: g,
    blocks: blocks.list.length,
    // Medidas en unidades del globo (origen: debajo de la canasta, en su eje).
    basketHalf: (outer + 0.5) * V,
    rimY: (WALL_BLOCKS + 1) * V,
    meowthHeadY: headTop,
    envelopeBottomY: baseLayer * V,
    envelopeTopY: (baseLayer + ENVELOPE_RADII.length) * V,
    envelopeRadiusAt: (y) => {
      const layer = Math.floor(y / V) - baseLayer;
      return layer < 0 || layer >= ENVELOPE_RADII.length ? 0 : (ENVELOPE_RADII[layer] + 0.5) * V;
    },
    maxRadius: (Math.max(...ENVELOPE_RADII) + 0.5) * V,
  };
}

/** Estrellita que brilla un instante donde desaparece el globo. */
function twinkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,244,180,0.9)');
  grad.addColorStop(1, 'rgba(255,244,180,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = k % 2 ? 14 : 62;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export function createRocket(scene, { burst }) {
  const balloon = new THREE.Group();
  balloon.visible = false;
  scene.add(balloon);
  const twinkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: twinkleTexture(), transparent: true, depthTest: false }));
  twinkle.visible = false;
  scene.add(twinkle);

  let meowth = null;
  let dims = null;
  const ready = loadMeowth()
    .then((m) => {
      meowth = m;
      const built = buildBalloon(m);
      dims = built;
      balloon.add(built.group);
    })
    .catch((err) => console.warn('No se pudo armar el globo del Team Rocket.', err));

  /** Medidas del globo en unidades del mundo (para ubicarlo sin chocar). */
  function layout() {
    if (!dims) return null;
    return {
      basketRadius: dims.basketHalf * Math.SQRT2 * SCALE, // esquina de la canasta
      rimY: dims.rimY * SCALE,
      meowthHeadY: dims.meowthHeadY * SCALE,
      meowthChestY: (dims.rimY + (dims.meowthHeadY - dims.rimY) * 0.45) * SCALE,
      envelopeBottomY: dims.envelopeBottomY * SCALE,
      envelopeTopY: dims.envelopeTopY * SCALE,
      envelopeRadiusAt: (y) => dims.envelopeRadiusAt(y / SCALE) * SCALE,
      maxRadius: dims.maxRadius * SCALE,
    };
  }

  let hovering = false;
  let hoverAt = new THREE.Vector3();
  let talking = false;
  // Las escenas se encadenan: llegar, robar e irse nunca se pisan.
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn).catch((err) => console.warn('Animación del Team Rocket:', err)));

  function arrive(hover, faceTo) {
    return queue(async () => {
      await ready;
      hoverAt = hover.clone();
      const sky = hover.clone().add(new THREE.Vector3(-6, 10, -6));
      balloon.visible = true;
      balloon.rotation.set(0, 0, 0);
      balloon.scale.setScalar(1);
      balloon.position.copy(sky);
      await tween(1600, (t) => {
        balloon.position.lerpVectors(sky, hover, t);
        balloon.lookAt(faceTo.x, balloon.position.y, faceTo.z);
        balloon.rotateY((1 - t) * 2.5);
      }, ease.out);
      balloon.lookAt(faceTo.x, hover.y, faceTo.z);
      hovering = true;
    });
  }

  function talk(on) {
    talking = on;
  }

  function cry() {
    if (meowth && meowth.cry) meowth.cry.reset().play();
  }

  /** La medalla sale de la víctima, sube y cae sobre el ladrón. */
  function steal(from, to, cat) {
    return queue(async () => {
      const tex = await medalTexture(cat);
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.3, transparent: true });
      const edge = new THREE.MeshStandardMaterial({ color: '#f8c630', roughness: 0.3, metalness: 0.6 });
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), [edge, face, face]);
      coin.rotation.x = Math.PI / 2;
      scene.add(coin);
      const a = from.clone().add(new THREE.Vector3(0, 0.9, 0));
      const b = to.clone().add(new THREE.Vector3(0, 0.9, 0));
      burst(a, ['#f8c630', '#ffffff'], 14, 1.8);
      await tween(1300, (t) => {
        coin.position.lerpVectors(a, b, t);
        coin.position.y += Math.sin(t * Math.PI) * 2.4;
        coin.rotation.z = t * Math.PI * 6;
      }, ease.inOut);
      burst(b, ['#f8c630', '#ffe066', '#ffffff'], 22, 2.2);
      await wait(250);
      scene.remove(coin);
      face.dispose();
      edge.dispose();
    });
  }

  function leave(blastOff) {
    return queue(async () => {
      if (!balloon.visible) return;
      hovering = false;
      talking = false;
      const from = balloon.position.clone();
      if (blastOff) {
        // «¡El Team Rocket sale volando otra vez!»
        const to = from.clone().add(new THREE.Vector3(6, 13, -9));
        const spin0 = balloon.rotation.z;
        await tween(1300, (t) => {
          balloon.position.lerpVectors(from, to, t);
          balloon.rotation.z = spin0 + t * Math.PI * 6;
          balloon.scale.setScalar(1 - t * 0.85);
        }, ease.in);
        balloon.visible = false;
        twinkle.position.copy(to);
        twinkle.visible = true;
        window.GameSound?.play('tick');
        await tween(600, (t) => {
          const s = 1.5 * Math.sin(t * Math.PI);
          twinkle.scale.set(s, s, 1);
          twinkle.material.rotation = t * Math.PI;
        }, ease.linear);
        twinkle.visible = false;
      } else {
        const to = from.clone().add(new THREE.Vector3(8, 11, -8));
        await tween(1500, (t) => {
          balloon.position.lerpVectors(from, to, t);
        }, ease.in);
        balloon.visible = false;
      }
    });
  }

  /** Balanceo del globo y boca de Meowth (se llama en cada cuadro). */
  function update(dt, t) {
    if (hovering) balloon.position.y = hoverAt.y + Math.sin(t * 1.6) * 0.06;
    if (!meowth || !balloon.visible) return;
    meowth.mixer.update(dt);
    const m = meowth.mouth;
    if (m) {
      // Abre y cierra la boca unas 6 veces por segundo mientras habla.
      const open = talking ? Math.max(0, Math.sin(t * 38)) : 0;
      m.lips.position.copy(m.lipsBase).addScaledVector(MOUTH_OPEN.lips, open);
      m.opening.position.copy(m.openingBase).addScaledVector(MOUTH_OPEN.opening, open);
    }
    if (meowth.head) meowth.head.rotation.z = talking ? Math.sin(t * 7) * 0.08 : 0;
  }

  /** Al cambiar de partida o recargar, el globo no queda colgado. */
  function reset() {
    hovering = false;
    talking = false;
    balloon.visible = false;
    twinkle.visible = false;
  }

  return { ready, layout, arrive, talk, cry, steal, leave, update, reset };
}
