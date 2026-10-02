/*
 * Vista de grabación: tablero al centro y cuatro espacios para cámaras,
 * dos a cada lado, pensados para superponer video en la edición posterior.
 * Los espacios pueden ser un marco neutro o verde croma.
 *
 * Solo dibuja; no cambia la partida.
 */
(function () {
  'use strict';

  const { $, el } = window.Dom;
  const { CATS, CAT_KEYS, HITS_FOR_MEDAL } = window.GameConfig;
  const { creatureIcon, medalIcon } = window.GameArt;
  const Game = window.CarreraDeMedallas;
  const Board = window.GameBoard;

  const PREF_KEY = 'carreraMedallas.rec';

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
    } catch (err) {
      console.warn('No se pudieron leer las preferencias de grabación:', err);
      return {};
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn('No se pudieron guardar las preferencias de grabación:', err);
    }
  }

  const prefs = readPrefs();
  // ?vista=grabacion abre directamente la vista de grabación al entrar en partida.
  let wantRec = new URLSearchParams(window.location.search).get('vista') === 'grabacion' || !!prefs.rec;

  /** Aplica la vista de grabación (solo tiene sentido con una partida en curso). */
  function applyRecClass(on) {
    if (document.body.classList.contains('rec-mode') === on) return;
    document.body.classList.toggle('rec-mode', on);
    $('recToolbar').hidden = !on;
    Board.placeTurnPanel();
  }

  function setRecMode(on) {
    wantRec = on;
    prefs.rec = on;
    writePrefs(prefs);
    render();
  }

  function setChroma(on) {
    document.body.classList.toggle('chroma', on);
    $('btnChroma').setAttribute('aria-pressed', String(on));
    prefs.chroma = on;
    writePrefs(prefs);
  }

  /** Un espacio de cámara con la placa del jugador debajo. */
  function camSlot(p, i, view) {
    const isTurn = view.phase !== 'over' && view.current === i;
    const isWinner = view.phase === 'over' && view.winner === i;
    return el('div', { class: `cam-slot ${isTurn ? 'turn' : ''} ${isWinner ? 'winner' : ''}`, style: { '--pc': p.color } }, [
      el('div', { class: 'cam-frame' }, [el('span', { class: 'cam-hint', text: `Cámara ${i + 1}` })]),
      el('div', { class: 'cam-plate' }, [
        el('div', { class: 'token' }, [creatureIcon(p.creature)]),
        el('div', { class: 'cam-info' }, [
          el('strong', { class: 'cam-name', text: p.name }),
          el(
            'span',
            { class: 'cam-streak', attrs: { title: `Aciertos ${p.streak} de ${HITS_FOR_MEDAL}` } },
            Array.from({ length: HITS_FOR_MEDAL }, (_, k) => el('span', { class: `pip-streak ${k < p.streak ? 'on' : ''}` })),
          ),
        ]),
        el(
          'div',
          { class: 'cam-medals' },
          CAT_KEYS.map((c) => el('span', { class: `mini-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: CATS[c].name } }, [medalIcon(c)])),
        ),
      ]),
    ]);
  }

  function render() {
    const view = Game.publicView();
    $('btnRec').hidden = !view;
    applyRecClass(!!view && wantRec);
    if (!view || !wantRec) return;
    $('camLeft').replaceChildren(camSlot(view.players[0], 0, view), camSlot(view.players[1], 1, view));
    $('camRight').replaceChildren(camSlot(view.players[2], 2, view), camSlot(view.players[3], 3, view));
  }

  $('btnRec').addEventListener('click', () => setRecMode(true));
  $('btnRecExit').addEventListener('click', () => setRecMode(false));
  $('btnChroma').addEventListener('click', () => setChroma(!document.body.classList.contains('chroma')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('rec-mode') && !document.querySelector('.overlay:not([hidden])')) {
      setRecMode(false);
    }
  });

  Game.onUpdate(render);
  setChroma(!!prefs.chroma);
  render();
})();
