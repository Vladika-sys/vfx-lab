import test from 'node:test';
import assert from 'node:assert/strict';
import { facePixelRatio, createFaceQuality } from '../src/face-quality.js';

test('portrait, landscape and high-DPI screens stay within the render budget', () => {
  for (const [width, height, dpi] of [[393, 873, 3], [873, 393, 3], [1280, 720, 1], [1920, 1080, 2], [320, 568, 1]]) {
    const ratio = facePixelRatio(width, height, dpi);
    assert.ok(ratio <= dpi); assert.ok(width * height * ratio ** 2 <= 650001);
    assert.ok(Math.max(width, height) * ratio <= 900.01);
  }
});

test('slow frames reduce resolution, recovery is gradual and bounded', () => {
  const quality = createFaceQuality();
  for (let i = 0; i < 600; i++) quality.sample(.05);
  assert.equal(quality.scale, .55);
  for (let i = 0; i < 61; i++) quality.sample(1 / 60);
  assert.ok(quality.scale <= .61);
  for (let i = 0; i < 6000; i++) quality.sample(1 / 60);
  assert.equal(quality.scale, 1);
});

test('startup and an inactive tab do not force resolution changes', () => {
  const quality = createFaceQuality();
  for (let i = 0; i < 20; i++) quality.sample(.08);
  quality.sample(5); quality.sample(NaN);
  assert.equal(quality.scale, 1);
});
