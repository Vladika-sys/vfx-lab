import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageTracker } from '../src/image-tracking.js';

function fixture(options = {}) {
  const calls = { process: 0, stop: 0, dispose: 0 };
  let update;
  const controller = { addImageTargetsFromBuffer: () => ({ dimensions: [[720, 960]] }),
    getProjectionMatrix: () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    dummyRun() {}, processVideo() { calls.process++; }, stopProcessVideo() { calls.stop++; }, dispose() { calls.dispose++; } };
  const args = { width: 640, height: 480, source: {}, targetUrl: 'local.mind',
    fetchTarget: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }),
    controllerFactory: async config => { update = config.onUpdate; return controller; }, ...options };
  return { args, controller, calls, send: data => update(data) };
}
test('image tracking uses the target pose and its dimensions, not a screen overlay', async () => {
  let time = 0;
  const f = fixture({ now: () => time }), tracker = await createImageTracker(f.args);
  assert.equal(tracker.targetAspect, 720 / 960);
  assert.equal(tracker.anchor.visible, false);
  tracker.update(); tracker.update(); assert.equal(f.calls.process, 1);
  f.send({ type: 'updateMatrix', targetIndex: 0, worldMatrix: [1,0,0,0,0,1,0,0,0,0,1,0,12,24,-2000,1] });
  assert.equal(tracker.update(), true);
  assert.equal(tracker.anchor.matrix.elements[12], 372);
  assert.equal(tracker.anchor.matrix.elements[13], 504);
  assert.equal(tracker.anchor.matrix.elements[0], 720);
  f.send({ type: 'updateMatrix', targetIndex: 0, worldMatrix: null });
  assert.equal(tracker.update(), true);
  time = 121;
  assert.equal(tracker.update(), false);
  tracker.dispose(); f.send({ type: 'processDone' });
  assert.equal(f.calls.dispose, 1);
  f.send({ type: 'updateMatrix', targetIndex: 0, worldMatrix: Array(16).fill(1) });
  assert.equal(tracker.anchor.visible, false);
});
test('a missing target fails cleanly before camera tracking starts', async () => {
  const f = fixture({ fetchTarget: async () => ({ ok: false }) });
  await assert.rejects(createImageTracker(f.args), /încărcată/);
  assert.equal(f.calls.process, 0);
});
test('cancelling initialization releases the new tracker', async () => {
  const abort = new AbortController();
  const f = fixture({ signal: abort.signal });
  const factory = f.args.controllerFactory;
  f.args.controllerFactory = async options => { const value = await factory(options); abort.abort(); return value; };
  await assert.rejects(createImageTracker(f.args), { name: 'AbortError' });
  assert.equal(f.calls.dispose, 1);
});

test('a stalled recognition loop reports an error instead of leaving an inactive camera', async () => {
  let time = 0;
  const f = fixture({ now: () => time }), tracker = await createImageTracker(f.args);
  tracker.update();
  time = 14000; f.send({ type: 'processDone' });
  assert.equal(tracker.processedFrames, 1);
  time = 28000; assert.equal(tracker.update(), false);
  time = 30001; assert.throws(() => tracker.update(), /nu răspunde/);
  f.send({ type: 'processDone' });
  assert.equal(f.calls.dispose, 1);
});
