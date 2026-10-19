import test from 'node:test';
import assert from 'node:assert/strict';
import { createHora, pickDancer } from '../src/hora.js';
import * as THREE from 'three';
import { horaTravel, horaRadius, horaFootStep, horaPhrase, horaArmLift, horaAutomaticHop, horaReaction } from '../src/hora-motion.js';

test('the opening walk advances a quarter turn and the full choreography keeps making progress', () => {
  assert.ok(Math.abs(horaTravel(8) - Math.PI / 2) < 1e-10);
  const progress = horaTravel(32);
  assert.ok(progress > 2.8 && progress < 3.5);
  assert.ok(Math.abs(horaTravel(64) - progress * 2) < 1e-10);
  const hora = createHora([], 6), start = hora.dancers[0].position.clone();
  for (let i = 0; i < 8 * 60; i++) hora.update(1 / 60, { bpm: 60 });
  const position = hora.dancers[0].position;
  assert.ok(position.x > .9 && Math.abs(position.z) < 1e-8);
  assert.ok(position.distanceTo(start) > 1.3);
  assert.equal(hora.group.rotation.y, 0);
  assert.ok(hora.group.position.length() === 0);
  hora.dispose();
});

test('four phrases include gathering, heel and kick accents, and a real direction change', () => {
  assert.deepEqual([2, 10, 18, 26, 34].map(beat => horaPhrase(beat).index), [0, 1, 2, 3, 0]);
  for (const count of [3, 6, 10]) {
    assert.ok(horaRadius(11, count) < horaRadius(8, count) - .09);
    assert.ok(horaRadius(15, count) > horaRadius(11, count) + .10);
    assert.ok(horaRadius(11, count) > .68);
  }
  assert.equal(horaFootStep(16.5, 0).style, 'heel');
  assert.equal(horaFootStep(18.5, 0).style, 'kick');
  assert.ok(horaTravel(27) < horaTravel(25));
  assert.ok(horaTravel(32) > horaTravel(29));
  assert.ok(horaArmLift(12, 0, 6) > .18);
  const wave = Array.from({ length: 6 }, (_, edge) => horaArmLift(26, edge, 6));
  assert.ok(Math.max(...wave) - Math.min(...wave) > .1);
});

test('the final phrase sends a single smooth hop around the ring', () => {
  const count = 6;
  for (let i = 0; i < count; i++) {
    const beat = 24 + (i + .5) / count * 8;
    const hops = Array.from({ length: count }, (_, dancer) => horaAutomaticHop(beat, dancer, count));
    assert.ok(hops[i] > .1);
    assert.equal(hops.filter(hop => hop > .001).length, 1);
  }
  assert.equal(horaAutomaticHop(32, 5, count), 0);
  assert.ok(horaAutomaticHop(23.5, 0, count) > .08);
});

test('support feet stay planted in marker coordinates instead of sliding with the body', () => {
  const hora = createHora([], 6);
  hora.update(.15, { bpm: 60 });
  const foot = hora.dancers[0].feet[1], planted = foot.position.clone();
  const body = hora.dancers[0].position.clone();
  for (let i = 0; i < 10; i++) hora.update(.05, { bpm: 60 });
  assert.ok(foot.position.distanceTo(planted) < 1e-10);
  assert.ok(hora.dancers[0].position.distanceTo(body) > .1);
  assert.ok(hora.dancers[0].feet[0].position.y > .1);
  hora.dispose();
});

test('motion is continuous at beat boundaries, phrase boundaries, and reverse steps', () => {
  for (let beat = -2; beat <= 40; beat++) {
    assert.ok(Math.abs(horaTravel(beat - 1e-6) - horaTravel(beat + 1e-6)) < 1e-8);
  }
  const hora = createHora([], 10);
  for (let frame = 0; frame < 32 * 120; frame++) {
    const previous = hora.dancers.map(dancer => dancer.feet.map(foot => foot.position.clone()));
    hora.update(1 / 120, { bpm: 60 });
    hora.dancers.forEach((dancer, i) => dancer.feet.forEach((foot, side) => {
      assert.ok(foot.position.distanceTo(previous[i][side]) < .015);
      assert.ok(foot.position.y >= .044);
    }));
  }
  hora.dispose();
});

