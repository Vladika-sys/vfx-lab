import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the coffee page uses the supplied photograph and the former URL redirects to it', async () => {
  const page = await readFile(new URL('../cafea.html', import.meta.url), 'utf8');
  const legacy = await readFile(new URL('../target.html', import.meta.url), 'utf8');
  const ar = await readFile(new URL('../ar.html', import.meta.url), 'utf8');
  assert.match(page, /assets\/target\/coffe.jpg/);
  assert.doesNotMatch(page, /eticheta-cafea/);
  assert.match(legacy, /http-equiv="refresh" content="0;url=.\/cafea.html"/);
  assert.doesNotMatch(legacy, /src\/target.js|eticheta-cafea/);
  assert.match(ar, /href=".\/cafea.html"/);
});
