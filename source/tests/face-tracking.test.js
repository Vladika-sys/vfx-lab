import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceTracker } from '../src/face-tracking.js';

function fakeWorker() {
  return { sent: [], terminated: false,
    postMessage(message) { this.sent.push(message); if (message.type === 'init') queueMicrotask(() => this.onmessage({ data: { type: 'ready' } })); },
    terminate() { this.terminated = true; },
    result(data) { this.onmessage({ data }); },
  };
}
test('one frame in flight; stale results cannot release a newer frame', async () => {
  const worker = fakeWorker(), results = [], source = { videoWidth: 1280, videoHeight: 720 };
  let options;
  const tracker = await createFaceTracker({ modelUrl: '/model', makeWorker: () => worker,
    bitmap: async (_source, opts) => { options = opts; return { close() {} }; }, onResult: result => results.push(result), onError: assert.fail });
  assert.equal(await tracker.submit(source, 5), true);
  assert.deepEqual([options.resizeWidth, options.resizeHeight], [640, 360]);
  assert.equal(await tracker.submit(source, 10), false);
  worker.result({ type: 'result', id: 0 });
  assert.equal(await tracker.submit(source, 15), false);
  worker.result({ type: 'result', id: 1 });
  assert.equal(results.length, 1);
  assert.equal(await tracker.submit(source, 20), true);
  tracker.close(); assert.equal(worker.terminated, true);
  assert.equal(await tracker.submit(source, 25), false);
});
test('stopping during frame capture closes the bitmap without sending it', async () => {
  const worker = fakeWorker(); let resolveBitmap, closed = false;
  const tracker = await createFaceTracker({ modelUrl: '/model', makeWorker: () => worker,
    bitmap: () => new Promise(resolve => { resolveBitmap = resolve; }), onResult: assert.fail, onError: assert.fail });
  const submitted = tracker.submit({ videoWidth: 640, videoHeight: 480 }, 5);
  tracker.close(); resolveBitmap({ close() { closed = true; } });
  assert.equal(await submitted, false); assert.equal(closed, true); assert.equal(worker.sent.length, 1);
});
test('abort during model initialization terminates the worker and rejects initialization', async () => {
  const worker = fakeWorker(); worker.postMessage = () => {};
  const abort = new AbortController();
  const pending = createFaceTracker({ modelUrl: '/model', signal: abort.signal, makeWorker: () => worker, onResult: assert.fail, onError: assert.fail });
  abort.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(worker.terminated, true);
});
