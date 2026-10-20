import * as THREE from 'three';

export function createTrackedPose(anchor, { now = () => performance.now(), lossGraceMs = 120 } = {}) {
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const targetPosition = new THREE.Vector3(), targetRotation = new THREE.Quaternion(), targetScale = new THREE.Vector3();
  const nextPosition = new THREE.Vector3(), nextRotation = new THREE.Quaternion(), nextScale = new THREE.Vector3();
  let initialized = false, missingSince = null, lastStep = 0, positionRate = 12, rotationRate = 12;
  anchor.visible = false; anchor.matrixAutoUpdate = false;
  const compose = () => {
    anchor.matrix.compose(position, rotation, scale);
    anchor.matrixWorldNeedsUpdate = true;
  };
  return {
    sample(matrix) {
      if (!matrix.elements.every(Number.isFinite)) return false;
      matrix.decompose(nextPosition, nextRotation, nextScale);
      if (![...nextPosition, ...nextRotation, ...nextScale].every(Number.isFinite)
        || Math.min(nextScale.x, nextScale.y, nextScale.z) <= 0 || nextRotation.lengthSq() < .5) return false;
      nextRotation.normalize();
      const time = now();
      targetPosition.copy(nextPosition); targetRotation.copy(nextRotation); targetScale.copy(nextScale);
      const distance = position.distanceTo(targetPosition) / Math.max(targetScale.x, 1);
      positionRate = 12 + Math.min(18, distance * 80);
      rotationRate = 12 + Math.min(18, rotation.angleTo(targetRotation) * 18);
      if (!initialized || !anchor.visible || (missingSince !== null && time - missingSince >= lossGraceMs)) {
        position.copy(targetPosition); rotation.copy(targetRotation); scale.copy(targetScale);
        initialized = true; lastStep = time; compose();
      }
      anchor.visible = true; missingSince = null;
      return true;
    },
    lose() { if (missingSince === null) missingSince = now(); },
    update() {
      const time = now(), delta = Math.min(.1, Math.max(0, (time - lastStep) / 1000));
      lastStep = time;
      if (!initialized) return false;
      if (missingSince !== null) {
        anchor.visible = time - missingSince < lossGraceMs;
        return anchor.visible;
      }
      position.lerp(targetPosition, 1 - Math.exp(-positionRate * delta));
      rotation.slerp(targetRotation, 1 - Math.exp(-rotationRate * delta)).normalize();
      scale.lerp(targetScale, 1 - Math.exp(-12 * delta));
      compose();
      return anchor.visible;
    },
    reset() { anchor.visible = false; initialized = false; missingSince = null; },
  };
}
