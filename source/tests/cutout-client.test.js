import test from 'node:test';
import assert from 'node:assert/strict';
import { createCutoutClient } from '../src/cutout-client.js';

class FakeWorker {
  messages = [];
  terminated = false;
  postMessage(message) { this.messages.push(message); }
  reply(index, result = {}) { this.onmessage({ data: { id: this.messages[index].id, ...result } }); }
  terminate() { this.terminated = true; }
}

test('one prepared worker is reused across photographs and warmup calls', async () => {
  const workers = [];
  const client = createCutoutClient({ workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  const warm = client.warmup();
  assert.equal(client.warmup(), warm);
  workers[0].reply(0); await warm;
  const first = client.prepare({}, 1); workers[0].reply(1); await first;
  const cut = client.segment([{ brushMode: 1 }], 1); workers[0].reply(2, { values: [1] }); assert.deepEqual((await cut).values, [1]);
  const second = client.prepare({}, 2); workers[0].reply(3); await second;
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, false);
  assert.equal(workers[0].messages[3].imageId, 2);
  client.dispose(); assert.equal(workers[0].terminated, true);
});

test('a stalled worker is released, all pending work rejects, and retry starts fresh', async () => {
  const workers = [];
  const client = createCutoutClient({ timeoutMs: 20, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  const results = await Promise.allSettled([client.warmup(), client.prepare({}, 1)]);
  assert(results.every(result => result.status === 'rejected'));
  assert.equal(workers[0].terminated, true);
  const retry = client.warmup(); workers[1].reply(0); await retry;
  assert.equal(workers.length, 2);
  client.dispose();
});

test('a segmentation error does not discard the loaded worker', async () => {
  const worker = new FakeWorker();
  const client = createCutoutClient({ workerFactory: () => worker });
  const failed = client.segment([], 9); worker.reply(0, { error: 'Fotografia nu mai este activă.' });
  await assert.rejects(failed, /nu mai este activă/);
  const next = client.prepare({}, 10); worker.reply(1); await next;
  assert.equal(worker.terminated, false); client.dispose();
});
