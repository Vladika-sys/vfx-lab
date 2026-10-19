import * as THREE from 'three';
import { ArToolkitContext, ArMarkerControls } from '@ar-js-org/ar.js/three.js/build/ar-threex.mjs';

export async function createMarkerTracker({ width, height, assetRoot }) {
  for (const file of ['camera_para.dat', 'patt.hiro']) {
    const response = await fetch(`${assetRoot}${file}`);
    if (!response.ok) throw new Error('Fișierele reperului nu au putut fi încărcate.');
    await response.arrayBuffer();
  }
  const context = new ArToolkitContext({
    cameraParametersUrl: `${assetRoot}camera_para.dat`,
    detectionMode: 'mono', maxDetectionRate: 30,
    canvasWidth: width, canvasHeight: height,
    imageSmoothingEnabled: true,
  });
  let expired = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      expired = true;
      reject(new Error('Recunoașterea AR nu a pornit. Reîncearcă sau folosește alt browser.'));
    }, 20000);
    context.init(() => {
      clearTimeout(timeout);
      if (expired) { context.dispose(); return; }
      resolve();
    });
  });
  context.arController.orientation = 'landscape';
  context.arController.options.orientation = 'landscape';
  const detected = new THREE.Group();
  const marker = new ArMarkerControls(context, detected, {
    type: 'pattern', patternUrl: `${assetRoot}patt.hiro`,
    size: 1, changeMatrixMode: 'modelViewMatrix', minConfidence: .7,
  });
  const anchor = new THREE.Group();
  anchor.visible = false;
  return {
    anchor,
    projectionMatrix: context.getProjectionMatrix(),
    update(source, delta) {
      const processed = context.update(source);
      if (!processed) return anchor.visible;
      if (detected.visible) {
        const blend = anchor.visible ? 1 - Math.exp(-24 * Math.max(delta, 1 / 30)) : 1;
        anchor.position.lerp(detected.position, blend);
        anchor.quaternion.slerp(detected.quaternion, blend);
        anchor.scale.copy(detected.scale);
      }
      anchor.visible = detected.visible;
      return anchor.visible;
    },
    dispose() {
      marker.dispose();
      context.dispose();
      anchor.visible = false;
    },
  };
}
