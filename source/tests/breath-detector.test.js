import test from 'node:test';
import assert from 'node:assert/strict';
import { breathFeatures, createBreathGate } from '../src/breath-detector.js';

const quiet = { rms: .003, flatness: .7, lowRatio: .2, midRatio: .5, peakRatio: .01 };
const breath = { rms: .07, flatness: .45, lowRatio: .3, midRatio: .5, peakRatio: .03 };
function warm(gate) { for (let i = 0; i < 60; i++) gate.update(quiet, 1 / 60); }
test('quiet calibration, short transients, and closed-mouth input do not trigger fire', () => {
  const gate = createBreathGate();
  for (let i = 0; i < 30; i++) assert.equal(gate.update(breath, 1 / 60).active, false);
  gate.reset(); warm(gate);
  for (let i = 0; i < 4; i++) assert.equal(gate.update(breath, 1 / 60).active, false);
  for (let i = 0; i < 50; i++) assert.equal(gate.update(breath, 1 / 60, false).level, 0);
});
test('sustained broadband breath activates, then fades after the breath ends', () => {
  const gate = createBreathGate(); warm(gate);
  let result;
  for (let i = 0; i < 30; i++) result = gate.update(breath, 1 / 60);
  assert.equal(result.active, true); assert.ok(result.level > .7);
  for (let i = 0; i < 65; i++) result = gate.update(quiet, 1 / 60);
  assert.equal(result.active, false); assert.ok(result.level < .005);
});
test('tonal voice/music-like spectra are rejected even at a loud RMS', () => {
  const gate = createBreathGate(); warm(gate);
  for (let i = 0; i < 100; i++) assert.equal(gate.update({ rms: .18, flatness: .002, lowRatio: .85, midRatio: .13, peakRatio: .7 }, 1 / 60).active, false);
});
test('spectral features distinguish broadband noise from a narrow tone at 44.1 and 48 kHz', () => {
  for (const rate of [44100, 48000]) {
    const samples = new Float32Array(2048).fill(.05), spectrum = new Float32Array(1024).fill(-40);
    const noise = breathFeatures(samples, spectrum, rate, 2048);
    assert.ok(Math.abs(noise.rms - .05) < 1e-6); assert.ok(noise.flatness > .99);
    spectrum.fill(-100); spectrum[Math.round(220 * 2048 / rate)] = -10;
    const tone = breathFeatures(samples, spectrum, rate, 2048);
    assert.ok(tone.flatness < .01); assert.ok(tone.peakRatio > .99);
  }
});
test('render frame rate does not materially change the breath envelope', () => {
  const levels = [];
  for (const fps of [30, 60, 120]) {
    const gate = createBreathGate(); warm(gate);
    let result;
    for (let i = 0; i < fps; i++) result = gate.update(breath, 1 / fps);
    levels.push(result.level);
  }
  assert.ok(Math.max(...levels) - Math.min(...levels) < .01);
});
