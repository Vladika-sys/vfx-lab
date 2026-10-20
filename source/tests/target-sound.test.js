import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetSound } from '../src/target-sound.js';
function fixture() {
  const voices = [], gains = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(value) { this.value = value; } });
  const context = { currentTime: 1, state: 'running', destination: {}, closed: false,
    resume: async () => {}, close() { this.closed = true; return Promise.resolve(); },
    createGain() { const value = { gain: param(), connect() {}, disconnect() {} }; gains.push(value); return value; },
    createOscillator() { const voice = { frequency: param(), connect() {}, disconnect() {}, starts: [], stops: [],
      start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }; voices.push(voice); return voice; } };
  return { context, voices, gains, sound: createTargetSound({ contextFactory: () => context }) };
}
test('the soundtrack plays only while the target effect is active', async () => {
  const f = fixture(); await f.sound.unlock();
  f.sound.update(); assert.equal(f.voices.length, 0);
  f.sound.setActive(true); f.sound.update(); assert.ok(f.voices.length >= 2);
  f.sound.setActive(false); assert.equal(f.gains[0].gain.value, 0);
  const count = f.voices.length; f.context.currentTime = 20; f.sound.update();
  assert.equal(f.voices.length, count);
  assert.ok(f.voices.every(voice => voice.stops.includes(1.1)));
  await f.sound.close(); assert.equal(f.context.closed, true);
});
test('reacquisition resumes sound without scheduling the missing interval', () => {
  const f = fixture(); f.sound.setActive(true); f.sound.update(); f.sound.setActive(false);
  f.context.currentTime = 100; f.sound.setActive(true); f.sound.update();
  assert.ok(f.voices.at(-1).starts[0] >= 100);
  f.sound.close(); const count = f.voices.length; f.sound.setActive(true); f.sound.update();
  assert.equal(f.voices.length, count);
});
