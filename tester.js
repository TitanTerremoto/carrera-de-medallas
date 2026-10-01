/*
 * Modo tester: bots que juegan solos para ver cómo avanza la partida.
 *
 * Usan exactamente las mismas acciones que un celular (CarreraDeMedallas.act),
 * así que lo que se ve es el juego real: dado, movimiento 3D, preguntas,
 * rachas, medallas y victoria. Nunca juegan por un asiento que tenga un
 * dispositivo conectado.
 *
 * Herramienta de prueba de la pantalla principal: para elegir cuándo
 * acertar, mira la respuesta correcta en el estado interno (getState).
 */
(function () {
  'use strict';

  const { $, el, toast } = window.Dom;
  const { CAT_KEYS, MEDALS_TO_WIN } = window.GameConfig;
  const { CREATURES } = window.GameArt;
  const Game = window.CarreraDeMedallas;
  const Setup = window.GameSetup;
  window.GameSpeed = window.GameSpeed || { turbo: false };

  // Pausas de los bots en ms (pensar antes de actuar / leer el resultado).
  const SPEEDS = {
    normal: { think: 2600, read: 4200 }, // ritmo de una persona: se ve todo con calma
    rapido: { think: 1200, read: 2200 },
    turbo: { think: 60, read: 150 }, // además omite las animaciones
  };

  const tester = {
    on: false,
    paused: false,
    stepOnce: false,
    accuracy: 0.7,
    speed: 'normal',
    stats: { turns: 0, right: 0, wrong: 0 },
  };
  let loopId = 0;

  // Pausa real (no Dom.delay, que con la ventana oculta no espera y dejaría
  // este bucle girando sin pausa).
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastActedKey = null;

  // ── Decisiones de los bots ──
  /** Huella del momento del juego (sin el reloj de la pregunta, que cambia solo). */
  function stateKey(v) {
    return JSON.stringify([v.phase, v.current, v.pending, v.log.length], (k, val) => (k === 'timeLeftMs' ? undefined : val));
  }

  /** Índice (en pantalla) de la opción que eligió el bot. */
  function pickAnswer() {
    const pd = Game.getState().pending;
    const correct = pd.order.indexOf(0);
    if (Math.random() < tester.accuracy) return correct;
    const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
    return wrong[Math.floor(Math.random() * wrong.length)];
  }

  /** Decide la próxima acción para la vista actual, o null si toca esperar. */
  function nextAction(v) {
    const pd = v.pending;
    const pace = SPEEDS[tester.speed];
    if (v.phase === 'over') {
      // Solo queda pasar de la corrección a la celebración.
      if (pd && pd.type === 'question' && pd.answered && v.winner === v.current) return { wait: pace.read, action: { type: 'continue' } };
      return null;
    }
    if (Game.isRemote(v.current)) return null;
    if (!pd) return v.phase === 'idle' && !v.busy ? { wait: pace.think, action: { type: 'roll' } } : null;
    switch (pd.type) {
      case 'question':
        return pd.answered ? { wait: pace.read, action: { type: 'continue' } } : { wait: pace.think * 1.5, action: { type: 'answer', i: null } };
      case 'choose':
        return { wait: pace.think, action: { type: 'choose', cat: CAT_KEYS[Math.floor(Math.random() * CAT_KEYS.length)] } };
      case 'info':
      case 'medal':
        return { wait: pace.read * 0.7, action: { type: 'continue' } };
      default:
        return null; // 'move': la ficha se está moviendo
    }
  }

  async function loop(id) {
    while (tester.on && id === loopId) {
      const v = Game.publicView();
      if (!v) return stop('La partida terminó.');
      const key = stateKey(v);
      const plan = !tester.paused || tester.stepOnce ? nextAction(v) : null;
      if (plan && key !== lastActedKey) {
        await sleep(plan.wait);
        if (!tester.on || id !== loopId) return;
        // Si el estado cambió durante la pausa (otro jugador actuó), se reevalúa.
        if (stateKey(Game.publicView() || v) !== key) continue;
        const action = plan.action;
        if (action.type === 'answer') action.i = pickAnswer();
        const seat = v.current;
        const correctIdx = action.type === 'answer' ? Game.getState().pending.order.indexOf(0) : null;
        if (Game.act(seat, action)) {
          lastActedKey = key;
          tester.stepOnce = false;
          if (action.type === 'roll') tester.stats.turns++;
          if (action.type === 'answer') tester.stats[action.i === correctIdx ? 'right' : 'wrong']++;
          render();
        }
      }
      // Terminó: ya se pasó de la corrección a la celebración.
      if (v.phase === 'over' && $('questionDialog').hidden) return stopQuiet();
      await sleep(200);
    }
  }

  // ── Encendido / apagado ──
  function start() {
    tester.on = true;
    tester.paused = false;
    tester.stepOnce = false;
    lastActedKey = null;
    loopId++;
    document.body.classList.add('tester-on');
    window.GameSpeed.turbo = tester.speed === 'turbo';
    render();
    loop(loopId);
  }

  function stopQuiet() {
    tester.on = false;
    window.GameSpeed.turbo = false;
    loopId++;
    render();
  }

  function stop(message) {
    stopQuiet();
    document.body.classList.remove('tester-on');
    if (message) toast(message);
  }

  /** Completa los asientos libres con bots y empieza una partida de prueba. */
  function startBotGame() {
    const seats = Setup.seats();
    const used = new Set(seats.filter((s) => s.creature).map((s) => s.creature));
    const free = CREATURES.map((c) => c.id).filter((id) => !used.has(id));
    const players = seats.map((s) => {
      if (s.remote) return s;
      const creature = s.creature || free.shift();
      const name = s.name || `Bot ${CREATURES.find((c) => c.id === creature).name}`;
      return { name, creature };
    });
    Setup.load(players);
    tester.stats = { turns: 0, right: 0, wrong: 0 };
    $('setupForm').requestSubmit();
    if (Game.publicView()) start();
    else toast('Revisa los jugadores: hay datos repetidos o incompletos.');
  }

  // ── Panel flotante ──
  function render() {
    const panel = $('testerPanel');
    const v = Game.publicView();
    panel.hidden = !document.body.classList.contains('tester-on') || !v;
    $('btnTester').textContent = tester.on ? '🤖 Tester: activo' : '🤖 Modo tester';
    if (panel.hidden) return;

    const s = tester.stats;
    const answered = s.right + s.wrong;
    let status = tester.paused ? '⏸ En pausa' : '▶ Jugando solo';
    if (!tester.on) status = v.phase === 'over' ? '🏁 Partida terminada' : '⏹ Detenido';
    const leader = v.players
      .map((p) => ({ name: p.name, m: CAT_KEYS.filter((c) => p.medals[c]).length + (p.atFinal ? 0.5 : 0) }))
      .sort((a, b) => b.m - a.m)[0];

    $('testerStatus').textContent = status;
    $('testerStats').replaceChildren(
      el('li', { text: `Turnos: ${s.turns}` }),
      el('li', { text: `Aciertos: ${s.right}/${answered}${answered ? ` (${Math.round((s.right / answered) * 100)} %)` : ''}` }),
      el('li', { text: `Va ganando: ${leader.name} (${Math.floor(leader.m)}/${MEDALS_TO_WIN}${leader.m % 1 ? ', en el desafío final' : ''})` }),
      el('li', { text: `Turno de: ${v.players[v.current].name}${Game.isRemote(v.current) ? ' 📱' : ''}` }),
    );
    $('btnTesterPause').textContent = tester.paused ? '▶ Seguir' : '⏸ Pausar';
    $('btnTesterPause').disabled = !tester.on;
    $('btnTesterStep').disabled = !tester.on || !tester.paused;
    $('btnTesterRun').hidden = tester.on || v.phase === 'over';
  }

  function init() {
    $('btnBotGame').addEventListener('click', startBotGame);
    $('btnTester').addEventListener('click', () => {
      if (!Game.publicView()) return startBotGame();
      if (tester.on) stop('Modo tester apagado: la partida sigue a mano.');
      else start();
    });
    $('btnTesterPause').addEventListener('click', () => {
      tester.paused = !tester.paused;
      render();
    });
    $('btnTesterStep').addEventListener('click', () => {
      tester.stepOnce = true;
      lastActedKey = null;
    });
    $('btnTesterRun').addEventListener('click', start);
    $('btnTesterClose').addEventListener('click', () => stop('Modo tester apagado: la partida sigue a mano.'));
    $('testerAccuracy').addEventListener('change', (e) => {
      tester.accuracy = Number(e.target.value);
    });
    $('testerSpeed').addEventListener('change', (e) => {
      tester.speed = SPEEDS[e.target.value] ? e.target.value : 'normal';
      window.GameSpeed.turbo = tester.on && tester.speed === 'turbo';
    });
    Game.onUpdate(render);
    render();
    // index.html?tester=1 arranca directo una partida de prueba.
    if (new URLSearchParams(window.location.search).get('tester') === '1' && !Game.publicView()) startBotGame();
  }

  init();
})();
