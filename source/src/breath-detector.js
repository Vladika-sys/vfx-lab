const clamp = value => Math.min(1, Math.max(0, value));

export function breathFeatures(samples, spectrum, sampleRate, fftSize) {
  let energy = 0, peak = 0;
  for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  let sum = 0, logs = 0, low = 0, mid = 0, strongest = 0, count = 0;
  for (let i = 1; i < spectrum.length; i++) {
    const frequency = i * sampleRate / fftSize;
    if (frequency < 40 || frequency > 5500) continue;
    const db = Number.isFinite(spectrum[i]) ? Math.max(-100, spectrum[i]) : -100;
    const power = 10 ** (db / 10);
    sum += power; logs += Math.log(power); strongest = Math.max(strongest, power); count++;
    if (frequency < 600) low += power;
    else if (frequency < 3000) mid += power;
  }
  let periodicity = 0;
  const stride = 4, length = Math.floor(samples.length / stride);
  for (let lag = Math.floor(sampleRate / (450 * stride)); lag <= Math.ceil(sampleRate / (85 * stride)); lag += 2) {
    let product = 0, first = 0, second = 0;
    for (let i = lag; i < length; i++) {
      const a = samples[i * stride], b = samples[(i - lag) * stride];
      product += a * b; first += a * a; second += b * b;
    }
    periodicity = Math.max(periodicity, product / Math.max(1e-12, Math.sqrt(first * second)));
  }
  return { rms, flatness: count ? Math.exp(logs / count) / Math.max(sum / count, 1e-12) : 0,
    lowRatio: low / Math.max(sum, 1e-12), midRatio: mid / Math.max(sum, 1e-12),
    peakRatio: strongest / Math.max(sum, 1e-12), crest: peak / Math.max(rms, 1e-8), periodicity };
}

export function createBreathGate() {
  let elapsed = 0, floor = .0005, candidate = 0, release = 0, active = false, level = 0;
  return {
    update(features, seconds, eligible = true) {
      const dt = Math.max(0, Math.min(.1, seconds)); elapsed += dt;
      const { rms = 0, flatness = 0, lowRatio = 0, midRatio = 0, peakRatio = 1, periodicity = 0 } = features;
      const on = Math.max(.003, floor * 2.2), off = Math.max(.0018, floor * 1.45);
      const noiseLike = periodicity < .75 && peakRatio < .25 && (flatness > .10 || lowRatio > .58 || midRatio > .55);
      const valid = eligible && elapsed > .7 && noiseLike && rms > (active ? off : on);
      if (elapsed <= .7 || (!active && !valid && rms < on)) {
        floor += (Math.min(.02, Math.max(.0005, rms)) - floor) * (1 - Math.exp(-dt * 2));
      }
      if (valid) { candidate += dt; release = 0; if (candidate > .09) active = true; }
      else { candidate = 0; release += dt; if (!eligible || release > .14) active = false; }
      const desired = active ? clamp(.55 + (rms - on) / Math.max(.012, on * 2)) : 0;
      level += (desired - level) * (1 - Math.exp(-dt * (desired > level ? 20 : 11)));
      if (!eligible) level = 0;
      return { level, active, calibrated: elapsed > .7, floor, signal: clamp(rms / on) };
    },
    reset() { elapsed = 0; floor = .0005; candidate = release = level = 0; active = false; },
  };
}
