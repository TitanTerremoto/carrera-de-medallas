/*
 * Control del jugador (celular u otra pestaña).
 *
 * No guarda ni calcula la partida: se conecta a la ventana espectador,
 * envía intenciones (lanzar, responder, elegir, continuar) y dibuja la foto
 * que recibe. La respuesta correcta solo llega después de responder.
 *
 * El asiento se recuerda con un token en localStorage, así que si el
 * teléfono se bloquea o se recarga la página, vuelve a su lugar solo.
 */
(function () {
  'use strict';

  const { $, el, toast } = window.Dom;
  const { CATS, CAT_KEYS, STREAK_GOAL, DICE_MAX, ANSWER_SECONDS } = window.GameConfig;
  const { CREATURES, creatureIcon, categoryIcon, medalIcon, typeIcons, pokemonIcon } = window.GameArt;
  const Sound = window.GameSound;
  const Net = window.NetProtocol;

  const RETRY_MS = 2500;
  const SCREENS = ['scrCode', 'scrConnecting', 'scrJoin', 'scrWait', 'scrPlay'];

  let code = Net.normalizeCode(new URLSearchParams(window.location.search).get('sala'));
  let peer = null;
  let conn = null;
  let retryTimer = null;
  let last = null; // último { room, you, lobby, game }
  let sending = false; // hay una acción enviada esperando respuesta
  let me = null; // { seat, token, name, creature }
  let joinSeat = null;
  let joinCreature = null;
  let prevTurnMine = false;
  let answerDeadline = null; // hora local en la que vence la pregunta abierta
  let lastAnswerSeen = null;

  /*
   * Datos guardados del jugador.
   * - Asiento y token: sessionStorage (uno por pestaña, sobrevive a recargar).
   *   Así dos pestañas de la misma PC son dos jugadores distintos.
   * - Nombre y criatura: localStorage, solo para no volver a escribirlos.
   */
  const seatKey = () => `carreraMedallas.ctrl.${code}`;
  const PROFILE_KEY = 'carreraMedallas.ctrl.profile';

  function readJson(storage, key) {
    try {
      return JSON.parse(storage.getItem(key));
    } catch (err) {
      console.warn('No se pudieron leer tus datos guardados:', err);
      return null;
    }
  }

  function loadMe() {
    const seat = readJson(sessionStorage, seatKey());
    const profile = readJson(localStorage, PROFILE_KEY) || {};
    return {
      seat: seat && Number.isInteger(seat.seat) ? seat.seat : null,
      token: seat && typeof seat.token === 'string' ? seat.token : Net.newToken(),
      name: typeof profile.name === 'string' ? profile.name : '',
      creature: typeof profile.creature === 'string' ? profile.creature : null,
    };
  }

  function saveMe() {
    try {
      sessionStorage.setItem(seatKey(), JSON.stringify({ seat: me.seat, token: me.token }));
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: me.name, creature: me.creature }));
    } catch (err) {
      console.warn('No se pudieron guardar tus datos:', err);
    }
  }

  // ── Pantallas ──
  function show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
  }

  function setStatus(text, kind) {
    $('ctrlStatus').textContent = text;
    $('ctrlStatus').className = `ctrl-status ${kind || ''}`;
  }

  // ── Conexión ──
  function connect() {
    clearTimeout(retryTimer);
    if (typeof window.Peer !== 'function') {
      setStatus('Error', 'bad');
      $('connectingText').textContent = 'No se pudo cargar la librería de conexión. Revisa tu internet y recarga.';
      show('scrConnecting');
      return;
    }
    show(last ? currentScreen() : 'scrConnecting');
    setStatus('Conectando…', 'wait');
    if (!peer || peer.destroyed) {
      peer = new window.Peer({ debug: 1 });
      peer.on('open', openConn);
      peer.on('disconnected', () => {
        if (peer && !peer.destroyed) peer.reconnect();
      });
      peer.on('error', (err) => {
        console.warn('Error de conexión:', err.type, err);
        if (err.type === 'peer-unavailable') {
          $('connectingText').textContent = `No se encuentra la sala ${code}. ¿Está abierta la pantalla principal?`;
          setStatus('Sala no encontrada', 'bad');
          if (!last) show('scrConnecting');
        } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          peer.destroy();
          peer = null;
          setStatus('Sin conexión', 'bad');
        }
        retryLater();
      });
    } else if (peer.open) {
      openConn();
    }
  }

  function openConn() {
    if (conn && conn.open) return;
    conn = peer.connect(Net.ROOM_PREFIX + code, { reliable: true });
    conn.on('open', () => {
      setStatus(`Sala ${code}`, 'ok');
      // Si ya teníamos asiento, lo recuperamos automáticamente.
      if (me.seat != null) sendJoin(me.seat);
    });
    conn.on('data', onMessage);
    conn.on('close', () => {
      setStatus('Reconectando…', 'wait');
      retryLater();
    });
    conn.on('error', (err) => {
      console.warn('Error en la conexión con la sala:', err);
      retryLater();
    });
  }

  function retryLater() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  }

  function send(msg) {
    if (!conn || !conn.open) {
      toast('Sin conexión con la sala. Reintentando…');
      return false;
    }
    conn.send(msg);
    return true;
  }

  function sendJoin(seat) {
    send({ t: 'join', seat, token: me.token, name: me.name, creature: me.creature });
  }

  function act(a, extra) {
    if (sending) return;
    if (send({ t: 'act', a, ...(extra || {}) })) {
      sending = true;
      render();
    }
  }

  function onMessage(msg) {
    if (!Net.isMessage(msg)) return;
    if (msg.t === 'state') {
      last = msg;
      const pq = msg.game && msg.game.pending;
      answerDeadline = pq && pq.type === 'question' && !pq.answered && pq.timeLeftMs != null ? Date.now() + pq.timeLeftMs : null;
      sending = false;
      render();
    } else if (msg.t === 'kicked') {
      // El mismo asiento se abrió en otro dispositivo: no peleamos por él.
      me.seat = null;
      saveMe();
      toast('Tu asiento se abrió en otro dispositivo.');
    } else if (msg.t === 'joined') {
      me.seat = msg.seat;
      saveMe();
      $('joinError').textContent = '';
    } else if (msg.t === 'error') {
      sending = false;
      $('joinError').textContent = String(msg.msg || 'Error');
      toast(String(msg.msg || 'Error'));
      // Si el asiento guardado ya no es nuestro, lo olvidamos.
      if (last && last.you == null) {
        me.seat = null;
        saveMe();
      }
      render();
    }
  }

  // ── Dibujo ──
  function currentScreen() {
    if (!last) return 'scrConnecting';
    if (last.you == null) return 'scrJoin';
    return last.game ? 'scrPlay' : 'scrWait';
  }

  function render() {
    if (!code) return show('scrCode');
    const screen = currentScreen();
    show(screen);
    if (screen === 'scrJoin') renderJoin();
    if (screen === 'scrWait') renderWait();
    if (screen === 'scrPlay') renderPlay();
  }

  function token(p, cls) {
    return el('div', { class: `token ${cls || ''}`, style: { '--pc': p.color } }, [p.creature ? creatureIcon(p.creature) : el('span', { text: '?' })]);
  }

  function renderJoin() {
    const inGame = !!last.game;
    const seats = inGame ? last.game.players.map((p, i) => ({ ...p, connected: last.lobby[i].connected })) : last.lobby;
    $('joinTitle').textContent = inGame ? 'La partida ya empezó: ¿quién eres?' : 'Elige tu asiento';
    $('joinProfile').hidden = inGame;

    if (joinSeat == null || joinSeat < 0 || seats[joinSeat]?.connected) joinSeat = seats.findIndex((s) => !s.connected);
    $('seatList').replaceChildren(
      ...seats.map((s, i) =>
        el(
          'button',
          {
            class: `ctrl-seat ${joinSeat === i ? 'selected' : ''}`,
            style: { '--pc': s.color },
            attrs: { type: 'button', role: 'radio', 'aria-checked': String(joinSeat === i), disabled: s.connected },
            on: {
              click: () => {
                joinSeat = i;
                if (!inGame && !me.name && s.name) me.name = s.name;
                render();
              },
            },
          },
          [token(s), el('strong', { text: s.name || `Jugador ${i + 1}` }), el('small', { text: s.connected ? 'Ocupado' : 'Libre' })],
        ),
      ),
    );

    if (!inGame) {
      if ($('nameInput').value !== me.name && document.activeElement !== $('nameInput')) $('nameInput').value = me.name;
      joinCreature = joinCreature || me.creature;
      const takenBy = new Map();
      seats.forEach((s, i) => {
        if (s.creature && i !== joinSeat) takenBy.set(s.creature, i);
      });
      if (joinCreature && takenBy.has(joinCreature)) joinCreature = null;
      $('creaturePicker').replaceChildren(
        ...CREATURES.map((c) =>
          el(
            'button',
            {
              class: `creature-option ${joinCreature === c.id ? 'selected' : ''}`,
              style: { '--pc': seats[joinSeat]?.color || '#495057' },
              attrs: { type: 'button', 'aria-pressed': String(joinCreature === c.id), 'aria-label': c.name, disabled: takenBy.has(c.id) },
              on: {
                click: () => {
                  joinCreature = c.id;
                  render();
                },
              },
            },
            [creatureIcon(c.id)],
          ),
        ),
      );
    }
    $('btnJoin').disabled = joinSeat < 0;
  }

  function onJoinClick() {
    if (!last || joinSeat == null || joinSeat < 0) return;
    if (!last.game) {
      me.name = $('nameInput').value.trim();
      me.creature = joinCreature;
      if (!me.name) return ($('joinError').textContent = 'Escribe tu nombre.');
      if (!me.creature) return ($('joinError').textContent = 'Elige una ficha.');
    }
    me.seat = joinSeat;
    saveMe();
    sendJoin(joinSeat);
  }

  function lobbyRows(list, current) {
    return list.map((s, i) =>
      el('li', { class: `ctrl-lobby-row ${i === current ? 'current' : ''} ${i === last.you ? 'mine' : ''}`, style: { '--pc': s.color } }, [
        token(s),
        el('span', { class: 'ctrl-lobby-name', text: s.name || `Jugador ${i + 1}` }),
        s.medals
          ? el('span', { class: 'ctrl-mini' }, CAT_KEYS.map((c) => el('span', { class: `mini-medal ${s.medals[c] ? 'owned' : ''}` }, [medalIcon(c)])))
          : el('small', { text: s.connected ? '📱 Conectado' : 'En la pantalla' }),
      ]),
    );
  }

  function renderWait() {
    const mine = last.lobby[last.you];
    $('waitMe').replaceChildren(token(mine, 'token-lg'), el('div', {}, [el('small', { text: `Jugador ${last.you + 1}` }), el('strong', { text: mine.name })]));
    $('lobbyList').replaceChildren(...lobbyRows(last.lobby, -1));
  }

  function streakPips(n) {
    return el('span', { class: 'streak-pips' }, Array.from({ length: STREAK_GOAL }, (_, k) => el('span', { class: `pip-streak ${k < n ? 'on' : ''}` })));
  }

  function renderPlay() {
    const g = last.game;
    const mineIdx = last.you;
    const p = g.players[mineIdx];
    const myTurn = g.phase !== 'over' && g.current === mineIdx;

    // Aviso al empezar mi turno: vibración y sonido.
    if (myTurn && !prevTurnMine) {
      vibrate([120, 60, 120]);
      Sound.play('special');
    }
    prevTurnMine = myTurn;

    $('playMe').style.setProperty('--pc', p.color);
    $('playMe').classList.toggle('my-turn', myTurn);
    $('playMe').replaceChildren(
      token(p, 'token-lg'),
      el('div', { class: 'ctrl-me-info' }, [
        el('strong', { text: p.name }),
        el('span', { class: 'ctrl-streak' }, [streakPips(p.streak), ` Racha ${p.streak}/${STREAK_GOAL}`]),
        p.racing ? el('span', { class: 'ctrl-race', text: p.atFinal ? '🏆 Desafío de la Liga Pokémon' : '🏁 ¡Corre a Pueblo Paleta!' }) : null,
      ]),
      el(
        'div',
        { class: 'ctrl-mini ctrl-mini-lg' },
        CAT_KEYS.map((c) => el('span', { class: `mini-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: CATS[c].name } }, [medalIcon(c)])),
      ),
    );
    $('actionCard').replaceChildren(...actionContent(g, mineIdx, myTurn));
    $('scoreList').replaceChildren(...lobbyRows(g.players, g.phase === 'over' ? -1 : g.current));
  }

  function waitingFor(g, text) {
    const cp = g.players[g.current];
    return [el('div', { class: 'ctrl-waiting', style: { '--pc': cp.color } }, [token(cp, 'token-lg'), el('p', { text: text || `Turno de ${cp.name}` })])];
  }

  function bigButton(label, onClick, cls) {
    return el('button', { class: `btn btn-primary btn-big ctrl-wide ${cls || ''}`, text: label, attrs: { type: 'button', disabled: sending }, on: { click: onClick } });
  }

  /**
   * Bloque de dado del celular. Sin número: los números giran y al tocarlo
   * se envía el golpe (el número lo sortea la pantalla principal y el bloque
   * sigue girando hasta recibirlo). Con número: muestra el resultado.
   */
  function diceBlock(result) {
    if (result) {
      return [
        el('div', { class: 'dice-block ctrl-block hit', attrs: { 'aria-hidden': 'true' } }, [el('span', { text: String(result) })]),
        el('p', { class: 'ctrl-center-text', text: `¡Sacaste ${result}!` }),
      ];
    }
    return [
      el('p', { class: 'ctrl-center-text', text: '¡Es tu turno! Golpea el bloque' }),
      el(
        'button',
        {
          class: 'dice-block ctrl-block cycling',
          attrs: { type: 'button', 'aria-label': 'Golpear el bloque de dado', disabled: sending },
          on: { click: () => act('roll') },
        },
        [el('span', { class: 'ctrl-block-num', text: '?' })],
      ),
    ];
  }

  // Cuenta regresiva local de la pregunta (la decisión final es de la pantalla principal).
  setInterval(() => {
    const box = document.querySelector('.ctrl-question .q-timer');
    if (!box || !answerDeadline) return;
    const left = Math.max(0, answerDeadline - Date.now());
    const secs = Math.ceil(left / 1000);
    box.classList.toggle('urgent', secs <= 5);
    box.querySelector('.q-timer-fill').style.width = `${(left / (ANSWER_SECONDS * 1000)) * 100}%`;
    box.querySelector('.q-timer-text').textContent = `⏱ ${secs} s`;
  }, 250);

  // Los números del bloque giran mientras esté en pantalla.
  setInterval(() => {
    const num = document.querySelector('.ctrl-block.cycling .ctrl-block-num');
    if (num) num.textContent = String((Number(num.textContent) || 0) % DICE_MAX + 1);
  }, 70);

  /** Contenido de la tarjeta principal según el evento en curso. */
  function actionContent(g, mineIdx, myTurn) {
    const pd = g.pending;
    const cp = g.players[g.current];

    if (g.phase === 'over') {
      const w = g.players[g.winner];
      const out = [el('div', { class: 'ctrl-winner', style: { '--pc': w.color } }, [token(w, 'token-xl'), el('h2', { text: `🏆 ¡Ganó ${w.name}!` })])];
      if (pd && pd.type === 'question' && g.winner === mineIdx) out.push(questionView(pd, true), bigButton('🏆 Ver celebración', () => act('continue')));
      return out;
    }

    if (!pd) {
      if (g.phase === 'idle' && myTurn && g.players[mineIdx].atFinal) {
        return [el('p', { class: 'ctrl-center-text', text: '¡Llegaste a Pueblo Paleta! Vence a la Liga Pokémon y serás Campeón.' }), bigButton('🏆 Desafío de la Liga', () => act('roll'))];
      }
      if (g.phase === 'idle') return myTurn ? diceBlock() : waitingFor(g);
      return myTurn && g.lastRoll ? diceBlock(g.lastRoll) : waitingFor(g, `${cp.name} se mueve…`);
    }

    switch (pd.type) {
      case 'move':
        if (myTurn && g.lastRoll) return diceBlock(g.lastRoll);
        return waitingFor(g, g.lastRoll ? `👊 ${cp.name} sacó ${g.lastRoll}…` : `${cp.name} se mueve…`);
      case 'question': {
        const out = [questionView(pd, myTurn)];
        if (pd.answered && myTurn) out.push(bigButton(pd.outcome.won ? '🏆 Ver celebración' : 'Continuar ➜', () => act('continue')));
        if (!myTurn && !pd.answered) out.unshift(el('p', { class: 'ctrl-small', text: `Responde ${cp.name}:` }));
        return out;
      }
      case 'choose':
        if (!myTurn) return waitingFor(g, `${cp.name} está eligiendo categoría…`);
        return [
          el('h2', { text: '¡Centro Pokémon! Elige la categoría' }),
          el(
            'div',
            { class: 'choose-grid' },
            CAT_KEYS.map((c) =>
              el(
                'button',
                { class: 'choose-btn', style: { '--cat': CATS[c].color }, attrs: { type: 'button', disabled: sending }, on: { click: () => act('choose', { cat: c }) } },
                [categoryIcon(c), el('span', { text: CATS[c].name })],
              ),
            ),
          ),
        ];
      case 'info':
        return [el('h2', { text: pd.title }), el('p', { text: pd.text }), myTurn ? bigButton('Continuar ➜', () => act('continue')) : null].filter(Boolean);
      case 'medal':
        return [
          el('div', { class: 'medal-big' }, [medalIcon(pd.cat)]),
          el('h2', { class: 'ctrl-center-text', text: `¡Medalla de ${CATS[pd.cat].name} para ${cp.name}!` }),
          myTurn ? bigButton('¡Genial! ➜', () => act('continue')) : null,
        ].filter(Boolean);
      default:
        return waitingFor(g);
    }
  }

  /** Imagen de assets/ con una ruta que mandó la pantalla principal (solo rutas locales). */
  function artImg(src, cls) {
    const safe = /^assets\/[a-z0-9/_-]+\.png$/.test(src) ? src : '';
    const node = pokemonIcon('pikachu', cls);
    node.src = safe;
    return node;
  }

  /** Tarjeta de pregunta; las opciones solo son botones activos para quien responde. */
  function questionView(pd, mine) {
    const cat = CATS[pd.cat];
    const answerKey = `${pd.text}|${pd.chosen}`;
    if (pd.answered && mine && lastAnswerSeen !== answerKey) {
      lastAnswerSeen = answerKey;
      Sound.play(pd.outcome.correct ? 'correct' : 'wrong');
      vibrate(pd.outcome.correct ? 60 : [200, 80, 200]);
    }
    const letters = ['A', 'B', 'C', 'D'];
    return el('div', { class: 'ctrl-question', style: { '--cat': cat.color } }, [
      el('div', { class: 'ctrl-q-head' }, [
        pd.mode === 'medal' ? medalIcon(pd.cat) : categoryIcon(pd.cat),
        el('div', {}, [el('small', { text: { medal: '🏅 Medalla directa', final: '🏆 Desafío final' }[pd.mode] || 'Pregunta' }), el('strong', { text: cat.name })]),
      ]),
      pd.art && pd.art.length ? el('div', { class: 'q-art' }, pd.art.map((src) => artImg(src, 'q-art-img'))) : null,
      el('p', { class: 'q-text', text: pd.text }),
      !pd.answered && answerDeadline ? el('div', { class: 'q-timer' }, [el('div', { class: 'q-timer-fill' }), el('span', { class: 'q-timer-text' })]) : null,
      el(
        'div',
        { class: 'ctrl-options' },
        pd.options.map((opt, i) => {
          const classes = ['q-option'];
          if (pd.answered && i === pd.correct) classes.push('correct');
          if (pd.answered && i === pd.chosen) classes.push('chosen');
          if (pd.answered && i === pd.chosen && i !== pd.correct) classes.push('wrong');
          return el(
            'button',
            {
              class: classes.join(' '),
              attrs: { type: 'button', disabled: !mine || pd.answered || sending },
              on: { click: () => act('answer', { i }) },
            },
            [el('span', { class: 'q-letter', text: letters[i] }), ...typeIcons(opt), el('span', { class: 'q-option-text', text: opt })],
          );
        }),
      ),
      pd.answered
        ? el('div', { class: 'q-feedback' }, [
            el('strong', {
              class: pd.outcome.correct ? 'ok' : 'bad',
              text: pd.outcome.correct ? '✔ ¡Correcto!' : `${pd.outcome.timeout ? '⏰ ¡Se acabó el tiempo!' : '✘ Incorrecto.'} Era: ${pd.options[pd.correct]}`,
            }),
            pd.revealArt ? el('div', { class: 'q-reveal' }, [artImg(pd.revealArt, 'q-reveal-img')]) : null,
            el('p', { text: pd.explain }),
            el('p', { class: `q-outcome ${pd.outcome.medal ? 'medal-line' : ''}`, text: pd.outcome.message }),
          ])
        : null,
    ]);
  }

  /** Vibra solo si el navegador lo permite (requiere que la persona ya haya tocado la página). */
  function vibrate(pattern) {
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(pattern);
  }

  // ── Mantener la pantalla encendida mientras se juega ──
  async function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      await navigator.wakeLock.request('screen');
    } catch (err) {
      console.warn('No se pudo mantener la pantalla encendida:', err);
    }
  }

  // ── Inicio ──
  function start() {
    me = loadMe();
    connect();
    render();
    keepAwake();
  }

  $('codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = Net.normalizeCode($('codeInput').value);
    if (!c) return toast('El código tiene 5 letras o números.');
    code = c;
    history.replaceState(null, '', `?sala=${c}`);
    start();
  });
  $('nameInput').addEventListener('input', (e) => {
    me.name = e.target.value;
  });
  $('btnJoin').addEventListener('click', onJoinClick);
  $('btnLeave').addEventListener('click', () => {
    send({ t: 'leave' });
    me.seat = null;
    saveMe();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    keepAwake();
    // Al volver a la pestaña, si la conexión cayó, se reintenta enseguida.
    if (code && (!conn || !conn.open)) connect();
  });

  if (code) start();
  else show('scrCode');
})();
