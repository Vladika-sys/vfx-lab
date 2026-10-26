import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceAudio } from '../src/face-audio.js';

function fixture(getMicrophone = async () => ({ getTracks: () => [], getAudioTracks: () => [] })) {
  const nodes = [], gains = [];
  const node = () => { const value = { connections: [], disconnected: false, connect(other) { this.connections.push(other); }, disconnect() { this.disconnected = true; } }; nodes.push(value); return value; };
  const context = { state: 'running', sampleRate: 48000, currentTime: 0, destination: {}, closed: false,
    resumes: 0, async resume() { this.resumes++; this.state = 'running'; }, close() { this.closed = true; return Promise.resolve(); },
    createGain() { const gain = { ...node(), gain: { value: 0, setTargetAtTime(value) { this.value = value; } } }; gains.push(gain); return gain; },
    createMediaElementSource: node, createMediaStreamSource: node,
    createAnalyser() { return { ...node(), fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData(array) { array.fill(.003); }, getFloatFrequencyData(array) { array.fill(-60); } }; },
  };
  const music = { paused: true, calls: 0, async play() { this.paused = false; this.calls++; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
  const sound = createFaceAudio({ src: '/music.mp3', contextFactory: () => context, audioFactory: () => music, getMicrophone });
  return { sound, music, context, nodes, gains };
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
test('microphone capture requests raw input without suppressing wind', async () => {
  let constraints, stopped = false;
  const track = { readyState: 'live', stop() { stopped = true; this.readyState = 'ended'; } };
  const { sound } = fixture(async options => { constraints = options; return { getTracks: () => [track], getAudioTracks: () => [track] }; });
  await sound.enableMicrophone(); assert.equal(sound.microphoneActive, true);
  assert.equal(constraints.video, false); assert.equal(constraints.audio.echoCancellation, false); assert.equal(constraints.audio.noiseSuppression, false);
  assert.equal(constraints.audio.autoGainControl, false);
  sound.disableMicrophone(); assert.equal(stopped, true); assert.equal(sound.microphoneActive, false); sound.close();
});

test('microphone graph has an inaudible destination and resumes after input routing changes', async () => {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const setup = fixture(async () => {
    setup.context.state = 'suspended';
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  });
  const { sound, context, gains, nodes } = setup;
  sound.setActive(true); await sound.enableMicrophone();
  assert.equal(context.resumes, 2); assert.equal(context.state, 'running');
  assert.equal(gains[0].gain.value, .04);
  const sink = gains[1]; assert.equal(sink.gain.value, 0);
  assert.ok(sink.connections.includes(context.destination));
  assert.ok(nodes.some(node => node.connections.includes(sink)));
  context.state = 'suspended'; assert.equal(sound.microphonePaused, true);
  assert.equal(sound.update(1 / 60, true).signal, 0);
  await sound.resumeMicrophone(); assert.equal(sound.microphonePaused, false);
  sound.disableMicrophone(); assert.equal(sink.disconnected, true); assert.equal(gains[0].gain.value, .25);
  sound.close();
});
test('a late music play promise cannot leave audio running after the session closes', async () => {
  const { sound, music } = fixture(); let finish;
  music.play = () => new Promise(resolve => { finish = () => { music.paused = false; resolve(); }; });
  const unlocking = sound.unlock(); sound.close(); finish(); await unlocking;
  assert.equal(music.paused, true);
});
