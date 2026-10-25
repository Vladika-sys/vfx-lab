const clamp = value => Math.min(1, Math.max(0, value));

export function breathFeatures(samples, spectrum, sampleRate, fftSize) {
  let energy = 0, peak = 0;
  for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  let sum = 0, logs = 0, low = 0, mid = 0, strongest = 0, count = 0;
  for (let i = 1; i < spectrum.length; i++) {
    const frequency = i * sampleRate / fftSize;
    if (frequency < 90 || frequency > 5500) continue;
    const db = Number.isFinite(spectrum[i]) ? Math.max(-100, spectrum[i]) : -100;
    const power = 10 ** (db / 10);
    sum += power; logs += Math.log(power); strongest = Math.max(strongest, power); count++;
    if (frequency < 600) low += power;
    else if (frequency < 3000) mid += power;
  }
  return { rms, flatness: count ? Math.exp(logs / count) / Math.max(sum / count, 1e-12) : 0,
    lowRatio: low / Math.max(sum, 1e-12), midRatio: mid / Math.max(sum, 1e-12),
    peakRatio: strongest / Math.max(sum, 1e-12), crest: peak / Math.max(rms, 1e-8) };
}

export function createBreathGate() {
  let elapsed = 0, floor = .003, candidate = 0, release = 0, active = false, level = 0;
  return {
    update(features, seconds, eligible = true) {
      const dt = Math.max(0, Math.min(.1, seconds)); elapsed += dt;
      const { rms = 0, flatness = 0, lowRatio = 0, midRatio = 0, peakRatio = 1 } = features;
      const on = Math.max(.018, floor * 3.2), off = Math.max(.010, floor * 1.9);
      const noiseLike = flatness > .12 || (lowRatio > .58 && midRatio > .08 && peakRatio < .30);
      const valid = eligible && elapsed > .7 && noiseLike && rms > (active ? off : on);
      if (elapsed <= .7 || (!active && !valid && rms < on)) {
        floor += (Math.min(.02, Math.max(.0005, rms)) - floor) * (1 - Math.exp(-dt * 2));
      }
      if (valid) { candidate += dt; release = 0; if (candidate > .09) active = true; }
      else { candidate = 0; release += dt; if (!eligible || release > .14) active = false; }
      const desired = active ? clamp(.35 + (rms - on) / Math.max(.04, on * 3)) : 0;
      level += (desired - level) * (1 - Math.exp(-dt * (desired > level ? 20 : 11)));
      if (!eligible) level = 0;
      return { level, active, calibrated: elapsed > .7, floor };
    },
    reset() { elapsed = 0; floor = .003; candidate = release = level = 0; active = false; },
  };
}
