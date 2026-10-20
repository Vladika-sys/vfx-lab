import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrackedPose } from '../src/image-pose.js';

const matrix = (x = 0, angle = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, -2000),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1000, 1000, 1000));
function fixture() {
  let time = 0;
  const anchor = new THREE.Group(), pose = createTrackedPose(anchor, { now: () => time });
  return { anchor, pose, at(value) { time = value; return pose.update(); }, setTime(value) { time = value; } };
}

test('tracking updates are eased over display frames without changing the first placement', () => {
  const f = fixture(); f.pose.sample(matrix()); assert.equal(f.anchor.matrix.elements[12], 0);
  f.pose.sample(matrix(100)); assert.equal(f.anchor.matrix.elements[12], 0);
  let previous = 0, largestStep = 0;
  for (let i = 1; i <= 15; i++) {
    f.at(i * 1000 / 60);
    const x = f.anchor.matrix.elements[12];
    assert.ok(x >= previous && x <= 100); largestStep = Math.max(largestStep, x - previous); previous = x;
  }
  assert.ok(largestStep < 35); assert.ok(previous > 99);
});

test('smoothing is time based at 30, 60 and 120 display frames per second', () => {
  const results = [30, 60, 120].map(fps => {
    const f = fixture(); f.pose.sample(matrix()); f.pose.sample(matrix(100, .8));
    for (let i = 1; i <= fps / 2; i++) f.at(i * 1000 / fps);
    return f.anchor.matrix;
  });
  for (const value of results.slice(1)) value.elements.forEach((entry, i) => assert.ok(Math.abs(entry - results[0].elements[i]) < 1e-7));
});

test('small alternating tracking errors are damped and rotations stay orthogonal', () => {
  const f = fixture(); f.pose.sample(matrix()); let squared = 0, count = 0;
  for (let frame = 1; frame <= 240; frame++) {
    f.setTime(frame * 1000 / 60);
    if (frame % 4 === 0) f.pose.sample(matrix((frame / 4) % 2 ? 4 : -4, ((frame / 4) % 2 ? 1 : -1) * .004));
    f.pose.update();
    if (frame > 60) { squared += f.anchor.matrix.elements[12] ** 2; count++; }
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    f.anchor.matrix.extractBasis(x, y, z); x.normalize(); y.normalize(); z.normalize();
    assert.ok(Math.abs(x.dot(y)) + Math.abs(x.dot(z)) + Math.abs(y.dot(z)) < 1e-9);
  }
  assert.ok(Math.sqrt(squared / count) < 2.4);
});

test('brief recognition gaps hold the pose, but real loss hides it and reacquisition snaps into place', () => {
  const f = fixture(); f.pose.sample(matrix()); f.at(100); f.pose.lose();
  assert.equal(f.at(219), true);
  f.pose.sample(matrix(20)); assert.equal(f.anchor.matrix.elements[12], 0);
  f.at(230); f.pose.lose(); assert.equal(f.at(351), false);
  f.setTime(360); f.pose.sample(matrix(400)); assert.equal(f.anchor.matrix.elements[12], 400);
  assert.equal(f.anchor.visible, true);
  f.pose.reset(); assert.equal(f.at(500), false);
});

test('invalid pose samples do not corrupt the displayed transform', () => {
  const f = fixture(); f.pose.sample(matrix(20));
  const invalid = matrix(); invalid.elements[0] = NaN;
  assert.equal(f.pose.sample(invalid), false);
  assert.equal(f.pose.sample(new THREE.Matrix4().makeScale(0, 0, 0)), false);
  assert.equal(f.anchor.matrix.elements[12], 20); assert.ok(f.anchor.matrix.elements.every(Number.isFinite));
});
