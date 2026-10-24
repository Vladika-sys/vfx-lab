import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { fitFacePose, jawAmount } from '../src/face-pose.js';

const reference = JSON.parse(await readFile(new URL('../public/assets/face/reference.json', import.meta.url)));
test('face pose fits canonical centimeters to unmirrored video, at different head angles and aspects', () => {
  for (const aspect of [16 / 9, 9 / 16, 1]) for (const yaw of [-.65, 0, .65]) {
    const camera = new PerspectiveCamera(55, aspect, 1, 1000);
    const position = new Vector3(3, -2, -60), rotation = new Quaternion().setFromEuler(new Euler(.15, yaw, -.12));
    const matrix = new Matrix4().compose(position, rotation, new Vector3(1, 1, 1));
    const landmarks = [];
    for (let i = 0; i < reference.positions.length / 3; i++) {
      const p = new Vector3().fromArray(reference.positions, i * 3).applyMatrix4(matrix).project(camera);
      landmarks.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2 });
    }
    const fit = fitFacePose(matrix.elements, landmarks, reference, camera);
    assert.ok(fit);
    assert.ok(new Vector3().setFromMatrixPosition(fit).distanceTo(position) < 1e-7);
    assert.ok(new Quaternion().setFromRotationMatrix(fit).angleTo(rotation) < 1e-6);
  }
});
test('invalid, missing or degenerate face observations do not produce a mask pose', () => {
  const camera = new PerspectiveCamera(55, 1, 1, 1000), matrix = new Matrix4().elements;
  assert.equal(fitFacePose(null, [], reference, camera), null);
  assert.equal(fitFacePose(matrix, [], reference, camera), null);
  assert.equal(fitFacePose(matrix.map(() => NaN), [], reference, camera), null);
  assert.equal(fitFacePose(matrix, Array.from({ length: 468 }, () => ({ x: .5, y: .5 })), reference, camera), null);
});
test('jaw movement has a neutral dead zone and clamps to the exported 22-degree joint range', () => {
  assert.equal(jawAmount([]), 0);
  assert.equal(jawAmount([{ categoryName: 'jawOpen', score: .02 }]), 0);
  assert.equal(jawAmount([{ categoryName: 'jawOpen', score: 1 }]), 1);
  assert.equal(jawAmount([{ categoryName: 'jawOpen', score: NaN }]), 0);
  assert.ok(Math.abs(jawAmount([{ categoryName: 'jawOpen', score: .355 }]) - .5) < 1e-9);
});
test('Blender export contains eyes, embedded textures and the independently controllable jaw', async () => {
  const bytes = await readFile(new URL('../public/assets/face/masca_lemn.glb', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
  assert.ok(gltf.nodes.some(node => node.name === 'JawPivot'));
  assert.ok(gltf.nodes.some(node => node.name === 'MaskShell'));
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => !image.uri && Number.isInteger(image.bufferView)));
  assert.ok(gltf.animations.some(animation => animation.name === 'JawOpen'));
  assert.equal(reference.units, 'centimeters');
  assert.equal(reference.positions.length, 468 * 3);
});
