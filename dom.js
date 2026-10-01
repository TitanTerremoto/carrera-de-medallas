/*
 * Utilidades de interfaz: creación segura de nodos, ventanas superpuestas,
 * avisos breves (toast) y diálogo de confirmación.
 *
 * Todo el texto se inserta con textContent (nunca innerHTML), así un nombre
 * de jugador como "<b>Ana</b>" se muestra literalmente y no se interpreta.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /**
   * Crea un elemento.
   * opts: { class, text, attrs, style, on }  ·  children: nodos o textos.
   */
  function el(tag, opts, children) {
    const node = document.createElement(tag);
    const o = opts || {};
    if (o.class) node.className = o.class;
    if (o.text != null) node.textContent = String(o.text);
    for (const [k, v] of Object.entries(o.attrs || {})) {
      if (v === false || v == null) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const [k, v] of Object.entries(o.style || {})) node.style.setProperty(k, v);
    for (const [evt, fn] of Object.entries(o.on || {})) node.addEventListener(evt, fn);
    for (const child of children || []) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  /*
   * Pausa para que se vean las animaciones. Con la ventana oculta nadie las
   * ve y el navegador puede demorar los temporizadores hasta un minuto, así
   * que la pausa se omite y la partida sigue al ritmo de los jugadores.
   */
  const delay = (ms) => (skipAnimations() ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms)));

  /*
   * Ritmo de las animaciones, compartido con view3d/. `turbo` lo activa el
   * modo tester para ver una partida entera rápido.
   */
  window.GameSpeed = window.GameSpeed || { turbo: false };
  function skipAnimations() {
    return document.hidden || window.GameSpeed.turbo;
  }

  // ── Ventanas superpuestas ──
  function isOpen(id) {
    return !$(id).hidden;
  }

  function openOverlay(id) {
    const ov = $(id);
    ov.hidden = false;
    // Forzamos un frame para que la transición de entrada se vea.
    requestAnimationFrame(() => ov.classList.add('show'));
    document.body.classList.add('modal-open');
    const focusTarget =
      ov.querySelector('[data-autofocus]') || ov.querySelector('.btn-primary:not([disabled]), button:not([disabled])');
    if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 30);
  }

  function closeOverlay(id) {
    const ov = $(id);
    ov.classList.remove('show');
    ov.hidden = true;
    if (!document.querySelector('.overlay:not([hidden])')) document.body.classList.remove('modal-open');
  }

  function closeAllOverlays() {
    document.querySelectorAll('.overlay').forEach((ov) => closeOverlay(ov.id));
  }

  // ── Aviso breve ──
  let toastTimer = null;
  function toast(text, ms) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth; // reinicia la animación
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      t.hidden = true;
    }, ms || 1900);
  }

  // ── Confirmación (reemplaza window.confirm con el estilo del juego) ──
  let confirmResolver = null;
  function confirmDialog(title, text, yesLabel) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('btnConfirmYes').textContent = yesLabel || 'Sí, continuar';
    openOverlay('confirmDialog');
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function settleConfirm(answer) {
    if (!confirmResolver) return;
    const resolve = confirmResolver;
    confirmResolver = null;
    closeOverlay('confirmDialog');
    resolve(answer);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('confirmDialog')) return; // la página del jugador no tiene confirmaciones
    $('btnConfirmYes').addEventListener('click', () => settleConfirm(true));
    $('btnConfirmNo').addEventListener('click', () => settleConfirm(false));
  });

  window.Dom = { $, el, delay, isOpen, openOverlay, closeOverlay, closeAllOverlays, toast, confirmDialog, settleConfirm };
})();
