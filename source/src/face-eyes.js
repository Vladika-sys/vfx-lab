import * as THREE from 'three';
import { landmarkOnFace } from './face-fit.js';

const contours = [
  [33, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
];

export function createRedEyes() {
  const group = new THREE.Group(); group.name = 'RedEyes';
  const eyes = contours.map((contour, side) => {
    const positions = new Float32Array((contour.length + 1) * 3), indices = [];
    for (let i = 0; i < contour.length; i++) indices.push(0, i + 1, (i + 1) % contour.length + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(indices);
    const uniforms = { uIris: { value: new THREE.Vector2() }, uRadius: { value: .5 }, uStrength: { value: 1 }, uGlowPass: { value: 0 } };
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
      vertexShader: 'varying vec2 vPoint;void main(){vPoint=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform vec2 uIris;uniform float uRadius,uStrength,uGlowPass;varying vec2 vPoint;
        void main(){
          vec2 p=(vPoint-uIris)/uRadius;float r=length(p);
          float iris=1.-smoothstep(.86,1.08,r),pupil=1.-smoothstep(.21,.33,r);
          float grain=.82+.18*sin(atan(p.y,p.x)*42.+r*19.);
          vec3 red=vec3(1.9,.008,.018)*grain*uStrength;
          vec3 color=mix(vec3(.22,.003,.008),red,iris);
          color=mix(color,vec3(.018,.001,.002),pupil);
          float glint=1.-smoothstep(.025,.1,length(p-vec2(-.28,.3)));
          color+=vec3(.9,.16,.12)*glint;
          float alpha=mix(.20,.96,iris);
          gl_FragColor=vec4(color*mix(1.,.32,uGlowPass),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = side ? 'RedEyeRight' : 'RedEyeLeft';
    mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.userData.selectiveGlow = 'self'; mesh.visible = false;
    group.add(mesh);
    return { contour, mesh, uniforms, positions, target: positions.slice(), iris: new THREE.Vector3(), radius: .5, valid: false, initialized: false };
  });
  return {
    group,
    sample(landmarks, pose, camera, snap = false) {
      eyes.forEach((eye, side) => {
        const point = id => landmarkOnFace(landmarks?.[id], 5, pose, camera);
        const corners = side ? [point(362), point(263)] : [point(33), point(133)];
        const top = point(side ? 386 : 159), bottom = point(side ? 374 : 145);
        const ring = eye.contour.map(point);
        const width = corners[0] && corners[1] ? corners[0].distanceTo(corners[1]) : 0;
        eye.valid = width > 1 && width < 5 && top && bottom && top.distanceTo(bottom) / width > .09 && ring.every(Boolean);
        if (!eye.valid) { eye.mesh.visible = false; eye.initialized = false; return; }
        const iris = point(side ? 473 : 468) || corners[0].clone().add(corners[1]).multiplyScalar(.5);
        eye.iris.copy(iris); eye.radius = width * .21;
        const center = ring.reduce((sum, value) => sum.add(value), new THREE.Vector3()).divideScalar(ring.length);
        center.toArray(eye.target, 0); ring.forEach((value, i) => value.toArray(eye.target, (i + 1) * 3));
        if (snap || !eye.initialized) {
          eye.positions.set(eye.target); eye.uniforms.uIris.value.set(iris.x, iris.y); eye.uniforms.uRadius.value = eye.radius;
          eye.initialized = true;
        }
      });
    },
    update(delta, time, visible = true) {
      const alpha = 1 - Math.exp(-32 * Math.max(0, Math.min(.1, delta)));
      for (const eye of eyes) {
        eye.mesh.visible = visible && Boolean(eye.valid);
        if (!eye.mesh.visible) continue;
        for (let i = 0; i < eye.positions.length; i++) eye.positions[i] += (eye.target[i] - eye.positions[i]) * alpha;
        eye.mesh.geometry.attributes.position.needsUpdate = true;
        eye.uniforms.uIris.value.lerp(eye.iris, alpha);
        eye.uniforms.uRadius.value += (eye.radius - eye.uniforms.uRadius.value) * alpha;
        eye.uniforms.uStrength.value = .96 + .04 * Math.sin(time * 2.3);
      }
    },
  };
}
