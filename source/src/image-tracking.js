import * as THREE from 'three';

export async function createImageTracker({ width, height, targetUrl, source, signal,
  controllerFactory = async options => {
    const { Controller } = await import('mind-ar/dist/mindar-image.prod.js');
    return new Controller(options);
  }, fetchTarget = fetch }) {
  const anchor = new THREE.Group();
  anchor.visible = false;
  anchor.matrixAutoUpdate = false;
  const postMatrix = new THREE.Matrix4();
  let disposed = false, running = false, processing = false, released = false, releaseTimer;
  let controller;
  const release = () => {
    if (released || !controller) return;
    released = true;
    clearTimeout(releaseTimer);
    controller.dispose();
  };
  const dispose = () => {
    disposed = true;
    anchor.visible = false;
    controller?.stopProcessVideo();
    if (!processing) release();
    else releaseTimer = setTimeout(release, 2000);
  };
  const abort = () => { if (signal?.aborted) throw new DOMException('Operație anulată.', 'AbortError'); };
  try {
    abort();
    const response = await fetchTarget(targetUrl, { signal });
    if (!response.ok) throw new Error('Imaginea-țintă nu a putut fi încărcată.');
    const buffer = await response.arrayBuffer();
    abort();
    controller = await controllerFactory({ inputWidth: width, inputHeight: height,
      maxTrack: 1, warmupTolerance: 2, missTolerance: 2,
      filterMinCF: .001, filterBeta: 1000,
      onUpdate(data) {
        if (data.type === 'processDone') {
          processing = false;
          if (disposed) release();
          else processing = running;
          return;
        }
        if (disposed || data.type !== 'updateMatrix' || data.targetIndex !== 0) return;
        anchor.visible = data.worldMatrix !== null;
        if (anchor.visible) anchor.matrix.fromArray(data.worldMatrix).multiply(postMatrix);
      },
    });
    abort();
    const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
    if (dimensions.length !== 1) throw new Error('Este necesară o singură imagine-țintă.');
    const [imageWidth, imageHeight] = dimensions[0];
    postMatrix.compose(new THREE.Vector3(imageWidth / 2, imageHeight / 2, 0),
      new THREE.Quaternion(), new THREE.Vector3(imageWidth, imageWidth, imageWidth));
    const projectionMatrix = new THREE.Matrix4().fromArray(controller.getProjectionMatrix());
    controller.dummyRun(source);
    abort();
    return {
      anchor, projectionMatrix, targetAspect: imageWidth / imageHeight,
      update() {
        if (!disposed && !running) {
          running = true; processing = true;
          controller.processVideo(source);
        }
        return !disposed && anchor.visible;
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
