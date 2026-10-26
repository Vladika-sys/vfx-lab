import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createRedEyes } from '../src/face-eyes.js';

const reference = JSON.parse(await readFile(new URL('../public/assets/face/reference.json', import.meta.url)));
function observation(yaw = 0) {
  const camera = new THREE.PerspectiveCamera(55, 9 / 16, 1, 1000);
  const pose = new THREE.Matrix4().compose(new THREE.Vector3(2, 1, -65), new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, yaw, -.12)), new THREE.Vector3(1, 1, 1));
  const project = point => { const p = point.clone().applyMatrix4(pose).project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; };
  const landmarks = Array.from({ length: reference.positions.length / 3 }, (_, i) => project(new THREE.Vector3(reference.positions[i * 3], reference.positions[i * 3 + 1], 5)));
  landmarks[468] = project(new THREE.Vector3(-3.2, 2.65, 5));
  landmarks[473] = project(new THREE.Vector3(3.2, 2.65, 5));
  return { camera, pose, landmarks };
}

test('red irises stay on the observed eyes at different head angles', () => {
  for (const yaw of [-.6, 0, .6]) {
    const { landmarks, pose, camera } = observation(yaw), eyes = createRedEyes();
    eyes.sample(landmarks, pose, camera, true); eyes.update(1 / 60, 1);
    eyes.group.children.forEach((mesh, side) => {
      assert.equal(mesh.visible, true);
      const iris = mesh.material.uniforms.uIris.value;
      const projected = new THREE.Vector3(iris.x, iris.y, 5).applyMatrix4(pose).project(camera);
      const measured = landmarks[side ? 473 : 468];
      assert.ok(Math.abs((projected.x + 1) / 2 - measured.x) < 1e-6);
      assert.ok(Math.abs((1 - projected.y) / 2 - measured.y) < 1e-6);
      assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    });
  }
});

test('closed eyelids, missing observations and hidden mask do not leave red dots visible', () => {
  const { landmarks, pose, camera } = observation(), eyes = createRedEyes();
  eyes.sample(landmarks, pose, camera, true); eyes.update(1 / 60, 1, false);
  assert.ok(eyes.group.children.every(mesh => !mesh.visible));
  landmarks[159] = landmarks[145]; landmarks[386] = landmarks[374];
  eyes.sample(landmarks, pose, camera); eyes.update(1 / 60, 1);
  assert.ok(eyes.group.children.every(mesh => !mesh.visible));
  eyes.sample(null, pose, camera); eyes.update(1 / 60, 1);
  assert.ok(eyes.group.children.every(mesh => !mesh.visible));
});