test('hora keeps neighbours joined and all limb transforms finite', () => {
  for (const count of [3,6,10]) {
    const hora = createHora([],count);
    for (let frame=0;frame<2000;frame++) {
      hora.update(1/30,{dancing:true,bpm:112});
      if (frame % 173 === 0) hora.jump(frame % count);
      hora.dancers.forEach((dancer,i) => {
        assert.ok(dancer.hands[0].position.distanceTo(hora.dancers[(i+1)%count].hands[1].position)<1e-10);
        dancer.limbs.forEach(limb => assert.ok([...limb.position.toArray(),...limb.quaternion.toArray(),...limb.scale.toArray()].every(Number.isFinite)));
      });
    }
    hora.dispose();
  }
});

test('repeated touches cycle through hop, two stamps, and sway, then return to rest', () => {
  const hora = createHora([], 6);
  for (const kind of ['hop', 'stamp', 'sway', 'hop']) {
    hora.jump(0);
    assert.equal(hora.dancers[0].reactionKind, kind);
    for (let i = 0; i < 90; i++) hora.update(1 / 60, { dancing: false });
    const reaction = hora.dancers[0].reaction;
    assert.ok(Math.abs(reaction.hop) + Math.abs(reaction.stamp) + Math.abs(reaction.sway) + Math.abs(reaction.yaw) < 1e-10);
  }
  assert.ok(horaReaction('stamp', .275).stamp > .13);
  assert.ok(horaReaction('stamp', .825).stamp > .13);
  assert.notEqual(horaReaction('stamp', .275).side, horaReaction('stamp', .825).side);
  assert.ok(Math.abs(horaReaction('sway', .2).sway) > .02);
  hora.dispose();
});

test('pause freezes every phrase and photo bodies use the same choreography', () => {
  const hora = createHora([{ canvas: { width: 400, height: 300 } }], 6);
  for (let phrase = 0; phrase < 4; phrase++) {
    hora.update(phrase === 0 ? 1 : 8, { bpm: 60 });
    const before = hora.dancers.map(dancer => [...dancer.position.toArray(), ...dancer.body.rotation.toArray().slice(0, 3), ...dancer.feet.flatMap(foot => foot.position.toArray())]);
    for (let i = 0; i < 20; i++) hora.update(.1, { dancing: false });
    hora.dancers.forEach((dancer, i) => {
      const after = [...dancer.position.toArray(), ...dancer.body.rotation.toArray().slice(0, 3), ...dancer.feet.flatMap(foot => foot.position.toArray())];
      assert.deepEqual(after, before[i]);
      assert.equal(dancer.body.children[0].geometry.type, 'PlaneGeometry');
    });
  }
  hora.dispose();
});
test('pause freezes the dance beat; touch produces a temporary hop', () => {
  const hora=createHora([],6);
  const beat=hora.update(.5,{bpm:120});
  assert.equal(hora.update(.2,{dancing:false}),beat);
  const before=hora.dancers[0].position.y;
  hora.jump(0);hora.update(.2,{dancing:false});
  assert.ok(hora.dancers[0].position.y>before+.1);
  for(let i=0;i<40;i++)hora.update(.05,{dancing:false});
  assert.ok(Math.abs(hora.dancers[0].position.y-before)<1e-8);
  hora.dispose();
});
test('tempo changes animation rate without screen-space animation', () => {
  const slow=createHora([],6),fast=createHora([],6);
  assert.equal(slow.update(1,{bpm:70}),70/60);
  assert.equal(fast.update(1,{bpm:160}),160/60);
  assert.equal(slow.group.type,'Group');
  assert.ok(slow.dancers.every(dancer=>dancer.body.type==='Group'&&dancer.limbs.length===8));
  slow.dispose();fast.dispose();
});
test('touch selection uses a 3D ray and works with the generic AR camera',()=>{
  const hora=createHora([],6),anchor=new THREE.Group();anchor.position.set(0,-.4,-4);anchor.add(hora.group);anchor.updateMatrixWorld(true);
  const perspective=new THREE.PerspectiveCamera(50,4/3,.1,100),camera=new THREE.Camera();camera.projectionMatrix.copy(perspective.projectionMatrix);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);
  const point=hora.dancers[0].body.children[0].getWorldPosition(new THREE.Vector3()).project(camera);
  assert.equal(pickDancer(hora.group,camera,point.x,point.y),0);
  assert.equal(pickDancer(hora.group,camera,4,4),-1);
  hora.dispose();
});
