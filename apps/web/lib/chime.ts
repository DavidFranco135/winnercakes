// Toque curto de "venda concluída" (sininho de notificação), gerado na hora
// pelo próprio navegador — sem arquivo de áudio. O navegador só libera som
// depois que a pessoa toca na tela uma vez; `unlockChime` cuida disso.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockChime() {
  const a = audio();
  if (a && a.state === "suspended") a.resume().catch(() => {});
}

function bell(a: AudioContext, freq: number, start: number, length: number, gain: number) {
  // Sino: tom principal + harmônico suave, ataque rápido e queda longa.
  for (const [mult, g] of [
    [1, gain],
    [2.01, gain * 0.25],
    [3.02, gain * 0.08],
  ] as const) {
    const osc = a.createOscillator();
    const env = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(g, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(env).connect(a.destination);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

/** Dois toques ascendentes ("plin-plim"). */
export function playChime() {
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") a.resume().catch(() => {});
  const t = a.currentTime + 0.02;
  bell(a, 1318.5, t, 0.55, 0.22); // Mi6
  bell(a, 1760, t + 0.16, 0.9, 0.2); // Lá6
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([60, 40, 90]);
}

/** Toque de alerta (ticket já usado / não pago): grave e duplo. */
export function playAlert() {
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") a.resume().catch(() => {});
  const t = a.currentTime + 0.02;
  bell(a, 440, t, 0.25, 0.25);
  bell(a, 440, t + 0.3, 0.35, 0.25);
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([90, 60, 90, 60, 200]);
}
