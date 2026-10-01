/*
 * Protocolo entre la ventana espectador (anfitrión) y los dispositivos de
 * los jugadores. La conexión usa PeerJS (WebRTC); el servidor público de
 * PeerJS solo presenta a los dispositivos, los mensajes viajan entre ellos.
 *
 * Autoridad: la ventana espectador guarda la partida y decide todo. Los
 * dispositivos solo envían intenciones y muestran lo que reciben.
 *
 * Dispositivo → espectador
 *   { t:'join', seat, token, name, creature }  ocupar o recuperar un asiento
 *   { t:'leave' }                              liberar el asiento
 *   { t:'act', a:'roll'|'answer'|'choose'|'continue', i?, cat? }
 *
 * Espectador → dispositivo
 *   { t:'state', room, you, lobby, game }      foto completa tras cada cambio
 *   { t:'joined', seat }                       asiento confirmado
 *   { t:'kicked' }                             el asiento se abrió en otro dispositivo
 *   { t:'error', msg }                         pedido rechazado (texto para mostrar)
 *
 * `game` es la vista pública de script.js: nunca incluye la respuesta
 * correcta de una pregunta que todavía no se respondió.
 */
(function () {
  'use strict';

  // Prefijo para que los códigos de sala no choquen con otras apps de PeerJS.
  const ROOM_PREFIX = 'carrera-medallas-v1-';
  // Sin letras confundibles (0/O, 1/I/L).
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 5;
  const MAX_MESSAGE_CHARS = 4000;

  function randomInts(n) {
    const arr = new Uint32Array(n);
    crypto.getRandomValues(arr);
    return Array.from(arr);
  }

  function newRoomCode() {
    return randomInts(CODE_LENGTH)
      .map((v) => CODE_CHARS[v % CODE_CHARS.length])
      .join('');
  }

  /** Normaliza lo que escribe una persona: mayúsculas y sin caracteres raros. */
  function normalizeCode(text) {
    const clean = String(text || '')
      .toUpperCase()
      .split('')
      .filter((ch) => CODE_CHARS.includes(ch))
      .join('');
    return clean.length === CODE_LENGTH ? clean : null;
  }

  /** Identificador secreto del dispositivo para recuperar su asiento. */
  function newToken() {
    return randomInts(4)
      .map((v) => v.toString(36).padStart(7, '0'))
      .join('');
  }

  /** Acepta solo objetos con un tipo de mensaje y de tamaño razonable. */
  function isMessage(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return false;
    try {
      return JSON.stringify(msg).length <= MAX_MESSAGE_CHARS;
    } catch {
      return false;
    }
  }

  function controlUrl(code) {
    const url = new URL('control.html', window.location.href);
    url.search = `?sala=${code}`;
    url.hash = '';
    return url.toString();
  }

  window.NetProtocol = { ROOM_PREFIX, CODE_LENGTH, newRoomCode, normalizeCode, newToken, isMessage, controlUrl };
})();
