import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCoffeeEffect } from '../src/coffee-effect.js';

test('all coffee beans use two instanced draws while preserving motion and touch selection', () => {
  const effect = createCoffeeEffect(), meshes = [];
  effect.group.traverse(object => { if (object.isInstancedMesh) meshes.push(object); });
  assert.equal(meshes.length, 2); meshes.forEach(mesh => assert.equal(mesh.count, 14));
  const before = new THREE.Matrix4(), after = new THREE.Matrix4(); meshes[0].getMatrixAt(0, before);
  effect.update(1); effect.react(); effect.update(.2); effect.group.updateMatrixWorld(true);
  meshes[0].getMatrixAt(0, after); assert.notDeepEqual(before.elements, after.elements);
  assert.ok(after.elements.every(Number.isFinite));
  const center = new THREE.Vector3().setFromMatrixPosition(after).applyMatrix4(meshes[0].matrixWorld);
  const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, 2)), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(meshes[0]).some(hit => hit.instanceId === 0));
  let released = 0; meshes.forEach(mesh => mesh.addEventListener('dispose', () => released++));
  effect.dispose(); assert.equal(released, 2);
});
