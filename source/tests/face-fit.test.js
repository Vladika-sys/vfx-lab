import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createMaskRig, landmarkOnFace, solveJawFit } from '../src/face-fit.js';
import { gltfGeometry } from './gltf-geometry.js';

const reference = JSON.parse(await readFile(new URL('../public/assets/face/reference.json', import.meta.url)));
function observation(yaw = 0, opened = false) {
  const camera = new THREE.PerspectiveCamera(55, 9 / 16, 1, 1000);
  const pose = new THREE.Matrix4().compose(new THREE.Vector3(2, 1, -65),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, yaw, -.08)), new THREE.Vector3(1, 1, 1));
  const landmarks = [];
  for (let i = 0; i < reference.positions.length / 3; i++) {
    const p = new THREE.Vector3().fromArray(reference.positions, i * 3);
    if (opened) {
      const w = THREE.MathUtils.smoothstep(-p.y, 3.8, 9.2);
      p.y -= 2.2 * w; p.z -= .3 * w;
    }
    if ([13, 14, 61, 291].includes(i)) p.z = 5.35;
    if (i === 13) p.y = -4;
    if (i === 14) p.y = opened ? -6.35 : -4.04;
    if (i === 152) p.z = reference.positions[i * 3 + 2];
    p.applyMatrix4(pose).project(camera);
    landmarks.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2 });
  }
  return { camera, pose, landmarks, reference };
}
test('closed lips keep the jaw fully closed regardless of head angle', () => {
  for (const yaw of [-.65, 0, .65]) {
    const fit = solveJawFit(observation(yaw));
    assert.ok(fit); assert.equal(fit.amount, 0); assert.equal(fit.angle, 0);
    assert.ok(fit.residual.length() < 1e-7);
  }
});
test('opening uses lip separation and follows the observed chin instead of only a blendshape score', () => {
  for (const yaw of [-.5, 0, .5]) {
    const data = observation(yaw, true), fit = solveJawFit(data);
    assert.ok(fit.amount > .98); assert.ok(fit.angle <= THREE.MathUtils.degToRad(16));
    const chin = new THREE.Vector3().fromArray(reference.positions, 152 * 3);
    const hinge = new THREE.Vector3(0, -3, -.7);
    chin.sub(hinge).applyAxisAngle(new THREE.Vector3(1, 0, 0), fit.angle).add(hinge).add(fit.residual);
    const detected = landmarkOnFace(data.landmarks[152], reference.positions[152 * 3 + 2], data.pose, data.camera);
    assert.ok(chin.distanceTo(detected) < 1e-7);
  }
});
test('bad or partial landmark observations cannot deform the jaw', () => {
  const data = observation(); data.landmarks[152] = null;
  assert.equal(solveJawFit(data), null);
  assert.equal(landmarkOnFace({ x: NaN, y: .5 }, 4, data.pose, data.camera), null);
});

function rigModel() {
  const scene = new THREE.Group(), root = new THREE.Group(), pivot = new THREE.Group();
  root.name = 'MaskRoot'; pivot.name = 'JawPivot'; pivot.position.set(0, -.03, -.007);
  scene.add(root); root.add(pivot);
  const make = name => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.02, -.038, .05, .02, -.038, .05, 0, -.10, .043], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = name; return mesh;
  };
  const jaw = make('Jaw'); pivot.add(jaw); jaw.position.copy(pivot.position).negate();
  root.add(make('MouthLiner'));
  scene.scale.setScalar(100); scene.updateMatrixWorld(true);
  return { scene, root, pivot, jaw };
}
test('chin fitting stretches the bottom of the jaw but preserves its closed upper seam', () => {
  const { scene, pivot, jaw } = rigModel();
  const rig = createMaskRig(scene);
  rig.sample({ angle: 0, amount: 0, residual: new THREE.Vector3(0, -2, 0) });
  rig.update(1 / 60, 0);
  const position = jaw.geometry.attributes.position;
  assert.ok(Math.abs(position.getY(0) + .038) < 1e-7);
  assert.ok(Math.abs(position.getY(2) + .12) < 1e-7);
  assert.equal(pivot.rotation.x, 0);
});
test('jaw smoothing remains finite through opening, closing and face reacquisition', () => {
  const { scene } = rigModel(), rig = createMaskRig(scene);
  for (const open of [false, true, false, true]) {
    rig.sample(solveJawFit(observation(0, open)), true);
    for (let i = 0; i < 10; i++) {
      const result = rig.update(1 / 60, i / 60);
      assert.ok(Number.isFinite(result.angle));
      scene.traverse(mesh => { if (mesh.geometry) assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite)); });
    }
  }
});

test('the shipped Blender mesh covers mouth and chin landmarks, closed and open, from both three-quarter views', async () => {
  const bytes = await readFile(new URL('../public/assets/face/masca_ritual.glb', import.meta.url));
  for (const yaw of [-.55, 0, .55]) for (const opened of [false, true]) {
    const data = observation(yaw, opened), model = gltfGeometry(bytes), anchor = new THREE.Group();
    model.scale.setScalar(100); anchor.add(model); anchor.matrixAutoUpdate = false; anchor.matrix.copy(data.pose);
    const rig = createMaskRig(model); rig.sample(solveJawFit(data)); rig.update(.016, 0); anchor.updateMatrixWorld(true);
    for (const index of [152, 148, 176, 150, 136, 377, 400, 379, 365, 13, 14]) {
      const depth = [13, 14].includes(index) ? 5.35 : data.reference.positions[index * 3 + 2];
      const local = landmarkOnFace(data.landmarks[index], depth, data.pose, data.camera);
      const world = local.applyMatrix4(data.pose), ray = new THREE.Raycaster(new THREE.Vector3(), world.clone().normalize());
      const hits = ray.intersectObject(model, true);
      assert.ok(hits.length && hits[0].distance < world.length(), `Uncovered ${index}, yaw ${yaw}, open ${opened}`);
    }
  }
});
