import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../blender/masca_lemn/referinte/canonical_face_model.obj', import.meta.url);
const positions = [], indices = [];
for (const line of (await readFile(source, 'utf8')).split(/\r?\n/)) {
  const [kind, ...values] = line.trim().split(/\s+/);
  if (kind === 'v') positions.push(...values.map(Number));
  if (kind === 'f') {
    const face = values.map(value => Number(value.split('/')[0]) - 1);
    for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
  }
}
await writeFile(new URL('../public/assets/face/reference.json', import.meta.url), JSON.stringify({ units: 'centimeters', positions, indices }));
