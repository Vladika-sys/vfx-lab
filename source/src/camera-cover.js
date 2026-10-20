import { Matrix4 } from 'three';

export function fitCameraCover({ videoWidth, videoHeight, width, height, projectionMatrix }) {
  const ratio = Math.max(width / videoWidth, height / videoHeight);
  const coverWidth = Math.round(videoWidth * ratio), coverHeight = Math.round(videoHeight * ratio);
  return {
    coverWidth, coverHeight,
    projectionMatrix: new Matrix4().makeScale(coverWidth / width, coverHeight / height, 1).multiply(projectionMatrix),
  };
}
