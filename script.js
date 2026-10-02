/*
 * Carrera de Medallas — lógica principal del juego.
 *
 * Modelo de estado (todo vive en `state` y se guarda en localStorage):
 *   players[]  → nombre, ficha, color, posición, aciertos (streak), medallas, pierde turno
 *   current    → índice del jugador en turno
 *   phase      → 'idle' (puede lanzar) · 'busy' (resolviendo un evento) · 'over'
 *   pending    → el evento en curso. Se guarda para que, si se recarga la
 *                página a mitad de turno, se retome exactamente donde estaba
 *                (y nadie pueda volver a lanzar el dado o cambiar de pregunta).
 *   decks      → preguntas aún no usadas por categoría (sin repetir hasta agotar)
 *
 * Tipos de `pending`:
 *   { type:'move', steps, depth }             ficha por moverse
 *   { type:'question', cat, mode, qi, order,  pregunta abierta ('normal' | 'medal')
 *     answered, chosen, outcome }
 *   { type:'choose' }                         Centro Pokémon: elegir categoría
 *   { type:'info', title, text, icon }        aviso que hay que confirmar
 *   { type:'medal', cat }                     celebración de medalla nueva
 */
(function () {
  'use strict';

  const { $, el, delay, openOverlay, closeOverlay, closeAllOverlays, toast, confirmDialog, isOpen } = window.Dom;
  const { CATS, CAT_KEYS, QUESTION_KEYS, LEAGUE_KEY, HITS_FOR_MEDAL, ANSWER_SECONDS, MEDALS_TO_WIN, DICE_MAX, SAVE_KEY, BOARD_LAYOUT, BOARD_SIZE } = window.GameConfig;
  const ANSWER_MS = ANSWER_SECONDS * 1000;
  // Ventanas del juego que se muestran dentro del área de juego (no sobre toda la página).
  const IN_BOARD_DIALOGS = ['questionDialog', 'infoDialog', 'chooseDialog', 'rocketDialog', 'medalDialog', 'victoryDialog'];
  const { creatureIcon, categoryIcon, medalIcon, artIcon, pokemonIcon, typeIcons } = window.GameArt;
  const Poke = window.PokeData;
  const Board = window.GameBoard;
  const Sound = window.GameSound;

  const STEP_MS = 260;
  const MAX_CHAIN = 3; // máximo de casillas de movimiento encadenadas en un turno
  const LOG_KEEP = 40;

  const BANK = prepareBank(window.QUESTION_BANK || {});

  let state = null;
  let busy = false; // hay una animación en curso (dado o movimiento)
  let gameId = 0; // cambia al reiniciar: las animaciones viejas se detienen
  let squareEls = [];
  let tokenEls = [];

  /*
   * Quién puede actuar desde esta pantalla. Por defecto todos los asientos se
   * juegan aquí; net-host.js marca como remotos los que tienen un dispositivo
   * conectado, y entonces solo ese dispositivo puede mover ese asiento.
   */
  let isRemoteSeat = () => false;
  /*
   * Si un dispositivo no responde (se quedó sin batería, sin señal…), la
   * pantalla principal puede jugar ese turno: «Jugar este turno aquí».
   * Vale hasta que termina el turno.
   */
  let takeoverSeat = null;
  const lockedRemote = (seat) => isRemoteSeat(seat) && takeoverSeat !== seat;
  /** Quién actúa ahora: la víctima si responde una defensa; si no, el jugador en turno. */
  const actingSeat = () => {
    const pd = state && state.pending;
    return pd && pd.type === 'question' && pd.answerer != null ? pd.answerer : state.current;
  };
  const hostMayAct = () => !!state && (state.phase === 'over' || !lockedRemote(actingSeat()));
  const listeners = [];
  let notifyQueued = false;

  /*
   * Presentación de las animaciones del turno. La vista 2D (por defecto) usa
   * el tablero HTML; view3d/ registra una vista 3D con attachView() cuando el
   * navegador puede mostrarla. El motor espera (await) las animaciones de
   * dado, salto y caída antes de seguir; las demás se disparan y no bloquean.
   */
  const view2D = {
    roll: () => Promise.resolve(),
    beforeMove: () => Promise.resolve(),
    step(seat) {
      const t = tokenEls[seat];
      t.classList.remove('hop');
      void t.offsetWidth;
      t.classList.add('hop');
      return Promise.resolve();
    },
    afterMove: () => Promise.resolve(),
    overview: () => Promise.resolve(),
    turnStart() {},
    react() {},
    victory() {},
    sync() {},
  };
  let view3d = null;
  const view = () => view3d || view2D;

  // ═════════════════════ Banco de preguntas ═════════════════════

  /** Valida el banco: descarta (y avisa por consola) preguntas mal formadas. */
  function prepareBank(raw) {
    const bank = {};
    for (const cat of QUESTION_KEYS) {
      const list = Array.isArray(raw[cat]) ? raw[cat] : [];
      bank[cat] = list.filter((q, i) => {
        const ok =
          q && typeof q.q === 'string' && typeof q.correct === 'string' &&
          Array.isArray(q.wrong) && q.wrong.length === 3 &&
          new Set([q.correct, ...q.wrong]).size === 4;
        if (!ok) console.warn(`Pregunta inválida descartada: ${cat}[${i}]`, q);
        return ok;
      });
      if (bank[cat].length < 20) console.warn(`La categoría ${cat} tiene solo ${bank[cat].length} preguntas.`);
      if (bank[cat].length === 0) throw new Error(`La categoría ${cat} no tiene preguntas válidas.`);
    }
    return bank;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function freshDeck(cat) {
    return shuffle(BANK[cat].map((_, i) => i));
  }

  /**
   * Saca la siguiente pregunta de la categoría. El mazo se rebaraja recién
   * cuando se agota, y se evita que la última pregunta salga primera otra vez.
   */
  function drawQuestion(cat) {
    let deck = (state.decks[cat] || []).filter((i) => i < BANK[cat].length);
    if (deck.length === 0) {
      deck = freshDeck(cat);
      const last = state.lastQ[cat];
      if (deck.length > 1 && deck[deck.length - 1] === last) {
        [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
    }
    const qi = deck.pop();
    state.decks[cat] = deck;
    state.lastQ[cat] = qi;
    return qi;
  }

  // ═════════════════════ Estado y guardado ═════════════════════

  function newState(players) {
    const decks = {};
    const lastQ = {};
    for (const cat of QUESTION_KEYS) {
      decks[cat] = freshDeck(cat);
      lastQ[cat] = null;
    }
    return {
      v: 1,
      players: players.map((p) => ({
        name: p.name,
        creature: p.creature,
        color: p.color,
        pos: 0,
        streak: 0,
        medals: Object.fromEntries(CAT_KEYS.map((c) => [c, false])),
        skipNext: false,
      })),
      current: 0,
      phase: 'idle',
      lastRoll: null,
      pending: null,
      decks,
      lastQ,
      log: [],
      winner: null,
    };
  }

  function saveGame() {
    if (!state || state.phase === 'over') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('No se pudo guardar la partida:', err);
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn('No se pudo borrar la partida guardada:', err);
    }
  }

  /** Lee la partida guardada y comprueba que tenga la forma esperada. */
  function loadSave() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      console.warn('No se pudo leer la partida guardada:', err);
      return null;
    }
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      const valid =
        s && s.v === 1 && Array.isArray(s.players) && s.players.length === 4 &&
        s.players.every(
          (p) => typeof p.name === 'string' && Number.isInteger(p.pos) && p.pos >= 0 && p.pos < BOARD_SIZE &&
            Number.isInteger(p.streak) && p.medals && CAT_KEYS.every((c) => typeof p.medals[c] === 'boolean'),
        ) &&
        Number.isInteger(s.current) && s.current >= 0 && s.current < 4 &&
        (s.phase === 'idle' || s.phase === 'busy') &&
        s.decks && CAT_KEYS.every((c) => Array.isArray(s.decks[c])) && Array.isArray(s.log);
      if (!valid) throw new Error('estructura inesperada');
      s.lastQ = s.lastQ || {};
      // Partidas de versiones anteriores pueden no tener mazo para algún banco.
      for (const k of QUESTION_KEYS) if (!Array.isArray(s.decks[k])) s.decks[k] = [];
      // Al retomar, la pregunta abierta vuelve a tener el tiempo completo.
      if (s.pending && s.pending.type === 'question' && !s.pending.answered) s.pending.deadline = Date.now() + ANSWER_MS;
      // Si el banco cambió y la pregunta pendiente ya no existe, se saca otra.
      if (s.pending && s.pending.type === 'question' && !BANK[s.pending.cat]?.[s.pending.qi]) {
        s.pending = { type: 'move', steps: 0, depth: 0 };
      }
      return s;
    } catch (err) {
      console.warn('La partida guardada no es válida y se descarta:', err);
      clearSave();
      return null;
    }
  }

  const cur = () => state.players[state.current];
  const medalCount = (p) => CAT_KEYS.filter((c) => p.medals[c]).length;
  /** Con 4 medallas el jugador corre a Pueblo Paleta: avanza sin preguntas. */
  const isRacing = (p) => medalCount(p) >= MEDALS_TO_WIN;
  /** Ya llegó a Pueblo Paleta: en su turno responde el desafío final. */
  const atFinal = (p) => isRacing(p) && p.pos === 0;
  const randomOf = (list) => list[Math.floor(Math.random() * list.length)];
  const alive = (id) => id === gameId && state && state.phase !== 'over';

  function addLog(text, playerIdx) {
    state.log.push({ t: text, p: playerIdx == null ? null : playerIdx });
    if (state.log.length > LOG_KEEP) state.log.splice(0, state.log.length - LOG_KEEP);
  }

  // ═════════════════════ Renderizado ═════════════════════

  function tokenNode(p, extraClass) {
    return el('div', { class: `token ${extraClass || ''}`, style: { '--pc': p.color }, attrs: { title: p.name } }, [creatureIcon(p.creature)]);
  }

  function miniMedals(p, className) {
    return el(
      'div',
      { class: className || 'mini-medals' },
      CAT_KEYS.map((c) =>
        el('span', { class: `mini-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: `${CATS[c].name}: ${p.medals[c] ? 'obtenida' : 'pendiente'}` } }, [
          medalIcon(c),
        ]),
      ),
    );
  }

  function renderTokens() {
    squareEls.forEach((sqEl) => sqEl.querySelector('.sq-tokens').replaceChildren());
    state.players.forEach((p, i) => {
      const t = tokenEls[i];
      t.classList.toggle('active', i === state.current && state.phase !== 'over');
      squareEls[p.pos].querySelector('.sq-tokens').appendChild(t);
    });
    // Indica cuántas fichas comparten casilla para ajustar su tamaño.
    squareEls.forEach((sqEl) => {
      const n = sqEl.querySelector('.sq-tokens').childElementCount;
      sqEl.dataset.tokens = String(n);
    });
  }

  /*
   * Aciertos: `p.streak` cuenta de 0 a HITS_FOR_MEDAL. Los errores no lo
   * borran; con HITS_FOR_MEDAL aciertos, la próxima pregunta normal es «por la
   * medalla» y, acierte o falle, el contador vuelve a 0.
   */
  const readyForMedal = (p) => p.streak >= HITS_FOR_MEDAL;

  function streakText(streak) {
    if (streak >= HITS_FOR_MEDAL) return `${HITS_FOR_MEDAL} de ${HITS_FOR_MEDAL} · ¡Tu próxima pregunta es por la medalla!`;
    return `${streak} de ${HITS_FOR_MEDAL}`;
  }

  function streakPips(streak) {
    return Array.from({ length: HITS_FOR_MEDAL }, (_, i) => el('span', { class: `pip-streak ${i < streak ? 'on' : ''}` }));
  }

  function renderTurnPanel() {
    const p = cur();
    const panel = $('turnPanel');
    panel.style.setProperty('--pc', p.color);
    $('turnToken').replaceChildren(tokenNode(p, 'token-lg'));
    $('turnName').textContent = p.name;
    $('diceResult').textContent = state.lastRoll ? `Último dado: ${state.lastRoll}` : 'Aún sin lanzar';
    $('streakPips').replaceChildren(...streakPips(p.streak));
    $('streakText').textContent = `Aciertos: ${streakText(p.streak)}`;
    $('streakBox').classList.toggle('hot', readyForMedal(p));
    $('turnMedals').replaceChildren(
      ...CAT_KEYS.map((c) =>
        el('div', { class: `turn-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: CATS[c].name } }, [
          medalIcon(c),
          el('span', { text: CATS[c].name }),
        ]),
      ),
    );
    const remote = lockedRemote(state.current);
    const canRoll = state.phase === 'idle' && !busy && !remote;
    $('btnRoll').disabled = !canRoll;
    let label = '⏳ Resolviendo…';
    if (state.phase === 'over') label = '🏁 Partida terminada';
    else if (state.phase === 'idle' && remote) label = '📱 Golpea desde su dispositivo';
    else if (canRoll) label = atFinal(cur()) ? '🏆 ¡Desafío de la Liga!' : '👊 ¡Golpear el bloque!';
    $('btnRoll').textContent = label;
    Board.setDiceCycling(state.phase === 'idle' && !busy && !atFinal(cur()));
    applyLocks();
    notify();
  }

  function renderPlayers() {
    $('playersList').replaceChildren(
      ...state.players.map((p, i) =>
        el('li', { class: `player-row ${i === state.current && state.phase !== 'over' ? 'current' : ''}`, style: { '--pc': p.color } }, [
          tokenNode(p),
          el('div', { class: 'player-info' }, [
            el('strong', { class: 'player-name', text: p.name }),
            el('span', { class: 'player-meta', text: `${readyForMedal(p) ? '🏅 Por la medalla' : `Aciertos ${p.streak}/${HITS_FOR_MEDAL}`} · ${medalCount(p)}/${MEDALS_TO_WIN} medallas` }),
            p.skipNext ? el('span', { class: 'player-flag', text: 'Pierde el próximo turno' }) : null,
            isRacing(p) ? el('span', { class: 'player-flag race', text: atFinal(p) ? '🏆 Desafío de la Liga' : '🏁 Rumbo a Pueblo Paleta' }) : null,
          ]),
          miniMedals(p),
        ]),
      ),
    );
  }

  function renderLog() {
    const recent = state.log.slice(-6).reverse();
    $('logList').replaceChildren(
      ...recent.map((entry) =>
        el('li', { style: entry.p != null ? { '--pc': state.players[entry.p].color } : {}, class: entry.p != null ? 'by-player' : '' }, [entry.t]),
      ),
    );
  }

  function renderAll() {
    renderTokens();
    renderTurnPanel();
    renderPlayers();
    renderLog();
    applyLocks();
    view().sync(state);
    notify();
  }

  /** Avisa a los oyentes (red, vista de grabación) una vez por ciclo. */
  function notify() {
    if (notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      for (const fn of listeners) {
        try {
          fn();
        } catch (err) {
          console.error('Error en un oyente de la partida:', err);
        }
      }
    });
  }

  /**
   * Bloquea los botones de esta pantalla cuando el jugador en turno juega
   * desde otro dispositivo, y muestra a quién se está esperando.
   */
  function applyLocks() {
    if (!state) return;
    const remote = !hostMayAct();
    const pd = state.pending;
    document.body.classList.toggle('remote-turn', remote);
    document.querySelectorAll('.remote-wait').forEach((n) => {
      n.replaceChildren(
        ...(remote
          ? [`📱 Juega ${state.players[actingSeat()].name} desde su dispositivo… `, el('button', { class: 'btn-takeover', text: '🎮 Jugar aquí', attrs: { type: 'button' }, on: { click: takeOver } })]
          : []),
      );
      n.hidden = !remote;
    });
    $('btnTakeover').hidden = !remote || state.phase !== 'idle';
    document.querySelectorAll('#qOptions .q-option').forEach((b) => {
      b.disabled = remote || !pd || pd.type !== 'question' || pd.answered;
    });
    document.querySelectorAll('#chooseGrid .choose-btn, #rocketGrid .rocket-btn').forEach((b) => {
      b.disabled = remote || b.dataset.blocked === '1';
    });
    for (const id of ['btnQContinue', 'btnInfoOk', 'btnMedalOk']) $(id).disabled = remote;
  }

  /** La pantalla principal toma el turno de un dispositivo que no responde. */
  function takeOver() {
    if (!state || state.phase === 'over' || !lockedRemote(actingSeat())) return;
    takeoverSeat = actingSeat();
    addLog(`🎮 El turno de ${state.players[takeoverSeat].name} se juega desde la pantalla principal.`, takeoverSeat);
    renderTurnPanel();
    applyLocks();
  }

  // ═════════════════════ Flujo del turno ═════════════════════

  /** 1) Lanzar el dado. Solo funciona en fase 'idle' y una vez por turno. */
  async function rollDice() {
    if (!state || state.phase !== 'idle' || busy) return;
    if (atFinal(cur())) return startFinal();
    const run = gameId;
    busy = true;
    state.phase = 'busy';
    // El número se sortea aquí, en la pantalla principal; la animación del
    // bloque solo se detiene en él.
    const roll = 1 + Math.floor(Math.random() * DICE_MAX);
    state.lastRoll = roll;
    // Se guarda ANTES de animar: recargar no permite volver a tirar.
    state.pending = { type: 'move', steps: roll, depth: 0 };
    addLog(`${cur().name} sacó un ${roll}.`, state.current);
    saveGame();
    renderTurnPanel();
    renderLog();

    // En 3D el golpe suena cuando la ficha llega al bloque (lo hace la vista).
    if (!view3d) Sound.play('hit');
    Board.hitDice(roll);
    await Promise.all([delay(950), view().roll(state.current, roll)]);
    if (!alive(run)) return;
    $('diceResult').textContent = `¡Sacaste ${roll}!`;
    await delay(250);
    if (!alive(run)) return;
    await runPending(run);
  }

  /** Desafío final en Pueblo Paleta: una pregunta de cualquier categoría. */
  function startFinal() {
    state.phase = 'busy';
    addLog(`🏆 ${cur().name} enfrenta el desafío de la Liga Pokémon.`, state.current);
    return openQuestion(LEAGUE_KEY, 'final');
  }

  /** Ejecuta (o retoma tras recargar) el evento pendiente del turno. */
  async function runPending(run) {
    const pd = state.pending;
    if (!pd) return endTurn();
    switch (pd.type) {
      case 'move': {
        busy = true;
        renderTurnPanel();
        const ok = await animateMove(pd.steps, run);
        if (!ok) return;
        busy = false;
        state.pending = null;
        return landOn(pd.depth, run);
      }
      case 'question':
        return showQuestion();
      case 'choose':
        return showChooser();
      case 'rocket':
        return showRocket();
      case 'info':
        return showInfo();
      case 'medal':
        return showMedal();
      default:
        console.warn('Evento pendiente desconocido, se pasa el turno:', pd);
        return endTurn();
    }
  }

  /** 2) Mueve la ficha casillero por casillero. Devuelve false si se canceló. */
  async function animateMove(steps, run) {
    const seat = state.current;
    const p = cur();
    const dir = Math.sign(steps);
    const total = Math.abs(steps);
    if (total === 0) return true;
    await view().beforeMove(seat);
    if (!alive(run)) return false;
    const racing = isRacing(p);
    for (let k = 0; k < total; k++) {
      p.pos = (p.pos + dir + BOARD_SIZE) % BOARD_SIZE;
      // Con 4 medallas, al cruzar o pisar Pueblo Paleta la ficha se detiene ahí.
      const stop = racing && dir > 0 && p.pos === 0;
      renderTokens();
      view2D.step(seat);
      Sound.play('step');
      await Promise.all([delay(STEP_MS), view3d ? view3d.step(seat, p.pos, stop ? 0 : total - k - 1) : null]);
      if (!alive(run)) return false;
      if (stop) break;
    }
    await view().afterMove(seat, p.pos);
    return alive(run);
  }

  /** 3) Aplica el efecto de la casilla donde cayó la ficha. */
  async function landOn(depth, run) {
    const p = cur();
    const sq = BOARD_LAYOUT[p.pos];
    renderAll();
    if (sq.type !== 'move') {
      await view().overview();
      if (!alive(run)) return;
    }

    // Recta final: solo cuentan Pueblo Paleta y las casillas de movimiento o Monte Moon.
    if (isRacing(p)) {
      if (sq.type === 'start') {
        addLog(`🏁 ${p.name} llega a Pueblo Paleta.`, state.current);
        toast(`🏆 ¡${p.name} llega a Pueblo Paleta! Desafío de la Liga Pokémon`);
        return openQuestion(LEAGUE_KEY, 'final');
      }
      if (sq.type !== 'move' && sq.type !== 'skip') {
        addLog(`${p.name} corre hacia Pueblo Paleta.`, state.current);
        toast(`🏁 ${p.name} corre hacia Pueblo Paleta`);
        return endTurn();
      }
    }

    switch (sq.type) {
      case 'question':
        addLog(`${p.name} cae en ${CATS[sq.cat].name}.`, state.current);
        if (readyForMedal(p) && p.medals[sq.cat]) {
          // Con la pregunta por la medalla pendiente, una categoría ya ganada no sirve:
          // pierde el turno (sin pregunta) y conserva sus aciertos.
          addLog(`${p.name} ya tiene la Medalla de ${CATS[sq.cat].name}: pierde el turno.`, state.current);
          return setInfo(
            'Pierdes el turno',
            `${p.name} tenía la pregunta por la medalla, pero ya tiene la Medalla de ${CATS[sq.cat].name}. Pierde este turno y conserva sus ${HITS_FOR_MEDAL} aciertos para la próxima.`,
            { medal: sq.cat },
          );
        }
        return openQuestion(sq.cat, 'normal');

      case 'medal':
        if (p.medals[sq.cat]) {
          addLog(`${p.name} ya tiene la medalla de ${CATS[sq.cat].name}.`, state.current);
          return setInfo(
            'Medalla ya obtenida',
            `${p.name} ya tiene la Medalla de ${CATS[sq.cat].name} y no puede duplicarla. No hay pregunta en esta visita.`,
            { medal: sq.cat },
          );
        }
        addLog(`${p.name} cae en la medalla directa de ${CATS[sq.cat].name}.`, state.current);
        return openQuestion(sq.cat, 'medal');

      case 'move': {
        if (depth >= MAX_CHAIN) return endTurn();
        const verb = sq.steps > 0 ? `avanza ${sq.steps}` : `retrocede ${-sq.steps}`;
        addLog(`${sq.name}: ${p.name} ${verb}.`, state.current);
        Sound.play('special');
        toast(`${sq.name}: ${p.name} ${verb} casillas`);
        state.pending = { type: 'move', steps: sq.steps, depth: depth + 1 };
        saveGame();
        renderAll();
        await delay(800);
        if (!alive(run)) return;
        return runPending(run);
      }

      case 'skip':
        p.skipNext = true;
        addLog(`${p.name} se pierde en el Monte Moon.`, state.current);
        return setInfo('Monte Moon', `¡Una bandada de Zubat! ${p.name} se pierde en la cueva y pierde su próximo turno.`, { art: 'zubat' });

      case 'rocket': {
        addLog(`🚀 ${p.name} cae en la casilla del Team Rocket.`, state.current);
        const options = stealOptions(state.current);
        if (!options.length) {
          return setInfo(
            'Team Rocket',
            `«¡Prepárense para los problemas!»… pero ningún rival tiene una medalla que ${p.name} no tenga. No hay nada que robar.`,
            { art: 'meowth' },
          );
        }
        state.pending = { type: 'rocket', options };
        saveGame();
        return showRocket();
      }

      case 'wild':
        addLog(`${p.name} llega al Centro Pokémon.`, state.current);
        state.pending = { type: 'choose' };
        saveGame();
        return showChooser();

      case 'start':
      default:
        addLog(`${p.name} descansa en Pueblo Paleta.`, state.current);
        toast(`${p.name} descansa en Pueblo Paleta`);
        return endTurn();
    }
  }

  /** 4) Pasa al siguiente jugador, saltando a quien deba perder el turno. */
  function endTurn() {
    if (!state || state.phase === 'over') return;
    state.pending = null;
    let next = state.current;
    for (let guard = 0; guard < 8; guard++) {
      next = (next + 1) % state.players.length;
      const p = state.players[next];
      if (!p.skipNext) break;
      p.skipNext = false;
      addLog(`${p.name} pierde este turno (Monte Moon).`, next);
      toast(`${p.name} pierde este turno`);
    }
    state.current = next;
    state.phase = 'idle';
    busy = false;
    takeoverSeat = null;
    saveGame();
    renderAll();
    pulseTurn();
    view().turnStart(state.current);
    Sound.cry(cur().creature);
  }

  function pulseTurn() {
    const panel = $('turnPanel');
    panel.classList.remove('turn-change');
    void panel.offsetWidth;
    panel.classList.add('turn-change');
  }

  // ═════════════════════ Ventanas de evento ═════════════════════

  function setInfo(title, text, icon) {
    state.pending = { type: 'info', title, text, icon };
    saveGame();
    return showInfo();
  }

  function showInfo() {
    const pd = state.pending;
    Sound.play('special');
    $('infoTitle').textContent = pd.title;
    $('infoText').textContent = pd.text;
    const icon = pd.icon && pd.icon.medal ? medalIcon(pd.icon.medal) : artIcon(pd.icon && pd.icon.art);
    $('infoIcon').replaceChildren(icon);
    renderAll();
    openOverlay('infoDialog');
  }

  function onInfoOk() {
    if (!state || state.pending?.type !== 'info') return;
    closeOverlay('infoDialog');
    endTurn();
  }

  /** Categorías elegibles en el Centro Pokémon (con la pregunta por la medalla, solo las que faltan). */
  const choosableCats = (p) => CAT_KEYS.filter((c) => !(readyForMedal(p) && p.medals[c]));

  function showChooser() {
    renderAll();
    const allowed = choosableCats(cur());
    $('chooseGrid').replaceChildren(
      ...CAT_KEYS.map((c) =>
        el(
          'button',
          {
            class: 'choose-btn',
            attrs: { type: 'button', 'data-blocked': allowed.includes(c) ? null : '1', title: allowed.includes(c) ? null : 'Ya tienes esta medalla' },
            style: { '--cat': CATS[c].color },
            on: { click: () => hostMayAct() && chooseCategory(c) },
          },
          [categoryIcon(c), el('span', { text: CATS[c].name })],
        ),
      ),
    );
    applyLocks();
    openOverlay('chooseDialog');
  }

  function chooseCategory(cat) {
    if (!state || state.pending?.type !== 'choose' || !choosableCats(cur()).includes(cat)) return;
    closeOverlay('chooseDialog');
    addLog(`${cur().name} elige ${CATS[cat].name}.`, state.current);
    openQuestion(cat, 'normal');
  }

  // ═════════════════════ Team Rocket ═════════════════════

  /** Rivales a los que el ladrón puede robar: medallas que el rival tiene y él no. */
  function stealOptions(thiefSeat) {
    const thief = state.players[thiefSeat];
    return state.players
      .map((v, seat) => ({ seat, cats: CAT_KEYS.filter((c) => v.medals[c] && !thief.medals[c]) }))
      .filter((o) => o.seat !== thiefSeat && o.cats.length);
  }

  function showRocket() {
    const pd = state.pending;
    const thief = cur();
    renderAll();
    $('rocketIcon').replaceChildren(artIcon('meowth'));
    $('rocketText').textContent = `«¡Prepárense para los problemas!» ${thief.name}, elige a qué rival robarle una medalla. Podrá defenderla con una pregunta.`;
    $('rocketGrid').replaceChildren(
      ...pd.options.map((o) => {
        const v = state.players[o.seat];
        return el('button', { class: 'rocket-btn', attrs: { type: 'button' }, style: { '--pc': v.color }, on: { click: () => hostMayAct() && chooseVictim(o.seat) } }, [
          tokenNode(v),
          el('span', { class: 'rocket-name', text: v.name }),
          el('span', { class: 'rocket-medals' }, o.cats.map((c) => medalIcon(c))),
        ]);
      }),
    );
    Sound.play('special');
    applyLocks();
    openOverlay('rocketDialog');
  }

  /** El ladrón eligió víctima: sale al azar una medalla robable y la víctima la defiende. */
  function chooseVictim(seat) {
    const pd = state && state.pending;
    if (!pd || pd.type !== 'rocket') return;
    const option = pd.options.find((o) => o.seat === seat);
    if (!option) return;
    const cat = randomOf(option.cats);
    closeOverlay('rocketDialog');
    addLog(`🚀 ${cur().name} intenta robarle la Medalla de ${CATS[cat].name} a ${state.players[seat].name}.`, state.current);
    openQuestion(cat, 'defense', { answerer: seat, thief: state.current });
  }

  // ═════════════════════ Preguntas ═════════════════════

  /**
   * Abre una pregunta. `extra` permite que responda otro jugador (defensa del
   * Team Rocket: { answerer, thief }).
   */
  function openQuestion(cat, mode, extra) {
    const qi = drawQuestion(cat);
    state.pending = {
      type: 'question',
      cat,
      mode, // 'normal' suma aciertos (o es «por la medalla») · 'medal' medalla directa · 'final' desafío final · 'defense' Team Rocket
      forMedal: mode === 'normal' && readyForMedal(cur()), // pregunta por la medalla tras juntar los aciertos
      qi,
      order: shuffle([0, 1, 2, 3]), // 0 = correcta, 1..3 = incorrectas
      answered: false,
      chosen: null,
      outcome: null,
      deadline: Date.now() + ANSWER_MS, // se responde dentro de ANSWER_SECONDS
      ...(extra || {}),
    };
    saveGame();
    showQuestion();
  }

  function optionText(q, idx) {
    return idx === 0 ? q.correct : q.wrong[idx - 1];
  }

  function renderQuestionStreak(pd, p) {
    const box = $('qStreak');
    if (pd.mode === 'defense') {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: `🛡 ${p.name} defiende su Medalla de ${CATS[pd.cat].name}: si acierta, la conserva; si falla, se la lleva ${state.players[pd.thief].name}.` }));
    } else if (pd.mode === 'final') {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: '🏆 Desafío de la Liga Pokémon: si aciertas, ¡eres Campeón! Si fallas, vuelves a intentarlo en tu próximo turno.' }));
    } else if (pd.mode === 'medal') {
      box.replaceChildren(
        el('span', { class: 'q-streak-text', text: `Pregunta especial: si aciertas ganas la Medalla de ${CATS[pd.cat].name}. No cambia tus aciertos (${p.streak} de ${HITS_FOR_MEDAL}).` }),
      );
    } else if (pd.forMedal) {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: `🏅 Pregunta por la medalla: si aciertas, ganas la Medalla de ${CATS[pd.cat].name}. Acierte o falle, tus aciertos vuelven a 0.` }));
    } else {
      box.replaceChildren(el('span', { class: 'streak-pips' }, streakPips(p.streak)), el('span', { class: 'q-streak-text', text: `Aciertos: ${streakText(p.streak)} · un error no los borra.` }));
    }
  }

  function showQuestion() {
    const pd = state.pending;
    const q = BANK[pd.cat][pd.qi];
    const p = state.players[actingSeat()]; // quien responde (la víctima, en una defensa)
    const cat = CATS[pd.cat];
    renderAll();

    $('questionDialog').style.setProperty('--cat', cat.color);
    $('questionDialog').classList.toggle('q-medal-mode', pd.mode !== 'normal');
    $('qIcon').replaceChildren(pd.mode === 'medal' || pd.mode === 'defense' ? medalIcon(pd.cat) : categoryIcon(pd.cat));
    $('qMode').textContent = pd.forMedal ? '🏅 ¡Pregunta por la medalla!' : { medal: '🏅 Casilla de medalla directa', final: '🏆 Desafío final', defense: '🚀 ¡Ataque del Team Rocket!' }[pd.mode] || 'Pregunta';
    $('qCat').textContent = pd.cat === 'habilidades' ? 'Habilidades y movimientos' : cat.name;
    $('qPlayer').replaceChildren(tokenNode(p), el('span', { text: p.name }));
    $('qText').textContent = q.q;
    // Artwork de los Pokémon nombrados en el enunciado (nunca de las opciones).
    $('qArt').replaceChildren(...Poke.findPokemon(q.q).slice(0, 3).map((n) => pokemonIcon(Poke.POKEMON[n], 'q-art-img')));
    $('qReveal').replaceChildren();
    renderQuestionStreak(pd, p);

    const letters = ['A', 'B', 'C', 'D'];
    $('qOptions').replaceChildren(
      ...pd.order.map((optIdx, i) =>
        el('button', { class: 'q-option', attrs: { type: 'button', 'data-i': i }, on: { click: () => hostMayAct() && answerQuestion(i) } }, [
          el('span', { class: 'q-letter', text: letters[i] }),
          ...typeIcons(optionText(q, optIdx)),
          el('span', { class: 'q-option-text', text: optionText(q, optIdx) }),
        ]),
      ),
    );
    $('qFeedback').hidden = true;
    $('questionDialog').querySelector('.question-card').classList.remove('q-answered');
    if (pd.answered) showAnswered();
    applyLocks();
    openOverlay('questionDialog');
  }

  /**
   * Revisa el tiempo de la pregunta abierta (cada 250 ms). Al llegar a 0,
   * cuenta como respuesta incorrecta. Lo decide la pantalla principal.
   */
  let lastTickSecond = null;
  function checkAnswerTimer() {
    const pd = state && state.pending;
    const box = $('qTimer');
    if (!pd || pd.type !== 'question' || pd.answered || !pd.deadline) {
      box.hidden = true;
      lastTickSecond = null;
      return;
    }
    const left = Math.max(0, pd.deadline - Date.now());
    const secs = Math.ceil(left / 1000);
    box.hidden = false;
    box.classList.toggle('urgent', secs <= 5);
    $('qTimerFill').style.width = `${(left / ANSWER_MS) * 100}%`;
    $('qTimerText').textContent = `⏱ ${secs} s`;
    if (secs <= 5 && secs > 0 && secs !== lastTickSecond) Sound.play('tick');
    lastTickSecond = secs;
    if (left <= 0) answerQuestion(null);
  }

  /**
   * Registra la respuesta (i = opción elegida, o null si se acabó el tiempo).
   * Una pregunta solo puede responderse una vez.
   */
  function answerQuestion(i) {
    const pd = state && state.pending;
    if (!pd || pd.type !== 'question' || pd.answered) return;
    pd.answered = true;
    pd.chosen = i;

    const seat = actingSeat();
    const p = state.players[seat];
    const timeout = i === null;
    const correct = !timeout && pd.order[i] === 0;
    const outcome = { correct, timeout, medal: null, streakBefore: p.streak, streakAfter: p.streak, won: false };
    const catName = CATS[pd.cat].name;

    if (pd.mode === 'normal') {
      if (pd.forMedal) {
        // Pregunta por la medalla: los aciertos se consumen siempre. Nunca es
        // de una medalla ya ganada (en ese caso se pierde el turno antes).
        p.streak = 0;
        if (correct && !p.medals[pd.cat]) {
          p.medals[pd.cat] = true;
          outcome.medal = 'new';
          outcome.cat = pd.cat;
        }
      } else if (correct) {
        p.streak = Math.min(p.streak + 1, HITS_FOR_MEDAL); // un error no borra los aciertos
      }
    } else if (pd.mode === 'medal' && correct && !p.medals[pd.cat]) {
      // Medalla directa: no toca los aciertos.
      p.medals[pd.cat] = true;
      outcome.medal = 'new';
      outcome.cat = pd.cat;
    } else if (pd.mode === 'final' && correct) {
      outcome.won = true;
    } else if (pd.mode === 'defense') {
      // Defensa del Team Rocket: no toca los aciertos. Si falla, la medalla cambia de dueño.
      const thief = state.players[pd.thief];
      if (correct) outcome.defended = true;
      else {
        p.medals[pd.cat] = false;
        thief.medals[pd.cat] = true;
        outcome.stolen = true;
        outcome.cat = pd.cat;
      }
    }
    outcome.streakAfter = p.streak;
    outcome.reachedGoal =
      pd.mode === 'defense'
        ? !!outcome.stolen && medalCount(state.players[pd.thief]) === MEDALS_TO_WIN
        : outcome.medal === 'new' && medalCount(p) === MEDALS_TO_WIN;
    pd.outcome = outcome;

    addLog(`${p.name} ${correct ? 'acierta' : 'falla'} (${catName}${pd.mode === 'final' ? ', desafío final' : pd.mode === 'defense' ? ', defensa' : ''}).`, seat);
    if (outcome.medal === 'new') addLog(`🏅 ${p.name} gana la ${CATS[outcome.cat].badgeName} (${CATS[outcome.cat].name}).`, seat);
    if (outcome.defended) addLog(`🛡 ${p.name} defiende su Medalla de ${catName}. ¡El Team Rocket sale volando!`, seat);
    if (outcome.stolen) addLog(`🚀 ${state.players[pd.thief].name} le roba la Medalla de ${catName} a ${p.name}.`, pd.thief);
    if (outcome.reachedGoal) {
      const who = pd.mode === 'defense' ? pd.thief : seat;
      addLog(`🏁 ${state.players[who].name} tiene ${MEDALS_TO_WIN} medallas: ¡a Pueblo Paleta!`, who);
    }

    Sound.play(correct ? 'correct' : 'wrong');
    if (outcome.medal === 'new' || outcome.stolen) setTimeout(() => Sound.play('medal'), 350);
    view().react(seat, { correct, medal: outcome.medal === 'new' ? outcome.cat : null });
    if (outcome.stolen && view().steal) view().steal(seat, pd.thief, pd.cat);

    if (outcome.won) {
      // Desafío final superado: victoria inmediata.
      finishGame();
    } else {
      saveGame();
    }
    renderAll();
    showAnswered();
  }

  function outcomeMessage(pd) {
    const o = pd.outcome;
    const catName = CATS[pd.cat].name;
    const goal = o.reachedGoal ? ` ¡Ya tienes las ${MEDALS_TO_WIN} medallas: corre a Pueblo Paleta para el desafío de la Liga Pokémon!` : '';
    if (pd.mode === 'defense') {
      const victim = state.players[pd.answerer].name;
      const thief = state.players[pd.thief].name;
      if (o.correct) return `¡${victim} defendió su Medalla de ${catName}! ¡El Team Rocket sale volando otra vez!`;
      return `¡El Team Rocket se lleva la Medalla de ${catName} de ${victim} para ${thief}!${o.reachedGoal ? ` ¡${thief} ya tiene las ${MEDALS_TO_WIN} medallas: a Pueblo Paleta!` : ''}`;
    }
    if (pd.mode === 'final') {
      return o.correct ? '¡Venciste el desafío de la Liga Pokémon! ¡Eres el nuevo Campeón!' : 'La Liga te espera: en tu próximo turno respondes otro desafío desde Pueblo Paleta.';
    }
    if (pd.mode === 'medal') {
      if (o.medal === 'new') return `¡Ganas directamente la Medalla de ${catName}! Tus aciertos no cambian (${o.streakAfter} de ${HITS_FOR_MEDAL}).${goal}`;
      return `No ganas la medalla esta vez. Tus aciertos no cambian (${o.streakAfter} de ${HITS_FOR_MEDAL}).`;
    }
    if (pd.forMedal) {
      if (!o.correct) return `¡Se escapó la medalla! Tus aciertos vuelven a 0 de ${HITS_FOR_MEDAL}.`;
      if (o.medal === 'new') return `¡Ganas la Medalla de ${catName}! Tus aciertos vuelven a 0.${goal}`;
      return `Ya tenías la Medalla de ${catName}. Tus aciertos vuelven a 0.`;
    }
    if (!o.correct) return `Fallaste, pero conservas tus aciertos (${o.streakAfter} de ${HITS_FOR_MEDAL}).`;
    if (o.streakAfter >= HITS_FOR_MEDAL) return `¡${HITS_FOR_MEDAL} de ${HITS_FOR_MEDAL}! Tu próxima pregunta es por la medalla.`;
    return `Aciertos: ${streakText(o.streakAfter)}`;
  }

  /** Muestra la corrección: elegida, correcta, explicación y resultado. */
  function showAnswered() {
    const pd = state.pending;
    const q = BANK[pd.cat][pd.qi];
    const o = pd.outcome;
    $('qOptions').querySelectorAll('.q-option').forEach((btn, i) => {
      btn.disabled = true;
      const isRight = pd.order[i] === 0;
      btn.classList.toggle('correct', isRight);
      btn.classList.toggle('chosen', i === pd.chosen);
      btn.classList.toggle('wrong', i === pd.chosen && !isRight);
      if (isRight) btn.setAttribute('aria-label', `${btn.textContent} (respuesta correcta)`);
    });
    renderQuestionStreak(pd, state.players[actingSeat()]);
    $('qVerdict').textContent = o.correct ? '✔ ¡Correcto!' : o.timeout ? `⏰ ¡Se acabó el tiempo! La respuesta era: ${q.correct}` : `✘ Incorrecto. La respuesta era: ${q.correct}`;
    $('qTimer').hidden = true;
    $('qVerdict').className = o.correct ? 'ok' : 'bad';
    $('qExplain').textContent = q.explain || '';
    // Si la respuesta es un Pokémon, aparece su artwork al revelarla.
    const reveal = Poke.exactPokemon(q.correct);
    $('qReveal').replaceChildren(...(reveal ? [pokemonIcon(Poke.POKEMON[reveal], 'q-reveal-img')] : []));
    $('qOutcome').textContent = outcomeMessage(pd);
    $('qOutcome').classList.toggle('medal-line', !!o.medal || !!o.won || !!o.stolen || !!o.defended);
    $('btnQContinue').textContent = o.won ? '🏆 Ver celebración' : 'Continuar ➜';
    $('qFeedback').hidden = false;
    $('questionDialog').querySelector('.question-card').classList.add('q-answered');
    applyLocks();
    if (hostMayAct()) setTimeout(() => $('btnQContinue').focus({ preventScroll: true }), 50);
  }

  function onQuestionContinue() {
    if (!state) return;
    if (state.phase === 'over') {
      closeOverlay('questionDialog');
      return showVictory();
    }
    const pd = state.pending;
    if (!pd || pd.type !== 'question' || !pd.answered) return;
    closeOverlay('questionDialog');
    if (pd.outcome.stolen) {
      // La medalla robada se celebra como medalla nueva del ladrón (jugador en turno).
      state.pending = { type: 'medal', cat: pd.cat, from: pd.answerer };
      saveGame();
      return showMedal();
    }
    if (pd.outcome.medal === 'new') {
      state.pending = { type: 'medal', cat: pd.outcome.cat || pd.cat };
      saveGame();
      return showMedal();
    }
    endTurn();
  }

  function showMedal() {
    const pd = state.pending;
    const p = cur();
    renderAll();
    $('medalBig').replaceChildren(medalIcon(pd.cat));
    $('medalTitle').textContent = pd.from != null ? `¡${CATS[pd.cat].badgeName} robada!` : `¡${CATS[pd.cat].badgeName}!`;
    const stolenFrom = pd.from != null ? `El Team Rocket se la quitó a ${state.players[pd.from].name}. ` : '';
    $('medalText').textContent = stolenFrom + (isRacing(p)
      ? `Medalla de ${CATS[pd.cat].name}. ¡${p.name} tiene las ${MEDALS_TO_WIN} medallas! Ahora debe volver a Pueblo Paleta y vencer el desafío de la Liga Pokémon.`
      : `Medalla de ${CATS[pd.cat].name}. ${p.name} tiene ${medalCount(p)} de las ${MEDALS_TO_WIN} que necesita.`);
    Sound.cry(p.creature);
    openOverlay('medalDialog');
  }

  function onMedalOk() {
    if (!state || state.pending?.type !== 'medal') return;
    closeOverlay('medalDialog');
    endTurn();
  }

  // ═════════════════════ Victoria ═════════════════════

  function finishGame() {
    state.phase = 'over';
    state.winner = state.current;
    busy = false;
    addLog(`🏆 ¡${cur().name} gana la partida!`, state.current);
    clearSave(); // una partida terminada no se ofrece para continuar
  }

  async function showVictory() {
    const p = state.players[state.winner];
    const run = gameId;
    closeAllOverlays();
    renderAll();
    Sound.cry(p.creature);
    if (view3d) {
      // Primero se ve el festejo en el tablero 3D; después, la ventana.
      view3d.victory(state.winner);
      Sound.play('victory');
      await delay(2600);
      if (run !== gameId) return;
    }
    $('victoryToken').replaceChildren(tokenNode(p, 'token-xl'));
    $('victoryTitle').textContent = p.name;
    $('victoryDialog').style.setProperty('--pc', p.color);
    $('victoryMedals').replaceChildren(
      ...CAT_KEYS.filter((c) => p.medals[c]).map((c) => el('div', { class: 'victory-medal' }, [medalIcon(c), el('span', { text: CATS[c].name })])),
    );
    launchConfetti();
    if (!view3d) Sound.play('victory');
    openOverlay('victoryDialog');
  }

  function launchConfetti() {
    const box = $('confetti');
    const colors = [...CAT_KEYS.map((c) => CATS[c].color), '#f8c630', '#ffffff'];
    box.replaceChildren(
      ...Array.from({ length: 90 }, () =>
        el('span', {
          class: 'confetti-piece',
          style: {
            left: `${Math.random() * 100}%`,
            background: colors[Math.floor(Math.random() * colors.length)],
            'animation-delay': `${(Math.random() * 1.8).toFixed(2)}s`,
            'animation-duration': `${(2.6 + Math.random() * 2).toFixed(2)}s`,
            transform: `rotate(${Math.floor(Math.random() * 360)}deg)`,
          },
        }),
      ),
    );
  }

  // ═════════════════════ Pantallas y partida ═════════════════════

  function showScreen(name) {
    const game = name === 'game';
    $('screenSetup').hidden = game;
    $('screenGame').hidden = !game;
    $('btnRestart').hidden = !game;
    $('btnSetup').hidden = !game;
    document.body.classList.toggle('in-game', game);
  }

  /** Prepara la vista de una partida (nueva o recuperada). */
  function mountGame(s) {
    gameId += 1;
    busy = false;
    state = s;
    closeAllOverlays();
    tokenEls = state.players.map((p) => tokenNode(p, 'board-token'));
    showScreen('game');
    renderAll();
    if (state.phase === 'idle') view().turnStart(state.current);
  }

  function startNewGame(players) {
    clearSave();
    const s = newState(players);
    s.log.push({ t: `¡Comienza la partida! Empieza ${players[0].name}.`, p: 0 });
    mountGame(s);
    saveGame();
    pulseTurn();
    toast(`¡A jugar! Empieza ${players[0].name}`);
  }

  function resumeGame(saved) {
    mountGame(saved);
    toast('Partida recuperada');
    // Si se cerró a mitad de un evento, se retoma ese mismo evento.
    if (state.phase === 'busy') runPending(gameId);
  }

  function playersConfig() {
    return state.players.map((p) => ({ name: p.name, creature: p.creature, color: p.color }));
  }

  function goToSetup(players) {
    gameId += 1; // detiene animaciones en curso
    closeAllOverlays();
    state = null;
    busy = false;
    view().sync(null);
    window.GameSetup.load(players);
    showScreen('setup');
    document.body.classList.remove('remote-turn');
    notify();
  }

  async function onRestartClick() {
    if (!state) return;
    const ok = await confirmDialog('¿Reiniciar la partida?', 'Se perderán el progreso, los aciertos y las medallas de todos. Los jugadores se mantienen.', 'Sí, reiniciar');
    if (ok) startNewGame(playersConfig());
  }

  async function onSetupClick() {
    if (!state) return;
    const ok = await confirmDialog('¿Volver a configuración?', 'La partida actual se abandonará y no podrá continuarse.', 'Sí, volver');
    if (!ok) return;
    const players = playersConfig();
    clearSave();
    goToSetup(players);
  }

  function describeSave(s) {
    const turn = s.players[s.current];
    const lines = s.players.map((p) => `${p.name} (${medalCount(p)}/${MEDALS_TO_WIN})`).join(', ');
    return `Jugadores: ${lines}. Le toca a ${turn.name}.`;
  }

  function updateSoundButton() {
    const on = Sound.isEnabled();
    $('btnSound').textContent = on ? '🔊 Sonido' : '🔇 Silencio';
    $('btnSound').setAttribute('aria-pressed', String(on));
    $('btnSound').title = on ? 'Silenciar sonidos' : 'Activar sonidos';
  }

  // ═════════════════════ Inicio ═════════════════════

  function init() {
    squareEls = Board.init();
    updateSoundButton();
    // Las ventanas del juego aparecen dentro del área de juego, como un popup del tablero.
    for (const id of IN_BOARD_DIALOGS) {
      $(id).classList.add('in-board');
      $('playArea').appendChild($(id));
    }
    setInterval(checkAnswerTimer, 250);

    window.GameSetup.init({ onStart: startNewGame });

    // Botones de esta pantalla: solo actúan si el turno no es de un dispositivo remoto.
    const local = (fn) => () => hostMayAct() && fn();
    $('btnRoll').addEventListener('click', local(rollDice));
    $('btnTakeover').addEventListener('click', takeOver);
    $('btnQContinue').addEventListener('click', local(onQuestionContinue));
    $('btnInfoOk').addEventListener('click', local(onInfoOk));
    $('btnMedalOk').addEventListener('click', local(onMedalOk));
    $('btnRestart').addEventListener('click', onRestartClick);
    $('btnSetup').addEventListener('click', onSetupClick);
    $('btnRules').addEventListener('click', () => openOverlay('rulesDialog'));
    $('btnRulesClose').addEventListener('click', () => closeOverlay('rulesDialog'));
    $('btnSound').addEventListener('click', () => {
      Sound.toggle();
      updateSoundButton();
    });
    $('btnPlayAgain').addEventListener('click', () => startNewGame(playersConfig()));
    $('btnBackSetup').addEventListener('click', () => goToSetup(playersConfig()));

    // Escape cierra la ayuda o cancela una confirmación, pero nunca una pregunta.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (isOpen('confirmDialog')) window.Dom.settleConfirm(false);
      else if (isOpen('rulesDialog')) closeOverlay('rulesDialog');
    });

    const saved = loadSave();
    showScreen('setup');
    if (saved) {
      window.GameSetup.load(saved.players);
      $('resumeText').textContent = describeSave(saved);
      $('btnResume').onclick = () => {
        closeOverlay('resumeDialog');
        resumeGame(saved);
      };
      $('btnNewFromResume').onclick = () => {
        closeOverlay('resumeDialog');
        clearSave();
      };
      openOverlay('resumeDialog');
    }
  }

  // ═════════════════════ Acciones remotas y vista pública ═════════════════════

  /**
   * Ejecuta una acción enviada por el dispositivo de un jugador.
   * Solo el asiento en turno puede actuar, y solo con la acción que el evento
   * actual admite; cualquier otra cosa se ignora. Devuelve si se aceptó.
   */
  function act(seat, action) {
    if (!state || !action) return false;
    const pd = state.pending;
    // Responde quien defiende (si hay defensa); continuar puede el jugador en
    // turno o quien respondió; todo lo demás, solo el jugador en turno.
    const answerSeat = actingSeat();
    const allowed =
      action.type === 'answer' ? seat === answerSeat
        : action.type === 'continue' ? seat === state.current || seat === answerSeat
          : seat === state.current;
    if (!allowed) return false;
    if (state.phase === 'over') {
      // Solo queda pasar de la corrección a la celebración.
      if (action.type === 'continue' && seat === state.winner && isOpen('questionDialog')) {
        onQuestionContinue();
        return true;
      }
      return false;
    }
    switch (action.type) {
      case 'roll':
        if (state.phase !== 'idle' || busy) return false;
        rollDice();
        return true;
      case 'answer':
        if (!pd || pd.type !== 'question' || pd.answered) return false;
        if (!Number.isInteger(action.i) || action.i < 0 || action.i > 3) return false;
        answerQuestion(action.i);
        return true;
      case 'choose':
        if (!pd || pd.type !== 'choose' || !choosableCats(cur()).includes(action.cat)) return false;
        chooseCategory(action.cat);
        return true;
      case 'steal':
        if (!pd || pd.type !== 'rocket' || !pd.options.some((o) => o.seat === action.victim)) return false;
        chooseVictim(action.victim);
        return true;
      case 'continue':
        if (pd?.type === 'question' && pd.answered) onQuestionContinue();
        else if (pd?.type === 'info') onInfoOk();
        else if (pd?.type === 'medal') onMedalOk();
        else return false;
        return true;
      default:
        return false;
    }
  }

  /**
   * Evento en curso tal como lo ven los dispositivos. La respuesta correcta,
   * la explicación y el resultado solo se incluyen DESPUÉS de responder.
   */
  function publicPending() {
    const pd = state.pending;
    if (!pd) return null;
    if (pd.type === 'question') {
      const q = BANK[pd.cat][pd.qi];
      const view = {
        type: 'question',
        cat: pd.cat,
        mode: pd.mode,
        text: q.q,
        options: pd.order.map((i) => optionText(q, i)),
        art: Poke.findPokemon(q.q).slice(0, 3).map((n) => Poke.pokemonArt(n)),
        answered: pd.answered,
        chosen: pd.chosen,
        answerer: pd.answerer ?? null, // defensa: responde la víctima
        forMedal: !!pd.forMedal,
        thief: pd.thief ?? null,
        // Tiempo restante (no la hora absoluta: los relojes de los dispositivos difieren).
        timeLeftMs: !pd.answered && pd.deadline ? Math.max(0, pd.deadline - Date.now()) : null,
      };
      if (pd.answered) {
        const reveal = Poke.exactPokemon(q.correct);
        Object.assign(view, {
          revealArt: reveal ? Poke.pokemonArt(reveal) : null,
          correct: pd.order.indexOf(0),
          explain: q.explain || '',
          outcome: {
            correct: pd.outcome.correct,
            timeout: !!pd.outcome.timeout,
            medal: pd.outcome.medal,
            won: pd.outcome.won,
            stolen: !!pd.outcome.stolen,
            message: outcomeMessage(pd),
          },
        });
      }
      return view;
    }
    if (pd.type === 'info') return { type: 'info', title: pd.title, text: pd.text };
    if (pd.type === 'rocket') return { type: 'rocket', options: pd.options.map((o) => ({ seat: o.seat, cats: [...o.cats] })) };
    if (pd.type === 'medal') return { type: 'medal', cat: pd.cat, from: pd.from ?? null };
    return { type: pd.type };
  }

  /** Copia de la partida apta para enviar a los dispositivos. */
  function publicView() {
    if (!state) return null;
    return {
      phase: state.phase,
      busy,
      current: state.current,
      lastRoll: state.lastRoll,
      winner: state.winner,
      players: state.players.map((p) => ({
        name: p.name,
        creature: p.creature,
        color: p.color,
        pos: p.pos,
        streak: p.streak,
        medals: { ...p.medals },
        skipNext: p.skipNext,
        racing: isRacing(p),
        atFinal: atFinal(p),
      })),
      pending: publicPending(),
      log: state.log.slice(-5).map((l) => l.t),
    };
  }

  window.CarreraDeMedallas = {
    getState: () => state, // solo para depurar desde la consola
    publicView,
    act,
    onUpdate(fn) {
      listeners.push(fn);
    },
    /** Registra la vista 3D (view3d/). Si falla al cargar, sigue la 2D. */
    attachView(v) {
      view3d = v;
      Board.placeTurnPanel();
      v.sync(state);
      if (state && state.phase === 'idle') v.turnStart(state.current);
    },
    /** true si ese asiento juega desde otro dispositivo. */
    isRemote: (seat) => isRemoteSeat(seat),
    /** fn(seat) → true si ese asiento juega desde otro dispositivo. */
    setRemoteSeats(fn) {
      isRemoteSeat = fn;
      if (state) {
        renderTurnPanel();
        applyLocks();
      }
    },
  };

  init();
})();
