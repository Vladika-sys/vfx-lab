export function createTargetSound({ contextFactory = () => new (window.AudioContext || window.webkitAudioContext)() } = {}) {
  const context = contextFactory();
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(context.destination);
  const voices = new Set();
  let active = false, closed = false, next = 0, step = 0;
  function note(frequency, at, duration, volume, type) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(output);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .04);
  }
  function silence() {
    output.gain.cancelScheduledValues(context.currentTime);
    output.gain.setTargetAtTime(0, context.currentTime, .025);
    for (const oscillator of voices) { try { oscillator.stop(context.currentTime + .1); } catch {} }
    voices.clear();
  }
  return {
    async unlock() { if (!closed) await context.resume(); },
    setActive(value) {
      if (closed || value === active) return;
      active = value;
      if (!active) silence();
      else {
        next = context.currentTime + .04;
        output.gain.cancelScheduledValues(context.currentTime);
        output.gain.setTargetAtTime(.22, context.currentTime, .1);
      }
    },
    update() {
      if (!active || closed || context.state !== 'running') return;
      const notes = [261.63, 329.63, 392, 493.88, 293.66, 349.23, 440, 523.25];
      next = Math.max(next, context.currentTime);
      while (next < context.currentTime + .13) {
        const index = step % notes.length;
        note(notes[index], next, .65, .13, 'sine');
        if (step % 4 === 0) note(index < 4 ? 130.81 : 146.83, next, 1.2, .10, 'triangle');
        next += .32; step++;
      }
    },
    close() {
      if (closed) return;
      active = false; closed = true; silence();
      return context.close().catch(() => {});
    },
  };
}
