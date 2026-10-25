import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceAudio } from '../src/face-audio.js';

function fixture(getMicrophone = async () => ({ getTracks: () => [], getAudioTracks: () => [] })) {
  const node = () => ({ connect() {}, disconnect() {} });
  const context = { state: 'running', sampleRate: 48000, currentTime: 0, destination: {}, closed: false,
    resume: async () => {}, close() { this.closed = true; return Promise.resolve(); },
    createGain() { return { ...node(), gain: { value: 0, setTargetAtTime(value) { this.value = value; } } }; },
    createMediaElementSource: node, createMediaStreamSource: node,
    createAnalyser() { return { ...node(), fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData(array) { array.fill(.003); }, getFloatFrequencyData(array) { array.fill(-60); } }; },
  };
  const music = { paused: true, calls: 0, async play() { this.paused = false; this.calls++; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
  const sound = createFaceAudio({ src: '/music.mp3', contextFactory: () => context, audioFactory: () => music, getMicrophone });
  return { sound, music, context };
}
test('music unlocks silently, then follows face visibility and mute without restarting each frame', async () => {
  const { sound, music } = fixture(); await sound.unlock(); assert.equal(music.paused, true);
  sound.setActive(true); await Promise.resolve(); await Promise.resolve(); assert.equal(music.paused, false);
  const count = music.calls;
  for (let i = 0; i < 50; i++) sound.setActive(true);
  assert.equal(music.calls, count);
  sound.setMuted(true); assert.equal(music.paused, true);
  sound.setMuted(false); await Promise.resolve(); await Promise.resolve();
  sound.setActive(false); assert.equal(music.paused, true); sound.close();
});
test('closing during microphone permission releases the late stream and cannot reconnect it', async () => {
  let resolve, stopped = false;
  const { sound, context } = fixture(() => new Promise(done => { resolve = done; }));
  const enabling = sound.enableMicrophone(); await Promise.resolve();
  sound.close(); resolve({ getTracks: () => [{ stop() { stopped = true; } }] }); await enabling;
  assert.equal(stopped, true); assert.equal(sound.microphoneActive, false); assert.equal(context.closed, true);
});
test('microphone capture asks for echo cancellation but not suppression of the breath signal', async () => {
  let constraints, stopped = false;
  const track = { readyState: 'live', stop() { stopped = true; this.readyState = 'ended'; } };
  const { sound } = fixture(async options => { constraints = options; return { getTracks: () => [track], getAudioTracks: () => [track] }; });
  await sound.enableMicrophone(); assert.equal(sound.microphoneActive, true);
  assert.equal(constraints.video, false); assert.equal(constraints.audio.echoCancellation, true); assert.equal(constraints.audio.noiseSuppression, false);
  sound.disableMicrophone(); assert.equal(stopped, true); assert.equal(sound.microphoneActive, false); sound.close();
});
test('a late music play promise cannot leave audio running after the session closes', async () => {
  const { sound, music } = fixture(); let finish;
  music.play = () => new Promise(resolve => { finish = () => { music.paused = false; resolve(); }; });
  const unlocking = sound.unlock(); sound.close(); finish(); await unlocking;
  assert.equal(music.paused, true);
});
