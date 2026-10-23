import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundRemover} from '../public/background-remover.js';

function setup(options = {}) {
  const workers = [];
  const remover = createBackgroundRemover({makeWorker() {
    const worker = {postMessage(data) { this.sent = data; }, terminate() { this.terminated = true; }, emit(data) { this.onmessage({data}); }};
    workers.push(worker); return worker;
  }, ...options});
  return {workers, remover};
}
const image = () => ({width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255])});

test('cancelling rejects the old job and late results cannot replace a new photo', async () => {
  const {workers, remover} = setup();
  const first = remover.run(image());
  const cancelled = assert.rejects(first, {name: 'AbortError'});
  remover.cancel(); await cancelled;
  assert.equal(workers[0].terminated, true);
  let finished = false;
  const second = remover.run(image()).then(result => { finished = true; return result; });
  workers[0].emit({id: 1, type: 'result', pixels: [0]});
  await Promise.resolve(); assert.equal(finished, false);
  workers[1].emit({id: 2, type: 'result', pixels: [255]});
  assert.deepEqual((await second).pixels, [255]); remover.cancel();
});

test('progress does not finish a job, original pixels survive, and worker is reused', async () => {
  const {workers, remover} = setup(); const input = image(); const progress = [];
  const first = remover.run(input, message => progress.push(message));
  assert.notEqual(input.data, workers[0].sent.pixels);
  workers[0].sent.pixels[3] = 0;
  assert.equal(input.data[3], 255);
  workers[0].emit({id: 1, type: 'progress', message: 'loading'});
  await assert.rejects(remover.run(image()), /이미/);
  workers[0].emit({id: 1, type: 'result'}); await first;
  const second = remover.run(image()); assert.equal(workers.length, 1);
  workers[0].emit({id: 2, type: 'result'}); await second;
  assert.deepEqual(progress, ['loading']); remover.cancel();
});

test('failed workers are terminated and retries start cleanly', async () => {
  const {workers, remover} = setup();
  const first = remover.run(image()); const failed = assert.rejects(first, /실패/);
  workers[0].emit({id: 1, type: 'error'}); await failed;
  assert.equal(workers[0].terminated, true);
  const second = remover.run(image()); const crashed = assert.rejects(second, /실행하지/);
  workers[1].onerror(); await crashed;
  assert.equal(workers[1].terminated, true);
});

test('stalled inference times out and releases the worker', async () => {
  const {workers, remover} = setup({timeoutMs: 10});
  await assert.rejects(remover.run(image()), /오래/);
  assert.equal(workers[0].terminated, true);
});
