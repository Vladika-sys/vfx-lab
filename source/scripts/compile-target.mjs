import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as tf from '@tensorflow/tfjs';
import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';

const require = createRequire(new URL('../node_modules/mind-ar/package.json', import.meta.url));
const { createCanvas, loadImage } = require('canvas');
const folder = new URL('../public/assets/target/', import.meta.url);
const image = await loadImage(await fs.readFile(new URL('coffe.jpg', folder)));
const canvas = createCanvas(image.width, image.height);
canvas.getContext('2d').drawImage(image, 0, 0);
await tf.setBackend('cpu');
await tf.ready();
const compiler = new OfflineCompiler();
const data = await compiler.compileImageTargets([canvas], progress => {
  if (Math.round(progress) % 20 === 0) process.stdout.write(`${Math.round(progress)}% `);
});
const matching = data[0].matchingData.reduce((n, level) => n + level.maximaPoints.length + level.minimaPoints.length, 0);
if (matching < 60) throw new Error(`Imaginea are prea puține puncte distincte: ${matching}`);
await fs.writeFile(new URL('cafea.mind', folder), compiler.exportData());
console.log(`\n${matching} puncte. ${canvas.width}×${canvas.height} px. ${fileURLToPath(new URL('cafea.mind', folder))}`);
