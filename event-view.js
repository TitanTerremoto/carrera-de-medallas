/*
 * Ventanas del juego dibujadas a partir de la vista pública de la partida
 * (la misma que reciben los celulares): pregunta y su corrección, reloj,
 * aviso, medalla nueva, campeón y panel del turno.
 *
 * La usan la pantalla principal (script.js) y la de espectador
 * (spectator.js), así las dos se ven igual. Solo dibuja: no decide nada.
 * Todos los textos van como texto (nunca como HTML).
 */
(function () {
  'use strict';

  const { $, el } = window.Dom;
  const { CATS, CAT_KEYS, HITS_FOR_MEDAL, MEDALS_TO_WIN, ANSWER_SECONDS } = window.GameConfig;
  const { creatureIcon, categoryIcon, medalIcon, artIcon, pokemonIcon, typeIcons } = window.GameArt;
  const Poke = window.PokeData;

  const ANSWER_MS = ANSWER_SECONDS * 1000;
  const LETTERS = ['A', 'B', 'C', 'D'];

  function tokenNode(p, extraClass) {
    return el('div', { class: `token ${extraClass || ''}`, style: { '--pc': p.color }, attrs: { title: p.name } }, [creatureIcon(p.creature)]);
  }

  function streakText(streak) {
    if (streak >= HITS_FOR_MEDAL) return `${HITS_FOR_MEDAL} de ${HITS_FOR_MEDAL} · ¡Tu próxima pregunta es por la medalla!`;
    return `${streak} de ${HITS_FOR_MEDAL}`;
  }

  function streakPips(streak) {
    return Array.from({ length: HITS_FOR_MEDAL }, (_, i) => el('span', { class: `pip-streak ${i < streak ? 'on' : ''}` }));
  }

  const medalCount = (p) => CAT_KEYS.filter((c) => p.medals[c]).length;

  /** Quién responde la pregunta: la víctima en una defensa; si no, el jugador en turno. */
  const answererOf = (q, current) => (q.answerer != null ? q.answerer : current);

  function paintQuestionStreak(q, players, current) {
    const p = players[answererOf(q, current)];
    const box = $('qStreak');
    const catName = CATS[q.cat].name;
    if (q.mode === 'defense') {
      const thief = players[q.thief];
      box.replaceChildren(el('span', { class: 'q-streak-text', text: `🛡 ${p.name} defiende su Medalla de ${catName}: si acierta, la conserva; si falla, se la lleva ${thief ? thief.name : 'el Team Rocket'}.` }));
    } else if (q.mode === 'final') {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: '🏆 Desafío de la Liga Pokémon: si aciertas, ¡eres Campeón! Si fallas, vuelves a intentarlo en tu próximo turno.' }));
    } else if (q.mode === 'medal') {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: `Pregunta especial: si aciertas ganas la Medalla de ${catName}. No cambia tus aciertos (${p.streak} de ${HITS_FOR_MEDAL}).` }));
    } else if (q.forMedal) {
      box.replaceChildren(el('span', { class: 'q-streak-text', text: `🏅 Pregunta por la medalla: si aciertas, ganas la Medalla de ${catName}. Acierte o falle, tus aciertos vuelven a 0.` }));
    } else {
      box.replaceChildren(el('span', { class: 'streak-pips' }, streakPips(p.streak)), el('span', { class: 'q-streak-text', text: `Aciertos: ${streakText(p.streak)} · un error no los borra.` }));
    }
  }

  /**
   * Pregunta abierta. `q` es la vista pública de la pregunta (publicPending de
   * script.js); `onAnswer(i)` se llama al tocar una opción (null: solo mirar).
   */
  function paintQuestion(q, players, current, onAnswer) {
    const p = players[answererOf(q, current)];
    const cat = CATS[q.cat];
    const dialog = $('questionDialog');
    // Pregunta común: la ventana va arriba y la ficha se ve abajo (plano cercano).
    dialog.classList.toggle('q-top', q.mode === 'normal');
    dialog.style.setProperty('--cat', cat.color);
    dialog.classList.toggle('q-medal-mode', q.mode !== 'normal');
    $('qIcon').replaceChildren(q.mode === 'medal' || q.mode === 'defense' ? medalIcon(q.cat) : categoryIcon(q.cat));
    $('qMode').textContent = q.forMedal ? '🏅 ¡Pregunta por la medalla!' : { medal: '🏅 Casilla de medalla directa', final: '🏆 Desafío final', defense: '🚀 ¡Ataque del Team Rocket!' }[q.mode] || 'Pregunta';
    $('qCat').textContent = q.cat === 'habilidades' ? 'Habilidades y movimientos' : cat.name;
    $('qPlayer').replaceChildren(tokenNode(p), el('span', { text: p.name }));
    $('qText').textContent = q.text;
    // Artwork de los Pokémon nombrados en el enunciado (nunca de las opciones).
    $('qArt').replaceChildren(...Poke.findPokemon(q.text).slice(0, 3).map((n) => pokemonIcon(Poke.POKEMON[n], 'q-art-img')));
    $('qReveal').replaceChildren();
    paintQuestionStreak(q, players, current);
    $('qOptions').replaceChildren(
      ...q.options.map((text, i) =>
        el('button', { class: 'q-option', attrs: { type: 'button', 'data-i': i }, on: { click: () => onAnswer && onAnswer(i) } }, [
          el('span', { class: 'q-letter', text: LETTERS[i] }),
          ...typeIcons(text),
          el('span', { class: 'q-option-text', text }),
        ]),
      ),
    );
    $('qFeedback').hidden = true;
    dialog.querySelector('.question-card').classList.remove('q-answered');
  }

  /** Corrección: elegida, correcta, explicación y resultado (la pregunta ya respondida). */
  function paintAnswered(q, players, current) {
    const o = q.outcome;
    const right = q.options[q.correct];
    $('qOptions').querySelectorAll('.q-option').forEach((btn, i) => {
      btn.disabled = true;
      const isRight = i === q.correct;
      btn.classList.toggle('correct', isRight);
      btn.classList.toggle('chosen', i === q.chosen);
      btn.classList.toggle('wrong', i === q.chosen && !isRight);
      if (isRight) btn.setAttribute('aria-label', `${btn.textContent} (respuesta correcta)`);
    });
    paintQuestionStreak(q, players, current);
    $('qVerdict').textContent = o.correct ? '✔ ¡Correcto!' : o.timeout ? `⏰ ¡Se acabó el tiempo! La respuesta era: ${right}` : `✘ Incorrecto. La respuesta era: ${right}`;
    $('qTimer').hidden = true;
    $('qVerdict').className = o.correct ? 'ok' : 'bad';
    $('qExplain').textContent = q.explain || '';
    // Si la respuesta es un Pokémon, aparece su artwork al revelarla.
    const reveal = Poke.exactPokemon(right);
    $('qReveal').replaceChildren(...(reveal ? [pokemonIcon(Poke.POKEMON[reveal], 'q-reveal-img')] : []));
    $('qOutcome').textContent = o.message;
    $('qOutcome').classList.toggle('medal-line', !!o.medal || !!o.won || !!o.stolen || !!o.defended);
    $('btnQContinue').textContent = o.won ? '🏆 Ver celebración' : 'Continuar ➜';
    $('qFeedback').hidden = false;
    $('questionDialog').querySelector('.question-card').classList.add('q-answered');
  }

  /** Reloj de la pregunta. `leftMs` null lo oculta. Devuelve los segundos que muestra. */
  function paintTimer(leftMs) {
    const box = $('qTimer');
    if (leftMs == null) {
      box.hidden = true;
      return null;
    }
    const left = Math.max(0, leftMs);
    const secs = Math.ceil(left / 1000);
    box.hidden = false;
    box.classList.toggle('urgent', secs <= 5);
    $('qTimerFill').style.width = `${Math.min(100, (left / ANSWER_MS) * 100)}%`;
    $('qTimerText').textContent = `⏱ ${secs} s`;
    return secs;
  }

  /** Aviso (pierde el turno, Monte Moon…). `icon`: { medal: cat } o { art: clave }. */
  function paintInfo(info) {
    $('infoTitle').textContent = info.title;
    $('infoText').textContent = info.text;
    const icon = info.icon && info.icon.medal ? medalIcon(info.icon.medal) : artIcon(info.icon && info.icon.art);
    $('infoIcon').replaceChildren(icon);
  }

  /** Medalla recién ganada por `p`. */
  function paintMedal(cat, p) {
    $('medalBig').replaceChildren(medalIcon(cat));
    $('medalTitle').textContent = `¡${CATS[cat].badgeName}!`;
    $('medalText').textContent =
      medalCount(p) >= MEDALS_TO_WIN
        ? `Medalla de ${CATS[cat].name}. ¡${p.name} tiene las ${MEDALS_TO_WIN} medallas! Ahora enfrenta a Lance en el desafío de la Liga Pokémon.`
        : `Medalla de ${CATS[cat].name}. ${p.name} tiene ${medalCount(p)} de las ${MEDALS_TO_WIN} que necesita.`;
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

  /** Ventana del campeón (con confeti). */
  function paintVictory(p) {
    $('victoryToken').replaceChildren(tokenNode(p, 'token-xl'));
    $('victoryTitle').textContent = p.name;
    $('victoryDialog').style.setProperty('--pc', p.color);
    $('victoryMedals').replaceChildren(
      ...CAT_KEYS.filter((c) => p.medals[c]).map((c) => el('div', { class: 'victory-medal' }, [medalIcon(c), el('span', { text: CATS[c].name })])),
    );
    launchConfetti();
  }

  /** Panel del turno: ficha, nombre, último dado, aciertos y medallas del jugador `p`. */
  function paintTurnCard(p, lastRoll) {
    $('turnPanel').style.setProperty('--pc', p.color);
    $('turnToken').replaceChildren(tokenNode(p, 'token-lg'));
    $('turnName').textContent = p.name;
    $('diceResult').textContent = lastRoll ? `Último dado: ${lastRoll}` : 'Aún sin lanzar';
    $('streakPips').replaceChildren(...streakPips(p.streak));
    $('streakText').textContent = `Aciertos: ${streakText(p.streak)}`;
    $('streakBox').classList.toggle('hot', p.streak >= HITS_FOR_MEDAL);
    $('turnMedals').replaceChildren(
      ...CAT_KEYS.map((c) =>
        el('div', { class: `turn-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: CATS[c].name } }, [medalIcon(c), el('span', { text: CATS[c].name })]),
      ),
    );
  }

  function miniMedals(p) {
    return el(
      'div',
      { class: 'mini-medals' },
      CAT_KEYS.map((c) =>
        el('span', { class: `mini-medal ${p.medals[c] ? 'owned' : ''}`, attrs: { title: `${CATS[c].name}: ${p.medals[c] ? 'obtenida' : 'pendiente'}` } }, [medalIcon(c)]),
      ),
    );
  }

  /** Lista de entrenadores (barra lateral), en el orden en que juegan. */
  function paintPlayers(players, order, current, phase) {
    $('playersList').replaceChildren(
      ...order.map((i) => [players[i], i]).map(([p, i]) =>
        el('li', { class: `player-row ${i === current && phase !== 'over' ? 'current' : ''}`, style: { '--pc': p.color } }, [
          tokenNode(p),
          el('div', { class: 'player-info' }, [
            el('strong', { class: 'player-name', text: p.name }),
            el('span', { class: 'player-meta', text: `${p.streak >= HITS_FOR_MEDAL ? '🏅 Por la medalla' : `Aciertos ${p.streak}/${HITS_FOR_MEDAL}`} · ${medalCount(p)}/${MEDALS_TO_WIN} medallas` }),
            p.skipNext ? el('span', { class: 'player-flag', text: 'Pierde el próximo turno' }) : null,
            medalCount(p) >= MEDALS_TO_WIN ? el('span', { class: 'player-flag race', text: '🏆 Desafío de la Liga' }) : null,
          ]),
          miniMedals(p),
        ]),
      ),
    );
  }

  /** Últimos eventos: `entries` [{ t, p }] (p: asiento de quien lo hizo, o null), del más viejo al más nuevo. */
  function paintLog(entries, players) {
    $('logList').replaceChildren(
      ...[...entries].reverse().map((entry) => {
        const p = entry.p != null ? players[entry.p] : null;
        return el('li', { style: p ? { '--pc': p.color } : {}, class: p ? 'by-player' : '' }, [String(entry.t)]);
      }),
    );
  }

  window.GameEventView = {
    tokenNode,
    streakText,
    streakPips,
    paintQuestion,
    paintAnswered,
    paintTimer,
    paintInfo,
    paintMedal,
    paintVictory,
    paintTurnCard,
    paintPlayers,
    paintLog,
  };
})();
