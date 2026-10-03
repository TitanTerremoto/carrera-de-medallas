/*
 * Personajes que visitan las casillas especiales (modelos de Cobblemon):
 *
 *   chansey    Centro Pokémon: entra caminando y te pregunta la categoría.
 *   dodrio     Dodrio veloz: llega corriendo y corre al lado de la ficha.
 *   diglett    Diglett: asoma del suelo, la hace tropezar y se vuelve a meter.
 *   tentacool  Islas Espuma: te arrastra hacia atrás.
 *   zubat      Monte Moon: tres Zubat dan vueltas alrededor de la ficha.
 *   mew        Pueblo Paleta: baja flotando y regala una medalla.
 *   tangela · onix · raichu · venomoth  Pokémon de los líderes (medalla directa).
 *   dragonite  Lance, desafío de la Liga.
 *
 *   arrive(kind, spot, faceTo)   entrada del personaje en `spot`
 *   talk(on) · cry()             «habla» (rebote) / su grito
 *   follow(to, ms)               corre a `to` (Dodrio acompañando a la ficha)
 *   leave()                      salida según el personaje
 *   swarm(center, ms)            los tres Zubat atacan alrededor de `center`
 *
 * Todo pasa por tween(): con la ventana oculta o en turbo se salta al final.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tween, ease, wait } from './tween.js';

// Alto en el mundo y radio visto desde arriba (para no chocar con las fichas).
// `fly`: llega volando y flota a `hover` del suelo; `float`: se mece en el aire.
export const VISITORS = {
  chansey: { height: 0.78, radius: 0.36 },
  dodrio: { height: 1.05, radius: 0.42 },
  diglett: { height: 0.48, radius: 0.24 },
  tentacool: { height: 0.62, radius: 0.32 },
  zubat: { height: 0.42, radius: 0.3 },
  mew: { height: 0.72, radius: 0.34, fly: true, hover: 0.4, float: true },
  tangela: { height: 0.72, radius: 0.4 },
  onix: { height: 1.6, radius: 0.55 },
  raichu: { height: 0.78, radius: 0.36 },
  venomoth: { height: 0.9, radius: 0.46, fly: true, hover: 0.3, float: true },
  dragonite: { height: 1.3, radius: 0.55, fly: true, hover: 0 },
};

/** Alto total que ocupa (con el vuelo incluido), para encuadrarlo. */
export const visitorTop = (kind) => VISITORS[kind].height + (VISITORS[kind].hover || 0);

const loader = new GLTFLoader();
const cache = new Map();

/** Carga un modelo de models/decor: ojos abiertos, tamaño ajustado y sus animaciones. */
async function loadVisitor(kind) {
  const gltf = await loader.loadAsync(`models/decor/${kind}.glb`);
  const model = gltf.scene;
  model.traverse((n) => {
    const nm = (n.name || '').toLowerCase();
    if (nm.startsWith('eyelid') || nm.includes('emote')) n.visible = false;
    if (n.isMesh) n.castShadow = true;
  });
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name.split('.').pop()] = mixer.clipAction(clip);
  const base = clips.air_idle || clips.ground_idle || clips.air_fly || clips.water_swim;
  if (base) base.play();
  mixer.update(0);
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.multiplyScalar(VISITORS[kind].height / (box.getSize(new THREE.Vector3()).y || 1));
  box.setFromObject(model, true);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  const turn = new THREE.Group(); // los modelos de Cobblemon miran hacia -Z
  turn.rotation.y = Math.PI;
  turn.add(model);
  const root = new THREE.Group();
  root.add(turn);
  return { root, body: turn, mixer, clips, base };
}

function getVisitor(kind) {
  if (!cache.has(kind)) cache.set(kind, loadVisitor(kind));
  return cache.get(kind);
}

