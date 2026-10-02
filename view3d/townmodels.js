/*
 * Edificios de PokeSwap (modelos de HeartGold/SoulSilver convertidos por
 * scripts/build_town_models.py del proyecto PokeSwap) dibujados con Three.js.
 *
 * Formato (assets/town/<id>.json):
 *   vertices:  [x, y, z]   x a la derecha, y arriba, z hacia el frente; 1 = 1 px del juego
 *   materials: { texture, alpha, shadow }   shadow = sombra plana translúcida "horneada"
 *   triangles: [material, i0, i1, i2, u0, v0, u1, v1, u2, v2]   UV en píxeles de la textura
 *
 * Son modelos de ~50–600 triángulos con texturas de 16–128 px: muy livianos.
 * Se arma una sola geometría por modelo (un grupo por material) y se cachea,
 * así cada copia extra solo cuesta un Mesh.
 */
import * as THREE from 'three';

const cache = new Map();
const texLoader = new THREE.TextureLoader();

function loadTexture(file) {
  return new Promise((resolve) => {
    texLoader.load(
      `assets/town/${file}`,
      (tex) => {
        // Píxeles nítidos, estilo DS. Las UV ya vienen dentro de la textura.
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.flipY = false; // las filas de la textura se cuentan desde arriba
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      (err) => {
        console.warn('No se pudo cargar la textura del edificio', file, err);
        resolve(null);
      },
    );
  });
}

/** Arma geometría + materiales de un modelo (una vez por id). */
async function build(id) {
  const res = await fetch(`assets/town/${id}.json`);
  if (!res.ok) throw new Error(`modelo ${id}: HTTP ${res.status}`);
  const data = await res.json();
  const textures = await Promise.all(data.materials.map((m) => loadTexture(m.texture)));

  // Triángulos agrupados por material: un grupo de dibujo por material.
  const byMat = data.materials.map(() => []);
  data.triangles.forEach((t) => byMat[t[0]].push(t));
  const pos = [];
  const uv = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  byMat.forEach((tris, mi) => {
    const tex = textures[mi];
    const w = tex ? tex.image.width : 1;
    const h = tex ? tex.image.height : 1;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = data.vertices[t[1 + k]];
        pos.push(v[0], v[1], v[2]);
        uv.push(t[4 + k * 2] / w, t[5 + k * 2] / h);
      }
    }
    geo.addGroup(start, tris.length * 3, mi);
    start += tris.length * 3;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const materials = data.materials.map((m, i) =>
    m.shadow
      ? // Sombra pintada bajo el edificio: translúcida y sin escribir profundidad.
        new THREE.MeshBasicMaterial({ map: textures[i], transparent: true, opacity: m.alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
      : new THREE.MeshLambertMaterial({ map: textures[i], alphaTest: 0.5, side: THREE.FrontSide }),
  );
  return { geo, materials, data };
}

/**
 * Devuelve un edificio listo para poner en escena.
 * `scale`: unidades del mundo por píxel del modelo. El origen queda en el
 * centro del frente del edificio, apoyado en el suelo.
 */
export async function townModel(id, scale) {
  if (!cache.has(id)) cache.set(id, build(id));
  const { geo, materials, data } = await cache.get(id);
  const mesh = new THREE.Mesh(geo, materials);
  mesh.scale.setScalar(scale);
  mesh.position.set(-data.center * scale, -data.bounds.y[0] * scale, -data.front * scale);
  const holder = new THREE.Group();
  holder.add(mesh);
  return holder;
}
