/*
 * Arte del juego: artwork de las fichas y medallas de gimnasio (imágenes de
 * assets/, ver pokedata.js), Poké Ball y símbolos de categoría en SVG.
 * No usa imágenes externas, así que funciona sin conexión.
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  /** Crea un nodo SVG con atributos. */
  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    return node;
  }

  function svgRoot(className) {
    const svg = svgEl('svg', { viewBox: '0 0 64 64', class: className, 'aria-hidden': 'true' });
    return svg;
  }

  const Poke = window.PokeData;

  // ── Fichas: Pikachu y los tres iniciales de Kanto ──
  const CREATURES = [
    { id: 'pikachu', name: 'Pikachu', element: 'Eléctrico' },
    { id: 'charmander', name: 'Charmander', element: 'Fuego' },
    { id: 'squirtle', name: 'Squirtle', element: 'Agua' },
    { id: 'bulbasaur', name: 'Bulbasaur', element: 'Planta' },
    { id: 'emolga', name: 'Emolga', element: 'Eléctrico/Volador' },
    { id: 'noibat', name: 'Noibat', element: 'Volador/Dragón' },
    { id: 'jolteon', name: 'Jolteon', element: 'Eléctrico' },
    { id: 'treecko', name: 'Treecko', element: 'Planta' },
  ];

  /** Imagen de un archivo de assets (no se puede arrastrar ni seleccionar). */
  function img(src, className, alt) {
    const node = document.createElement('img');
    node.src = src;
    node.alt = alt || '';
    node.draggable = false;
    node.decoding = 'async';
    if (className) node.className = className;
    return node;
  }

  /** Artwork de una ficha por id (ids desconocidos → la primera). */
  function creatureIcon(id, className) {
    const c = CREATURES.find((x) => x.id === id) || CREATURES[0];
    return img(Poke.artPath(c.id), `creature ${className || ''}`.trim(), c.name);
  }

  /** Artwork de cualquier Pokémon descargado (por archivo, ej. 'zubat'). */
  function pokemonIcon(slug, className) {
    return img(Poke.artPath(slug), `poke-art ${className || ''}`.trim());
  }

  /** Poké Ball en SVG (logo, casilla de salida). */
  function pokeballSVG(className) {
    const svg = svgRoot(className || 'pokeball');
    svg.appendChild(svgEl('circle', { cx: 32, cy: 32, r: 29, fill: '#fff', stroke: '#1f2933', 'stroke-width': 4 }));
    svg.appendChild(svgEl('path', { d: 'M3 32 A29 29 0 0 1 61 32 Z', fill: '#e3350d', stroke: '#1f2933', 'stroke-width': 4 }));
    svg.appendChild(svgEl('rect', { x: 3, y: 29, width: 58, height: 6, fill: '#1f2933' }));
    svg.appendChild(svgEl('circle', { cx: 32, cy: 32, r: 10, fill: '#fff', stroke: '#1f2933', 'stroke-width': 4 }));
    svg.appendChild(svgEl('circle', { cx: 32, cy: 32, r: 4.5, fill: '#fff', stroke: '#adb5bd', 'stroke-width': 1.5 }));
    svg.appendChild(svgEl('path', { d: 'M14 20 A20 20 0 0 1 26 10', fill: 'none', stroke: '#fff', 'stroke-width': 3, opacity: 0.55, 'stroke-linecap': 'round' }));
    return svg;
  }

  /** Arte de una casilla especial: 'pokeball' o el archivo de un Pokémon. */
  function artIcon(key, className) {
    return key === 'pokeball' || !key ? pokeballSVG(className) : pokemonIcon(key, className);
  }

  /** Medalla de gimnasio de una categoría (definida en config.js). */
  function medalIcon(cat, className) {
    const { CATS } = window.GameConfig;
    return img(Poke.badgePath(CATS[cat].badge), `medal ${className || ''}`.trim(), CATS[cat].badgeName);
  }

  /** Íconos de tipo para un texto como "Fuego/Volador" (vacío si no es un tipo). */
  function typeIcons(text) {
    return Poke.typeParts(text).map((t) => img(Poke.typePath(t), 'type-icon', t));
  }

  // ── Símbolos de categoría (se usan en casilleros y medallas) ──
  function addCategorySymbol(svg, cat, color) {
    const ink = color || '#fff';
    switch (cat) {
      case 'tipos': // Tres elementos que se cruzan
        for (const [cx, cy] of [[32, 23], [23.5, 38], [40.5, 38]]) {
          svg.appendChild(svgEl('circle', { cx, cy, r: 10, fill: 'none', stroke: ink, 'stroke-width': 3.5 }));
        }
        break;
      case 'pokedex': // Libro-enciclopedia con lente
        svg.appendChild(svgEl('rect', { x: 17, y: 11, width: 30, height: 42, rx: 5, fill: 'none', stroke: ink, 'stroke-width': 3.5 }));
        svg.appendChild(svgEl('circle', { cx: 32, cy: 26, r: 7, fill: ink }));
        svg.appendChild(svgEl('path', { d: 'M23 41 H41 M23 47 H35', stroke: ink, 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
        break;
      case 'habilidades': // Estrella de energía
        svg.appendChild(svgEl('polygon', {
          points: '32,7 37,25 55,20 41,33 53,48 35,41 32,58 28,41 11,48 23,33 9,20 27,25',
          fill: ink,
        }));
        break;
      case 'cambalache': // Flechas de intercambio
        svg.appendChild(svgEl('path', {
          d: 'M14 25 H46 M38 16 L47 25 L38 34', fill: 'none', stroke: ink, 'stroke-width': 4.5,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }));
        svg.appendChild(svgEl('path', {
          d: 'M50 41 H18 M26 32 L17 41 L26 50', fill: 'none', stroke: ink, 'stroke-width': 4.5,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }));
        break;
      case 'liga': // Copa de la Liga
        svg.appendChild(svgEl('path', {
          d: 'M20 10 H44 V24 A12 12 0 0 1 20 24 Z M20 14 H12 A8 8 0 0 0 20 28 M44 14 H52 A8 8 0 0 1 44 28',
          fill: 'none', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round',
        }));
        svg.appendChild(svgEl('path', { d: 'M32 36 V46 M22 54 H42 M26 46 H38 V54', fill: 'none', stroke: ink, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        break;
      default:
        break;
    }
  }

  function categoryIcon(cat, className) {
    const svg = svgRoot(className || 'cat-icon');
    addCategorySymbol(svg, cat, 'currentColor');
    return svg;
  }

  window.GameArt = { CREATURES, creatureIcon, pokemonIcon, pokeballSVG, artIcon, medalIcon, typeIcons, categoryIcon, svgRoot, svgEl };
})();
