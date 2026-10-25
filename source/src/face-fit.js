import { MathUtils, Matrix3, Matrix4, Vector3 } from 'three';

const CHIN = 152, HINGE = new Vector3(0, -3, -.7), MAX_ANGLE = MathUtils.degToRad(16);
const clamp = MathUtils.clamp;

export function landmarkOnFace(landmark, depth, pose, camera) {
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
  const inverse = pose.clone().invert();
  const origin = new Vector3().applyMatrix4(inverse);
  const direction = new Vector3(landmark.x * 2 - 1, 1 - landmark.y * 2, .5)
    .unproject(camera).normalize().transformDirection(inverse);
  if (Math.abs(direction.z) < .15) return null;
  const distance = (depth - origin.z) / direction.z;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  return origin.addScaledVector(direction, distance);
}

export function solveJawFit({ landmarks, pose, camera, reference }) {
  const upper = landmarkOnFace(landmarks?.[13], 5.35, pose, camera);
  const lower = landmarkOnFace(landmarks?.[14], 5.35, pose, camera);
  const left = landmarkOnFace(landmarks?.[61], 5.35, pose, camera);
  const right = landmarkOnFace(landmarks?.[291], 5.35, pose, camera);
  const chinReference = new Vector3().fromArray(reference.positions, CHIN * 3);
  const chin = landmarkOnFace(landmarks?.[CHIN], chinReference.z, pose, camera);
  if (!upper || !lower || !left || !right || !chin) return null;
  const mouthWidth = left.distanceTo(right);
  if (mouthWidth < 1 || mouthWidth > 12) return null;
  const ratio = Math.max(0, upper.y - lower.y) / mouthWidth;
  const amount = MathUtils.smoothstep(ratio, .065, .48), angle = amount * MAX_ANGLE;
  const predicted = chinReference.clone().sub(HINGE).applyAxisAngle(new Vector3(1, 0, 0), angle).add(HINGE);
  const residual = chin.clone().sub(predicted);
  residual.set(clamp(residual.x, -1.2, 1.2), clamp(residual.y, -4, 3), clamp(residual.z, -.8, 2.8));
  return { amount, angle, residual, mouthRatio: ratio };
}

export function createMaskRig(model) {
  const root = model.getObjectByName('MaskRoot'), jaw = model.getObjectByName('JawPivot');
  const liner = model.getObjectByName('MouthLiner');
  if (!root || !jaw || !liner) throw new Error('Masca nu conține maxilarul și căptușeala pentru gură.');
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert(), bindPivot = jaw.matrix.clone();
  const bindPivotInverse = bindPivot.clone().invert(), entries = [];
  const zero = new Vector3(), p = new Vector3(), moved = new Vector3(), offset = new Vector3();
  let angle = 0, amount = 0, step = 0, initialized = false;
  const residual = new Vector3(), target = { angle: 0, amount: 0, residual: new Vector3() };
  for (const [object, flexible] of [[model.getObjectByName('Jaw'), false], [liner, true]]) object.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone(); mesh.frustumCulled = false;
    mesh.geometry.computeBoundingSphere(); mesh.geometry.boundingSphere.radius *= 2;
    mesh.geometry.boundingBox = null;
    const bind = rootInverse.clone().multiply(mesh.matrixWorld), positions = mesh.geometry.attributes.position;
    const original = positions.array.slice(), points = new Float32Array(original.length), weights = new Float32Array(positions.count);
    const rotationWeights = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      p.fromArray(original, i * 3).applyMatrix4(bind).toArray(points, i * 3);
      weights[i] = MathUtils.smoothstep(-p.y * 100, 3.8, 9.2);
      rotationWeights[i] = MathUtils.smoothstep(-p.y * 100, 2.7, 4.1);
    }
    entries.push({ mesh, flexible, bind, inverse: bind.clone().invert(), original, points, weights, rotationWeights });
  });
  const emissive = new Set();
  model.traverse(mesh => {
    for (const mat of mesh.material ? [mesh.material].flat() : []) if (mat.name === 'EmberFissures') emissive.add(mat);
  });
  return {
    sample(fit, snap = false) {
      if (!fit) return;
      target.angle = fit.angle; target.amount = fit.amount; target.residual.copy(fit.residual);
      if (!initialized || snap) { angle = fit.angle; amount = fit.amount; residual.copy(fit.residual); initialized = true; }
    },
    update(delta, time) {
      const alpha = 1 - Math.exp(-24 * Math.max(0, Math.min(.1, delta)));
      angle += (target.angle - angle) * alpha; amount += (target.amount - amount) * alpha;
      residual.lerp(target.residual, alpha);
      jaw.rotation.x = angle; jaw.updateMatrix();
      const deformation = jaw.matrix.clone().multiply(bindPivotInverse);
      step++;
      for (const entry of entries) {
        const { mesh, flexible, original, points, weights, rotationWeights } = entry;
        const inverse = flexible ? entry.inverse : entry.bind.clone().premultiply(deformation).invert();
        const linear = new Matrix3().setFromMatrix4(inverse);
        offset.copy(residual).multiplyScalar(.01).applyMatrix3(linear);
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const w = weights[i];
          if (flexible) {
            p.fromArray(points, i * 3); moved.copy(p).applyMatrix4(deformation);
            p.lerp(moved, rotationWeights[i]).addScaledVector(residual, .01 * w).applyMatrix4(inverse);
          } else p.fromArray(original, i * 3).addScaledVector(offset, w);
          positions.setXYZ(i, p.x, p.y, p.z);
        }
        positions.needsUpdate = true;
        if (step % 3 === 0) mesh.geometry.computeVertexNormals();
      }
      const strength = 1.7 + .28 * Math.sin(time * 1.7) + .12 * Math.sin(time * 3.1) + amount * 2.5;
      emissive.forEach(mat => { mat.emissiveIntensity = strength; });
      return { amount, angle, residual: residual.clone() };
    },
    reset() { initialized = false; target.angle = target.amount = 0; target.residual.copy(zero); },
  };
}
