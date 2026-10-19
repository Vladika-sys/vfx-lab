export function createHoraMusic({
  src = `${import.meta.env.BASE_URL}assets/ar/hora.m4a`,
  AudioClass = window.Audio,
} = {}) {
  const audio = new AudioClass(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = .8;
  audio.preservesPitch = true;
  let closed = false, playing = false, pending = null, failure = null;

  function play() {
    if (closed || pending || !audio.paused) return pending || Promise.resolve();
    pending = Promise.resolve(audio.play()).catch(error => {
      if (closed || !playing || error.name === 'AbortError') return;
      failure = error;
      throw error;
    }).finally(() => {
      pending = null;
      if (!playing || closed) audio.pause();
    });
    return pending;
  }

  return {
    async resume() { playing = true; await play(); },
    update(_beat, bpm, shouldPlay) {
      if (closed) return;
      audio.playbackRate = Math.max(.65, Math.min(1.5, bpm / 112));
      playing = shouldPlay;
      if (!playing) audio.pause();
      else if (!failure) play().catch(() => {});
    },
    get error() { return failure || audio.error; },
    close() {
      closed = true; playing = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return Promise.resolve();
    },
  };
}
