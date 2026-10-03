/*
 * Configuración fija del juego: categorías, colores de jugador y tablero.
 * Cambiar el recorrido del tablero solo requiere editar BOARD_LAYOUT.
 */
(function () {
  'use strict';

  /**
   * Categorías de pregunta. La clave coincide con QUESTION_BANK.
   * Las cuatro primeras dan medalla; `liga` no da medalla: es el banco del
   * desafío final de la Liga Pokémon (final: true).
   */
  const CATS = {
    tipos: {
      name: 'Tipos',
      color: '#e03131',
      badge: 'arcoiris',
      badgeName: 'Medalla Arcoíris',
      desc: 'Efectividades, debilidades, resistencias, inmunidades y combinaciones de tipos.',
    },
    pokedex: {
      name: 'Pokédex',
      color: '#1c7ed6',
      badge: 'roca',
      badgeName: 'Medalla Roca',
      desc: 'Números, alturas, pesos, comparaciones y orden de la Pokédex.',
    },
    habilidades: {
      name: 'Habilidades',
      color: '#2f9e44',
      badge: 'trueno',
      badgeName: 'Medalla Trueno',
      desc: 'Habilidades y movimientos: efectos, potencia, precisión y prioridad.',
    },
    cambalache: {
      name: 'Cambalache',
      color: '#f59f00',
      badge: 'alma',
      badgeName: 'Medalla Alma',
      desc: 'Sorpresas: regiones, objetos, evoluciones, entrenadores y curiosidades.',
    },
    liga: {
      name: 'Liga Pokémon',
      color: '#ae3ec9',
      final: true,
      desc: 'Desafío final: Alto Mando, campeones, líderes de gimnasio, legendarios y míticos.',
    },
  };
  /** Categorías que dan medalla (las que aparecen en el tablero). */
  const CAT_KEYS = Object.keys(CATS).filter((k) => !CATS[k].final);
  /** Todos los bancos de preguntas, incluido el del desafío final. */
  const QUESTION_KEYS = Object.keys(CATS);
  const LEAGUE_KEY = 'liga';

  /** Colores fijos por asiento (bien distintos de los de las categorías). */
  const PLAYER_COLORS = ['#d6336c', '#0c8599', '#7048e8', '#495057'];

  // Aciertos que se acumulan (los errores no los borran) para que la próxima
  // pregunta normal sea «por la medalla».
  const HITS_FOR_MEDAL = 2;
  const ANSWER_SECONDS = 30; // tiempo para responder cada pregunta (da para leerla en voz alta)
  // Con las 4 medallas, Lance hace al instante la pregunta del desafío de la Liga Pokémon.
  const MEDALS_TO_WIN = 4;
  const DICE_MAX = 6; // el bloque de dado sale entre 1 y 6 (con 10 la partida dura ~8 min menos)
  const SAVE_KEY = 'carreraMedallas.save.v1';

  // Atajos para describir casillas
  const Q = (cat) => ({ type: 'question', cat });
  const MEDAL = (cat) => ({ type: 'medal', cat });
  // `art`: Pokémon (archivo en assets/pokemon/) o 'pokeball' que ilustra la casilla.
  const ADV = (n) => ({ type: 'move', steps: n, name: 'Dodrio veloz', art: 'dodrio' });
  const BACK = (n) => ({ type: 'move', steps: -n, name: 'Diglett', art: 'diglett' });
  // Team Rocket: quien cae le roba una medalla a un rival (que puede defenderla).
  const ROCKET = () => ({ type: 'rocket', name: 'Team Rocket', art: 'meowth' });

  /*
   * Recorrido de 36 casillas en sentido horario, empezando por Pueblo Paleta
   * (esquina inferior derecha). Las posiciones 0, 9, 18 y 27 son esquinas.
   * 5–6 casillas de pregunta y 1 de medalla directa por categoría, 4 de
   * avance/retroceso y 2 del Team Rocket (en lados opuestos).
   */
  const BOARD_LAYOUT = [
    { type: 'start', name: 'Pueblo Paleta', art: 'pokeball' },
    Q('tipos'), Q('pokedex'), ADV(2), Q('habilidades'), Q('cambalache'), MEDAL('tipos'), Q('pokedex'), Q('habilidades'),
    { type: 'skip', name: 'Monte Moon', art: 'zubat' },
    Q('cambalache'), Q('tipos'), BACK(2), Q('pokedex'), MEDAL('habilidades'), ROCKET(), Q('tipos'), Q('habilidades'),
    { type: 'wild', name: 'Centro Pokémon', art: 'chansey' },
    Q('tipos'), Q('pokedex'), ADV(3), Q('habilidades'), Q('cambalache'), MEDAL('pokedex'), Q('pokedex'), Q('habilidades'),
    { type: 'move', steps: -4, name: 'Islas Espuma', art: 'tentacool' },
    Q('cambalache'), Q('tipos'), BACK(3), Q('pokedex'), MEDAL('cambalache'), Q('cambalache'), Q('tipos'), ROCKET(),
  ];
  const BOARD_SIZE = BOARD_LAYOUT.length; // 36
  const SIDE = BOARD_SIZE / 4; // casillas por lado sin contar la esquina siguiente

  /** Texto corto que describe el efecto de una casilla. */
  function squareSubtitle(sq) {
    switch (sq.type) {
      case 'start': return 'Mew regala medalla';
      case 'skip': return 'Pierdes 1 turno';
      case 'wild': return 'Eliges la categoría';
      case 'rocket': return 'Robas una medalla';
      case 'move': return sq.steps > 0 ? `Avanza ${sq.steps}` : `Retrocede ${-sq.steps}`;
      case 'medal': return `Medalla ${CATS[sq.cat].name}`;
      case 'question': return CATS[sq.cat].name;
      default: return '';
    }
  }

  function squareTitle(sq) {
    if (sq.type === 'question') return `Pregunta de ${CATS[sq.cat].name}`;
    if (sq.type === 'medal') return `Medalla directa: ${CATS[sq.cat].name}`;
    return sq.name;
  }

  window.GameConfig = {
    CATS, CAT_KEYS, QUESTION_KEYS, LEAGUE_KEY, PLAYER_COLORS, HITS_FOR_MEDAL, ANSWER_SECONDS, MEDALS_TO_WIN, DICE_MAX, SAVE_KEY,
    BOARD_LAYOUT, BOARD_SIZE, SIDE, squareSubtitle, squareTitle,
  };
})();
