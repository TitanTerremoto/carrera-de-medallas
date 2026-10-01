/*
 * Fichas 3D: Pikachu, Charmander, Squirtle y Bulbasaur.
 *
 * Mientras no haya modelos reales se usan figuras de juguete armadas con
 * formas simples. Para usar modelos .glb, se copian en models/ y se listan en
 * models/models.json; si un modelo trae animaciones, se reproduce "idle" (o
 * la primera que tenga).
 *
 * Cada ficha mira hacia +Z. El grupo `body` tiene el pivote en los pies, así
 * los estiramientos y aplastamientos se ven naturales al saltar.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tween, ease, lerp } from './tween.js';

const PIECE_HEIGHT = 0.82;
const PIECE_FOOTPRINT = 0.62; // ancho máximo para que entren varias en una casilla
const matCache = new Map();

function mat(color, extra) {
  const key = color + JSON.stringify(extra || {});
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...(extra || {}) }));
  return matCache.get(key);
}

function part(geo, color, pos, opts = {}) {
  const m = new THREE.Mesh(geo, mat(color, opts.mat));
  m.position.set(...pos);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.rot) m.rotation.set(...opts.rot);
  return m;
}

const sphere = (r) => new THREE.SphereGeometry(r, 20, 16);

/** Par de ojos con brillo. */
function eyes(g, y, z, dx, r, color, scaleY = 1.3) {
  for (const s of [-1, 1]) {
    g.add(part(sphere(r), color, [s * dx, y, z], { scale: [1, scaleY, 0.8] }));
    g.add(part(sphere(r * 0.38), '#ffffff', [s * dx + r * 0.35, y + r * 0.45, z + r * 0.6]));
  }
}

