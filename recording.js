/*
 * Vista de grabación: tablero al centro y cuatro espacios para cámaras,
 * dos a cada lado, pensados para superponer video en la edición posterior.
 * Los espacios pueden ser un marco neutro, verde croma o transparentes: en
 * ese caso el fondo de la página se dibuja con huecos reales en el interior
 * de las cuatro cámaras, para ver debajo las fuentes de cámara de OBS.
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
    syncHoles();
  }

  function setRecMode(on) {
    wantRec = on;
    prefs.rec = on;
    writePrefs(prefs);
    render();
  }

  /** Interior de las cámaras: 'neutral' (marco gris), 'chroma' (verde) o 'transparent' (hueco real). */
  const CAM_LOOKS = ['neutral', 'chroma', 'transparent'];

  function setCamLook(look) {
    const value = CAM_LOOKS.includes(look) ? look : 'neutral';
    document.body.classList.toggle('chroma', value === 'chroma');
    document.body.classList.toggle('cam-holes', value === 'transparent');
    $('btnChroma').setAttribute('aria-pressed', String(value === 'chroma'));
    $('btnCamHoles').setAttribute('aria-pressed', String(value === 'transparent'));
    prefs.cams = value;
    delete prefs.chroma; // preferencia vieja (solo verde sí/no)
    writePrefs(prefs);
    syncHoles();
  }

  /** Cada botón alterna su modo; tocar el activo vuelve al marco neutro. */
  function toggleCamLook(look) {
    setCamLook(prefs.cams === look ? 'neutral' : look);
  }

  // ── Huecos reales ──
  // El fondo de la página lo pinta una capa fija (body::before) recortada con
  // un clip-path «evenodd»: todo el lienzo menos el interior de cada cámara.
  // Se recalcula en cada cuadro mientras el modo está activo porque las
  // cámaras cambian de tamaño con la ventana y se agrandan un poco en su turno.
  let holesFrame = 0;
  let lastHoles = '';

  /** Rectángulo con las esquinas de arriba redondeadas (las de abajo tocan la placa). */
  function holePath(x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    return `M${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}H${x}Z`;
  }

  function drawHoles() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let d = `M0 0H${vw}V${vh}H0Z`;
    document.querySelectorAll('.cam-frame').forEach((frame) => {
      const box = frame.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      const slot = getComputedStyle(frame.parentElement);
      const rad = Math.max(0, parseFloat(slot.borderTopLeftRadius) - parseFloat(slot.borderTopWidth));
      // 1 px de más por lado, escondido bajo el borde y la placa: sin hilos de fondo en el canto.
      const r2 = (n) => Math.round(n * 2) / 2;
      d += holePath(r2(box.left - 1), r2(box.top - 1), r2(box.width + 2), r2(box.height + 1), rad + 1);
    });
    const clip = `path(evenodd, '${d}')`;
    if (clip !== lastHoles) {
      lastHoles = clip;
      document.body.style.setProperty('--cam-holes', clip);
    }
    holesFrame = requestAnimationFrame(drawHoles);
  }

  /** Enciende o apaga el recorte según el modo actual. */
  function syncHoles() {
    const on = document.body.classList.contains('rec-mode') && document.body.classList.contains('cam-holes');
    if (on && !holesFrame) drawHoles();
    if (!on && holesFrame) {
      cancelAnimationFrame(holesFrame);
      holesFrame = 0;
      lastHoles = '';
      document.body.style.removeProperty('--cam-holes');
    }
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
  $('btnChroma').addEventListener('click', () => toggleCamLook('chroma'));
  $('btnCamHoles').addEventListener('click', () => toggleCamLook('transparent'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('rec-mode') && !document.querySelector('.overlay:not([hidden])')) {
      setRecMode(false);
    }
  });

  Game.onUpdate(render);
  setCamLook(prefs.cams || (prefs.chroma ? 'chroma' : 'neutral'));
  render();
})();
