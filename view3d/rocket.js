/*
 * Team Rocket en 3D: un globo con la «R» y Meowth en la canasta.
 *
 *   arrive()          baja del cielo y queda flotando sobre el tablero
 *   steal(from, to)   la medalla vuela de la víctima al ladrón
 *   leave(blastOff)   se va; con blastOff sale disparado girando y
 *                     desaparece con un destello («¡…sale volando otra vez!»)
 *
 * Todo pasa por tween(): con la ventana oculta o en turbo se salta al final.
 */
import * as THREE from 'three';
import { tween, ease, wait } from './tween.js';
import { loadImage, medalTexture } from './textures.js';

const HOVER = new THREE.Vector3(0, 3.4, -1.2); // sobre el tablero, algo hacia el fondo
const SKY = new THREE.Vector3(-9, 14, -12); // de dónde llega

/** Lona del globo: rojo, con la «R» blanca del Team Rocket. */
function envelopeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d6336c';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#c2255c';
  for (let x = 0; x < 512; x += 64) ctx.fillRect(x, 0, 32, 256);
  // Dos «R» para que se vea desde cualquier lado.
  ctx.font = 'bold 120px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const x of [128, 384]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, 128, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c92a2a';
    ctx.fillText('R', x, 134);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildBalloon() {
  const g = new THREE.Group();
  const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), new THREE.MeshStandardMaterial({ map: envelopeTexture(), roughness: 0.6 }));
  envelope.scale.set(1, 1.15, 1);
  envelope.position.y = 1.35;
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.32, 16), new THREE.MeshStandardMaterial({ color: '#8d5a2b', roughness: 0.9 }));
  const ropeMat = new THREE.MeshBasicMaterial({ color: '#5c3d1e' });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4), ropeMat);
    rope.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3);
    rope.rotation.z = Math.cos(a) * 0.25;
    rope.rotation.x = -Math.sin(a) * 0.25;
    g.add(rope);
  }
  g.add(envelope, basket);
  envelope.castShadow = true;
  basket.castShadow = true;

  // Meowth asomado en la canasta (imagen que siempre mira a la cámara).
  const meowth = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
  meowth.scale.set(0.62, 0.62, 1);
  meowth.position.y = 0.38;
  g.add(meowth);
  loadImage(window.PokeData.artPath('meowth')).then((img) => {
    if (!img) return;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    meowth.material.map = tex;
    meowth.material.needsUpdate = true;
  });
  return g;
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
  const balloon = buildBalloon();
  balloon.visible = false;
  scene.add(balloon);
  const twinkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: twinkleTexture(), transparent: true, depthTest: false }));
  twinkle.visible = false;
  scene.add(twinkle);

  let hovering = false;
  // Las escenas se encadenan: llegar, robar e irse nunca se pisan.
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn).catch((err) => console.warn('Animación del Team Rocket:', err)));

  function arrive() {
    return queue(async () => {
      if (hovering) return;
      balloon.visible = true;
      balloon.rotation.set(0, 0, 0);
      balloon.scale.setScalar(1);
      await tween(1600, (t) => {
        balloon.position.lerpVectors(SKY, HOVER, t);
        balloon.rotation.y = (1 - t) * 2.5;
      }, ease.out);
      hovering = true;
    });
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
        coin.position.y += Math.sin(t * Math.PI) * 2.4; // pasa cerca del globo
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
      const from = balloon.position.clone();
      if (blastOff) {
        // «¡El Team Rocket sale volando otra vez!»
        const to = from.clone().add(new THREE.Vector3(7, 13, -10));
        await tween(1300, (t) => {
          balloon.position.lerpVectors(from, to, t);
          balloon.rotation.z = t * Math.PI * 6;
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
        const to = SKY.clone().multiplyScalar(-1).setY(SKY.y);
        await tween(1500, (t) => {
          balloon.position.lerpVectors(from, to, t);
        }, ease.in);
        balloon.visible = false;
      }
    });
  }

  /** Balanceo suave mientras flota (se llama en cada cuadro). */
  function update(t) {
    if (!hovering) return;
    balloon.position.y = HOVER.y + Math.sin(t * 1.6) * 0.12;
    balloon.rotation.y = Math.sin(t * 0.5) * 0.3;
  }

  /** Al cambiar de partida o recargar, el globo no queda colgado. */
  function reset() {
    hovering = false;
    balloon.visible = false;
    twinkle.visible = false;
  }

  return { arrive, steal, leave, update, reset };
}
