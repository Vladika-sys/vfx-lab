import { breathFeatures, createBreathGate } from './breath-detector.js';

export function createFaceAudio({
  src, contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(),
  audioFactory = url => new Audio(url), getMicrophone = constraints => navigator.mediaDevices.getUserMedia(constraints),
} = {}) {
  const context = contextFactory(), music = audioFactory(src), output = context.createGain();
  music.loop = true; music.preload = 'auto'; music.volume = 1;
  const musicSource = context.createMediaElementSource(music); musicSource.connect(output); output.connect(context.destination);
  output.gain.value = 0;
  const gate = createBreathGate();
  let closed = false, wanted = false, playing = null, musicError = null, muted = false, lastEnabled = null;
  let micGeneration = 0, micStream = null, micSource = null, analyser = null, samples, spectrum;

  function play() {
    if (closed || playing || !music.paused) return playing || Promise.resolve();
    playing = Promise.resolve(music.play()).then(() => { musicError = null; }).catch(error => {
      if (!closed && error.name !== 'AbortError') musicError = error;
    }).finally(() => { playing = null; if (closed || !wanted || muted) music.pause(); });
    return playing;
  }
  function disableMicrophone() {
    micGeneration++; micStream?.getTracks().forEach(track => track.stop()); micStream = null;
    micSource?.disconnect(); micSource = null; analyser?.disconnect(); analyser = null; gate.reset();
  }
  return {
    async unlock() {
      if (closed) return;
      const resume = context.resume();
      const unlock = play();
      await Promise.all([resume, unlock]);
    },
    setActive(active) {
      if (closed) return;
      wanted = active;
      const enabled = wanted && !muted;
      if (enabled === lastEnabled) return;
      lastEnabled = enabled;
      output.gain.setTargetAtTime(enabled ? .25 : 0, context.currentTime, .16);
      if (!enabled) music.pause(); else if (!musicError) play();
    },
    setMuted(value) { muted = value; this.setActive(wanted); },
    get muted() { return muted; },
    get musicError() { return musicError || music.error; },
    get microphoneActive() { return Boolean(micStream?.getAudioTracks().some(track => track.readyState === 'live')); },
    async enableMicrophone() {
      if (closed || micStream) return;
      const attempt = ++micGeneration;
      await context.resume();
      if (closed || attempt !== micGeneration) return;
      const stream = await getMicrophone({ video: false, audio: {
        echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1,
      } });
      if (closed || attempt !== micGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
      try {
        micStream = stream; micSource = context.createMediaStreamSource(stream); analyser = context.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = .05; micSource.connect(analyser);
        samples = new Float32Array(analyser.fftSize); spectrum = new Float32Array(analyser.frequencyBinCount);
        gate.reset();
      } catch (error) { disableMicrophone(); throw error; }
    },
    disableMicrophone,
    update(delta, eligible) {
      if (!analyser || closed || context.state !== 'running') return { level: 0, active: false, calibrated: false };
      analyser.getFloatTimeDomainData(samples); analyser.getFloatFrequencyData(spectrum);
      return gate.update(breathFeatures(samples, spectrum, context.sampleRate, analyser.fftSize), delta, eligible);
    },
    close() {
      if (closed) return;
      closed = true; wanted = false; disableMicrophone(); music.pause();
      music.removeAttribute('src'); music.load(); musicSource.disconnect(); output.disconnect();
      return context.close().catch(() => {});
    },
  };
}
