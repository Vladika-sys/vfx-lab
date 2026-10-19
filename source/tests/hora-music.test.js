import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoraMusic } from '../src/hora-music.js';

class FakeAudio {
  static latest;
  paused = true;
  currentTime = 12;
  playCount = 0;
  constructor(src) { this.src = src; FakeAudio.latest = this; }
  play() { this.paused = false; this.playCount++; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() { this.loaded = true; }
}

test('the supplied recording loops and follows pause and tempo without rewinding', async () => {
  const music = createHoraMusic({ src: '/assets/audio/hora.m4a', AudioClass: FakeAudio });
  const audio = FakeAudio.latest;
  await music.resume();
  assert.equal(audio.loop, true); assert.equal(audio.paused, false);
  music.update(0, 140, false); assert.equal(audio.paused, true); assert.equal(audio.currentTime, 12);
  music.update(0, 140, true); await Promise.resolve();
  assert.equal(audio.paused, false); assert.equal(audio.playbackRate, 1.25);
  await music.close(); assert.equal(audio.paused, true); assert.equal(audio.src, '');
  const plays = audio.playCount; music.update(0, 112, true); assert.equal(audio.playCount, plays);
});

test('closing while playback is starting cannot leave a detached song playing', async () => {
  let finish;
  class DelayedAudio extends FakeAudio { play() { return new Promise(resolve => { finish = () => { this.paused = false; resolve(); }; }); } }
  const music = createHoraMusic({ src: '/hora.m4a', AudioClass: DelayedAudio });
  const audio = FakeAudio.latest, ready = music.resume();
  await music.close(); finish(); await ready;
  assert.equal(audio.paused, true);
});
