/*
 * Interpolaciones simples para las animaciones 3D.
 * Cada tween corre dentro del bucle de render (tick) y devuelve una promesa
 * que se resuelve al terminar, para poder encadenar con await.
 */

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  // Arranque y frenado bien suaves: para movimientos de cámara.
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // Rebote al final, típico de "caer" en una casilla.
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
};

const active = new Set();

/**
 * Anima durante `ms` milisegundos llamando a onUpdate(t) con t de 0 a 1
 * (ya pasado por la curva `easing`).
 */
export function tween(ms, onUpdate, easing = ease.inOut) {
  // Con la ventana oculta nadie ve la animación y el navegador frena los
  // temporizadores: se salta directo al final para no demorar la partida.
  if (document.hidden || window.GameSpeed?.turbo) {
    onUpdate(easing(1), 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const tw = { start: performance.now(), ms: Math.max(1, ms), onUpdate, easing, resolve };
    active.add(tw);
    // Si la pestaña está en segundo plano no hay frames: el tween termina
    // igual por tiempo, para que la partida nunca quede esperando.
    setTimeout(() => finish(tw), tw.ms + 200);
  });
}

function finish(tw) {
  if (!active.has(tw)) return;
  active.delete(tw);
  tw.onUpdate(tw.easing(1), 1);
  tw.resolve();
}

export const wait = (ms) => tween(ms, () => {});

// Si la ventana se oculta a mitad de una animación, se completa ya.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) for (const tw of [...active]) finish(tw);
});

/** Avanza todas las interpolaciones; se llama una vez por frame. */
export function tickTweens(now) {
  for (const tw of active) {
    const raw = Math.min(1, (now - tw.start) / tw.ms);
    if (raw >= 1) finish(tw);
    else tw.onUpdate(tw.easing(raw), raw);
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
