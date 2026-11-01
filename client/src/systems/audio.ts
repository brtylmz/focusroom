let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!context) {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Short tones. Browsers only allow audio after a user gesture, so this is a no-op until one occurs. */
export function playChime(kind: 'message' | 'alert'): void {
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const frequencies = kind === 'alert' ? [880, 1174.66, 880] : [660];
  const start = ctx.currentTime;
  frequencies.forEach((frequency, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const t = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
