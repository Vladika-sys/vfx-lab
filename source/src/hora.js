import * as THREE from 'three';
import { horaTravel, horaRadius, horaFootStep, horaArmLift, horaAutomaticHop, horaReaction } from './hora-motion.js';

export function createHora(entries = [], count = 6) {
  const group = new THREE.Group();
  const dancers = [], geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const skin = material(new THREE.MeshStandardMaterial({ color: 0xba9974, roughness: .75 }));
  const trousers = material(new THREE.MeshStandardMaterial({ color: 0x3f4944, roughness: .9 }));
  const shoes = material(new THREE.MeshStandardMaterial({ color: 0x262b28, roughness: .75 }));
  const boneGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const ballGeometry = geometry(new THREE.SphereGeometry(1, 12, 8));
  const shoeGeometry = geometry(new THREE.BoxGeometry(.105, .07, .16));
  const up = new THREE.Vector3(0, 1, 0);
  const photoMaterials = entries.map(entry => {
    const texture = new THREE.CanvasTexture(entry.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .035, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false }));
  });
  function add(geo, mat, parent = group) { const mesh = new THREE.Mesh(geo, mat); parent.add(mesh); return mesh; }
  function link(mat, thickness, index) { const mesh = add(boneGeometry, mat); mesh.userData.dancerIndex = index; mesh.userData.thickness = thickness; return mesh; }
  function ball(radius, mat, parent) { const mesh = add(ballGeometry, mat, parent); mesh.scale.setScalar(radius); return mesh; }
  const demoMaterials = [
    material(new THREE.MeshStandardMaterial({ color: 0x9d342a, roughness: .4 })),
    material(new THREE.MeshStandardMaterial({ color: 0xc3b9a2, roughness: .32, metalness: .12 })),
    material(new THREE.MeshStandardMaterial({ color: 0x36674b, roughness: .27, metalness: .18 })),
  ];
  for (let index = 0; index < count; index++) {
    const body = new THREE.Group();
    body.userData.dancerIndex = index;
    group.add(body);
    if (entries.length) {
      const entry = entries[index % entries.length];
      const ratio = entry.canvas.width / entry.canvas.height;
      const height = Math.min(.57, .58 / ratio), width = height * ratio;
      add(geometry(new THREE.PlaneGeometry(width, height)), photoMaterials[index % entries.length], body).position.y = .37 + height / 2;
    } else if (index % 3 === 0) {
      const apple = ball(.25, demoMaterials[0], body); apple.position.y = .61; apple.scale.y *= .9;
      const stem = add(geometry(new THREE.CylinderGeometry(.018, .026, .13, 8)), skin, body); stem.position.set(0, .86, 0); stem.rotation.z = -.2;
      const leaf = add(geometry(new THREE.SphereGeometry(.1, 12, 8)), demoMaterials[2], body); leaf.position.set(.08, .87, 0); leaf.scale.set(1, .22, .4); leaf.rotation.z = -.3;
    } else if (index % 3 === 1) {
      const cup = add(geometry(new THREE.CylinderGeometry(.2, .15, .42, 32, 1, true)), demoMaterials[1], body); cup.position.y = .61;
      const rim = add(geometry(new THREE.TorusGeometry(.2, .017, 8, 32)), demoMaterials[1], body); rim.position.y = .82; rim.rotation.x = Math.PI / 2;
      const coffee = add(geometry(new THREE.CircleGeometry(.18, 32)), shoes, body); coffee.position.y = .797; coffee.rotation.x = -Math.PI / 2;
      const handle = add(geometry(new THREE.TorusGeometry(.12, .035, 8, 24)), demoMaterials[1], body); handle.position.set(.22, .61, 0);
    } else {
      const points = [[.12,0],[.15,.04],[.15,.34],[.07,.43],[.065,.62],[.08,.63]].map(([x,y]) => new THREE.Vector2(x,y));
      const bottle = add(geometry(new THREE.LatheGeometry(points, 28)), demoMaterials[2], body); bottle.position.y = .36;
      const cap = add(geometry(new THREE.CylinderGeometry(.08,.08,.035,16)), skin, body); cap.position.y = 1.01;
      const label = add(geometry(new THREE.CylinderGeometry(.16,.16,.17,28,1,true)), demoMaterials[1], body); label.position.y = .57;
    }
    const limbs = Array.from({ length: 8 }, (_, i) => link(i < 4 ? skin : trousers, i < 4 ? .028 : .035, index));
    const hands = [ball(.045, skin), ball(.045, skin)];
    const feet = [add(shoeGeometry, shoes), add(shoeGeometry, shoes)];
    [...hands, ...feet].forEach(mesh => { mesh.userData.dancerIndex = index; });
    dancers.push({ body, limbs, hands, feet, reactionTime: 2, reactionKind: 'hop', reactionCount: 0, position: new THREE.Vector3(), yaw: 0,
      phaseOffset: Math.sin(index * 2.4) * .045, style: .95 + Math.sin(index * 1.7) * .12, hop: 0,
    });
  }
  const ringMaterial = material(new THREE.MeshBasicMaterial({ color: 0x676253, transparent: true, opacity: .16, depthWrite: false }));
  const groundRing = add(geometry(new THREE.RingGeometry(1.1, 1.12, 96)), ringMaterial);
  groundRing.rotation.x = -Math.PI / 2; groundRing.position.y = .004;
  let beat = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const footFrom = new THREE.Vector3(), footTo = new THREE.Vector3(), bend = new THREE.Vector3(), reach = new THREE.Vector3();
  function segment(mesh, from, to) {
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    b.copy(to).sub(from);
    mesh.scale.set(mesh.userData.thickness, b.length(), mesh.userData.thickness);
    mesh.quaternion.setFromUnitVectors(up, b.normalize());
  }
  function local(dancer, x, y, z, result) {
    return result.set(x, y, z).applyQuaternion(dancer.body.quaternion).add(dancer.position);
  }
  function footPlant(index, side, atBeat, result) {
    const angle = index / count * Math.PI * 2 + horaTravel(atBeat);
    const radius = horaRadius(atBeat, count), sign = side ? 1 : -1;
    result.set(sign * .1, .045, .035).applyAxisAngle(up, angle + Math.PI);
    result.x += Math.sin(angle) * radius;
    result.z += Math.cos(angle) * radius;
    return angle + Math.PI;
  }
  function update(delta, { dancing = true, bpm = 112 } = {}) {
    if (dancing) beat += delta * bpm / 60;
    dancers.forEach((dancer, i) => {
      dancer.reactionTime = Math.min(2, dancer.reactionTime + delta);
      dancer.reaction = horaReaction(dancer.reactionKind, dancer.reactionTime);
      const personalBeat = beat + dancer.phaseOffset;
      const angle = i / count * Math.PI * 2 + horaTravel(personalBeat);
      const pulse = Math.sin(personalBeat * Math.PI);
      const accent = Math.floor(personalBeat) % 4 === 3 ? 1.4 : 1;
      const bounce = pulse ** 2 * .052 * dancer.style * accent;
      dancer.hop = dancer.reaction.hop + horaAutomaticHop(beat, i, count);
      const radius = horaRadius(personalBeat, count);
      dancer.position.set(Math.sin(angle)*radius, bounce + dancer.hop, Math.cos(angle)*radius);
      dancer.yaw = angle + Math.PI + Math.sin(personalBeat * Math.PI * 2) * .065 + dancer.reaction.yaw;
      dancer.body.position.copy(dancer.position);
      dancer.body.rotation.set(Math.sin(personalBeat * Math.PI * 2 + i * .6) * .035,
        dancer.yaw, pulse * .10 * dancer.style + dancer.reaction.sway);
    });
    dancers.forEach((dancer, i) => {
      for (let side = 0; side < 2; side++) {
        const neighbour = dancers[(i + (side === 0 ? 1 : count - 1)) % count];
        const hand = dancer.hands[side];
        hand.position.copy(dancer.position).add(neighbour.position).multiplyScalar(.5);
        const edge = side === 0 ? i : (i + count - 1) % count;
        const armLift = horaArmLift(beat, edge, count) + (dancer.reaction.arm + neighbour.reaction.arm) / 2;
        hand.position.y += .65 + (1 - Math.cos(beat * Math.PI / 2)) * .035 + Math.sin(beat * Math.PI + edge * .55) * .018 + armLift;
        const sign = side ? 1 : -1;
        local(dancer, sign * .19, .61, 0, a);
        local(dancer, sign * .31, .52 + armLift * .8, .045, c);
        segment(dancer.limbs[side*2], a, c);
        segment(dancer.limbs[side*2+1], c, hand.position);
        const motion = horaFootStep(beat + dancer.phaseOffset, side);
        const fromYaw = footPlant(i, side, motion.from, footFrom);
        const toYaw = footPlant(i, side, motion.to, footTo);
        const lift = motion.lift * (motion.height + (motion.accent && motion.style === 'side' ? .045 : 0)) * dancer.style;
        const stamp = side === dancer.reaction.side ? dancer.reaction.stamp : 0;
        const foot = dancer.feet[side];
        foot.position.lerpVectors(footFrom, footTo, motion.progress);
        reach.set(0, 0, motion.reach * motion.lift).applyAxisAngle(up, dancer.yaw);
        foot.position.add(reach);
        foot.position.y += lift + dancer.hop + stamp;
        foot.rotation.set(motion.lift * motion.pitch - stamp * 1.5, fromYaw + (toYaw - fromYaw) * motion.progress, sign * motion.lift * .10);
        local(dancer, sign * .085, .39, 0, a);
        b.copy(foot.position).sub(a);
        const distance = b.length(); b.normalize();
        bend.set(0, 0, 1).applyAxisAngle(up, dancer.yaw);
        bend.addScaledVector(b, -bend.dot(b)).normalize();
        const legLength = Math.max(.255, distance * .505);
        const kneeOffset = Math.sqrt(Math.max(0, legLength ** 2 - distance ** 2 / 4));
        c.copy(a).add(foot.position).multiplyScalar(.5).addScaledVector(bend, kneeOffset);
        segment(dancer.limbs[4+side*2], a, c);
        segment(dancer.limbs[5+side*2], c, foot.position);
      }
    });
    return beat;
  }
  update(0);
  return {
    group, dancers,
    update,
    jump(index) {
      const dancer = dancers[index];
      if (!dancer) return;
      dancer.reactionKind = ['hop', 'stamp', 'sway'][dancer.reactionCount++ % 3];
      dancer.reactionTime = 0;
    },
    dispose() { geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); group.removeFromParent(); },
  };
}

export function pickDancer(group, camera, x, y) {
  group.updateWorldMatrix(true,true);
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const direction = new THREE.Vector3(x,y,.5).unproject(camera).sub(origin).normalize();
  const intersections = new THREE.Raycaster(origin,direction).intersectObject(group,true);
  for (const hit of intersections) {
    const image = hit.object.material?.map?.image;
    if(image?.getContext && hit.uv){
      const px=Math.min(image.width-1,Math.floor(hit.uv.x*image.width)),py=Math.min(image.height-1,Math.floor((1-hit.uv.y)*image.height));
      if(image.getContext('2d').getImageData(Math.max(0,px),Math.max(0,py),1,1).data[3]<32)continue;
    }
    let object=hit.object;
    while(object&&object.userData.dancerIndex===undefined)object=object.parent;
    if(object)return object.userData.dancerIndex;
  }
  return -1;
}
