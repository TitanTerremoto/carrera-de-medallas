/*
 * Pokémon Party — lógica principal del juego.
 *
 * Modelo de estado (todo vive en `state` y se guarda en localStorage):
 *   players[]  → nombre, ficha, color, posición, aciertos (streak), medallas, pierde turno
 *   current    → índice del jugador en turno
 *   phase      → 'idle' (puede lanzar) · 'busy' (resolviendo un evento) · 'over'
 *   pending    → el evento en curso. Se guarda para que, si se recarga la
 *                página a mitad de turno, se retome exactamente donde estaba
 *                (y nadie pueda volver a lanzar el dado o cambiar de pregunta).
 *   decks      → preguntas aún no usadas por categoría (sin repetir hasta agotar)
 *   order      → orden de turnos (asientos), según los dados de la ceremonia
 *   asked      → textos de las preguntas ya hechas en la partida (ninguna se repite,
 *                ni siquiera si el mismo texto está en dos categorías)
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
  const { CATS, CAT_KEYS, QUESTION_KEYS, LEAGUE_KEY, HITS_FOR_MEDAL, ANSWER_SECONDS, MEDALS_TO_WIN, DICE_MAX, SAVE_KEY, BOARD_LAYOUT, BOARD_SIZE, squareTitle } = window.GameConfig;
  const ANSWER_MS = ANSWER_SECONDS * 1000;
  // Ventanas del juego que se muestran dentro del área de juego (no sobre toda la página).
  const IN_BOARD_DIALOGS = ['questionDialog', 'infoDialog', 'medalDialog', 'victoryDialog'];
  const { creatureIcon, categoryIcon, medalIcon, artIcon, pokemonIcon, typeIcons } = window.GameArt;
  const Poke = window.PokeData;
  const Board = window.GameBoard;
  const Sound = window.GameSound;
  const Talk = window.GameTalk;

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
    rocketArrive: () => Promise.resolve(),
    rocketLeave: () => Promise.resolve(),
    steal: () => Promise.resolve(),
    announce() {},
    questionShot() {},
    openingIntro: () => Promise.resolve(),
    openingRoll: () => Promise.resolve(),
    resetScenes() {},
    visitorArrive: () => Promise.resolve(),
    visitorLeave: () => Promise.resolve(),
    medalGift() {},
    visitorEscort() {},
    zubatAttack: () => Promise.resolve(),
    characterTalk() {},
    characterCry() {},
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
  /** Clave de una pregunta para no repetirla: el texto, sin mayúsculas ni signos. */
  const questionKey = (q) => q.q.toLowerCase().replace(/[¿?¡!.,«»]/g, '').replace(/\s+/g, ' ').trim();

  function drawQuestion(cat) {
    const asked = new Set(state.asked || []);
    let deck = (state.decks[cat] || []).filter((i) => i < BANK[cat].length);
    // Se toma la siguiente del mazo que no se haya hecho en esta partida (en
    // ninguna categoría). Si el mazo se agota, se baraja de nuevo una vez.
    let at = -1;
    for (let refill = 0; refill < 2 && at < 0; refill++) {
      if (deck.length === 0) {
        deck = freshDeck(cat);
        const last = state.lastQ[cat];
        if (deck.length > 1 && deck[deck.length - 1] === last) {
          [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
        }
      }
      for (let k = deck.length - 1; k >= 0 && at < 0; k--) if (!asked.has(questionKey(BANK[cat][deck[k]]))) at = k;
      if (at < 0) deck = [];
    }
    if (at < 0) at = deck.length - 1; // ya salieron todas: recién ahí se repite
    const qi = deck.splice(at, 1)[0];
    state.decks[cat] = deck;
    state.lastQ[cat] = qi;
    state.asked = [...(state.asked || []), questionKey(BANK[cat][qi])];
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
      order: players.map((_, seat) => seat), // se define en la ceremonia de inicio
      phase: 'idle',
      lastRoll: null,
      pending: null,
      decks,
      lastQ,
      asked: [],
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
      if (!Array.isArray(s.asked)) s.asked = [];
      // Orden de turnos: una permutación de los asientos (partidas viejas: el de los asientos).
      const seats = s.players.map((_, seat) => seat);
      const okOrder = Array.isArray(s.order) && s.order.length === seats.length && seats.every((x) => s.order.includes(x));
      if (!okOrder) s.order = seats;
      // Al retomar, la pregunta abierta vuelve a tener el tiempo completo.
      if (s.pending && s.pending.type === 'question' && !s.pending.answered) {
        s.pending.deadline = Date.now() + ANSWER_MS;
        s.pending.hold = false;
      }
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
  /**
   * Con las 4 medallas toca el desafío de la Liga: Lance (con Dragonite) hace
   * la pregunta final al instante; si falla, la repite al empezar su próximo turno.
   */
  const hasAllMedals = (p) => medalCount(p) >= MEDALS_TO_WIN;
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
    const canRoll = state.phase === 'idle' && !busy && !remote && !hasAllMedals(cur());
    $('btnRoll').disabled = !canRoll;
    let label = '⏳ Resolviendo…';
    if (state.phase === 'over') label = '🏁 Partida terminada';
    else if (state.phase === 'idle' && remote) label = '📱 Golpea desde su dispositivo';
    else if (state.phase === 'idle' && hasAllMedals(cur())) label = '🏆 Lance te espera…';
    else if (canRoll) label = '👊 ¡Golpear el bloque!';
    $('btnRoll').textContent = label;
    Board.setDiceCycling(state.phase === 'idle' && !busy && !hasAllMedals(cur()));
    applyLocks();
    notify();
  }

  /** Asientos en el orden de turnos (el de los dados de la ceremonia). */
  function turnOrder() {
    const seats = state.players.map((_, seat) => seat);
    return Array.isArray(state.order) && state.order.length === seats.length ? state.order : seats;
  }

  function renderPlayers() {
    // Los entrenadores se listan en el orden en que juegan.
    $('playersList').replaceChildren(
      ...turnOrder().map((i) => [state.players[i], i]).map(([p, i]) =>
        el('li', { class: `player-row ${i === state.current && state.phase !== 'over' ? 'current' : ''}`, style: { '--pc': p.color } }, [
          tokenNode(p),
          el('div', { class: 'player-info' }, [
            el('strong', { class: 'player-name', text: p.name }),
            el('span', { class: 'player-meta', text: `${readyForMedal(p) ? '🏅 Por la medalla' : `Aciertos ${p.streak}/${HITS_FOR_MEDAL}`} · ${medalCount(p)}/${MEDALS_TO_WIN} medallas` }),
            p.skipNext ? el('span', { class: 'player-flag', text: 'Pierde el próximo turno' }) : null,
            hasAllMedals(p) ? el('span', { class: 'player-flag race', text: '🏆 Desafío de la Liga' }) : null,
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
    document.querySelectorAll('#talkChoices .talk-choice').forEach((b) => {
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
    if (hasAllMedals(cur())) return startLeague();
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

  /**
   * Modo tester: el jugador en turno salta a la casilla anterior a `index` y
   * avanza 1, así se ve la llegada y el efecto de esa casilla. Solo al
   * empezar un turno. Para el Team Rocket, si nadie tiene algo para robar,
   * le da a un rival una medalla que el jugador en turno no tiene.
   */
  async function testSquare(index) {
    if (!state || state.phase !== 'idle' || busy || !Number.isInteger(index) || !BOARD_LAYOUT[index]) return false;
    const p = cur();
    const sq = BOARD_LAYOUT[index];
    if (sq.type === 'rocket' && !stealOptions(state.current).length) {
      const cat = CAT_KEYS.find((c) => !p.medals[c]);
      const rival = state.players.find((_, seat) => seat !== state.current);
      if (cat && rival) {
        rival.medals[cat] = true;
        addLog(`🧪 Prueba: ${rival.name} recibe la Medalla de ${CATS[cat].name} para que haya algo que robar.`, state.current);
      }
    }
    addLog(`🧪 Prueba: ${p.name} va a «${squareTitle(sq)}».`, state.current);
    p.pos = (index - 1 + BOARD_SIZE) % BOARD_SIZE;
    const run = gameId;
    busy = true;
    state.phase = 'busy';
    state.lastRoll = 1;
    state.pending = { type: 'move', steps: 1, depth: 0 };
    saveGame();
    renderAll();
    await delay(700); // la ficha se acomoda en la casilla anterior
    if (!alive(run)) return true;
    await runPending(run);
    return true;
  }

  // ═════════════════════ Modo debug (emergencias en vivo) ═════════════════════
  /*
   * Desde el panel del tester se puede corregir la partida si algo sale mal:
   * posición, medallas, aciertos y «pierde turno» de cada jugador, de quién es
   * el turno y forzar el fin de un turno trabado. Todo queda en el registro
   * con 🛠 y se guarda.
   */

  /** Corta lo que esté en curso (animaciones, ventanas, escenas) sin tocar la partida. */
  function interruptTurn() {
    gameId += 1; // las animaciones y escenas en curso dejan de avanzar
    busy = false;
    closeAllOverlays();
    Talk.close();
    view().resetScenes();
  }

  /** Cambia los datos de un jugador. `patch`: { pos?, medals?, streak?, skipNext? } */
  function debugSetPlayer(seat, patch) {
    const p = state && state.players[seat];
    if (!p || !patch) return false;
    const changes = [];
    if (Number.isInteger(patch.pos) && patch.pos >= 0 && patch.pos < BOARD_SIZE && patch.pos !== p.pos) {
      p.pos = patch.pos;
      changes.push(`casilla ${patch.pos}`);
    }
    if (patch.medals) {
      for (const c of CAT_KEYS) {
        if (typeof patch.medals[c] === 'boolean' && patch.medals[c] !== p.medals[c]) {
          p.medals[c] = patch.medals[c];
          changes.push(`${patch.medals[c] ? '+' : '−'}${CATS[c].name}`);
        }
      }
    }
    if (Number.isInteger(patch.streak) && patch.streak >= 0 && patch.streak <= HITS_FOR_MEDAL && patch.streak !== p.streak) {
      p.streak = patch.streak;
      changes.push(`aciertos ${patch.streak}`);
    }
    if (typeof patch.skipNext === 'boolean' && patch.skipNext !== p.skipNext) {
      p.skipNext = patch.skipNext;
      changes.push(patch.skipNext ? 'pierde el próximo turno' : 'ya no pierde turno');
    }
    if (!changes.length) return true;
    addLog(`🛠 Debug: ${p.name} → ${changes.join(', ')}.`, seat);
    saveGame();
    renderAll();
    // Con 4 medallas al empezar su turno, Lance llega solo.
    if (seat === state.current) scheduleLeagueRetry();
    return true;
  }

  /** Corta el turno actual (si quedó trabado) y le da el turno a `seat`. */
  function debugSetTurn(seat) {
    if (!state || state.phase === 'over' || !state.players[seat]) return false;
    interruptTurn();
    state.pending = null;
    state.phase = 'idle';
    state.current = seat;
    addLog(`🛠 Debug: turno de ${state.players[seat].name}.`, seat);
    saveGame();
    renderAll();
    view().turnStart(seat);
    scheduleLeagueRetry();
    return true;
  }

  /** Termina el turno en curso (pregunta, escena o animación trabada) y pasa al siguiente. */
  function debugEndTurn() {
    if (!state || state.phase === 'over') return false;
    interruptTurn();
    addLog(`🛠 Debug: se cerró el turno de ${cur().name}.`, state.current);
    endTurn();
    return true;
  }

  /**
   * Desafío de la Liga: llega Lance con Dragonite y hace la pregunta final.
   * La pregunta se crea y guarda al empezar (recargar no la pierde); el reloj
   * corre recién cuando Lance termina de hablar.
   */
  async function startLeague() {
    if (!state || state.phase === 'over') return;
    const p = cur();
    const run = gameId;
    state.phase = 'busy';
    const held = state.pending;
    if (!(held && held.type === 'question' && held.mode === 'final' && held.hold)) {
      addLog(`🏆 ${p.name} enfrenta el desafío de la Liga Pokémon.`, state.current);
      openQuestion(LEAGUE_KEY, 'final', { hold: true });
    }
    const pd = state.pending;
    renderAll();
    await view().visitorArrive('dragonite', state.current);
    if (!alive(run) || state.pending !== pd) return;
    await characterSays('lance', `¡Draaa! Soy Dragonite, el compañero de Lance, Campeón de la Liga Pokémon. ¡${p.name}, juntaste las ${MEDALS_TO_WIN} medallas! Responde bien y el título será tuyo.`);
    if (!alive(run) || state.pending !== pd) return;
    Talk.close();
    releaseQuestion();
  }

  /** Cierra el turno: con las 4 medallas recién juntadas, Lance llega al instante. */
  function finishTurn() {
    if (state && state.phase !== 'over' && hasAllMedals(cur())) return startLeague();
    return endTurn();
  }

  /**
   * Mew en Pueblo Paleta: al cruzar o caer en la salida yendo hacia adelante,
   * regala una medalla al azar entre las que faltan. Si con ella se juntan las
   * 4, la ficha se queda ahí y empieza el desafío de la Liga.
   * Devuelve 'league', 'continue' o false (partida cancelada).
   */
  async function mewGift(run, left, depth) {
    const p = cur();
    const missing = CAT_KEYS.filter((c) => !p.medals[c]);
    if (!missing.length) return 'continue';
    const cat = randomOf(missing);
    p.medals[cat] = true;
    // Se guarda ya, con lo que queda del movimiento: recargar no repite el regalo.
    state.pending = { type: 'move', steps: left, depth };
    addLog(`✨ Mew le regala a ${p.name} la ${CATS[cat].badgeName} (${CATS[cat].name}).`, state.current);
    const complete = hasAllMedals(p);
    if (complete) {
      addLog(`🏆 ${p.name} tiene las ${MEDALS_TO_WIN} medallas: ¡al desafío de la Liga!`, state.current);
      openQuestion(LEAGUE_KEY, 'final', { hold: true });
    }
    saveGame();
    renderAll();
    await view().visitorArrive('mew', state.current);
    if (!alive(run)) return false;
    Sound.play('medal');
    view().medalGift(state.current, cat);
    const extra = complete ? ` ¡Y ya tienes las ${MEDALS_TO_WIN}! Lance te espera…` : '';
    await characterSays('mew', `¡Mew, mew! ✨ Por pasar por Pueblo Paleta te regalo la ${CATS[cat].badgeName}.${extra}`);
    if (!alive(run)) return false;
    Talk.close();
    view().visitorLeave();
    if (complete) return 'league';
    if (left > 0) await view().beforeMove(state.current);
    return 'continue';
  }

  /** Ejecuta (o retoma tras recargar) el evento pendiente del turno. */
  async function runPending(run) {
    const pd = state.pending;
    if (!pd) return endTurn();
    switch (pd.type) {
      case 'move': {
        busy = true;
        renderTurnPanel();
        const result = await animateMove(pd.steps, run, pd.depth);
        if (!result) return;
        busy = false;
        if (result === 'league') return startLeague();
        state.pending = null;
        return landOn(pd.depth, run);
      }
      case 'question':
        // Pregunta retenida (un personaje estaba hablando): al retomar, se muestra ya.
        return pd.hold ? releaseQuestion() : showQuestion();
      case 'choose':
        return showChooser();
      case 'rocket':
        return showRocket();
      case 'opening':
        return runOpening(run);
      case 'info':
        return showInfo();
      case 'medal':
        return showMedal();
      default:
        console.warn('Evento pendiente desconocido, se pasa el turno:', pd);
        return endTurn();
    }
  }

  /**
   * 2) Mueve la ficha casillero por casillero. Devuelve false si se canceló,
   * 'league' si Mew completó las 4 medallas y true al terminar.
   */
  async function animateMove(steps, run, depth = 0) {
    const seat = state.current;
    const p = cur();
    const dir = Math.sign(steps);
    const total = Math.abs(steps);
    if (total === 0) return true;
    await view().beforeMove(seat);
    if (!alive(run)) return false;
    for (let k = 0; k < total; k++) {
      p.pos = (p.pos + dir + BOARD_SIZE) % BOARD_SIZE;
      // Al pasar por Pueblo Paleta (hacia adelante) aparece Mew: la ficha frena ahí.
      const mew = dir > 0 && p.pos === 0 && !hasAllMedals(p);
      renderTokens();
      view2D.step(seat);
      Sound.play('step');
      await Promise.all([delay(STEP_MS), view3d ? view3d.step(seat, p.pos, mew ? 0 : total - k - 1) : null]);
      if (!alive(run)) return false;
      if (mew) {
        const gift = await mewGift(run, total - k - 1, depth);
        if (gift !== 'continue') return gift;
      }
    }
    await view().afterMove(seat, p.pos);
    return alive(run);
  }

  /** 3) Aplica el efecto de la casilla donde cayó la ficha. */
  async function landOn(depth, run) {
    const p = cur();
    const sq = BOARD_LAYOUT[p.pos];
    renderAll();
    // Transición al caer: las casillas con escena propia (Team Rocket, Centro
    // Pokémon, Monte Moon, Dodrio, Diglett…) y las preguntas comunes siguen en
    // el plano cercano; las demás muestran su ventana enseguida mientras la
    // cámara sube a la vista de arriba (sin esperarla).
    if (!SCENE_SQUARES.includes(sq.type)) view().overview();

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
        view().announce(readyForMedal(p) ? `🏅 ¡Pregunta por la medalla de ${CATS[sq.cat].name}!` : `❓ ¡Pregunta de ${CATS[sq.cat].name}!`, CATS[sq.cat].color);
        view().questionShot(state.current);
        return openQuestion(sq.cat, 'normal', null, ANNOUNCE_MS);

      case 'medal': {
        const leader = LEADERS[sq.cat];
        if (p.medals[sq.cat]) {
          addLog(`${p.name} ya tiene la medalla de ${CATS[sq.cat].name}.`, state.current);
          await view().visitorArrive(leader.model, state.current);
          if (!alive(run)) return;
          await characterSays(leader.kind, `Ya tienes la ${CATS[sq.cat].badgeName}, ${p.name}. ¡${leader.leader} te espera cuando quieras una revancha!`);
          if (!alive(run)) return;
          Talk.close();
          view().visitorLeave();
          return endTurn();
        }
        addLog(`${p.name} cae en la medalla directa de ${CATS[sq.cat].name}.`, state.current);
        // La pregunta se guarda ya; el reloj corre cuando el líder termina de hablar.
        openQuestion(sq.cat, 'medal', { hold: true });
        const pd = state.pending;
        await view().visitorArrive(leader.model, state.current);
        if (!alive(run) || state.pending !== pd) return;
        await characterSays(leader.kind, leader.line(p.name, CATS[sq.cat].badgeName));
        if (!alive(run) || state.pending !== pd) return;
        Talk.close();
        return releaseQuestion();
      }

      case 'move': {
        if (depth >= MAX_CHAIN) return endTurn();
        const verb = sq.steps > 0 ? `avanza ${sq.steps}` : `retrocede ${-sq.steps}`;
        addLog(`${sq.name}: ${p.name} ${verb}.`, state.current);
        Sound.play('special');
        state.pending = { type: 'move', steps: sq.steps, depth: depth + 1 };
        saveGame();
        renderAll();
        const visitor = VISITOR_LINES[sq.art];
        if (visitor) {
          // Dodrio te lleva / Diglett te hace tropezar: el personaje aparece y habla.
          await view().visitorArrive(sq.art, state.current);
          if (!alive(run)) return;
          await characterSays(sq.art, visitor(p.name, Math.abs(sq.steps)));
          if (!alive(run)) return;
          Talk.close();
          if (sq.art === 'dodrio') view().visitorEscort(state.current);
          else view().visitorLeave();
        } else {
          toast(`${sq.name}: ${p.name} ${verb} casillas`);
          await delay(800);
          if (!alive(run)) return;
        }
        return runPending(run);
      }

      case 'skip':
        p.skipNext = true;
        addLog(`${p.name} se pierde en el Monte Moon.`, state.current);
        saveGame();
        await view().zubatAttack(state.current);
        if (!alive(run)) return;
        await Talk.say({ text: `¡Tres Zubat atacan a ${p.name} en el Monte Moon! Se pierde en la cueva y pierde su próximo turno.`, auto: true, narrator: true });
        if (!alive(run)) return;
        Talk.close();
        return endTurn();

      case 'rocket': {
        addLog(`🚀 ${p.name} cae en la casilla del Team Rocket.`, state.current);
        Sound.play('special');
        await view().rocketArrive(state.current);
        if (!alive(run)) return;
        const options = stealOptions(state.current);
        if (!options.length) {
          await meowthSays(`¡Miau, miau! Vinimos a ayudarte, ${p.name}… pero nadie tiene una medalla que te falte. ¡Qué pérdida de tiempo!`);
          if (!alive(run)) return;
          Talk.close();
          view().rocketLeave(false);
          return endTurn();
        }
        state.pending = { type: 'rocket', options, victim: null };
        saveGame();
        return showRocket(true);
      }

      case 'wild':
        addLog(`${p.name} llega al Centro Pokémon.`, state.current);
        state.pending = { type: 'choose', chosen: null };
        saveGame();
        return showChooser();

      case 'start':
      default:
        // Mew ya pasó al llegar (ver animateMove).
        addLog(`${p.name} descansa en Pueblo Paleta.`, state.current);
        return endTurn();
    }
  }

  /** 4) Pasa al siguiente jugador, saltando a quien deba perder el turno. */
  function endTurn() {
    if (!state || state.phase === 'over') return;
    state.pending = null;
    // El turno sigue el orden que salió de los dados al empezar.
    const order = turnOrder();
    let next = state.current;
    for (let guard = 0; guard < 8; guard++) {
      next = order[(order.indexOf(next) + 1) % order.length];
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
    scheduleLeagueRetry();
  }

  /** Con las 4 medallas, el turno empieza directo con el desafío de la Liga (tras el cartel del turno). */
  function scheduleLeagueRetry() {
    if (!state || state.phase !== 'idle' || !hasAllMedals(cur())) return;
    const run = gameId;
    const seat = state.current;
    delay(1500).then(() => {
      if (alive(run) && state.phase === 'idle' && state.current === seat) startLeague();
    });
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

  /** Centro Pokémon: llega Chansey y pregunta la categoría (opciones en la caja de diálogo). */
  async function showChooser() {
    const pd = state.pending;
    const p = cur();
    const run = gameId;
    renderAll();
    const chosenBefore = pd.chosen; // ya elegida antes de recargar
    await view().visitorArrive('chansey', state.current);
    if (!alive(run) || state.pending !== pd) return;
    if (pd.chosen) {
      // Se recargó a mitad de la escena: se retoma. Si se eligió mientras
      // Chansey llegaba (desde el celular), esa elección ya siguió su curso.
      if (chosenBefore) chooseCategory(pd.chosen, true);
      return;
    }
    const allowed = choosableCats(p);
    const choices = CAT_KEYS.map((c) => ({ value: c, label: CATS[c].name, node: categoryIcon(c), blocked: !allowed.includes(c) }));
    const ask = readyForMedal(p) ? '¡Tu próxima pregunta es por la medalla! ¿De qué categoría la quieres?' : '¿De qué categoría quieres tu pregunta?';
    const cat = await characterSays('chansey', `¡Bienvenido al Centro Pokémon, ${p.name}! ${ask}`, choices);
    applyLocks();
    if (cat == null || !alive(run) || state.pending !== pd) return;
    if (hostMayAct()) chooseCategory(cat);
  }

  async function chooseCategory(cat, resumed) {
    const pd = state && state.pending;
    if (!pd || pd.type !== 'choose' || !choosableCats(cur()).includes(cat)) return;
    if (pd.chosen && !resumed) return; // ya se eligió
    const run = gameId;
    if (!resumed) {
      pd.chosen = cat;
      saveGame();
      notify();
      addLog(`${cur().name} elige ${CATS[cat].name}.`, state.current);
    }
    await characterSays('chansey', `¡${CATS[cat].name}, muy bien! Te deseo mucha suerte.`);
    if (!alive(run) || state.pending !== pd) return;
    Talk.close();
    view().visitorLeave();
    openQuestion(cat, 'normal');
  }

  /**
   * Casillas que al caer se quedan en el plano cercano de la ficha (escena
   * propia o pregunta común); el resto sube a la vista de arriba.
   */
  const SCENE_SQUARES = ['move', 'rocket', 'wild', 'skip', 'medal', 'question'];

  /** Líderes de gimnasio de cada medalla directa, con su Pokémon. */
  const LEADERS = {
    // Habla el Pokémon del líder, en nombre de su entrenador.
    tipos: { kind: 'erika', model: 'tangela', leader: 'Erika', line: (n, b) => `Soy Tangela, del Gimnasio de Erika en Ciudad Azulona. Responde con calma, ${n}, y la ${b} será tuya.` },
    pokedex: { kind: 'brock', model: 'onix', leader: 'Brock', line: (n, b) => `¡Soy Onix, del Gimnasio de Brock en Ciudad Plateada! Si aciertas, ${n}, te llevas la ${b}.` },
    habilidades: { kind: 'surge', model: 'raichu', leader: 'Lt. Surge', line: (n, b) => `¡Rai, rai! Soy Raichu, del Gimnasio de Lt. Surge en Ciudad Carmín. Acierta, ${n}, y la ${b} es tuya.` },
    cambalache: { kind: 'koga', model: 'venomoth', leader: 'Koga', line: (n, b) => `Soy Venomoth, del Gimnasio de Koga en Ciudad Fucsia. Si tu respuesta es certera, ${n}, la ${b} será tuya.` },
  };

  /** Lo que dicen Dodrio, Diglett y Tentacool antes de mover la ficha. */
  const VISITOR_LINES = {
    tentacool: (name, n) => `¡Tenta, tentacool! Te atrapé, ${name}… las corrientes de las Islas Espuma te arrastran ${n} casillas hacia atrás.`,
    dodrio: (name, n) => `¡Dodrio, dodrio, dodrio! ¡Agárrate, ${name}! Te llevo ${n} casillas adelante.`,
    diglett: (name, n) => `¡Diglett, dig, dig! Ups… ${name} tropieza en un túnel y retrocede ${n} casillas.`,
  };

  // ═════════════════════ Team Rocket ═════════════════════

  /** Rivales a los que el ladrón puede robar: medallas que el rival tiene y él no. */
  function stealOptions(thiefSeat) {
    const thief = state.players[thiefSeat];
    return state.players
      .map((v, seat) => ({ seat, cats: CAT_KEYS.filter((c) => v.medals[c] && !thief.medals[c]) }))
      .filter((o) => o.seat !== thiefSeat && o.cats.length);
  }

  /** Quién habla en la caja de diálogo: nombre y retrato (el Pokémon). */
  const SPEAKERS = {
    meowth: { name: 'Meowth', art: 'meowth' },
    chansey: { name: 'Chansey', art: 'chansey' },
    dodrio: { name: 'Dodrio', art: 'dodrio' },
    diglett: { name: 'Diglett', art: 'diglett' },
    tentacool: { name: 'Tentacool', art: 'tentacool' },
    mew: { name: 'Mew', art: 'mew' },
    erika: { name: 'Tangela', art: 'tangela' },
    brock: { name: 'Onix', art: 'onix' },
    surge: { name: 'Raichu', art: 'raichu' },
    koga: { name: 'Venomoth', art: 'venomoth' },
    lance: { name: 'Dragonite', art: 'dragonite' },
  };

  /**
   * Un personaje habla en la caja de diálogo (y se mueve al hablar en 3D). Con
   * `choices` se resuelve con la opción elegida; si no, avanza solo o al tocar.
   */
  function characterSays(kind, text, choices) {
    view().characterCry();
    return Talk.say({
      name: SPEAKERS[kind].name,
      art: SPEAKERS[kind].art,
      text,
      choices,
      auto: !choices,
      onTalk: (on) => view().characterTalk(on),
    });
  }

  const meowthSays = (text, choices) => characterSays('meowth', text, choices);

  /**
   * Meowth se presenta y el ladrón elige a quién robarle (en la caja de
   * diálogo). `arrived`: el globo ya bajó (si no, se retoma tras recargar).
   */
  async function showRocket(arrived) {
    const pd = state.pending;
    const thief = cur();
    const run = gameId;
    const victimBefore = pd.victim; // ya elegida antes de recargar
    renderAll();
    if (!arrived) {
      Sound.play('special');
      await view().rocketArrive(state.current);
      if (!alive(run) || state.pending !== pd) return;
    }
    if (pd.victim != null) {
      // Se recargó a mitad de la escena: se retoma (si se eligió mientras
      // bajaba el globo, esa elección ya siguió su curso).
      if (victimBefore != null) chooseVictim(pd.victim, true);
      return;
    }
    await meowthSays(`¡Miau, miau! ¡El Team Rocket llegó para ayudarte, ${thief.name}!`);
    if (!alive(run) || state.pending !== pd || pd.victim != null) return;
    const choices = pd.options.map((o) => {
      const v = state.players[o.seat];
      const node = el('span', { class: 'talk-choice-player', style: { '--pc': v.color } }, [tokenNode(v), el('span', { class: 'rocket-medals' }, o.cats.map((c) => medalIcon(c)))]);
      return { value: o.seat, label: v.name, node };
    });
    const victim = await meowthSays('Te conseguimos una medalla que te falta… ¿A quién se la quitamos, miau?', choices);
    applyLocks();
    if (victim == null || !alive(run) || state.pending !== pd) return;
    if (hostMayAct()) chooseVictim(victim);
  }

  /** El ladrón eligió víctima: sale al azar una medalla robable y la víctima la defiende. */
  async function chooseVictim(seat, resumed) {
    const pd = state && state.pending;
    if (!pd || pd.type !== 'rocket') return;
    if (pd.victim != null && !resumed) return; // ya se eligió
    const option = pd.options.find((o) => o.seat === seat);
    if (!option) return;
    const run = gameId;
    const cat = pd.cat || randomOf(option.cats);
    if (!resumed) {
      pd.victim = seat;
      pd.cat = cat;
      saveGame();
      notify();
      addLog(`🚀 ${cur().name} intenta robarle la Medalla de ${CATS[cat].name} a ${state.players[seat].name}.`, state.current);
    }
    const v = state.players[seat];
    await meowthSays(`¡Buena elección! ${v.name}, si respondes bien, conservas tu Medalla de ${CATS[cat].name}. Si no… ¡es nuestra, miau!`);
    if (!alive(run) || state.pending !== pd) return;
    Talk.close();
    openQuestion(cat, 'defense', { answerer: seat, thief: state.current });
  }

  // ═════════════════════ Preguntas ═════════════════════

  /** Pausa entre el anuncio de la casilla y la ventana de la pregunta (la cámara sube mientras tanto). */
  const ANNOUNCE_MS = 900;

  /**
   * Abre una pregunta. `extra` permite que responda otro jugador (defensa del
   * Team Rocket: { answerer, thief }). `lead`: la pregunta queda creada y
   * guardada ya (recargar no la pierde), pero la ventana aparece `lead` ms
   * después y el reloj empieza a correr recién entonces.
   */
  function openQuestion(cat, mode, extra, lead = 0) {
    const hold = !!(extra && extra.hold); // un personaje habla antes: sin reloj ni ventana hasta releaseQuestion()
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
      deadline: hold ? null : Date.now() + lead + ANSWER_MS, // se responde dentro de ANSWER_SECONDS (tras el anuncio)
      ...(extra || {}),
      hold,
    };
    saveGame();
    if (hold) return notify();
    if (!lead) return showQuestion();
    const pd = state.pending;
    const run = gameId;
    notify();
    return delay(lead).then(() => {
      if (alive(run) && state.pending === pd) showQuestion();
    });
  }

  /** Muestra la pregunta retenida y pone a correr el reloj. */
  function releaseQuestion() {
    const pd = state && state.pending;
    if (!pd || pd.type !== 'question' || !pd.hold) return;
    pd.hold = false;
    pd.deadline = Date.now() + ANSWER_MS;
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
    // Pregunta común: la ventana va arriba y la ficha se ve abajo (plano cercano).
    $('questionDialog').classList.toggle('q-top', pd.mode === 'normal');

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
      addLog(`🏆 ${state.players[who].name} tiene ${MEDALS_TO_WIN} medallas: ¡al desafío de la Liga!`, who);
    }

    Sound.play(correct ? 'correct' : 'wrong');
    if (outcome.medal === 'new' || outcome.stolen) setTimeout(() => Sound.play('medal'), 350);
    view().react(seat, { correct, medal: outcome.medal === 'new' ? outcome.cat : null });

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
    const goal = o.reachedGoal ? ` ¡Ya tienes las ${MEDALS_TO_WIN} medallas! Lance te espera para el desafío de la Liga Pokémon.` : '';
    if (pd.mode === 'defense') {
      const victim = state.players[pd.answerer].name;
      const thief = state.players[pd.thief].name;
      if (o.correct) return `¡${victim} defendió su Medalla de ${catName}! ¡El Team Rocket sale volando otra vez!`;
      return `¡El Team Rocket se lleva la Medalla de ${catName} de ${victim} para ${thief}!${o.reachedGoal ? ` ¡${thief} ya tiene las ${MEDALS_TO_WIN} medallas: a Pueblo Paleta!` : ''}`;
    }
    if (pd.mode === 'final') {
      return o.correct ? '¡Venciste el desafío de la Liga Pokémon! ¡Eres el nuevo Campeón!' : 'Lance te espera: en tu próximo turno respondes otro desafío de la Liga.';
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

  let rocketScene = false; // la escena final del Team Rocket se está mostrando

  async function onQuestionContinue() {
    if (!state || rocketScene) return;
    if (state.phase === 'over') {
      closeOverlay('questionDialog');
      return showVictory();
    }
    const pd = state.pending;
    if (!pd || pd.type !== 'question' || !pd.answered) return;
    closeOverlay('questionDialog');
    if (pd.mode === 'defense') return rocketFinale(pd);
    if (pd.mode === 'medal' || pd.mode === 'final') view().visitorLeave(); // el líder o Lance se despiden
    if (pd.outcome.medal === 'new') {
      state.pending = { type: 'medal', cat: pd.outcome.cat || pd.cat };
      saveGame();
      return showMedal();
    }
    endTurn();
  }

  /** Cierre de la escena del Team Rocket: la medalla vuela al ladrón o el globo sale volando. */
  async function rocketFinale(pd) {
    const run = gameId;
    const thief = state.players[pd.thief];
    const victim = state.players[pd.answerer];
    rocketScene = true;
    try {
      if (pd.outcome.stolen) {
        Sound.play('medal');
        const goal = pd.outcome.reachedGoal ? ` ¡Y con esta ya tienes las ${MEDALS_TO_WIN}! Lance te espera…` : '';
        await Promise.all([view().steal(pd.answerer, pd.thief, pd.cat), meowthSays(`¡Miau-ravilloso! La Medalla de ${CATS[pd.cat].name} de ${victim.name} ahora es tuya, ${thief.name}.${goal}`)]);
      } else {
        await meowthSays(`¡¿Quéee?! ${victim.name} sabía la respuesta… ¡Esto no estaba en el plan, miau!`);
        if (!alive(run)) return;
        Talk.close();
        await view().rocketLeave(true);
        if (!alive(run)) return;
        await Talk.say({ text: '¡El Team Rocket sale volando otra vez!', auto: true, narrator: true });
      }
    } finally {
      rocketScene = false;
    }
    if (!alive(run)) return;
    Talk.close();
    endTurn();
  }

  function showMedal() {
    const pd = state.pending;
    const p = cur();
    renderAll();
    $('medalBig').replaceChildren(medalIcon(pd.cat));
    $('medalTitle').textContent = `¡${CATS[pd.cat].badgeName}!`;
    $('medalText').textContent = (hasAllMedals(p)
      ? `Medalla de ${CATS[pd.cat].name}. ¡${p.name} tiene las ${MEDALS_TO_WIN} medallas! Ahora enfrenta a Lance en el desafío de la Liga Pokémon.`
      : `Medalla de ${CATS[pd.cat].name}. ${p.name} tiene ${medalCount(p)} de las ${MEDALS_TO_WIN} que necesita.`);
    Sound.cry(p.creature);
    openOverlay('medalDialog');
  }

  function onMedalOk() {
    if (!state || state.pending?.type !== 'medal') return;
    closeOverlay('medalDialog');
    finishTurn();
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
    s.log.push({ t: '¡Comienza la partida! Cada entrenador tira el dado: el orden de turnos va del número más alto al más bajo.', p: 0 });
    // La partida arranca con la ceremonia de presentación (se retoma si se recarga).
    s.phase = 'busy';
    s.pending = { type: 'opening' };
    mountGame(s);
    saveGame();
    runPending(gameId);
  }

  /**
   * Ceremonia de inicio: se presenta cada entrenador y tira el dado. El orden
   * de turnos va del número más alto al más bajo; los que empatan vuelven a
   * tirar entre ellos para ordenarse.
   */
  async function runOpening(run) {
    await view().openingIntro();
    if (!alive(run)) return;

    /** Cada uno de `group` tira el dado (con su presentación). Devuelve los números o null si se canceló. */
    const rollAll = async (group, tiebreak) => {
      const rolls = new Map();
      for (const seat of group) {
        const p = state.players[seat];
        state.current = seat; // el panel muestra a quién le toca tirar
        renderTurnPanel();
        view().announce(tiebreak ? `¡${p.name} desempata!` : `¡${p.name}!`, p.color);
        Sound.cry(p.creature);
        const n = 1 + Math.floor(Math.random() * DICE_MAX);
        rolls.set(seat, n);
        Board.hitDice(n);
        await Promise.all([delay(1200), view().openingRoll(seat, n)]);
        if (!alive(run)) return null;
        addLog(`🎲 ${p.name} sacó un ${n}.`, seat);
        renderLog();
      }
      return rolls;
    };

    /** Ordena `group` por sus dados (de mayor a menor); los empates se desempatan tirando de nuevo. */
    const rank = async (group, tiebreak) => {
      if (group.length < 2) return group;
      const rolls = await rollAll(group, tiebreak);
      if (!rolls) return null;
      const values = [...new Set(rolls.values())].sort((a, b) => b - a);
      const out = [];
      for (const v of values) {
        const tied = group.filter((seat) => rolls.get(seat) === v);
        if (tied.length > 1) {
          addLog(`🎲 ¡Empate en ${v} entre ${tied.map((seat) => state.players[seat].name).join(' y ')}! Desempatan.`, tied[0]);
          view().announce(`¡Empate en ${v}!`, '#f8c630');
          await delay(1400);
          if (!alive(run)) return null;
        }
        const sub = await rank(tied, true);
        if (!sub) return null;
        out.push(...sub);
      }
      return out;
    };

    const order = await rank(state.players.map((_, seat) => seat), false);
    if (!order) return;
    const winner = order[0];
    const starter = state.players[winner];
    state.order = order;
    addLog(`🏁 Orden de juego: ${order.map((seat) => state.players[seat].name).join(' → ')}.`, winner);
    toast(`¡A jugar! Empieza ${starter.name}`);
    view().announce(`¡Empieza ${starter.name}!`, starter.color);
    state.current = winner;
    state.pending = null;
    state.phase = 'idle';
    busy = false;
    saveGame();
    renderAll();
    pulseTurn();
    view().turnStart(winner);
    Sound.cry(starter.creature);
  }

  function resumeGame(saved) {
    mountGame(saved);
    toast('Partida recuperada');
    // Si se cerró a mitad de un evento, se retoma ese mismo evento.
    if (state.phase === 'busy') runPending(gameId);
    else scheduleLeagueRetry();
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
        if (!pd || pd.type !== 'question' || pd.answered || pd.hold) return false;
        if (!Number.isInteger(action.i) || action.i < 0 || action.i > 3) return false;
        answerQuestion(action.i);
        return true;
      case 'choose':
        if (!pd || pd.type !== 'choose' || pd.chosen || !choosableCats(cur()).includes(action.cat)) return false;
        Talk.close(); // si eligió desde el celular, se cierran las opciones de esta pantalla
        chooseCategory(action.cat);
        return true;
      case 'steal':
        if (!pd || pd.type !== 'rocket' || pd.victim != null || !pd.options.some((o) => o.seat === action.victim)) return false;
        Talk.close(); // si eligió desde el celular, se cierran las opciones de esta pantalla
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
    // Pregunta retenida: el dispositivo espera a que el personaje termine de hablar.
    if (pd.type === 'question' && pd.hold) return { type: 'scene' };
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
    if (pd.type === 'rocket') return { type: 'rocket', victim: pd.victim ?? null, options: pd.options.map((o) => ({ seat: o.seat, cats: [...o.cats] })) };
    if (pd.type === 'medal') return { type: 'medal', cat: pd.cat };
    if (pd.type === 'choose') return { type: 'choose', chosen: pd.chosen || null };
    return { type: pd.type };
  }

  /** Copia de la partida apta para enviar a los dispositivos. */
  function publicView() {
    if (!state) return null;
    return {
      phase: state.phase,
      busy,
      current: state.current,
      order: turnOrder(),
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
        league: hasAllMedals(p),
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
    /** Modo tester: el jugador en turno va a esa casilla (ver testSquare). */
    testSquare: (index) => testSquare(index),
    /** Modo debug: correcciones de emergencia desde el panel del tester. */
    debug: {
      setPlayer: (seat, patch) => debugSetPlayer(seat, patch),
      setTurn: (seat) => debugSetTurn(seat),
      endTurn: () => debugEndTurn(),
    },
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
