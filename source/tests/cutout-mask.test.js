import test from 'node:test';
import assert from 'node:assert/strict';
import { keepSeedComponent, mergeCutoutRegion, eraseColorRegion } from '../src/cutout-mask.js';
test('the selected object excludes detached shadows and unrelated regions',()=>{
  const values=new Float32Array(36);
  values[7]=values[8]=values[13]=values[14]=1;values[34]=values[35]=1;
  const result=keepSeedComponent(values,6,6,{x:.25,y:.25});
  assert.equal(result[7],1);assert.equal(result[14],1);assert.equal(result[34],0);assert.equal(result[35],0);
});
test('empty masks remain empty and out-of-image taps are bounded',()=>{
  assert.equal(keepSeedComponent(new Float32Array(16),4,4,{x:2,y:-1}).reduce((a,b)=>a+b,0),0);
  const values=new Float32Array(16);values[15]=1;
  assert.equal(keepSeedComponent(values,4,4,{x:0,y:0})[15],1);
});

test('additional selections preserve existing objects and erasure subtracts only the selected region', () => {
  let result = mergeCutoutRegion(null, new Float32Array([1, 0, 0, 0]));
  result = mergeCutoutRegion(result, new Float32Array([0, 0, 1, .5]));
  assert.deepEqual([...result], [1, 0, 1, .5]);
  result = mergeCutoutRegion(result, new Float32Array([1, 0, 0, 0]), true);
  assert.deepEqual([...result], [0, 0, 1, .5]);
});

test('erasing a background hole preserves the differently coloured object around it', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4), mask = new Float32Array(25).fill(1);
  for (let i = 0; i < 25; i++) pixels.set([40, 110, 80, 255], i * 4);
  pixels.set([230, 225, 210, 255], 12 * 4);
  const result = eraseColorRegion(mask, pixels, 5, 5, { x: .5, y: .5 });
  assert.equal(result[12], 0); assert.equal(result[11], 1); assert.equal(result[13], 1);
  assert.equal(result.reduce((sum, value) => sum + value, 0), 24);
});
