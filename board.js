/*
 * Vista del tablero: construcción de casillas, bloque de dado, leyenda y ubicación
 * del panel de turno. No conoce las reglas ni el estado de la partida;
 * script.js le pide dibujar y le pasa los datos.
 *
 * Esta separación permite reemplazar el tablero por una versión 3D sin tocar
 * la lógica del juego.
 */
(function () {
  'use strict';

  const { $, el } = window.Dom;
  const { CATS, CAT_KEYS, BOARD_LAYOUT, SIDE, squareSubtitle, squareTitle } = window.GameConfig;
  const { categoryIcon, medalIcon, artIcon } = window.GameArt;

  /** Fila y columna (1..10) de la casilla i en la grilla del tablero. */
  function gridPos(i) {
    const last = SIDE + 1; // 10
    if (i === 0) return [last, last];
    if (i < SIDE) return [last, last - i];
    if (i === SIDE) return [last, 1];
    if (i < 2 * SIDE) return [last - (i - SIDE), 1];
    if (i === 2 * SIDE) return [1, 1];
    if (i < 3 * SIDE) return [1, 1 + (i - 2 * SIDE)];
    if (i === 3 * SIDE) return [1, last];
    return [1 + (i - 3 * SIDE), last];
  }

  function squareIcon(sq) {
    if (sq.type === 'question') return categoryIcon(sq.cat, 'sq-icon');
    if (sq.type === 'medal') return medalIcon(sq.cat, 'sq-icon sq-medal-icon');
    return artIcon(sq.art, 'sq-icon sq-art');
  }

  /** Crea las 36 casillas dentro de #board y devuelve sus nodos. */
  function buildBoard() {
    const board = $('board');
    board.querySelectorAll('.sq').forEach((n) => n.remove());
    const squareEls = [];

    BOARD_LAYOUT.forEach((sq, i) => {
      const [row, col] = gridPos(i);
      const corner = i % SIDE === 0;
      const classes = ['sq', `sq-${sq.type}`];
      if (corner) classes.push('sq-corner');
      if (sq.type === 'move') classes.push(sq.steps > 0 ? 'sq-adv' : 'sq-back');
      // Orientación del borde para dibujar la franja de color hacia el centro.
      const side = corner ? 'corner' : row === SIDE + 1 ? 'bottom' : col === 1 ? 'left' : row === 1 ? 'top' : 'right';
      classes.push(`side-${side}`);

      const node = el(
        'div',
        {
          class: classes.join(' '),
          style: { 'grid-row': String(row), 'grid-column': String(col), ...(sq.cat ? { '--cat': CATS[sq.cat].color } : {}) },
          attrs: { title: `${squareTitle(sq)} · ${squareSubtitle(sq)}`, 'aria-label': `Casilla ${i}: ${squareTitle(sq)}` },
        },
        [
          sq.type === 'question' || sq.type === 'medal' ? el('span', { class: 'sq-band' }) : null,
          el('span', { class: 'sq-num', text: String(i) }),
          squareIcon(sq),
          el('span', { class: 'sq-label', text: corner || sq.type === 'move' ? sq.name : squareSubtitle(sq) }),
          corner || sq.type === 'move' ? el('span', { class: 'sq-sub', text: squareSubtitle(sq) }) : null,
          sq.type === 'medal' ? el('span', { class: 'sq-sub', text: '¡Directa!' }) : null,
          el('div', { class: 'sq-tokens' }),
        ],
      );
      board.appendChild(node);
      squareEls.push(node);
    });
    return squareEls;
  }

  // ── Bloque de dado: los números giran hasta que lo golpean ──
  const { DICE_MAX } = window.GameConfig;
  const CYCLE_MS = 70;
  let cycleTimer = null;

  function showDiceNumber(n) {
    $('diceNum').textContent = String(n);
  }

  /** Enciende o apaga el giro de números (mientras se espera el golpe). */
  function setDiceCycling(on) {
    $('dice').classList.toggle('cycling', on);
    if (on && !cycleTimer) {
      let n = 1;
      cycleTimer = setInterval(() => {
        n = (n % DICE_MAX) + 1;
        showDiceNumber(n);
      }, CYCLE_MS);
    } else if (!on && cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
    }
  }

  /** El bloque recibe el golpe: se detiene en el número sorteado. */
  function hitDice(n) {
    setDiceCycling(false);
    showDiceNumber(n);
    const block = $('dice');
    block.classList.remove('hit');
    void block.offsetWidth;
    block.classList.add('hit');
  }

  // ── Leyenda ──
  function legendItems() {
    const items = CAT_KEYS.map((c) => ({
      icon: categoryIcon(c),
      color: CATS[c].color,
      title: CATS[c].name,
      text: `Pregunta de ${CATS[c].name.toLowerCase()}. Suma un acierto.`,
    }));
    items.push(
      { icon: medalIcon('tipos'), color: '#f8c630', title: 'Medalla directa', text: 'Borde dorado. Acierta una pregunta y ganas esa medalla de gimnasio. No cambia tus aciertos.' },
      { icon: artIcon('pokeball'), color: '#12b886', title: 'Pueblo Paleta', text: 'La salida. Caer aquí no tiene efecto.' },
      { icon: artIcon('dodrio'), color: '#12b886', title: 'Dodrio veloz', text: 'Te lleva 2 o 3 casillas adelante y aplicas la nueva casilla.' },
      { icon: artIcon('diglett'), color: '#fa5252', title: 'Diglett', text: 'Te hace tropezar: retrocedes 2 o 3 casillas y aplicas la nueva.' },
      { icon: artIcon('zubat'), color: '#5c3d2e', title: 'Monte Moon', text: 'Te pierdes entre Zubat: pierdes tu próximo turno.' },
      { icon: artIcon('chansey'), color: '#f06595', title: 'Centro Pokémon', text: 'Eliges la categoría de tu pregunta.' },
      { icon: artIcon('meowth'), color: '#c92a2a', title: 'Team Rocket', text: 'Le robas una medalla a un rival; él puede defenderla con una pregunta.' },
      { icon: artIcon('tentacool'), color: '#1098ad', title: 'Islas Espuma', text: 'La corriente te arrastra: retrocedes 4 casillas.' },
    );
    return items;
  }

  function buildLegend(listId) {
    $(listId).replaceChildren(
      ...legendItems().map((it) =>
        el('li', { style: { '--cat': it.color } }, [
          el('span', { class: 'legend-icon' }, [it.icon]),
          el('span', {}, [el('strong', { text: it.title }), ' ', el('span', { text: it.text })]),
        ]),
      ),
    );
  }

  // ── Panel del turno: dentro del tablero o debajo en pantallas angostas ──
  const narrowMQ = window.matchMedia('(max-width: 960px)');

  function placeTurnPanel() {
    const panel = $('turnPanel');
    const center = $('boardCenter');
    // La vista de grabación siempre usa el centro del tablero.
    const inside = !narrowMQ.matches || document.body.classList.contains('rec-mode');
    if (inside && document.body.classList.contains('has-3d')) {
      // Con el tablero 3D, el panel flota sobre el escenario.
      $('stageHud').appendChild(panel);
      center.classList.remove('has-panel');
    } else if (inside) {
      center.appendChild(panel);
      center.classList.add('has-panel');
    } else {
      $('panelSlot').appendChild(panel);
      center.classList.remove('has-panel');
    }
  }

  function init() {
    const squareEls = buildBoard();
    buildLegend('legend');
    buildLegend('rulesLegend');
    placeTurnPanel();
    narrowMQ.addEventListener('change', placeTurnPanel);
    return squareEls;
  }

  window.GameBoard = { init, setDiceCycling, hitDice, placeTurnPanel, gridPos };
})();
