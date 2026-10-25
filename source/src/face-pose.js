import { Matrix4, Quaternion, Vector3 } from 'three';

export const FACE_ANCHORS = [10, 151, 168, 6, 197, 4, 1, 33, 133, 362, 263, 50, 280, 101, 330];

export function fitFacePose(matrixData, landmarks, reference, camera) {
  if (matrixData?.length !== 16 || !Array.from(matrixData).every(Number.isFinite)) return null;
  const matrix = new Matrix4().fromArray(matrixData), rotation = new Quaternion();
  matrix.decompose(new Vector3(), rotation, new Vector3());
  if (!Number.isFinite(rotation.lengthSq()) || rotation.lengthSq() < .5) return null;
  rotation.normalize();
  const rows = [], values = [], point = new Vector3();
  const px = camera.projectionMatrix.elements[0], py = camera.projectionMatrix.elements[5];
  for (const index of FACE_ANCHORS) {
    const landmark = landmarks?.[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
    point.fromArray(reference.positions, index * 3).applyQuaternion(rotation);
    const u = (landmark.x * 2 - 1) / px, v = (1 - landmark.y * 2) / py;
    rows.push([1, 0, u], [0, 1, v]);
    values.push(-u * point.z - point.x, -v * point.z - point.y);
  }
  const normal = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < rows.length; i++) for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) normal[a][b] += rows[i][a] * rows[i][b];
    normal[a][3] += rows[i][a] * values[i];
  }
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(normal[row][col]) > Math.abs(normal[pivot][col])) pivot = row;
    [normal[col], normal[pivot]] = [normal[pivot], normal[col]];
    if (Math.abs(normal[col][col]) < 1e-8) return null;
    const divisor = normal[col][col];
    for (let j = col; j < 4; j++) normal[col][j] /= divisor;
    for (let row = 0; row < 3; row++) if (row !== col) {
      const factor = normal[row][col];
      for (let j = col; j < 4; j++) normal[row][j] -= factor * normal[col][j];
    }
  }
  const translation = new Vector3(...normal.map(row => row[3]));
  if (![...translation].every(Number.isFinite) || translation.z > -12 || translation.z < -350) return null;
  return new Matrix4().compose(translation, rotation, new Vector3(1, 1, 1));
}

