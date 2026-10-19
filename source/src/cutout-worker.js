import { FilesetResolver, InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision';
import { keepSeedComponent, mergeCutoutRegion, eraseColorRegion } from './cutout-mask.js';

const modelUrl = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
let task, loading, activeImageId = null, latestImageId = null, queue = Promise.resolve();
const input = new OffscreenCanvas(512, 512), inputContext = input.getContext('2d', { willReadFrequently: true });
let processedStrokes = [], combined = null, maskWidth = 0, maskHeight = 0, delegate = 'GPU';

async function modelBuffer() {
  let cache;
  try { cache = await caches.open('vfx-cutout-model-v1'); } catch {}
  const cached = await cache?.match(modelUrl).catch(() => null);
  const response = cached || await fetch(modelUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Modelul de decupare nu a putut fi descărcat.');
  if (!cached && cache) await cache.put(modelUrl, response.clone()).catch(() => {});
  return new Uint8Array(await response.arrayBuffer());
}

async function ensureTask() {
  if (task) return task;
  if (!loading) loading = (async () => {
    const [files, model] = await Promise.all([
      FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm', true),
      modelBuffer(),
    ]);
    const create = backend => InteractiveSegmenterLegacy.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: model, delegate: backend },
      canvas: new OffscreenCanvas(512, 512), outputConfidenceMasks: true, outputCategoryMask: false,
    });
    const probe = new OffscreenCanvas(512, 512), probeContext = probe.getContext('2d');
    probeContext.fillStyle = '#808080'; probeContext.fillRect(0, 0, 512, 512);
    const warm = candidate => candidate.segment(probe, { keypoint: { x: .5, y: .5 } }, () => {});
    try { task = await create('GPU'); warm(task); }
    catch { task?.close(); delegate = 'CPU'; task = await create('CPU'); warm(task); }
    return task;
  })().catch(error => {
    task?.close(); task = null; activeImageId = null;
    throw error;
  }).finally(() => { loading = null; });
  return loading;
}

self.onmessage = ({ data: message }) => {
  if (message.type === 'prepare') latestImageId = message.imageId;
  queue = queue.then(async () => {
    const started = performance.now();
    try {
      await ensureTask();
      if (message.type === 'warmup') {
        self.postMessage({ id: message.id, delegate, elapsedMs: performance.now() - started });
        return;
      }
      if (message.type === 'prepare') {
        if (message.imageId !== latestImageId) throw new Error('Fotografie înlocuită.');
        input.width = message.image.width; input.height = message.image.height;
        inputContext.drawImage(message.image, 0, 0);
        processedStrokes = []; combined = null;
        activeImageId = message.imageId;
        self.postMessage({ id: message.id, imageId: activeImageId, elapsedMs: performance.now() - started });
        return;
      }
      if (message.imageId !== activeImageId) throw new Error('Fotografia nu mai este activă.');
      const signatures = message.strokes.map(stroke => JSON.stringify(stroke));
      if (processedStrokes.some((stroke, i) => signatures[i] !== stroke)) { processedStrokes = []; combined = null; }
      for (let i = processedStrokes.length; i < message.strokes.length; i++) {
        const stroke = message.strokes[i], point = stroke.point[0];
        if (stroke.brushMode === 2 && combined) {
          const colors = new OffscreenCanvas(maskWidth, maskHeight), context = colors.getContext('2d');
          context.drawImage(input, 0, 0, maskWidth, maskHeight);
          combined = eraseColorRegion(combined, context.getImageData(0, 0, maskWidth, maskHeight).data, maskWidth, maskHeight, point);
          processedStrokes.push(signatures[i]);
          continue;
        }
        task.segment(input, { keypoint: point }, result => {
          const masks = result.confidenceMasks;
          if (!masks?.length) throw new Error('Nu a fost identificat niciun obiect.');
          maskWidth = masks[0].width; maskHeight = masks[0].height;
          const seed = Math.min(maskHeight - 1, Math.floor(point.y * maskHeight)) * maskWidth + Math.min(maskWidth - 1, Math.floor(point.x * maskWidth));
          const channels = masks.map(mask => mask.getAsFloat32Array());
          const selected = channels.reduce((best, values) => values[seed] > best[seed] ? values : best);
          const region = keepSeedComponent(selected, maskWidth, maskHeight, point);
          combined = mergeCutoutRegion(combined, region);
        });
        processedStrokes.push(signatures[i]);
      }
      if (!combined) throw new Error('Selectează mai întâi obiectul.');
      const values = combined.slice();
      self.postMessage({ id: message.id, values, width: maskWidth, height: maskHeight, delegate, elapsedMs: performance.now() - started }, [values.buffer]);
    } catch (error) {
      self.postMessage({ id: message.id, error: error.message || 'Decuparea nu a reușit.' });
    } finally {
      message.image?.close();
    }
  });
};
