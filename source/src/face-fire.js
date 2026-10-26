import * as THREE from 'three';

function fireNoise() {
  const size = 128, data = new Uint8Array(size * size * 4);
  const hash = (x, y) => { const n = Math.sin((x & 31) * 127.1 + (y & 31) * 311.7) * 43758.5453; return n - Math.floor(n); };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), a), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), a), b);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    data[i] = Math.round(noise(x / 4, y / 4) * 255);
    data[i + 1] = Math.round(noise(x / 4 + 13, y / 4 + 19) * 255);
    data[i + 2] = data[i]; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

export function createMouthFire() {
  const group = new THREE.Group(); group.name = 'MouthFire'; group.visible = false;
  const uniforms = { uTime: { value: 0 }, uPower: { value: 0 }, uGlowPass: { value: 0 }, uCamera: { value: new THREE.Vector3() } };
  uniforms.uNoise = { value: fireNoise() };
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms, vertexShader: `
      attribute vec3 seed;uniform float uTime,uPower;varying vec2 vUv;varying float vAge,vSeed;
      void main(){
        vUv=uv;vAge=fract(seed.x+uTime*(1.35+seed.y*.35));vSeed=seed.z;
        float z=vAge*(11.+uPower*15.);
        vec3 center=vec3(sin(z*.45-uTime*5.+seed.z*3.)*vAge*1.2,-.23*z+sin(z*.6+seed.y*9.)*vAge*.7,z);
        vec4 mv=modelViewMatrix*vec4(center,1.);
        float diameter=(1.1+vAge*(5.+uPower*3.))*(.8+seed.y*.4);
        float angle=seed.z*6.28+uTime*.4;
        mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        mv.xy+=turn*(position.xy*vec2(diameter,diameter*1.4));
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform sampler2D uNoise;uniform float uTime,uPower,uGlowPass;
      varying vec2 vUv;varying float vAge,vSeed;
      void main(){
        vec2 q=vUv*2.-1.;float edge=1.-dot(q,q);if(edge<=0.)discard;
        vec2 flow=vUv*.23+vec2(vSeed,uTime*-.25);
        float coarse=texture2D(uNoise,flow).r;
        float fine=texture2D(uNoise,flow*2.7+vec2(uTime*.06,0.)).g;
        float body=smoothstep(.02,.7,edge+(coarse-.5)*.9)*smoothstep(.22,.65,coarse*.7+fine*.3);
        float alpha=body*.21*uPower*smoothstep(0.,.05,vAge)*(1.-smoothstep(.55,1.,vAge));
        if(alpha<.003)discard;
        float heat=clamp((1.-vAge)*.65+body*.35,0.,1.);
        vec3 color=mix(vec3(1.4,.045,.001),vec3(2.8,.62,.025),heat);
        color=mix(color,vec3(3.1,1.5,.24),smoothstep(.8,1.,heat));
        gl_FragColor=vec4(color*mix(1.,.22,uGlowPass),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const plane = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index; geometry.attributes = plane.attributes; geometry.instanceCount = 24;
  const layers = Float32Array.from({ length: 24 * 3 }, (_, i) => i % 3 === 0 ? Math.floor(i / 3) / 24 : ((Math.sin(i * 127.1 + 31.7) * 43758.5453) % 1 + 1) % 1);
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(layers, 3));
  const flame = new THREE.Mesh(geometry, material); flame.frustumCulled = false; flame.renderOrder = 5;
  flame.userData.selectiveGlow = 'self'; group.add(flame);
  const light = new THREE.PointLight(0xff6b19, 0, 45, 1.4); light.position.set(0, -1, 7); group.add(light);
  const seeds = Float32Array.from({ length: 64 * 3 }, (_, i) => ((Math.sin(i * 127.1 + 31.7) * 43758.5453) % 1 + 1) % 1);
  const positions = new Float32Array(64 * 3), sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uPower: uniforms.uPower }, vertexShader: `uniform float uPower;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(110.*uPower/max(-mv.z,1.),1.,4.);}`,
    fragmentShader: `uniform float uPower;void main(){float a=(1.-smoothstep(.05,.5,length(gl_PointCoord-.5)))*uPower;
      if(a<.01)discard;gl_FragColor=vec4(2.5,.32,.015,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; sparks.renderOrder = 6; group.add(sparks);
  let power = 0;
  return {
    group,
    update(delta, time, desired, mouth) {
      power += (THREE.MathUtils.clamp(desired, 0, 1) - power) * (1 - Math.exp(-Math.min(.1, Math.max(0, delta)) * (desired > power ? 18 : 9)));
      group.visible = power > .015;
      if (mouth) group.position.lerp(mouth, 1 - Math.exp(-Math.min(.1, delta) * 28));
      uniforms.uPower.value = power; uniforms.uTime.value = time;
      sparkGeometry.setDrawRange(0, Math.floor(64 * power));
      for (let i = 0; i < 64; i++) {
        const a = seeds[i * 3], b = seeds[i * 3 + 1], c = seeds[i * 3 + 2];
        const age = (time * (1.1 + b * .65) + a) % 1, z = age * (11 + power * 15);
        positions.set([Math.sin(b * 50 + age * 6) * age * (1 + c * 3), -.23 * z + Math.cos(a * 45 + age * 4) * age * 2, z], i * 3);
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      light.intensity = power * 100 * (.95 + .05 * Math.sin(time * 17));
      return power;
    },
    prepare(camera) { flame.updateWorldMatrix(true, false); uniforms.uCamera.value.copy(camera.position); camera.getWorldPosition(uniforms.uCamera.value); flame.worldToLocal(uniforms.uCamera.value); },
    reset() { power = 0; uniforms.uPower.value = 0; group.visible = false; light.intensity = 0; },
  };
}
