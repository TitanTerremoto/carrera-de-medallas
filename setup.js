/*
 * Pantalla de configuración: nombres, fichas y validación de los 4 jugadores.
 * Entrega al juego una lista [{ name, creature, color }] solo cuando todo es válido.
 *
 * Un asiento puede completarse en esta pantalla o desde un dispositivo
 * conectado a la sala (net-host.js llama a setRemote). Los asientos remotos
 * quedan bloqueados aquí para que no se pisen los datos.
 */
(function () {
  'use strict';

  const { $, el } = window.Dom;
  const { CATS, CAT_KEYS, PLAYER_COLORS } = window.GameConfig;
  const { CREATURES, creatureIcon, medalIcon, categoryIcon } = window.GameArt;

  const PLAYER_COUNT = 4;
  const NAME_MAX = 16;

  /** Borrador editable: [{ name, creature }] */
  let draft = [];
  let onStart = null;
  const remote = new Set(); // asientos controlados por un dispositivo
  const changeListeners = [];
  const seatRefs = []; // { seat, input, buttons: Map(creatureId → button), preview, badge }

  function emptyDraft() {
    return Array.from({ length: PLAYER_COUNT }, () => ({ name: '', creature: null }));
  }

  function renderCategoryCards() {
    const list = $('categoryCards');
    list.replaceChildren();
    for (const key of CAT_KEYS) {
      const cat = CATS[key];
      list.appendChild(
        el('li', { class: 'category-card', style: { '--cat': cat.color } }, [
          el('span', { class: 'category-card-icon' }, [medalIcon(key)]),
          el('div', {}, [el('strong', { text: `Medalla de ${cat.name}` }), el('small', { class: 'badge-name', text: cat.badgeName }), el('p', { text: cat.desc })]),
        ]),
      );
    }
    // La Liga Pokémon no es una medalla: es la meta final.
    const league = CATS.liga;
    list.appendChild(
      el('li', { class: 'category-card league-card', style: { '--cat': league.color } }, [
        el('span', { class: 'category-card-icon league-icon' }, [categoryIcon('liga')]),
        el('div', {}, [el('strong', { text: '🏆 Liga Pokémon' }), el('small', { class: 'badge-name', text: 'La meta final' }), el('p', { text: 'Al juntar las 4 medallas, el Dragonite de Lance te hace la pregunta final. ¡Acierta y eres Campeón!' })]),
      ]),
    );
  }

  /** Construye las 4 tarjetas de jugador una sola vez. */
  function buildSeats() {
    const grid = $('playerSetup');
    grid.replaceChildren();
    seatRefs.length = 0;

    for (let i = 0; i < PLAYER_COUNT; i++) {
      const inputId = `playerName${i}`;
      const input = el('input', {
        class: 'name-input',
        attrs: { id: inputId, type: 'text', maxlength: NAME_MAX, autocomplete: 'off', placeholder: `Entrenador ${i + 1}` },
        on: {
          input: (e) => {
            draft[i].name = e.target.value;
            refresh();
          },
        },
      });

      const preview = el('div', { class: 'seat-preview' });
      const buttons = new Map();
      const picker = el('div', { class: 'creature-picker', attrs: { role: 'group', 'aria-label': `Ficha del jugador ${i + 1}` } });
      for (const c of CREATURES) {
        const btn = el(
          'button',
          {
            class: 'creature-option',
            attrs: { type: 'button', title: `${c.name} (${c.element})`, 'aria-label': `${c.name}, tipo ${c.element}`, 'aria-pressed': 'false' },
            on: {
              click: () => {
                if (remote.has(i)) return;
                draft[i].creature = c.id;
                refresh();
              },
            },
          },
          [creatureIcon(c.id)],
        );
        buttons.set(c.id, btn);
        picker.appendChild(btn);
      }

      const badge = el('span', { class: 'seat-remote', text: '📱 Desde su dispositivo', attrs: { hidden: true } });
      const seat = el('fieldset', { class: 'seat card', style: { '--pc': PLAYER_COLORS[i] } }, [
        el('legend', { class: 'seat-legend', text: `Jugador ${i + 1}` }),
        badge,
        el('div', { class: 'seat-top' }, [
          preview,
          el('div', { class: 'seat-name' }, [el('label', { text: 'Nombre', attrs: { for: inputId } }), input]),
        ]),
        el('span', { class: 'seat-label', text: 'Elige tu ficha' }),
        picker,
      ]);
      grid.appendChild(seat);
      seatRefs.push({ seat, input, buttons, preview, badge });
    }
  }

  /** Devuelve la lista de problemas que impiden empezar (vacía = todo bien). */
  function problems() {
    const out = [];
    const names = draft.map((p) => p.name.trim());
    names.forEach((n, i) => {
      if (!n) out.push(`Falta el nombre del jugador ${i + 1}.`);
    });
    const lower = names.filter(Boolean).map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) out.push('Los nombres deben ser distintos.');
    draft.forEach((p, i) => {
      if (!p.creature) out.push(`El jugador ${i + 1} debe elegir una ficha.`);
    });
    return out;
  }

  /** Sincroniza la interfaz con el borrador. */
  function refresh() {
    const taken = new Map();
    draft.forEach((p, i) => {
      if (p.creature) taken.set(p.creature, i);
    });
    seatRefs.forEach((ref, i) => {
      const isRemote = remote.has(i);
      ref.seat.classList.toggle('is-remote', isRemote);
      ref.badge.hidden = !isRemote;
      ref.input.disabled = isRemote;
      if (ref.input.value !== draft[i].name) ref.input.value = draft[i].name;
      for (const [id, btn] of ref.buttons) {
        const owner = taken.get(id);
        const mine = draft[i].creature === id;
        btn.setAttribute('aria-pressed', String(mine));
        btn.classList.toggle('selected', mine);
        // Cada criatura solo puede pertenecer a un jugador.
        btn.disabled = isRemote || (owner !== undefined && owner !== i);
      }
      const c = CREATURES.find((x) => x.id === draft[i].creature);
      ref.preview.replaceChildren(
        c
          ? el('div', { class: 'token token-lg', style: { '--pc': PLAYER_COLORS[i] } }, [creatureIcon(c.id)])
          : el('div', { class: 'token token-lg token-empty', style: { '--pc': PLAYER_COLORS[i] }, text: '?' }),
        el('small', { text: c ? `${c.name} · ${c.element}` : 'Sin ficha' }),
      );
    });

    const issues = problems();
    $('btnStart').disabled = issues.length > 0;
    $('setupHint').textContent = issues.length ? issues[0] : '¡Todo listo! Pulsa «Comenzar partida».';
    $('setupHint').classList.toggle('ok', issues.length === 0);
    for (const fn of changeListeners) fn();
  }

  function submit(e) {
    e.preventDefault();
    if (problems().length) return refresh();
    const players = draft.map((p, i) => ({ name: p.name.trim().slice(0, NAME_MAX), creature: p.creature, color: PLAYER_COLORS[i] }));
    onStart(players);
  }

  /**
   * Comprueba si un dispositivo puede ocupar el asiento i con ese nombre y
   * criatura. Devuelve un mensaje de error o null si es válido.
   */
  function validateClaim(i, name, creature) {
    if (!Number.isInteger(i) || i < 0 || i >= PLAYER_COUNT) return 'Asiento inválido.';
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return 'Escribe tu nombre.';
    if (clean.length > NAME_MAX) return `El nombre puede tener hasta ${NAME_MAX} letras.`;
    if (draft.some((p, j) => j !== i && p.name.trim().toLowerCase() === clean.toLowerCase())) return 'Ese nombre ya lo usa otro jugador.';
    if (!CREATURES.some((c) => c.id === creature)) return 'Elige una ficha.';
    if (draft.some((p, j) => j !== i && p.creature === creature)) return 'Esa ficha ya la eligió otro jugador.';
    return null;
  }

  window.GameSetup = {
    init(handlers) {
      onStart = handlers.onStart;
      draft = emptyDraft();
      renderCategoryCards();
      buildSeats();
      $('setupForm').addEventListener('submit', submit);
      refresh();
    },
    /** Muestra la configuración, opcionalmente con los jugadores anteriores. */
    load(players) {
      draft = emptyDraft();
      (players || []).slice(0, PLAYER_COUNT).forEach((p, i) => {
        // Fichas de versiones anteriores que ya no existen quedan sin elegir.
        const known = CREATURES.some((c) => c.id === p.creature);
        draft[i] = { name: p.name || '', creature: known ? p.creature : null };
      });
      refresh();
    },
    validateClaim,
    /** Marca el asiento i como remoto con esos datos, o lo libera con null. */
    setRemote(i, info) {
      if (info) {
        remote.add(i);
        draft[i] = { name: info.name.trim().slice(0, NAME_MAX), creature: info.creature };
      } else {
        remote.delete(i);
      }
      refresh();
    },
    /** Datos actuales de los asientos (copia). */
    seats() {
      return draft.map((p, i) => ({ name: p.name.trim(), creature: p.creature, color: PLAYER_COLORS[i], remote: remote.has(i) }));
    },
    onChange(fn) {
      changeListeners.push(fn);
    },
  };
})();
