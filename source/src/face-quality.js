export function facePixelRatio(width, height, deviceRatio = 1) {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.min(deviceRatio, 1.25, 900 / Math.max(w, h), Math.sqrt(650000 / (w * h)));
}

export function createFaceQuality() {
  let scale = 1, elapsed = 0, total = 0, frames = 0, settling = 2;
  return {
    get scale() { return scale; },
    sample(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > .75) return false;
      if (settling > 0) { settling -= seconds; return false; }
      elapsed += seconds; total += seconds; frames++;
      if (elapsed < 1) return false;
      const average = total / frames, previous = scale;
      if (average > .04) scale = Math.max(.55, scale * .8);
      else if (average < .022) scale = Math.min(1, scale + .05);
      elapsed = total = frames = 0;
      if (scale !== previous) settling = scale < previous ? 1 : 5;
      return scale !== previous;
    },
  };
}
