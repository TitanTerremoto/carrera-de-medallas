/*
 * Efectos de sonido sintetizados con Web Audio.
 * No se cargan archivos: todo se genera al vuelo, así funciona sin conexión.
 * La preferencia (activado/silenciado) se guarda en localStorage.
 */
(function () {
  'use strict';

  const PREF_KEY = 'carreraMedallas.sound';
  let ctx = null;
  let enabled = readPref();

  function readPref() {
    try {
      return localStorage.getItem(PREF_KEY) !== 'off';
    } catch (err) {
      console.warn('No se pudo leer la preferencia de sonido:', err);
      return true;
    }
  }

  /** El contexto de audio se crea con el primer gesto del usuario. */
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Toca una nota breve con envolvente suave. */
  function tone(freq, start, dur, type, vol) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + start;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const EFFECTS = {
    hit() {
      // Golpe seco + "crack" del bloque al romperse
      tone(140, 0, 0.12, 'square', 0.12);
      tone(880, 0.05, 0.08, 'square', 0.07);
      for (let i = 0; i < 5; i++) tone(1200 + Math.random() * 900, 0.18 + i * 0.025, 0.05, 'triangle', 0.06);
    },
    /** Voz de los personajes al hablar: un «bip» corto y algo variado. */
    blip() {
      tone(560 + Math.random() * 180, 0, 0.04, 'square', 0.035);
    },
    tick() {
      tone(1320, 0, 0.05, 'square', 0.06);
    },
    step() {
      tone(520, 0, 0.08, 'triangle', 0.1);
    },
    correct() {
      tone(660, 0, 0.12, 'triangle', 0.15);
      tone(880, 0.1, 0.2, 'triangle', 0.15);
    },
    wrong() {
      tone(220, 0, 0.18, 'sawtooth', 0.07);
      tone(165, 0.15, 0.3, 'sawtooth', 0.07);
    },
    medal() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.14));
    },
    victory() {
      [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.32, 'square', 0.07));
      [262, 330, 392].forEach((f) => tone(f, 0.98, 0.9, 'triangle', 0.08));
    },
    /** Antes de cada pregunta: arpegio de suspenso con redoble suave. */
    suspense() {
      [392, 440, 494, 523, 587, 659, 698].forEach((f, i) => tone(f, i * 0.13, 0.2, 'triangle', 0.08));
      for (let i = 0; i < 14; i++) tone(95 + (i % 2) * 12, i * 0.065, 0.05, 'square', 0.025);
      tone(784, 0.95, 0.65, 'triangle', 0.1);
      tone(392, 0.95, 0.65, 'sine', 0.07);
      tone(494, 0.95, 0.65, 'sine', 0.05);
    },
    /** «¡Ya!»: arranca la pregunta. */
    go() {
      tone(784, 0, 0.09, 'square', 0.07);
      tone(1047, 0.08, 0.22, 'square', 0.08);
    },
    special() {
      tone(440, 0, 0.1, 'sine', 0.12);
      tone(554, 0.08, 0.16, 'sine', 0.12);
    },
  };

  window.GameSound = {
    play(name) {
      if (!enabled || !EFFECTS[name]) return;
      try {
        EFFECTS[name]();
      } catch (err) {
        // El sonido es opcional: si el navegador lo bloquea, el juego sigue.
        console.warn('No se pudo reproducir el sonido', name, err);
      }
    },
    isEnabled() {
      return enabled;
    },
    /** Grito del Pokémon (assets/cries/<id>.ogg). */
    cry(id) {
      if (!enabled || !/^[a-z]+$/.test(String(id))) return;
      const audio = new Audio(`assets/cries/${id}.ogg`);
      audio.volume = 0.18; // un 60 % más bajo que antes: los gritos no tapan la voz en el stream
      audio.play().catch((err) => console.warn('No se pudo reproducir el grito de', id, err));
    },
    toggle() {
      enabled = !enabled;
      try {
        localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
      } catch (err) {
        console.warn('No se pudo guardar la preferencia de sonido:', err);
      }
      if (enabled) EFFECTS.step();
      return enabled;
    },
  };
})();