export function createVisitors(scene, { burst }) {
  let current = null; // { kind, v } personaje en escena
  const exiting = new Set(); // personajes que se están yendo (siguen animados)
  let talking = false;
  const swarm = []; // Zubat activos: { v, phase }
  let swarmCenter = null;

  /** Cambia la animación de base (caminar ↔ quieto) con un fundido corto. */
  function setBase(v, name) {
    const next = v.clips[name] || v.base;
    if (!next || next === v.active) return;
    next.reset().fadeIn(0.15).play();
    if (v.active) v.active.fadeOut(0.15);
    else if (v.base && v.base !== next) v.base.fadeOut(0.15);
    v.active = next;
  }

  function faceTo(v, point) {
    v.root.lookAt(point.x, v.root.position.y, point.z);
  }

  async function arrive(kind, spot, look) {
    if (current) remove(current);
    const v = await getVisitor(kind);
    current = { kind, v };
    v.root.visible = true;
    v.root.scale.setScalar(1);
    v.body.position.set(0, 0, 0);
    scene.add(v.root);
    if (kind === 'diglett') {
      // Asoma del suelo con una nube de tierra.
      v.root.position.copy(spot);
      faceTo(v, look);
      burst(spot.clone().add(new THREE.Vector3(0, 0.05, 0)), ['#8d5a2b', '#5c3d1e', '#c8a27a'], 16, 1.6);
      window.GameSound?.play('step');
      await tween(500, (t) => {
        v.body.position.y = -VISITORS.diglett.height * (1 - t);
      }, ease.outBack);
    } else if (VISITORS[kind].fly) {
      // Baja volando desde el cielo y queda flotando.
      const at = spot.clone().setY(spot.y + VISITORS[kind].hover);
      const from = at.clone().add(new THREE.Vector3(0, 4, 0)).add(spot.clone().sub(look).setY(0).normalize().multiplyScalar(2));
      v.root.position.copy(from);
      faceTo(v, look);
      setBase(v, 'air_fly');
      await tween(1200, (t) => {
        v.root.position.lerpVectors(from, at, t);
      }, ease.out);
      setBase(v, VISITORS[kind].hover ? 'air_idle' : 'ground_idle');
      faceTo(v, look);
      if (kind === 'mew') window.GameSound?.play('special');
    } else {
      // Entra caminando (Dodrio, corriendo) desde un costado.
      const from = spot.clone().add(spot.clone().sub(look).setY(0).normalize().multiplyScalar(kind === 'dodrio' ? 3 : 1.6));
      v.root.position.copy(from);
      faceTo(v, spot);
      setBase(v, 'ground_walk');
      await tween(kind === 'dodrio' ? 700 : 1100, (t) => {
        v.root.position.lerpVectors(from, spot, t);
        v.body.position.y = Math.abs(Math.sin(t * Math.PI * (kind === 'dodrio' ? 6 : 4))) * 0.05;
      }, ease.out);
      v.body.position.y = 0;
      setBase(v, 'ground_idle');
      faceTo(v, look);
    }
  }

  function talk(on) {
    talking = on;
  }

  function cry() {
    const c = current && current.v.clips.cry;
    if (!c) return;
    c.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
    c.clampWhenFinished = false;
  }

  /** Corre hasta `to` (acompañando a la ficha en Dodrio veloz). */
  async function follow(to, ms) {
    if (!current) return;
    const { v } = current;
    const from = v.root.position.clone();
    faceTo(v, to);
    setBase(v, 'ground_walk');
    await tween(ms, (t) => {
      v.root.position.lerpVectors(from, to, t);
      v.body.position.y = Math.sin(t * Math.PI) * 0.12;
    }, ease.inOut);
    v.body.position.y = 0;
  }

  /** Salida: Diglett se mete en la tierra; los demás se van caminando y desaparecen. */
  async function leave() {
    if (!current) return;
    // Se guarda quién se va: si mientras tanto llega otro personaje, no se lo lleva.
    const leaving = current;
    const { kind, v } = leaving;
    // Deja el lugar libre ya: el que llega después no interrumpe esta salida.
    current = null;
    talking = false;
    exiting.add(leaving);
    if (kind === 'diglett') {
      burst(v.root.position.clone().add(new THREE.Vector3(0, 0.05, 0)), ['#8d5a2b', '#5c3d1e'], 12, 1.4);
      await tween(450, (t) => {
        v.body.position.y = -VISITORS.diglett.height * t;
      }, ease.in);
    } else if (VISITORS[kind].fly) {
      // Se va volando hacia arriba.
      const from = v.root.position.clone();
      const to = from.clone().add(new THREE.Vector3(1.5, 5, -1.5));
      setBase(v, 'air_fly');
      await tween(900, (t) => {
        v.root.position.lerpVectors(from, to, t);
        v.root.scale.setScalar(1 - t * 0.7);
      }, ease.in);
    } else {
      const from = v.root.position.clone();
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(v.root.quaternion).setY(0).normalize().negate();
      const to = from.clone().addScaledVector(dir, kind === 'dodrio' ? 4 : 1.8);
      faceTo(v, to);
      setBase(v, 'ground_walk');
      await tween(kind === 'dodrio' ? 700 : 900, (t) => {
        v.root.position.lerpVectors(from, to, t);
        v.root.scale.setScalar(1 - t * 0.9);
      }, ease.in);
    }
    remove(leaving);
  }

  /** Saca a un personaje de la escena (si es el actual, queda libre el lugar). */
  function remove(who) {
    exiting.delete(who);
    scene.remove(who.v.root);
    setBase(who.v, 'ground_idle');
    if (current === who) {
      current = null;
      talking = false;
    }
  }

  /** Tres Zubat dan vueltas en picada alrededor de la ficha y se van. */
  let zubats = null; // los tres Zubat se cargan una vez y se reutilizan
  async function zubatSwarm(center, ms) {
    swarmCenter = center.clone();
    zubats = zubats || Promise.all([0, 1, 2].map(() => loadVisitor('zubat')));
    const models = await zubats;
    models.forEach((v, k) => {
      v.root.scale.setScalar(1);
      scene.add(v.root);
      swarm.push({ v, phase: (k / 3) * Math.PI * 2, t0: performance.now() });
    });
    window.GameSound?.play('wrong');
    await wait(ms);
    // Se van volando hacia arriba.
    const leaving = swarm.splice(0);
    await tween(600, (t) => {
      for (const z of leaving) {
        z.v.root.position.y += 0.08 + t * 0.12;
        z.v.root.scale.setScalar(1 - t * 0.8);
      }
    }, ease.in);
    for (const z of leaving) scene.remove(z.v.root);
    swarmCenter = null;
  }

  function update(dt, t) {
    if (current) {
      const { v } = current;
      v.mixer.update(dt);
      // «Habla»: rebote corto y cabeceo mientras aparece su texto.
      v.body.scale.y = talking ? 1 + Math.abs(Math.sin(t * 16)) * 0.06 : 1;
      v.body.rotation.z = talking ? Math.sin(t * 7) * 0.06 : 0;
      // Los que flotan (Mew, Venomoth) se mecen; Mew además gira despacio.
      if (VISITORS[current.kind].float) {
        v.body.position.y = Math.sin(t * 2.2) * 0.08;
        if (current.kind === 'mew') v.body.rotation.y = Math.PI + Math.sin(t * 1.3) * 0.5;
      }
    }
    for (const who of exiting) who.v.mixer.update(dt);
    for (const z of swarm) {
      z.v.mixer.update(dt);
      if (!swarmCenter) continue;
      // Órbita con picadas: radio y altura cambian todo el tiempo.
      const a = t * 3.2 + z.phase;
      const r = 0.55 + Math.sin(t * 4 + z.phase) * 0.18;
      const y = swarmCenter.y + 0.75 + Math.sin(t * 6 + z.phase * 2) * 0.28;
      z.v.root.position.set(swarmCenter.x + Math.cos(a) * r, y, swarmCenter.z + Math.sin(a) * r);
      z.v.root.lookAt(swarmCenter.x + Math.cos(a + 0.6) * r, y, swarmCenter.z + Math.sin(a + 0.6) * r);
    }
  }

  function reset() {
    if (current) remove(current);
    for (const who of [...exiting]) remove(who);
    for (const z of swarm.splice(0)) scene.remove(z.v.root);
    swarmCenter = null;
  }

  return { arrive, talk, cry, follow, leave, zubatSwarm, update, reset, active: () => (current ? current.kind : null) };
}
