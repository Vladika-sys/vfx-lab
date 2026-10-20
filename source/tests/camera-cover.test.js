import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitCameraCover } from '../src/camera-cover.js';

test('rendering only the visible viewport preserves alignment with the cropped camera image', () => {
  for (const [videoWidth, videoHeight, width, height] of [[1280, 720, 390, 844], [720, 1280, 844, 390], [1280, 720, 1280, 720]]) {
    const camera = new THREE.PerspectiveCamera(45, videoWidth / videoHeight, .1, 100);
    const fitted = fitCameraCover({ videoWidth, videoHeight, width, height, projectionMatrix: camera.projectionMatrix });
    for (const point of [new THREE.Vector3(0, 0, -3), new THREE.Vector3(.4, -.2, -2), new THREE.Vector3(-.6, .3, -4)]) {
      const original = point.clone().applyMatrix4(camera.projectionMatrix), cropped = point.clone().applyMatrix4(fitted.projectionMatrix);
      const oldX = width / 2 + original.x * fitted.coverWidth / 2, oldY = height / 2 - original.y * fitted.coverHeight / 2;
      assert.ok(Math.abs((cropped.x + 1) * width / 2 - oldX) < 1e-9);
      assert.ok(Math.abs((1 - cropped.y) * height / 2 - oldY) < 1e-9);
    }
    assert.ok(fitted.coverWidth >= width && fitted.coverHeight >= height);
  }
});

test('a portrait viewport avoids rendering the hidden part of a landscape camera frame', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, .1, 100);
  const fitted = fitCameraCover({ videoWidth: 1280, videoHeight: 720, width: 390, height: 844, projectionMatrix: camera.projectionMatrix });
  const previousPixels = fitted.coverWidth * fitted.coverHeight * 1.5 ** 2;
  const newPixels = 390 * 844 * 1.25 ** 2;
  assert.ok(newPixels < previousPixels * .2);
});
