/*
 * Pantalla de espectador: index.html?espectador=CÓDIGO
 *
 * Se conecta a la sala como dispositivo de solo lectura (no ocupa asiento ni
 * puede actuar) y reproduce lo que presenta la pantalla principal: tablero
 * 3D con sus animaciones, diálogos, sonidos y ventanas. Sirve para que otros
 * streamers muestren la partida en su propio stream (también con la vista de
 * grabación y sus cámaras).
 *
 * No corre el motor: en su lugar define un CarreraDeMedallas «espejo» con la
 * misma interfaz que usan la vista 3D y la de grabación. Lo que llega de la
 * sala es de otra persona: se valida y se dibuja siempre como texto.
 */
(function () {
  'use strict';

  const code = window.NetProtocol.normalizeCode(new URLSearchParams(window.location.search).get('espectador'));
  window.GameSpectator = code ? { code } : null;
  if (!code) return;

  const { $, el, openOverlay, closeOverlay, closeAllOverlays } = window.Dom;
  const { CATS, CAT_KEYS } = window.GameConfig;
  const { categoryIcon, medalIcon } = window.GameArt;
  const Net = window.NetProtocol;
  const Board = window.GameBoard;
  const Sound = window.GameSound;
  const Talk = window.GameTalk;
  const EventView = window.GameEventView;

  const SEATS = 4;
  const RETRY_MS = 3000;
  const IN_BOARD_DIALOGS = ['questionDialog', 'infoDialog', 'medalDialog', 'victoryDialog'];
  // Lo que la vista 3D sabe hacer; cualquier otro pedido se ignora.
  const VIEW_METHODS = new Set([
    'turnStart', 'roll', 'beforeMove', 'step', 'afterMove', 'overview', 'react', 'victory', 'announce', 'questionShot',
    'openingIntro', 'openingRoll', 'resetScenes', 'rocketArrive', 'rocketLeave', 'steal', 'visitorArrive', 'visitorLeave',
    'medalGift', 'visitorEscort', 'zubatAttack', 'characterTalk', 'characterCry',
  ]);

  let game = null; // vista pública de la partida (la misma que reciben los celulares)
  let deadline = null; // hora local en la que vence la pregunta abierta
  let view = null; // vista 3D (si el navegador la puede mostrar)
  let caughtUp = false; // ya se dibujó lo que estaba pasando al conectarse
  const listeners = [];

  // ── Validación de lo que llega de la sala ──
  const isSeat = (n) => Number.isInteger(n) && n >= 0 && n < SEATS;
  const isCat = (c) => typeof c === 'string' && Object.hasOwn(CATS, c);
  const isKey = (s) => typeof s === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(s);
  const isText = (s, max = 600) => typeof s === 'string' && s.length <= max;

  function isPlayer(p) {
    return (
      p && isText(p.name, 40) && isKey(p.creature) && isText(p.color, 30) && Number.isInteger(p.pos) &&
      Number.isInteger(p.streak) && p.medals && typeof p.medals === 'object'
    );
  }

  /** La vista pública completa: lo justo para dibujar sin romper nada. */
  function validGame(g) {
    if (g === null) return true;
    if (!g || typeof g !== 'object' || !Array.isArray(g.players) || g.players.length !== SEATS || !g.players.every(isPlayer)) return false;
    if (!isSeat(g.current) || !['idle', 'busy', 'over'].includes(g.phase)) return false;
    if (g.winner != null && !isSeat(g.winner)) return false;
    const pd = g.pending;
    if (pd && pd.type === 'question') {
      if (!isCat(pd.cat) || !isText(pd.text) || !Array.isArray(pd.options) || pd.options.length !== 4 || !pd.options.every((o) => isText(o, 200))) return false;
      if (pd.answerer != null && !isSeat(pd.answerer)) return false;
      if (pd.thief != null && !isSeat(pd.thief)) return false;
      if (pd.answered && (!Number.isInteger(pd.correct) || !pd.outcome || !isText(pd.outcome.message))) return false;
    }
    if (pd && pd.type === 'medal' && !isCat(pd.cat)) return false;
    if (pd && pd.type === 'info' && (!isText(pd.title, 120) || !isText(pd.text))) return false;
    return true;
  }

  /** Lo mínimo que usa la vista 3D: fichas, turno y fase. */
  const miniPlayer = (p) => ({
    name: p.name,
    creature: p.creature,
    color: p.color,
    pos: p.pos,
    medals: Object.fromEntries(CAT_KEYS.map((c) => [c, !!(p.medals && p.medals[c])])),
  });
  const miniState = (g) => g && { phase: g.phase, current: g.current, players: g.players.map(miniPlayer) };

  function validMini(s) {
    return (
      s === null ||
      (s && isSeat(s.current) && ['idle', 'busy', 'over'].includes(s.phase) && Array.isArray(s.players) && s.players.length === SEATS &&
        s.players.every((p) => p && isText(p.name, 40) && isKey(p.creature) && isText(p.color, 30) && Number.isInteger(p.pos) && p.medals && typeof p.medals === 'object'))
    );
  }

  /** Argumentos de un pedido a la vista 3D: números, textos cortos o un objeto chico de esos. */
  function validArgs(args) {
    const simple = (v) => v == null || typeof v === 'boolean' || Number.isFinite(v) || isText(v, 200);
    return Array.isArray(args) && args.length <= 4 && args.every((a) => simple(a) || (a && typeof a === 'object' && !Array.isArray(a) && Object.values(a).every(simple)));
  }

  // ── El «motor espejo» que usan view3d.js y recording.js ──
  function notify() {
    for (const fn of listeners) {
      try {
        fn();
      } catch (err) {
        console.error('Error en un oyente de la partida:', err);
      }
    }
  }

  window.CarreraDeMedallas = {
    getState: () => null,
    publicView: () => game,
    act: () => false,
    onUpdate(fn) {
      listeners.push(fn);
    },
    onCast() {},
    attachView(v) {
      view = v;
      Board.placeTurnPanel();
      v.sync(miniState(game));
      if (game && game.phase === 'idle') v.turnStart(game.current);
    },
    isRemote: () => true,
    testSquare: () => false,
    debug: { setPlayer() {}, setTurn() {}, endTurn() {} },
    setRemoteSeats() {},
  };

  // ── Dibujo ──
  function setStatus(text, kind) {
    $('spectatorBadge').textContent = `👀 Espectador · Sala ${code} · ${text}`;
    $('spectatorBadge').className = `room-badge ${kind}`;
  }

  function renderGame() {
    const inGame = !!game;
    $('screenGame').hidden = !inGame;
    $('spectatorWait').hidden = inGame;
    document.body.classList.toggle('in-game', inGame);
    if (!inGame) return;
    EventView.paintTurnCard(game.players[game.current], game.lastRoll);
    EventView.paintPlayers(game.players, Array.isArray(game.order) && game.order.length === SEATS && game.order.every(isSeat) ? game.order : [0, 1, 2, 3], game.current, game.phase);
    EventView.paintLog(Array.isArray(game.recent) ? game.recent.filter((e) => e && isText(e.t) && (e.p == null || isSeat(e.p))) : [], game.players);
  }

  /** Pinta la ventana `id` con la partida `g` (la de ese momento en la pantalla principal). */
  function paintDialog(id, g) {
    const pd = g.pending;
    if (id === 'questionDialog') {
      if (!pd || pd.type !== 'question') return false;
      EventView.paintQuestion(pd, g.players, g.current, null);
      if (pd.answered) EventView.paintAnswered(pd, g.players, g.current);
    } else if (id === 'infoDialog') {
      if (!pd || pd.type !== 'info') return false;
      const icon = pd.icon && isCat(pd.icon.medal) ? { medal: pd.icon.medal } : { art: pd.icon && isKey(pd.icon.art) ? pd.icon.art : null };
      EventView.paintInfo({ title: pd.title, text: pd.text, icon });
    } else if (id === 'medalDialog') {
      if (!pd || pd.type !== 'medal') return false;
      EventView.paintMedal(pd.cat, g.players[g.current]);
    } else if (id === 'victoryDialog') {
      if (g.winner == null) return false;
      EventView.paintVictory(g.players[g.winner]);
    } else {
      return false;
    }
    return true;
  }

  function showDialog(id, g) {
    if (paintDialog(id, g)) openOverlay(id);
  }

  /** Al conectarse a mitad de partida: se muestra lo que está a la vista. */
  function catchUp() {
    caughtUp = true;
    if (view) {
      view.sync(miniState(game));
      if (game && game.phase === 'idle') view.turnStart(game.current);
    }
    if (!game) return;
    const pd = game.pending;
    if (game.phase === 'over' && game.winner != null) showDialog('victoryDialog', game);
    else if (pd && pd.type === 'question') showDialog('questionDialog', game);
    else if (pd && pd.type === 'info') showDialog('infoDialog', game);
    else if (pd && pd.type === 'medal') showDialog('medalDialog', game);
  }

  function setGame(g) {
    const hadGame = !!game;
    game = g;
    const pd = g && g.pending;
    deadline = pd && pd.type === 'question' && !pd.answered && Number.isFinite(pd.timeLeftMs) ? Date.now() + pd.timeLeftMs : null;
    if (!g && hadGame) {
      // La pantalla principal volvió a la configuración.
      closeAllOverlays();
      Talk.close();
      if (view) view.sync(null);
      caughtUp = false;
    }
    renderGame();
    notify();
  }

  /** Reloj de la pregunta (lo decide la pantalla principal; aquí solo se muestra). */
  setInterval(() => {
    if (!$('questionDialog').hidden && deadline != null && game && game.pending && game.pending.type === 'question' && !game.pending.answered) {
      EventView.paintTimer(deadline - Date.now());
    } else if (deadline == null) {
      EventView.paintTimer(null);
    }
  }, 250);

  /** Opción de la caja de diálogo: dibujo según `icon` (categoría o jugador con sus medallas). */
  function choiceNode(icon) {
    if (!icon || typeof icon !== 'object') return null;
    if (isCat(icon.cat)) return categoryIcon(icon.cat);
    if (isSeat(icon.seat) && game) {
      const v = game.players[icon.seat];
      const medals = Array.isArray(icon.medals) ? icon.medals.filter(isCat).slice(0, CAT_KEYS.length) : [];
      return el('span', { class: 'talk-choice-player', style: { '--pc': v.color } }, [EventView.tokenNode(v), el('span', { class: 'rocket-medals' }, medals.map((c) => medalIcon(c)))]);
    }
    return null;
  }

  function onTalk(e) {
    if (!isText(e.text) || !isText(e.name, 40) || !Array.isArray(e.choices) || e.choices.length > 8) return;
    const choices = e.choices
      .filter((ch) => ch && isText(ch.label, 60))
      .map((ch, i) => ({ value: i, label: ch.label, blocked: !!ch.blocked, node: choiceNode(ch.icon) }));
    Talk.say({
      name: e.name,
      art: isKey(e.art) ? e.art : null,
      text: e.text,
      narrator: !!e.narrator,
      // Sin opciones, el texto se queda hasta que la pantalla principal lo cierre o diga otro.
      auto: false,
      choices: choices.length ? choices : undefined,
      onTalk: e.talking && view ? (on) => view.characterTalk(on) : undefined,
    });
  }

  // ── Lo que transmite la pantalla principal ──
  function onCast(e) {
    if (!e || typeof e !== 'object') return;
    switch (e.k) {
      case 'view':
        if (view && VIEW_METHODS.has(e.m) && validArgs(e.a)) {
          try {
            view[e.m](...e.a);
          } catch (err) {
            console.warn('No se pudo reproducir una animación:', e.m, err);
          }
        }
        return;
      case 'sync':
        if (view && validMini(e.state)) view.sync(e.state && { phase: e.state.phase, current: e.state.current, players: e.state.players.map(miniPlayer) });
        return;
      case 'talk':
        return onTalk(e);
      case 'talkClose':
        return Talk.close();
      case 'sound':
        if (isKey(e.name)) Sound.play(e.name);
        return;
      case 'cry':
        if (isKey(e.id)) Sound.cry(e.id);
        return;
      case 'open':
        if (IN_BOARD_DIALOGS.includes(e.id) && e.game && validGame(e.game)) {
          setGame(e.game);
          showDialog(e.id, e.game);
        }
        return;
      case 'answered':
        if (e.game && validGame(e.game)) {
          setGame(e.game);
          if (!$('questionDialog').hidden) paintDialog('questionDialog', e.game);
        }
        return;
      case 'close':
        if (IN_BOARD_DIALOGS.includes(e.id)) closeOverlay(e.id);
        return;
      case 'closeAll':
        closeAllOverlays();
        return;
      default:
        return;
    }
  }

  // ── Conexión con la sala ──
  let peer = null;
  let conn = null;
  let retryTimer = null;
  let lastHeard = 0;

  function onMessage(msg) {
    if (!Net.isMessage(msg, true)) return;
    if (msg.t === 'state') {
      if (!validGame(msg.game)) return;
      setGame(msg.game);
      if (!caughtUp) catchUp();
    } else if (msg.t === 'cast') {
      onCast(msg.e);
    } else if (msg.t === 'error') {
      setStatus(isText(msg.msg, 200) ? msg.msg : 'Error', 'error');
    }
  }

  function retryLater() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  }

  function openConn() {
    if (conn && conn.open) return;
    if (conn) conn.close();
    const c = peer.connect(Net.ROOM_PREFIX + code, { reliable: true });
    conn = c;
    c.on('open', () => {
      if (c !== conn) return;
      lastHeard = Date.now();
      caughtUp = false; // al reconectar se vuelve a mostrar lo que está pasando
      c.send({ t: 'watch' });
      setStatus('Conectado', 'online');
    });
    c.on('data', (msg) => {
      if (c !== conn) return;
      lastHeard = Date.now();
      onMessage(msg);
    });
    c.on('close', () => {
      if (c !== conn) return;
      setStatus('Reconectando…', 'connecting');
      retryLater();
    });
    c.on('error', (err) => {
      if (c !== conn) return;
      console.warn('Error en la conexión con la sala:', err);
      retryLater();
    });
  }

  function connect() {
    clearTimeout(retryTimer);
    if (typeof window.Peer !== 'function') {
      setStatus('No se pudo cargar la librería de conexión', 'error');
      return;
    }
    setStatus('Conectando…', 'connecting');
    if (!peer || peer.destroyed) {
      peer = new window.Peer({ debug: 1 });
      peer.on('open', openConn);
      peer.on('disconnected', () => {
        if (peer && !peer.destroyed) peer.reconnect();
      });
      peer.on('error', (err) => {
        console.warn('Error de conexión:', err.type, err);
        if (err.type === 'peer-unavailable') setStatus('Sala no encontrada: ¿está abierta la pantalla principal?', 'error');
        else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          peer.destroy();
          peer = null;
          setStatus('Sin conexión', 'error');
        }
        retryLater();
      });
    } else if (peer.open) {
      openConn();
    }
  }

  // Latido: avisa que seguimos aquí y detecta si la sala dejó de responder.
  setInterval(() => {
    if (!conn || !conn.open) return;
    if (Date.now() - lastHeard > Net.DEAD_MS) {
      const old = conn;
      conn = null;
      old.close();
      setStatus('Reconectando…', 'connecting');
      connect();
      return;
    }
    conn.send({ t: 'ping' });
  }, Net.PING_MS);

  // ── Inicio ──
  function updateSoundButton() {
    const on = Sound.isEnabled();
    $('btnSound').textContent = on ? '🔊 Sonido' : '🔇 Silencio';
    $('btnSound').setAttribute('aria-pressed', String(on));
  }

  function init() {
    document.body.classList.add('spectator');
    Board.init();
    for (const id of IN_BOARD_DIALOGS) {
      $(id).classList.add('in-board');
      $('playArea').appendChild($(id));
    }
    $('screenSetup').hidden = true;
    const wait = el('section', { class: 'card spectator-wait', attrs: { id: 'spectatorWait' } }, [
      el('h2', { text: '👀 Modo espectador' }),
      el('p', { text: `Conectado a la sala ${code}. La partida aparece aquí en cuanto empiece en la pantalla principal.` }),
    ]);
    $('screenSetup').after(wait);
    $('roomBadge').after(el('span', { class: 'room-badge connecting', attrs: { id: 'spectatorBadge' } }));
    updateSoundButton();
    $('btnSound').addEventListener('click', () => {
      Sound.toggle();
      updateSoundButton();
    });
    $('btnRules').addEventListener('click', () => openOverlay('rulesDialog'));
    $('btnRulesClose').addEventListener('click', () => closeOverlay('rulesDialog'));
    renderGame();
    connect();
    window.addEventListener('beforeunload', () => {
      if (peer && !peer.destroyed) peer.destroy();
    });
  }

  init();
})();