const BUILD = {
  pikachu(g) {
    const Y = '#ffd43b';
    g.add(part(sphere(0.2), Y, [0, 0.25, 0], { scale: [1, 1.1, 0.9] }));
    g.add(part(sphere(0.21), Y, [0, 0.56, 0.02]));
    for (const s of [-1, 1]) {
      const ear = part(new THREE.ConeGeometry(0.055, 0.32, 10), Y, [s * 0.12, 0.8, 0], { rot: [0, 0, -s * 0.42] });
      ear.add(part(new THREE.ConeGeometry(0.032, 0.1, 10), '#212529', [0, 0.11, 0]));
      g.add(ear);
      g.add(part(sphere(0.045), '#e8413c', [s * 0.145, 0.5, 0.15], { scale: [1, 1, 0.5] }));
      g.add(part(sphere(0.05), Y, [s * 0.14, 0.3, 0.12]));
      g.add(part(sphere(0.06), Y, [s * 0.09, 0.04, 0.05], { scale: [1, 0.6, 1.3] }));
    }
    eyes(g, 0.6, 0.18, 0.075, 0.032, '#212529');
    g.add(part(sphere(0.013), '#212529', [0, 0.54, 0.21]));
    // Cola en zigzag
    g.add(part(new THREE.BoxGeometry(0.07, 0.16, 0.04), '#8d5a32', [0, 0.22, -0.2], { rot: [0, 0, 0.5] }));
    g.add(part(new THREE.BoxGeometry(0.09, 0.2, 0.04), Y, [0.05, 0.36, -0.23], { rot: [0, 0, -0.7] }));
    g.add(part(new THREE.BoxGeometry(0.22, 0.17, 0.04), Y, [0.02, 0.53, -0.25], { rot: [0, 0, 0.45] }));
  },
  charmander(g, piece) {
    const O = '#ff922b';
    g.add(part(new THREE.CapsuleGeometry(0.16, 0.16, 6, 16), O, [0, 0.3, 0]));
    g.add(part(sphere(0.13), '#ffd8a8', [0, 0.28, 0.1], { scale: [1, 1.2, 0.5] }));
    g.add(part(sphere(0.2), O, [0, 0.63, 0.04], { scale: [1, 0.95, 1.08] }));
    eyes(g, 0.67, 0.21, 0.08, 0.035, '#1b4965', 1.45);
    for (const s of [-1, 1]) {
      g.add(part(sphere(0.05), O, [s * 0.17, 0.34, 0.07]));
      g.add(part(sphere(0.07), O, [s * 0.09, 0.05, 0.04], { scale: [1, 0.6, 1.3] }));
    }
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, -0.12), new THREE.Vector3(0, 0.18, -0.32), new THREE.Vector3(0, 0.32, -0.45)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.05, 8), mat(O)));
    const flame = new THREE.Group();
    flame.position.set(0, 0.45, -0.46);
    flame.add(part(new THREE.ConeGeometry(0.075, 0.22, 10), '#fa5252', [0, 0, 0], { mat: { emissive: '#ff4d00', emissiveIntensity: 1.4 } }));
    flame.add(part(new THREE.ConeGeometry(0.04, 0.14, 10), '#ffd43b', [0, -0.02, 0.01], { mat: { emissive: '#ffd43b', emissiveIntensity: 1.6 } }));
    const glow = new THREE.PointLight('#ff8a3d', 0.8, 1.6);
    flame.add(glow);
    g.add(flame);
    // La llama parpadea en cada frame.
    piece.extraUpdate = (t) => {
      const f = 1 + Math.sin(t * 18) * 0.08 + Math.sin(t * 31) * 0.05;
      flame.scale.set(f, 1 / f + 0.1, f);
      glow.intensity = 0.6 + (f - 1) * 3;
    };
  },
  squirtle(g) {
    const B = '#8fd3ff';
    g.add(part(sphere(0.23), '#c97b3c', [0, 0.32, -0.1], { scale: [1, 1.15, 0.75] }));
    g.add(part(new THREE.TorusGeometry(0.21, 0.03, 8, 24), '#f1e3c8', [0, 0.32, -0.04], { scale: [1, 1.15, 1] }));
    g.add(part(sphere(0.18), B, [0, 0.3, 0.02]));
    g.add(part(sphere(0.13), '#f1e3c8', [0, 0.28, 0.12], { scale: [1, 1.2, 0.45] }));
    g.add(part(sphere(0.2), B, [0, 0.63, 0.04]));
    eyes(g, 0.66, 0.21, 0.08, 0.036, '#7a2e1c', 1.35);
    for (const s of [-1, 1]) {
      g.add(part(sphere(0.05), B, [s * 0.18, 0.34, 0.06]));
      g.add(part(sphere(0.07), B, [s * 0.1, 0.05, 0.04], { scale: [1, 0.6, 1.3] }));
    }
    g.add(part(new THREE.TorusGeometry(0.07, 0.035, 8, 16, Math.PI * 1.5), B, [0, 0.14, -0.33], { rot: [0, Math.PI / 2, 0] }));
  },
  bulbasaur(g) {
    const T = '#79d2b9';
    const D = '#2f9e8f';
    g.add(part(sphere(0.2), T, [0, 0.21, 0], { scale: [1.15, 0.8, 1.3] }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.055, 0.06, 0.14, 10), T, [sx * 0.13, 0.07, sz * 0.13]));
      g.add(part(new THREE.ConeGeometry(0.045, 0.11, 8), T, [sx * 0.14, 0.53, 0.2], { rot: [0, 0, -sx * 0.5] }));
      g.add(part(sphere(0.05), '#ffffff', [sx * 0.09, 0.41, 0.37], { scale: [1, 1.1, 0.6] }));
      g.add(part(sphere(0.03), '#c92a2a', [sx * 0.09, 0.41, 0.4]));
      g.add(part(sphere(0.011), '#ffffff', [sx * 0.09 + 0.01, 0.425, 0.425]));
      g.add(part(sphere(0.04), D, [sx * 0.17, 0.27, 0.05], { scale: [1, 0.5, 1.2] }));
    }
    g.add(part(sphere(0.19), T, [0, 0.37, 0.22], { scale: [1.15, 0.95, 1] }));
    g.add(part(sphere(0.17), '#40c057', [0, 0.43, -0.06]));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      g.add(part(new THREE.ConeGeometry(0.06, 0.22, 6), '#2b8a3e', [Math.cos(a) * 0.08, 0.5, -0.06 + Math.sin(a) * 0.08], { rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }));
    }
  },
};

// ── Modelos .glb opcionales ──
let manifestPromise = null;
function loadManifest() {
  if (!manifestPromise) {
    // no-cache: el navegador pregunta siempre si la lista cambió (es chica).
    manifestPromise = fetch('models/models.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch((err) => {
        console.warn('Sin lista de modelos 3D; se usan las figuras incluidas.', err);
        return {};
      });
  }
  return manifestPromise;
}

const loader = new GLTFLoader();

/** Carga el modelo real si está listado; si no, devuelve null. */
async function loadModel(creature) {
  const manifest = await loadManifest();
  const entry = manifest[creature];
  if (!entry || !entry.file) return null;
  try {
    const gltf = await loader.loadAsync(`models/${entry.file}`);
    const holder = new THREE.Group();
    holder.add(gltf.scene);
    holder.rotation.y = THREE.MathUtils.degToRad(entry.rotationY || 0);
    return { object: holder, model: gltf.scene, animations: gltf.animations || [], clips: entry.animations || {}, scale: entry.scale || 1 };
  } catch (err) {
    console.warn(`No se pudo cargar el modelo de ${creature}; se usa la figura incluida.`, err);
    return null;
  }
}

