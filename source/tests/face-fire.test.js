import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMouthFire } from '../src/face-fire.js';

test('fire starts at the mouth in head coordinates and changes direction when the head turns', () => {
  const fire = createMouthFire(), head = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  head.add(fire.group); head.position.z = -60;
  const mouth = new THREE.Vector3(0, -4.2, 7.4);
  for (let i = 0; i < 60; i++) fire.update(1 / 60, i / 60, 1, mouth);
  head.updateMatrixWorld(true); fire.prepare(camera);
  const front = fire.group.localToWorld(new THREE.Vector3(0, 0, 20));
  head.rotation.y = .6; head.updateMatrixWorld(true); fire.prepare(camera);
  const turned = fire.group.localToWorld(new THREE.Vector3(0, 0, 20));
  assert.ok(Math.abs(front.x) < 1e-8); assert.ok(turned.x > 10);
  assert.ok(fire.group.position.distanceTo(mouth) < 1e-6);
  assert.ok(fire.group.visible);
  assert.ok(fire.group.children[0].material.uniforms.uCamera.value.toArray().every(Number.isFinite));
});
test('fire releases smoothly and reset clears both flame and its light immediately', () => {
  const fire = createMouthFire();
  for (let i = 0; i < 30; i++) fire.update(1 / 60, i / 60, 1);
  const before = fire.group.children[1].intensity;
  fire.update(1 / 60, .6, 0); assert.ok(fire.group.children[1].intensity < before);
  for (let i = 0; i < 90; i++) fire.update(1 / 60, .7, 0);
  assert.equal(fire.group.visible, false);
  fire.reset(); assert.equal(fire.group.children[1].intensity, 0);
});
