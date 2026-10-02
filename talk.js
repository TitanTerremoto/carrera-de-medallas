/*
 * Caja de diálogo estilo juego de fiesta: un personaje habla abajo del
 * tablero, el texto aparece letra por letra y se avanza tocando la caja (o
 * con Enter/Espacio). Puede terminar en opciones para elegir.
 *
 *   GameTalk.say({ name, art, text, choices?, auto?, onTalk? }) → Promise
 *     - sin choices: se resuelve al avanzar (o solo, con auto: true)
 *     - con choices [{ value, label, node?, blocked? }]: se resuelve con el
 *       value elegido (blocked: no se puede elegir, p. ej. una medalla ya ganada)
 *     - GameTalk.close() la cierra y resuelve la pendiente con null
 *   onTalk(true/false): avisa mientras «habla» (para mover la boca en 3D)
 *
 * Es solo presentación: quién puede elegir lo decide script.js.
 */
(function () {
  'use strict';

  const { $, el } = window.Dom;
  const { artIcon } = window.GameArt;
  const Sound = window.GameSound;

  const CHAR_MS = 28; // velocidad del texto
  const HOLD_MS = 1700; // en auto, cuánto queda el texto completo antes de seguir

  let current = null; // { resolve, done, timer, typing, full }

  const skipAll = () => document.hidden || !!window.GameSpeed?.turbo;

  function finish(value) {
    if (!current) return;
    const c = current;
    current = null;
    clearInterval(c.timer);
    clearTimeout(c.autoTimer);
    if (c.typing && c.onTalk) c.onTalk(false);
    c.resolve(value);
  }

  function close() {
    finish(null);
    $('talkBox').hidden = true;
  }

  /** Completa el texto que se está escribiendo; si ya estaba, avanza. */
  function advance() {
    if (!current) return;
    if (current.typing) {
      completeText();
      return;
    }
    if (!current.choices) finish(true);
  }

  function completeText() {
    const c = current;
    clearInterval(c.timer);
    c.typing = false;
    if (c.onTalk) c.onTalk(false);
    $('talkText').textContent = c.full;
    $('talkBox').classList.add('talk-done');
    if (c.choices) $('talkChoices').hidden = false;
    else if (c.auto) c.autoTimer = setTimeout(() => finish(true), skipAll() ? 0 : HOLD_MS);
  }

  function say({ name, art, text, choices, auto, onTalk, narrator }) {
    finish(null);
    const box = $('talkBox');
    box.hidden = false;
    box.classList.toggle('talk-narrator', !!narrator);
    box.classList.remove('talk-done');
    // Reinicia la animación de entrada.
    box.classList.remove('talk-pop');
    void box.offsetWidth;
    box.classList.add('talk-pop');
    $('talkPortrait').replaceChildren(...(art ? [artIcon(art, 'talk-art')] : []));
    $('talkPortrait').hidden = !art;
    $('talkName').textContent = name || '';
    $('talkName').hidden = !name;
    $('talkText').textContent = '';
    $('talkChoices').hidden = true;
    $('talkChoices').replaceChildren(
      ...(choices || []).map((ch) =>
        el(
          'button',
          {
            class: 'talk-choice',
            attrs: { type: 'button', disabled: !!ch.blocked, 'data-blocked': ch.blocked ? '1' : null, title: ch.blocked ? 'No disponible' : null },
            on: {
              click: (e) => {
                e.stopPropagation();
                if (current && current.choices) finish(ch.value);
              },
            },
          },
          [...(ch.node ? [ch.node] : []), el('span', { text: ch.label })],
        ),
      ),
    );

    return new Promise((resolve) => {
      current = { resolve, full: String(text), typing: true, choices: choices && choices.length ? choices : null, auto, onTalk, timer: null, autoTimer: null };
      if (skipAll()) {
        completeText();
        return;
      }
      if (onTalk) onTalk(true);
      let i = 0;
      const c = current;
      c.timer = setInterval(() => {
        i++;
        $('talkText').textContent = c.full.slice(0, i);
        if (i % 3 === 0 && c.full[i - 1] !== ' ') Sound.play('blip');
        if (i >= c.full.length) completeText();
      }, CHAR_MS);
    });
  }

  function init() {
    $('talkBox').addEventListener('click', advance);
    document.addEventListener('keydown', (e) => {
      if (!current || $('talkBox').hidden) return;
      if (e.key === 'Enter' || e.key === ' ') {
        // Con opciones a la vista, Enter/Espacio sigue funcionando sobre el botón enfocado.
        if (current.choices && !current.typing) return;
        e.preventDefault();
        advance();
      }
    });
  }

  init();
  window.GameTalk = { say, close, isOpen: () => !!current };
})();
