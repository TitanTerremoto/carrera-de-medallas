/*
 * Sala en línea del lado de la ventana espectador.
 *
 * - Crea la sala (un Peer con id fijo derivado del código).
 * - Asigna asientos a los dispositivos y valida sus pedidos.
 * - Reenvía al juego solo las acciones del asiento en turno (script.js
 *   vuelve a validar cada una).
 * - Envía a cada dispositivo la vista pública tras cada cambio.
 *
 * Si un dispositivo se desconecta (o deja de dar latidos), su asiento vuelve
 * a poder jugarse desde esta pantalla hasta que se reconecte con su token.
 *
 * Espectadores: pantallas que solo miran (index.html?espectador=CÓDIGO). No
 * ocupan asiento ni pueden actuar; reciben la vista pública y lo que esta
 * pantalla presenta (Game.onCast) para reproducirlo igual.
 */
(function () {
  'use strict';

  // En la pantalla de espectador no hay sala propia.
  if (window.GameSpectator) return;

  const { $, el, toast } = window.Dom;
  const { CREATURES } = window.GameArt;
  const Game = window.CarreraDeMedallas;
  const Setup = window.GameSetup;
  const Net = window.NetProtocol;

  const ROOM_KEY = 'carreraMedallas.room.v1';
  const SEATS = 4;
  const MAX_WATCHERS = 12; // pantallas de espectador a la vez
  const ID_RETRIES = 6; // tras recargar, el servidor tarda en liberar el id anterior

  let peer = null;
  let code = null;
  let status = { kind: 'off', text: 'Sin sala en línea' };
  let idRetries = 0;
  let retryTimer = null;
  let broadcastQueued = false;
  const conns = new Set();
  const seatConn = Array(SEATS).fill(null);
  const seatToken = Array(SEATS).fill(null);

  // ── Persistencia del código (para recuperar la sala al recargar) ──
  function readRoom() {
    try {
      return Net.normalizeCode(localStorage.getItem(ROOM_KEY));
    } catch (err) {
      console.warn('No se pudo leer la sala guardada:', err);
      return null;
    }
  }

  function writeRoom(value) {
    try {
      if (value) localStorage.setItem(ROOM_KEY, value);
      else localStorage.removeItem(ROOM_KEY);
    } catch (err) {
      console.warn('No se pudo guardar la sala:', err);
    }
  }

  const isConnected = (seat) => !!seatConn[seat] && seatConn[seat].open;
  const watcherCount = () => [...conns].filter((c) => c.watch).length;

  function setStatus(kind, text) {
    status = { kind, text };
    renderPanels();
  }

  // ── Ciclo de vida de la sala ──
  function openRoom(existing) {
    clearTimeout(retryTimer);
    if (typeof window.Peer !== 'function') {
      setStatus('error', 'No se pudo cargar la librería de conexión.');
      return;
    }
    code = existing || Net.newRoomCode();
    writeRoom(code);
    setStatus('connecting', 'Conectando con el servidor…');

    peer = new window.Peer(Net.ROOM_PREFIX + code, { debug: 1 });
    peer.on('open', () => {
      idRetries = 0;
      setStatus('online', 'Sala en línea');
    });
    peer.on('connection', onConnection);
    peer.on('disconnected', () => {
      // Se perdió el servidor de presentación; las conexiones abiertas siguen.
      if (peer && !peer.destroyed) {
        setStatus('connecting', 'Reconectando con el servidor…');
        peer.reconnect();
      }
    });
    peer.on('error', onPeerError);
  }

  function onPeerError(err) {
    console.warn('Error en la sala en línea:', err.type, err);
    if (err.type === 'unavailable-id') {
      destroyPeer();
      if (idRetries++ < ID_RETRIES) {
        setStatus('connecting', 'Recuperando la sala…');
        retryTimer = setTimeout(() => openRoom(code), 3000);
      } else {
        setStatus('error', 'Ese código de sala sigue en uso. Cierra la sala y crea una nueva.');
      }
      return;
    }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      destroyPeer();
      setStatus('error', 'Sin conexión con el servidor. Reintentando…');
      retryTimer = setTimeout(() => openRoom(code), 5000);
      return;
    }
    if (err.type === 'browser-incompatible') setStatus('error', 'Este navegador no permite jugar en línea.');
  }

  function destroyPeer() {
    if (peer && !peer.destroyed) peer.destroy();
    peer = null;
  }

  function closeRoom() {
    clearTimeout(retryTimer);
    for (const conn of conns) conn.close();
    conns.clear();
    for (let i = 0; i < SEATS; i++) releaseSeat(i, { forget: true });
    destroyPeer();
    code = null;
    writeRoom(null);
    setStatus('off', 'Sin sala en línea');
    Game.setRemoteSeats(isConnected);
  }

  // ── Conexiones de dispositivos ──
  function onConnection(conn) {
    conn.seat = null;
    conn.lastSeen = Date.now();
    conn.on('open', () => {
      conn.lastSeen = Date.now();
      conns.add(conn);
      sendState(conn);
    });
    conn.on('data', (msg) => {
      conn.lastSeen = Date.now();
      handleMessage(conn, msg);
    });
    conn.on('close', () => dropConn(conn));
    conn.on('error', (err) => {
      console.warn('Error en la conexión de un dispositivo:', err);
      dropConn(conn);
    });
  }

  function dropConn(conn) {
    if (!conns.has(conn)) return;
    conns.delete(conn);
    if (conn.open) conn.close();
    if (conn.watch) renderPanels();
    if (conn.seat != null && seatConn[conn.seat] === conn) {
      const name = Setup.seats()[conn.seat].name || `Jugador ${conn.seat + 1}`;
      toast(`📴 ${name} se desconectó`);
      releaseSeat(conn.seat, { forget: false });
    }
    afterSeatsChanged();
  }

  /** Libera el asiento. Con forget, también olvida su token. */
  function releaseSeat(seat, { forget }) {
    seatConn[seat] = null;
    if (forget) seatToken[seat] = null;
    // En la sala de espera el asiento vuelve a editarse aquí; los datos quedan.
    Setup.setRemote(seat, null);
  }

  function afterSeatsChanged() {
    Game.setRemoteSeats(isConnected);
    renderPanels();
    scheduleBroadcast();
  }

  function reply(conn, msg) {
    if (conn.open) conn.send(msg);
  }

  function handleMessage(conn, msg) {
    if (!Net.isMessage(msg)) return;
    switch (msg.t) {
      case 'ping':
        return reply(conn, { t: 'pong' });
      case 'join':
        return handleJoin(conn, msg);
      case 'watch':
        if (conn.watch) return;
        if (conn.seat != null) return reply(conn, { t: 'error', msg: 'Este dispositivo ya juega en un asiento.' });
        if (watcherCount() >= MAX_WATCHERS) {
          reply(conn, { t: 'error', msg: 'La sala ya tiene el máximo de espectadores.' });
          setTimeout(() => dropConn(conn), 300);
          return;
        }
        conn.watch = true;
        sendState(conn);
        renderPanels();
        return;
      case 'leave':
        if (conn.seat != null && seatConn[conn.seat] === conn) {
          releaseSeat(conn.seat, { forget: true });
          conn.seat = null;
          afterSeatsChanged();
        }
        return;
      case 'act': {
        if (conn.seat == null || seatConn[conn.seat] !== conn) return reply(conn, { t: 'error', msg: 'Primero elige tu asiento.' });
        const ok = Game.act(conn.seat, { type: msg.a, i: msg.i, cat: msg.cat, victim: msg.victim });
        if (!ok) sendState(conn); // re-sincroniza por si el dispositivo iba atrasado
        return;
      }
      default:
        return;
    }
  }

  function handleJoin(conn, msg) {
    if (conn.watch) return reply(conn, { t: 'error', msg: 'Una pantalla de espectador no puede ocupar un asiento.' });
    const seat = msg.seat;
    const token = typeof msg.token === 'string' && /^[a-z0-9]{8,64}$/.test(msg.token) ? msg.token : null;
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS || !token) return reply(conn, { t: 'error', msg: 'Pedido inválido.' });

    const holder = seatConn[seat];
    if (holder && holder !== conn && holder.open && seatToken[seat] !== token) {
      return reply(conn, { t: 'error', msg: 'Ese asiento ya está ocupado por otro dispositivo.' });
    }

    const inGame = !!Game.publicView();
    if (!inGame) {
      const name = typeof msg.name === 'string' ? msg.name : '';
      const creature = CREATURES.some((c) => c.id === msg.creature) ? msg.creature : null;
      const problem = Setup.validateClaim(seat, name, creature);
      if (problem) return reply(conn, { t: 'error', msg: problem });
      Setup.setRemote(seat, { name, creature });
    }

    // Si este dispositivo tenía otro asiento, lo suelta.
    if (conn.seat != null && conn.seat !== seat && seatConn[conn.seat] === conn) releaseSeat(conn.seat, { forget: true });
    // Si el mismo jugador se reconectó desde otra conexión, la vieja queda fuera.
    if (holder && holder !== conn) {
      holder.seat = null;
      reply(holder, { t: 'kicked' });
      setTimeout(() => holder.close(), 300);
    }
    seatConn[seat] = conn;
    seatToken[seat] = token;
    conn.seat = seat;
    if (inGame) Setup.setRemote(seat, { ...Setup.seats()[seat] });

    reply(conn, { t: 'joined', seat });
    toast(`📱 ${Setup.seats()[seat].name || `Jugador ${seat + 1}`} se conectó`);
    afterSeatsChanged();
  }

  // ── Envío de estado ──
  function lobbyView() {
    return Setup.seats().map((s, i) => ({ name: s.name, creature: s.creature, color: s.color, connected: isConnected(i) }));
  }

  function sendState(conn) {
    reply(conn, { t: 'state', room: code, you: conn.seat, lobby: lobbyView(), game: Game.publicView() });
  }

  function scheduleBroadcast() {
    if (broadcastQueued) return;
    broadcastQueued = true;
    // Microtarea (no setTimeout): no la frena el navegador si la ventana está oculta.
    queueMicrotask(() => {
      broadcastQueued = false;
      for (const conn of conns) sendState(conn);
    });
  }

  /** Lo que presenta esta pantalla va solo a los espectadores (los celulares no lo necesitan). */
  function castToWatchers(event) {
    for (const conn of conns) if (conn.watch) reply(conn, { t: 'cast', e: event });
  }

  // ── Panel de la sala (configuración y barra lateral) ──
  function copyLink(url) {
    navigator.clipboard.writeText(url).then(
      () => toast('Enlace copiado'),
      (err) => {
        console.warn('No se pudo copiar el enlace:', err);
        toast('No se pudo copiar: selecciónalo y cópialo a mano');
      },
    );
  }

  /** Con «localhost» el enlace solo funciona en esta misma PC. */
  function isLocalhost() {
    return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  }

  function seatChips() {
    const seats = Setup.seats();
    return el(
      'ul',
      { class: 'room-seats' },
      seats.map((s, i) =>
        el('li', { class: `room-seat ${isConnected(i) ? 'on' : ''}`, style: { '--pc': s.color } }, [
          el('span', { class: 'room-dot' }),
          el('span', { class: 'room-seat-name', text: s.name || `Jugador ${i + 1}` }),
          el('small', { text: isConnected(i) ? 'Conectado' : 'En esta pantalla' }),
        ]),
      ),
    );
  }

  function panelContent(compact) {
    if (!code) {
      return [
        el('p', {
          class: 'room-help',
          text: 'Cada jugador puede jugar desde su celular u otra pestaña. Los asientos sin dispositivo se juegan desde esta pantalla.',
        }),
        el('button', { class: 'btn btn-primary', text: '🌐 Crear sala en línea', attrs: { type: 'button' }, on: { click: () => openRoom(null) } }),
      ];
    }
    const url = Net.controlUrl(code);
    return [
      el('div', { class: `room-status ${status.kind}` }, [el('span', { class: 'room-dot' }), status.text]),
      el('div', { class: 'room-code-row' }, [
        el('span', { class: 'room-code-label', text: 'Código' }),
        el('strong', { class: 'room-code', text: code }),
      ]),
      compact ? null : el('p', { class: 'room-help', text: 'Abre este enlace en cada celular (o escribe el código en la página del jugador):' }),
      isLocalhost()
        ? el('p', {
            class: 'room-warn',
            text: '⚠ Abriste esta pantalla como «localhost»: ese enlace no sirve en los celulares. Ábrela con la IP de esta PC (por ejemplo http://192.168.1.9:8765) y el enlace se corrige solo.',
          })
        : null,
      el('div', { class: 'room-link' }, [
        el('input', { class: 'room-link-input', attrs: { type: 'text', readonly: true, value: url, 'aria-label': 'Enlace para jugadores' } }),
        el('button', { class: 'btn', text: '📋 Copiar', attrs: { type: 'button' }, on: { click: () => copyLink(url) } }),
      ]),
      seatChips(),
      compact ? null : el('p', { class: 'room-help', text: '👀 Espectadores (para mostrar la partida en otro stream, sin jugar):' }),
      el('div', { class: 'room-link' }, [
        el('input', { class: 'room-link-input', attrs: { type: 'text', readonly: true, value: Net.spectatorUrl(code), 'aria-label': 'Enlace para espectadores' } }),
        el('button', { class: 'btn', text: '👀 Copiar', attrs: { type: 'button', title: 'Copiar enlace para espectadores' }, on: { click: () => copyLink(Net.spectatorUrl(code)) } }),
      ]),
      el('p', { class: 'room-help', text: `👀 ${watcherCount()} ${watcherCount() === 1 ? 'espectador' : 'espectadores'} mirando` }),
      compact
        ? null
        : el('button', {
            class: 'btn btn-ghost room-close',
            text: 'Cerrar sala',
            attrs: { type: 'button' },
            on: { click: closeRoom },
          }),
    ];
  }

  function renderPanels() {
    $('onlinePanel').replaceChildren(...panelContent(false).filter(Boolean));
    $('onlinePanelGame').replaceChildren(...panelContent(true).filter(Boolean));
    const connected = seatConn.filter((c) => c && c.open).length;
    $('roomBadge').hidden = !code;
    $('roomBadge').textContent = code ? `🌐 ${code} · ${connected}/4 📱` : '';
    $('roomBadge').className = `room-badge ${status.kind}`;
  }

  /** Conexiones que dejaron de dar latidos: se cierran y el asiento se libera. */
  function sweepDeadConns() {
    const now = Date.now();
    for (const conn of [...conns]) {
      if (now - conn.lastSeen > Net.DEAD_MS) {
        console.warn('Un dispositivo dejó de responder; se libera su asiento.');
        dropConn(conn);
      }
    }
  }

  // ── Inicio ──
  setInterval(sweepDeadConns, Net.PING_MS);
  Game.onUpdate(scheduleBroadcast);
  Game.onCast(castToWatchers);
  Setup.onChange(() => {
    renderPanels();
    scheduleBroadcast();
  });
  Game.setRemoteSeats(isConnected);
  renderPanels();
  const saved = readRoom();
  if (saved) openRoom(saved);

  window.addEventListener('beforeunload', () => destroyPeer());
})();
