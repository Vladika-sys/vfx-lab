import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { gltfGeometry } from '../tests/gltf-geometry.js';
import { createMaskRig, solveJawFit } from '../src/face-fit.js';
const bytes = await readFile(new URL('../public/assets/face/masca_ritual.glb', import.meta.url));
const reference = JSON.parse(await readFile(new URL('../public/assets/face/reference.json', import.meta.url)));
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 1000);
for (const opened of [false, true]) {
  const model = gltfGeometry(bytes); model.scale.setScalar(100);
  const pose = new THREE.Matrix4().makeTranslation(0, -1, -48), anchor = new THREE.Group(); anchor.matrixAutoUpdate = false; anchor.matrix.copy(pose); anchor.add(model);
  const rig = createMaskRig(model), landmarks = [], points = [];
  for (let i = 0; i < reference.positions.length / 3; i++) {
    const p = new THREE.Vector3().fromArray(reference.positions, i * 3);
    if (opened) { const w = THREE.MathUtils.smoothstep(-p.y, 3.8, 9.2); p.y -= 2.2 * w; p.z -= .3 * w; }
    if ([13, 14, 61, 291].includes(i)) p.z = 5.35;
    if (i === 13) p.y = -4;
    if (i === 14) p.y = opened ? -6.35 : -4.04;
    if (i === 152) p.z = reference.positions[i * 3 + 2];
    points.push(p.clone()); p.applyMatrix4(pose).project(camera); landmarks.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2 });
  }
  const fit = solveJawFit({ landmarks, pose, camera, reference }); rig.sample(fit); rig.update(.016, 0); anchor.updateMatrixWorld(true);
  const p = points[152].clone().applyMatrix4(pose), ray = new THREE.Raycaster(new THREE.Vector3(), p.clone().normalize());
  const hits = ray.intersectObject(model, true);
  const bounds = new THREE.Box3().setFromObject(model);
  console.log(JSON.stringify({ opened, fit, chinWorld: p.toArray(), chinDistance: p.length(), hits: hits.slice(0, 3).map(h => ({ distance: h.distance, mesh: h.object.parent.name, point: h.point.toArray() })), bounds: [bounds.min.toArray(), bounds.max.toArray()] }));
}