export class Piece {
  constructor(creature, color) {
    this.creature = creature;
    this.color = color;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.model = new THREE.Group();
    this.body.add(this.model);
    this.root.add(this.body);
    this.busy = 0; // animaciones en curso (pausa el balanceo de reposo)
    this.facing = 0;
    this.phase = Math.random() * 10;
    this.mixer = null;
    this.extraUpdate = null;

    // Base con el color del jugador para reconocer la ficha desde arriba.
    this.baseMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.06, 28), this.baseMat);
    base.position.y = 0.03;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 28), mat('#ffffff'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.062;
    this.root.add(base, rim);
    this.body.position.y = 0.06;

    (BUILD[creature] || BUILD.pikachu)(this.model, this);
    this.setShadows(this.root);
    loadModel(creature).then((m) => m && this.useModel(m));
  }

  setShadows(obj) {
    obj.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
  }

  /**
   * Usa el modelo real. `clips` (de models.json) dice qué animación del
   * modelo corresponde a cada momento: idle, move, cry, happy, sad.
   */
  useModel({ object, model, animations, clips, scale }) {
    this.body.remove(this.model);
    this.extraUpdate = null;
    this.model = object;
    this.body.add(object);
    this.setShadows(object);
    this.setupEyes(model);
    if (animations.length) this.setupAnimations(model, animations, clips);
    this.fitModel(model, scale);
  }

  /**
   * Ojos abiertos. En los modelos de Cobblemon el párpado está casi en el
   * mismo lugar que el ojo y en reposo lo tapa (o parpadea por z-fighting):
   * se ocultan los párpados y las expresiones alternativas ("emote"), y el
   * parpadeo lo hacemos nosotros mostrando el párpado un instante.
   */
  setupEyes(model) {
    this.lids = [];
    model.traverse((node) => {
      const name = (node.name || '').toLowerCase();
      if (name.includes('emote')) node.visible = false;
      else if (name.startsWith('eyelid')) {
        node.visible = false;
        this.lids.push(node);
      }
    });
    this.blinkAt = performance.now() + 1500 + Math.random() * 3000;
    this.blinkUntil = 0;
  }

  blink(now) {
    if (!this.lids || !this.lids.length) return;
    if (!this.blinkUntil && now >= this.blinkAt) {
      this.blinkUntil = now + 130;
      for (const lid of this.lids) lid.visible = true;
    } else if (this.blinkUntil && now >= this.blinkUntil) {
      this.blinkUntil = 0;
      this.blinkAt = now + 2200 + Math.random() * 3500;
      for (const lid of this.lids) lid.visible = false;
    }
  }

  /**
   * Ajusta tamaño y posición según la pose de reposo animada (la pose de
   * armado puede incluir piezas que la animación esconde).
   */
  fitModel(model, extraScale) {
    if (this.mixer) this.mixer.update(0);
    // Matrices al día desde la escena hacia abajo (si no, la caja sale corrida).
    this.model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const k = Math.min(PIECE_HEIGHT / (size.y || 1), PIECE_FOOTPRINT / (Math.max(size.x, size.z) || 1)) * extraScale;
    model.scale.multiplyScalar(k);
    this.model.updateWorldMatrix(true, true);
    box.setFromObject(model, true);
    const c = box.getCenter(new THREE.Vector3());
    // Centrado y apoyado sobre la base (coordenadas del contenedor)
    const local = this.model.worldToLocal(c.clone());
    const minY = this.model.worldToLocal(new THREE.Vector3(0, box.min.y, 0)).y;
    model.position.x -= local.x;
    model.position.z -= local.z;
    model.position.y -= minY;
  }

  setupAnimations(model, animations, clips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    const byName = (name) => animations.find((a) => a.name === name);
    for (const [key, name] of Object.entries(clips)) {
      const clip = byName(name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
      else console.warn(`El modelo de ${this.creature} no tiene la animación ${name}.`);
    }
    if (!this.actions.idle) {
      const idle = animations.find((a) => /idle/i.test(a.name)) || animations[0];
      this.actions.idle = this.mixer.clipAction(idle);
    }
    this.actions.idle.play();

    this.mixer.addEventListener('finished', (e) => this.onOneShotEnd(e.action));
  }

  /** Base que corresponde ahora: caminar mientras salta, si no, reposo. */
  baseAction() {
    return (this.moving && this.actions.move) || this.actions.idle;
  }

  /** Cambia suave entre reposo y caminar. */
  setMoving(on) {
    if (!this.actions || this.moving === on) return;
    const from = this.baseAction();
    this.moving = on;
    const to = this.baseAction();
    if (from === to || this.oneShot) return;
    to.reset().fadeIn(0.15).play();
    from.fadeOut(0.15);
  }

  /** Reproduce una vez una animación (cry, happy, sad) y vuelve a la base. */
  play(key) {
    const action = this.actions && this.actions[key];
    if (!action) return false;
    if (this.oneShot && this.oneShot !== action) this.oneShot.fadeOut(0.1);
    this.baseAction().fadeOut(0.15);
    action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play();
    action.clampWhenFinished = false;
    this.oneShot = action;
    return true;
  }

  onOneShotEnd(action) {
    if (action !== this.oneShot) return;
    this.oneShot = null;
    action.fadeOut(0.2);
    this.baseAction().reset().fadeIn(0.2).play();
  }

  setActive(on) {
    this.active = on;
  }

  /** Mira hacia un punto del tablero (gira suave en update). */
  faceTowards(point) {
    const dx = point.x - this.root.position.x;
    const dz = point.z - this.root.position.z;
    if (dx * dx + dz * dz > 1e-4) this.facing = Math.atan2(dx, dz);
  }

  update(dt, t) {
    if (this.mixer) this.mixer.update(dt);
    this.blink(performance.now());
    if (this.extraUpdate) this.extraUpdate(t);
    // Giro suave hacia la dirección deseada
    let diff = this.facing - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, dt * 10);
    // La base del jugador en turno brilla
    this.baseMat.emissiveIntensity = this.active ? 0.35 + Math.sin(t * 5) * 0.25 : 0;
    if (!this.busy) {
      const b = Math.sin(t * 3 + this.phase);
      this.body.position.y = 0.06 + Math.max(0, b) * 0.03;
      this.body.scale.set(1 + b * 0.015, 1 - b * 0.02, 1 + b * 0.015);
    }
  }

  async run(fn) {
    this.busy++;
    try {
      await fn();
    } finally {
      this.busy--;
      if (!this.busy) this.body.scale.set(1, 1, 1);
    }
  }

  /** Salto de una casilla a otra, con estiramiento y aplastamiento. */
  hop(to, ms = 300, height = 0.55) {
    // Mientras encadena saltos, el modelo camina; un rato después de parar, reposo.
    this.setMoving(true);
    clearTimeout(this.moveOff);
    this.moveOff = setTimeout(() => this.setMoving(false), ms + 350);
    return this.run(async () => {
      const from = this.root.position.clone();
      this.faceTowards(to);
      await tween(60, (t) => this.body.scale.set(1 + 0.15 * t, 1 - 0.2 * t, 1 + 0.15 * t), ease.out);
      await tween(ms, (t) => {
        this.root.position.set(lerp(from.x, to.x, t), lerp(from.y, to.y, t) + 4 * height * t * (1 - t), lerp(from.z, to.z, t));
        const s = Math.sin(t * Math.PI);
        this.body.scale.set(1 - 0.08 * s, 1 + 0.18 * s, 1 - 0.08 * s);
      }, ease.linear);
      await tween(110, (t) => {
        const k = Math.sin(t * Math.PI);
        this.body.scale.set(1 + 0.18 * k, 1 - 0.24 * k, 1 + 0.18 * k);
      }, ease.linear);
    });
  }

  /** Salto en el lugar (por ejemplo, para golpear el bloque de dado). */
  jump(height = 0.9, ms = 520, spin = 0) {
    return this.run(async () => {
      const y0 = this.root.position.y;
      const r0 = this.root.rotation.y;
      await tween(80, (t) => this.body.scale.set(1 + 0.15 * t, 1 - 0.22 * t, 1 + 0.15 * t), ease.out);
      await tween(ms, (t) => {
        this.root.position.y = y0 + 4 * height * t * (1 - t);
        if (spin) this.root.rotation.y = r0 + spin * t;
        const s = Math.sin(t * Math.PI);
        this.body.scale.set(1 - 0.08 * s, 1 + 0.16 * s, 1 - 0.08 * s);
      }, ease.linear);
      this.root.position.y = y0;
      if (spin) this.facing = this.root.rotation.y;
      await tween(120, (t) => {
        const k = Math.sin(t * Math.PI);
        this.body.scale.set(1 + 0.2 * k, 1 - 0.25 * k, 1 + 0.2 * k);
      }, ease.linear);
    });
  }

  /** Desánimo tras un error: se achica y niega con la cabeza. */
  sad() {
    this.play('sad');
    return this.run(async () => {
      await tween(200, (t) => this.body.scale.set(1 + 0.1 * t, 1 - 0.22 * t, 1 + 0.1 * t), ease.out);
      await tween(700, (t) => {
        this.body.rotation.y = Math.sin(t * Math.PI * 4) * 0.35 * (1 - t);
      }, ease.linear);
      await tween(200, (t) => this.body.scale.set(1.1 - 0.1 * t, 0.78 + 0.22 * t, 1.1 - 0.1 * t), ease.out);
      this.body.rotation.y = 0;
    });
  }
}
