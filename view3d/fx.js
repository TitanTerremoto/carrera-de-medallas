/*
 * Efectos estilo juego de fiesta: bloque de dado, contador de pasos,
 * partículas al caer, anillo de polvo, destellos, moneda de medalla y confeti.
 */
import * as THREE from 'three';
import { tween, ease, wait } from './tween.js';
import { blockTexture, numberTexture, medalTexture } from './textures.js';

export function createFx(scene) {
  const particles = []; // { mesh, vel, life, max, spin }
  const numberCache = new Map();

  function numberMaterial(n, color) {
    const key = `${n}|${color}`;
    if (!numberCache.has(key)) numberCache.set(key, new THREE.SpriteMaterial({ map: numberTexture(n, color), depthTest: false, transparent: true }));
    return numberCache.get(key);
  }

  // ── Bloque de dado flotante: los números del 1 al DICE_MAX giran en sus caras ──
  const { DICE_MAX } = window.GameConfig;
  const CYCLE_MS = 65;
  const faceTextures = Array.from({ length: DICE_MAX + 1 }, (_, n) => blockTexture(n === 0 ? '?' : n));
  const blockMat = new THREE.MeshStandardMaterial({ map: faceTextures[0], roughness: 0.35, metalness: 0.1, emissive: '#ffb703', emissiveIntensity: 0.15 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), blockMat);
  block.castShadow = true;
  block.visible = false;
  scene.add(block);
  let blockAnchor = null; // Object3D sobre el que flota
  let cycling = false;
  let cycleAt = 0;
  let face = 1;
  let spinSpeed = 1.8;

  function setFace(n) {
    blockMat.map = faceTextures[n];
    blockMat.needsUpdate = true;
  }

  // ── Número sobre la cabeza (resultado y pasos restantes) ──
  const counter = new THREE.Sprite(numberMaterial(1, '#495057'));
  counter.renderOrder = 10;
  counter.visible = false;
  scene.add(counter);
  let counterAnchor = null;
  let counterScale = 0;

  function showBlock(anchor) {
    blockAnchor = anchor;
    block.visible = true;
    cycling = true;
    spinSpeed = 1.8;
    block.scale.setScalar(0.01);
    return tween(350, (t) => block.scale.setScalar(t), ease.outBack);
  }

  function hideBlock() {
    cycling = false;
    if (!block.visible) return Promise.resolve();
    return tween(200, (t) => block.scale.setScalar(1 - t), ease.in).then(() => {
      block.visible = false;
      blockAnchor = null;
    });
  }

  /**
   * El bloque recibe el golpe: los números se frenan en el sorteado, el
   * bloque salta, se rompe en pedazos y el número queda sobre la ficha.
   */
  async function hitBlock(n, color) {
    const anchor = blockAnchor;
    cycling = false;
    setFace(n);
    // Gira para mostrar la cara de frente a la cámara mientras rebota.
    spinSpeed = 0;
    const r0 = block.rotation.y;
    const target = Math.round(r0 / (Math.PI / 2)) * (Math.PI / 2);
    await tween(200, (t) => {
      block.scale.setScalar(1 + 0.45 * Math.sin(t * Math.PI));
      block.rotation.y = r0 + (target - r0) * t;
    }, ease.out);
    await wait(260);
    shatter(block.position.clone());
    block.visible = false;
    blockAnchor = null;
    setCounter(n, color, anchor);
  }

  /** El bloque se rompe en pedazos dorados que caen girando. */
  const shardGeo = new THREE.BoxGeometry(0.16, 0.16, 0.06);
  function shatter(origin) {
    burst(origin, ['#ffe066', '#ffffff'], 12, 2.8);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: i % 2 ? '#f59f00' : '#ffd43b', transparent: true, roughness: 0.4 }));
      m.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      const a = (i / 10) * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * (1.4 + Math.random()), 2 + Math.random() * 1.5, Math.sin(a) * (1.4 + Math.random()));
      scene.add(m);
      particles.push({ mesh: m, vel, life: 0, max: 1.1, spin: (Math.random() - 0.5) * 14, gravity: 9 });
    }
  }

  function setCounter(n, color, anchor) {
    counter.material = numberMaterial(n, color);
    counterAnchor = anchor || counterAnchor;
    counter.visible = true;
    counterScale = 0.01;
    tween(260, (t) => {
      counterScale = 0.55 * t;
    }, ease.outBack);
  }

  function hideCounter() {
    if (!counter.visible) return Promise.resolve();
    const s0 = counterScale;
    return tween(220, (t) => {
      counterScale = s0 * (1 - t);
    }, ease.in).then(() => {
      counter.visible = false;
    });
  }

  // ── Partículas ──
  const cubeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  function burst(origin, colors, count = 14, speed = 2.2) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], transparent: true, emissive: colors[i % colors.length], emissiveIntensity: 0.3 }));
      m.position.copy(origin);
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 0.8;
      const vel = new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random() * 0.6), up * speed, Math.sin(a) * speed * (0.4 + Math.random() * 0.6));
      scene.add(m);
      particles.push({ mesh: m, vel, life: 0, max: 0.9 + Math.random() * 0.4, spin: (Math.random() - 0.5) * 12, gravity: 7 });
    }
  }

  const ringGeo = new THREE.RingGeometry(0.28, 0.36, 32);
  function ring(origin, color) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(origin).add(new THREE.Vector3(0, 0.03, 0));
    scene.add(m);
    tween(600, (t) => {
      m.scale.setScalar(1 + t * 2.4);
      m.material.opacity = 1 - t;
    }, ease.out).then(() => {
      scene.remove(m);
      m.material.dispose();
    });
  }

  /** Destello de la casilla: brilla en su color y se apaga. */
  function flashTile(tile, color) {
    const mat = tile.topMat;
    mat.emissive.set(color);
    return tween(700, (t) => {
      mat.emissiveIntensity = 0.7 * (1 - t);
      tile.top.position.y = tile.center.y + 0.002 + Math.sin(t * Math.PI) * 0.05;
      tile.box.position.y = tile.center.y / 2 + Math.sin(t * Math.PI) * 0.05;
    }, ease.out);
  }

  // ── Moneda de medalla que sube girando ──
  async function medalCoin(origin, cat) {
    const tex = await medalTexture(cat);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.3, transparent: true });
    const edge = new THREE.MeshStandardMaterial({ color: '#f8c630', roughness: 0.3, metalness: 0.6 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.07, 40), [edge, face, face]);
    coin.rotation.x = Math.PI / 2;
    coin.position.copy(origin);
    scene.add(coin);
    burst(origin.clone().add(new THREE.Vector3(0, 0.8, 0)), ['#f8c630', '#ffffff', '#ffe066'], 22, 2.4);
    await tween(900, (t) => {
      coin.position.y = origin.y + 0.4 + t * 1.3;
      coin.rotation.z = t * Math.PI * 4;
      coin.scale.setScalar(0.3 + 0.9 * t);
    }, ease.out);
    await wait(800);
    await tween(400, (t) => {
      coin.position.y = origin.y + 1.7 - t * 1.2;
      coin.scale.setScalar(1.2 * (1 - t) + 0.01);
    }, ease.in);
    scene.remove(coin);
  }

  // ── Confeti para la victoria ──
  const confettiGeo = new THREE.PlaneGeometry(0.1, 0.16);
  function confetti(center, colors) {
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(center.x + (Math.random() - 0.5) * 6, center.y + 3 + Math.random() * 4, center.z + (Math.random() - 0.5) * 6);
      scene.add(m);
      particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
        life: 0,
        max: 4 + Math.random() * 2,
        spin: (Math.random() - 0.5) * 10,
        gravity: 0,
      });
    }
  }

  function update(dt, camera) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * 0.7 * dt;
      p.mesh.material.opacity = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        particles.splice(i, 1);
      }
    }
    const t = performance.now() / 1000;
    if (block.visible && blockAnchor) {
      block.position.copy(blockAnchor.position).add(new THREE.Vector3(0, 1.45 + Math.sin(t * 3) * 0.06, 0));
      block.rotation.y += dt * spinSpeed;
      // Los números corren tan rápido que el que salga es imposible de "cazar".
      if (cycling && performance.now() - cycleAt > CYCLE_MS) {
        cycleAt = performance.now();
        face = (face % DICE_MAX) + 1;
        setFace(face);
      }
    }
    if (counter.visible && counterAnchor) {
      counter.position.copy(counterAnchor.position).add(new THREE.Vector3(0, 1.3, 0));
      // Tamaño constante en pantalla aunque la cámara se aleje.
      const d = camera.position.distanceTo(counter.position);
      counter.scale.setScalar(counterScale * Math.max(1, d / 5));
    }
  }

  return { showBlock, hideBlock, hitBlock, setCounter, hideCounter, burst, ring, flashTile, medalCoin, confetti, update, block };
}
