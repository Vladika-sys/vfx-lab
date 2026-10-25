import * as THREE from 'three';

export function createMouthFire() {
  const group = new THREE.Group(); group.name = 'MouthFire'; group.visible = false;
  const uniforms = { uTime: { value: 0 }, uPower: { value: 0 }, uGlowPass: { value: 0 }, uCamera: { value: new THREE.Vector3() } };
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms, vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `precision highp float;
      uniform vec3 uCamera;uniform float uTime,uPower,uGlowPass;varying vec3 vLocal;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){return noise(p)*.62+noise(p*2.07+4.2)*.26+noise(p*4.11+8.7)*.12;}
      float density(vec3 p){
        float jetLength=11.+uPower*15.;float h=p.z/jetLength;
        vec2 center=vec2(sin(p.z*.35-uTime*5.)*.075*p.z,-.23*p.z+sin(p.z*.43-uTime*3.)*.3);
        float radius=(.42+pow(max(h,0.),.65)*(1.25+uPower*2.2))*(.8+.35*noise(vec3(p.z*.3,uTime*2.,3.)));
        vec3 flow=vec3(p.xy*.78,p.z*.38-uTime*5.8);
        float n=fbm(flow);float r=length(p.xy-center)/radius;
        float body=1.-smoothstep(.08,1.15,r+(n-.5)*1.3);
        return body*smoothstep(.38,.70,n)*smoothstep(-.08,.04,h)*(1.-smoothstep(.55,1.,h))*uPower;
      }
      void main(){
        vec3 ray=normalize(vLocal-uCamera),inv=1./ray;
        vec3 a=(vec3(-8.,-13.,0.)-uCamera)*inv,b=(vec3(8.,8.,31.)-uCamera)*inv;
        vec3 lo=min(a,b),hi=max(a,b);float near=max(0.,max(max(lo.x,lo.y),lo.z));float far=min(min(hi.x,hi.y),hi.z);
        if(far<=near)discard;float stepSize=(far-near)/36.;vec4 sum=vec4(0.);
        vec3 p=uCamera+ray*(near+stepSize*.5);
        for(int i=0;i<36;i++){
          float d=density(p);float alpha=1.-exp(-d*stepSize*.38);
          float heat=clamp(d*1.05+(1.-p.z/(11.+uPower*15.))*.12,0.,1.);
          vec3 color=mix(vec3(.85,.035,.001),vec3(2.6,.38,.012),smoothstep(.08,.64,heat));
          color=mix(color,vec3(3.4,1.35,.16),smoothstep(.80,1.,heat));
          sum.rgb+=(1.-sum.a)*color*alpha;sum.a+=(1.-sum.a)*alpha;
          if(sum.a>.97)break;p+=ray*stepSize;
        }
        if(sum.a<.005)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001)*mix(1.,.22,uGlowPass),sum.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.BoxGeometry(16, 21, 31); geometry.translate(0, -2.5, 15.5);
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
