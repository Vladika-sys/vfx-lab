const steps = [
  1, 1, 1, -1 / 3, 1, 1, 1, -1 / 3,
  .2, .2, .2, .2, .2, .2, .2, .2,
  .5, .5, .5, 0, .5, .5, .5, 0,
  .2, -.8, -.8, -.4, -.15, .6, 1, 1,
];
const stride = 3 * Math.PI / 32;
const offsets = [0];
for (const step of steps) offsets.push(offsets.at(-1) + step * stride);
const wrap = (value, length) => ((value % length) + length) % length;
const ease = value => value * value * (3 - 2 * value);

export function horaPhrase(beat) {
  const phase = wrap(beat, 32);
  return { index: Math.floor(phase / 8), phase: phase % 8 };
}

export function horaTravel(beat) {
  const whole = Math.floor(beat), phase = beat - whole;
  const step = wrap(whole, 32);
  return Math.floor(beat / 32) * offsets[32] + offsets[step] + steps[step] * stride * ease(phase);
}

export function horaRadius(beat, count = 6) {
  const phrase = horaPhrase(beat);
  let gathering = 0;
  if (phrase.index === 1) {
    const shape = [0, -.5, -1, -1, -1, -.5, 0, .25, 0];
    const step = Math.floor(phrase.phase);
    gathering = shape[step] + (shape[step + 1] - shape[step]) * ease(phrase.phase - step);
  }
  return .95 + Math.sin(beat * Math.PI / 4) * .02 + gathering * Math.min(.24, 1.15 / count);
}

export function horaFootStep(beat, side) {
  const whole = Math.floor(beat), phase = beat - whole;
  const swinging = wrap(whole, 2) === side;
  const style = horaPhrase(beat).index === 2 ? ['heel', 'side', 'kick', 'hop'][wrap(whole, 4)] : 'side';
  return {
    from: swinging ? whole - 1 : whole,
    to: swinging ? whole + 1 : whole,
    progress: swinging ? ease(phase) : 0,
    lift: swinging ? Math.sin(phase * Math.PI) : 0,
    accent: wrap(whole, 4) === 3,
    style,
    height: style === 'heel' ? .035 : style === 'kick' ? .19 : .13,
    reach: style === 'heel' ? .09 : style === 'kick' ? .18 : 0,
    pitch: style === 'heel' ? -.42 : style === 'kick' ? .16 : -.22,
  };
}

export function horaArmLift(beat, edge, count) {
  const phrase = horaPhrase(beat);
  const gate = ease(Math.min(1, phrase.phase / .75, (8 - phrase.phase) / .75));
  if (phrase.index === 1) return Math.sin(phrase.phase / 8 * Math.PI) ** 2 * .19;
  if (phrase.index === 2) return Math.sin(beat * Math.PI) ** 2 * .065;
  if (phrase.index === 3) return Math.max(0, Math.sin(phrase.phase / 8 * Math.PI * 2 - edge / count * Math.PI * 2)) ** 2 * .15 * gate;
  return 0;
}

export function horaAutomaticHop(beat, index, count) {
  const phrase = horaPhrase(beat);
  if (phrase.index === 2 && Math.floor(phrase.phase) === 7) return Math.sin(phrase.phase * Math.PI) ** 2 * .085;
  if (phrase.index === 3) {
    const progress = phrase.phase / 8 * count - index;
    if (progress > 0 && progress < 1) return Math.sin(progress * Math.PI) ** 2 * .11;
  }
  return 0;
}

export function horaReaction(kind, seconds) {
  const duration = kind === 'stamp' ? 1.1 : kind === 'sway' ? 1.4 : .8;
  const progress = Math.min(1, Math.max(0, seconds / duration));
  const envelope = progress === 1 ? 0 : Math.sin(progress * Math.PI) ** 2;
  return {
    hop: kind === 'hop' ? Math.sqrt(envelope) * .28 : 0,
    stamp: kind === 'stamp' ? Math.sin(progress * Math.PI * 2) ** 2 * .14 * (progress < 1 ? 1 : 0) : 0,
    side: Math.min(1, Math.floor(progress * 2)),
    sway: kind === 'sway' ? Math.sin(progress * Math.PI * 4) * envelope * .20 : 0,
    yaw: kind === 'sway' ? Math.sin(progress * Math.PI * 2) * envelope * .16 : 0,
    arm: kind === 'sway' ? envelope * .07 : 0,
  };
}
