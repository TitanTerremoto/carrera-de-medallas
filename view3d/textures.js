/*
 * Texturas dibujadas en canvas: caras de las casillas (con el mismo arte SVG
 * del tablero 2D), centro del tablero, bloque de dado, números y medallas.
 */
import * as THREE from 'three';

const { CATS, squareSubtitle } = window.GameConfig;
const { categoryIcon, pokeballSVG } = window.GameArt;
const Poke = window.PokeData;

const PX_PER_UNIT = 256;

/** Convierte un nodo SVG en una imagen lista para dibujar en canvas. */
export function svgToImage(svg, color, size = 256) {
  const node = svg.cloneNode(true);
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  if (color) node.setAttribute('style', `color:${color}`);
  const xml = new XMLSerializer().serializeToString(node);
  return whenLoaded(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
}

/** Carga una imagen de assets/ (PNG). */
export function loadImage(src) {
  return whenLoaded(src);
}

/**
 * Espera a que la imagen cargue (eventos load/error; img.decode() puede
 * quedar esperando mientras la pestaña está oculta). Si falla, devuelve null.
 */
function whenLoaded(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.warn('No se pudo cargar la imagen', String(src).slice(0, 80), err);
      resolve(null);
    };
    img.src = src;
  });
}

function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Parte un texto en hasta dos líneas que entren en el ancho dado. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  return lines.slice(0, 2);
}

const TILE_BG = {
  question: '#f3f8ec',
  medal: '#fff3bf',
  start: '#b2f2bb',
  skip: '#d8c3a5',
  wild: '#eebefa',
  rocket: '#ffc9c9',
  adv: '#c3fae8',
  back: '#ffe3e3',
  whirl: '#99e9f2',
};

function tileKind(sq, corner) {
  if (sq.type === 'move') return corner ? 'whirl' : sq.steps > 0 ? 'adv' : 'back';
  return sq.type;
}

function tileIcon(sq) {
  if (sq.type === 'question') return svgToImage(categoryIcon(sq.cat), CATS[sq.cat].color);
  if (sq.type === 'medal') return loadImage(Poke.badgePath(CATS[sq.cat].badge));
  if (sq.art === 'pokeball' || !sq.art) return svgToImage(pokeballSVG());
  return loadImage(Poke.artPath(sq.art));
}

/**
 * Textura de la cara superior de una casilla.
 * `inward` indica hacia dónde mira el centro del tablero: 'up'|'down'|'left'|'right'|null.
 */
export async function tileTexture(sq, wUnits, hUnits, inward, corner) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wUnits * PX_PER_UNIT);
  canvas.height = Math.round(hUnits * PX_PER_UNIT);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const kind = tileKind(sq, corner);

  ctx.fillStyle = TILE_BG[kind];
  ctx.fillRect(0, 0, W, H);

  // Franja de categoría mirando al centro, como en el tablero 2D.
  if (sq.cat) {
    ctx.fillStyle = CATS[sq.cat].color;
    const b = 0.18;
    if (inward === 'up') ctx.fillRect(0, 0, W, H * b);
    if (inward === 'down') ctx.fillRect(0, H * (1 - b), W, H * b);
    if (inward === 'left') ctx.fillRect(0, 0, W * b, H);
    if (inward === 'right') ctx.fillRect(W * (1 - b), 0, W * b, H);
  }
  if (sq.type === 'medal') {
    ctx.strokeStyle = '#f8c630';
    ctx.lineWidth = Math.min(W, H) * 0.07;
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, 18);
    ctx.stroke();
  }

  const img = await tileIcon(sq);
  // El artwork de los Pokémon se ve más grande que los íconos planos.
  const scale = sq.art && sq.art !== 'pokeball' ? (corner ? 0.6 : 0.62) : corner ? 0.42 : 0.46;
  const s = Math.min(W, H) * scale;
  if (img) ctx.drawImage(img, (W - s) / 2, H * 0.42 - s / 2, s, s);

  const label = corner || sq.type === 'move' ? sq.name : squareSubtitle(sq);
  const fs = Math.min(W, H) * (corner ? 0.1 : 0.13);
  ctx.fillStyle = '#1f2933';
  ctx.font = `800 ${fs}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, label, W * 0.86);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.76 + i * fs * 1.05));
  if (corner || sq.type === 'move' || sq.type === 'medal') {
    ctx.font = `700 ${fs * 0.75}px "Trebuchet MS", "Segoe UI", sans-serif`;
    ctx.fillStyle = '#495057';
    const sub = sq.type === 'medal' ? '¡Directa!' : squareSubtitle(sq);
    ctx.fillText(sub, W / 2, H * 0.76 + lines.length * fs * 1.05);
  }
  return makeTexture(canvas);
}

/** Centro del tablero: Poké Ball gigante de fondo y el título del juego. */
export function centerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  for (let i = -1024; i < 2048; i += 64) {
    ctx.fillStyle = (i / 64) % 2 ? '#d8f3dc' : '#b7e4c7';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 0);
    ctx.lineTo(i + 64 - 1024, 1024);
    ctx.lineTo(i - 1024, 1024);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(512, 440, 50, 512, 512, 620);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  // Marca de agua de Poké Ball
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.translate(512, 512);
  ctx.lineWidth = 34;
  ctx.strokeStyle = '#1f2933';
  ctx.beginPath();
  ctx.arc(0, 0, 400, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e3350d';
  ctx.beginPath();
  ctx.arc(0, 0, 400, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#1f2933';
  ctx.fillRect(-400, -18, 800, 36);
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Título estilo logo: amarillo con borde azul
  ctx.save();
  ctx.translate(512, 500);
  ctx.rotate(-0.1);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.font = '900 190px "Trebuchet MS", "Arial Black", sans-serif';
  ctx.lineWidth = 34;
  ctx.strokeStyle = '#1d3a8a';
  ctx.strokeText('Pokémon', 0, -10);
  ctx.fillStyle = '#ffcb05';
  ctx.fillText('Pokémon', 0, -10);
  ctx.font = '900 76px "Trebuchet MS", sans-serif';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('Carrera de Medallas', 0, 96);
  ctx.fillStyle = '#e3350d';
  ctx.fillText('Carrera de Medallas', 0, 96);
  ctx.restore();
  return makeTexture(canvas);
}

/** Cara del bloque de dado dorado, con "?" o con un número. */
export function blockTexture(label = '?') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#ffe066');
  g.addColorStop(1, '#f59f00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#a05a00';
  ctx.lineWidth = 14;
  roundRect(ctx, 10, 10, 236, 236, 30);
  ctx.stroke();
  ctx.fillStyle = '#a05a00';
  for (const [x, y] of [[36, 36], [220, 36], [36, 220], [220, 220]]) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  const text = String(label);
  ctx.font = `900 ${text.length > 1 ? 140 : 170}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#7a3e00';
  ctx.strokeText(text, 128, 140);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 140);
  return makeTexture(canvas);
}

/** Número grande dentro de un círculo del color del jugador (para sprites). */
export function numberTexture(n, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.font = '900 160px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeText(String(n), 128, 140);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(n), 128, 140);
  return makeTexture(canvas);
}

/** Textura de la medalla de gimnasio, para la moneda 3D (fondo dorado). */
export async function medalTexture(cat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 110, 20, 128, 128, 128);
  g.addColorStop(0, '#fff3bf');
  g.addColorStop(1, '#f8c630');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const img = await loadImage(Poke.badgePath(CATS[cat].badge));
  if (img) ctx.drawImage(img, 36, 36, 184, 184);
  return makeTexture(canvas);
}
