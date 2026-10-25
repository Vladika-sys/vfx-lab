import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let task, files, model, backend = 'GPU', lastTime = -1;
async function create(delegate) {
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: model, delegate }, canvas: new OffscreenCanvas(640, 480),
    runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55, minTrackingConfidence: .55,
  });
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const response = await fetch(data.modelUrl);
      if (!response.ok) throw new Error('Modelul de urmărire nu a putut fi descărcat.');
      model = new Uint8Array(await response.arrayBuffer());
      files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm', true);
      const probe = new OffscreenCanvas(64, 64); probe.getContext('2d').fillRect(0, 0, 64, 64);
      try { task = await create('GPU'); task.detectForVideo(probe, 0); }
      catch { task?.close(); backend = 'CPU'; task = await create('CPU'); task.detectForVideo(probe, 0); }
      self.postMessage({ type: 'ready', backend });
    } else if (data.type === 'frame') {
      const timestamp = Math.max(lastTime + 1, data.timestamp); lastTime = timestamp;
      let result;
      try { result = task.detectForVideo(data.image, timestamp); }
      catch (failure) {
        if (backend !== 'GPU') throw failure;
        task.close(); backend = 'CPU'; task = await create('CPU');
        result = task.detectForVideo(data.image, timestamp);
      }
      self.postMessage({ type: 'result', id: data.id, backend,
        landmarks: result.faceLandmarks[0] || null,
        matrix: result.facialTransformationMatrixes[0]?.data || null,
      });
    }
  } catch (failure) { self.postMessage({ type: 'error', error: failure.message || 'Urmărirea feței s-a întrerupt.' }); }
  finally { data.image?.close(); }
};
