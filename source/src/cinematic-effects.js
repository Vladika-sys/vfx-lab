import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildPump } from './pump.js';

const output = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export function buildCinematicEffects({ groups, animators, getState, camera, renderer, weather }) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x62645d, metalness: .75, roughness: .5, normalMap: weather.maps['concrete_wall_006-nor_gl'], normalScale: new THREE.Vector2(.13, .13) });
  const iron = new THREE.MeshStandardMaterial({ color: 0x292b28, metalness: .55, roughness: .72 });
  const stone = new THREE.MeshStandardMaterial({ map: weather.maps['concrete_wall_006-Diffuse'], normalMap: weather.maps['concrete_wall_006-nor_gl'], roughness: .97, color: 0xa6a398 });
  const volumes = {};
  const captures = {};
  const depthTarget = new THREE.WebGLRenderTarget(1, 1);
  depthTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const depthMaterial = new THREE.MeshDepthMaterial();
  const dummy = new THREE.Object3D();
  function mesh(parent, geometry, material, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  function box(parent, size, position, material = steel) { return mesh(parent, new THREE.BoxGeometry(...size), material, position); }
  function cylinder(parent, radius, height, position, material = steel, open = false) { return mesh(parent, new THREE.CylinderGeometry(radius, radius, height, 40, 1, open), material, position); }
  function makeScene(id, view, lighting) {
    const yard = weather.createCourtyard(false, false);
    const layer = new THREE.Group();
    yard.add(layer);
    yard.userData.effectLayer = layer;
    yard.userData.view = view || { position: [4.1, 2.5, 7.1], target: [0, 1.7, -4.8], fov: 48 };
    yard.userData.lighting = lighting || {};
    groups[id] = yard;
    return { yard, layer };
  }
  function volume(id, layer, size, position, density, color) {
    const uniforms = {
      uNoise: { value: weather.noiseTexture }, uDepth: { value: depthTarget.depthTexture },
      uResolution: { value: new THREE.Vector2() }, uCamera: { value: new THREE.Vector3() }, uForward: { value: new THREE.Vector3() },
      uSize: { value: new THREE.Vector3(...size) }, uNear: { value: camera.near }, uFar: { value: camera.far },
      uTime: { value: 0 }, uParameter: { value: .5 }, uIntensity: { value: .72 }, uPhase: { value: 0 }
    };
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, uniforms,
      vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision highp sampler3D;out vec4 fragColor;
        #define gl_FragColor fragColor
        #include <packing>
        uniform sampler3D uNoise;uniform sampler2D uDepth;uniform vec2 uResolution;uniform vec3 uCamera,uForward,uSize;
        uniform float uNear,uFar,uTime,uParameter,uIntensity,uPhase;varying vec3 vLocal;
        float n3(vec3 p){return texture(uNoise,p).r;}
        float turbulence(vec3 p){return n3(p)*.65+n3(p*2.03+vec3(.37))*.25+n3(p*4.09)*.1;}
        float density(vec3 p){${density}}
        void main(){
          vec3 ray=normalize(vLocal-uCamera),inverse=1.0/ray;
          vec3 a=(-uSize*.5-uCamera)*inverse,b=(uSize*.5-uCamera)*inverse;
          vec3 lo=min(a,b),hi=max(a,b);float near=max(max(lo.x,lo.y),lo.z),far=min(min(hi.x,hi.y),hi.z);
          float depth=texture(uDepth,gl_FragCoord.xy/uResolution).x;
          float limit=-perspectiveDepthToViewZ(depth,uNear,uFar)/max(dot(ray,uForward),.001);
          near=max(near,0.0);far=min(far,limit-.025);if(far<=near)discard;
          float stride=(far-near)/56.0;float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
          vec3 p=uCamera+ray*(near+stride*jitter);vec4 sum=vec4(0);vec3 sun=normalize(vec3(-.5,.85,.35));
          for(int i=0;i<56;i++){
            float d=density(p);
            if(d>.0005){
              float shade=exp(-(density(p+sun*.35)*.8+density(p+sun*.85)*.9)*2.8);
              vec3 color;${color}
              float alpha=1.0-exp(-d*stride*2.0);
              sum.rgb+=(1.0-sum.a)*color*alpha;sum.a+=(1.0-sum.a)*alpha;
            }
            if(sum.a>.985)break;p+=ray*stride;
          }
          if(sum.a<.002)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
          ${output}
        }`
    });
    const object = mesh(layer, new THREE.BoxGeometry(...size), material, position);
    object.renderOrder = 4;
    (volumes[id] ||= []).push(object);
    return uniforms;
  }
  function updateVolume(uniforms, time) {
    const { primary, intensity } = getState();
    uniforms.uTime.value = time;
    uniforms.uParameter.value = primary;
    uniforms.uIntensity.value = intensity;
  }
  function points(parent, count, size, color) {
    const positions = new Float32Array(count * 3);
    const seeds = Float32Array.from({ length: count * 3 }, () => Math.random());
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: .72 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute vec3 aSeed;uniform float uSize,uIntensity,uPixelRatio;varying float vAlpha;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uSize*(.45+aSeed.z)*uPixelRatio/max(-mv.z,.5),1.0,9.0);vAlpha=(.2+aSeed.y*.5)*uIntensity;}`,
      fragmentShader: `uniform vec3 uColor;varying float vAlpha;void main(){float a=(1.0-smoothstep(.08,.5,length(gl_PointCoord-.5)))*vAlpha;gl_FragColor=vec4(uColor,a);${output}}`
    });
    const object = new THREE.Points(geometry, material);
    object.frustumCulled = false;
    parent.add(object);
    return { object, geometry, material, seeds, positions };
  }

  const fire = makeScene('fire', { position: [3.1, 2.15, 3.6], target: [0, 1.75, -4], fov: 43 }, { ambient: .28, key: .28, environment: .28, sky: .38 });
  cylinder(fire.yard, .43, .9, [0, .45, -4], iron, true);
  for (const y of [.09, .47, .86]) {
    const ring = mesh(fire.yard, new THREE.TorusGeometry(.438, .016, 12, 64), steel, [0, y, -4]);
    ring.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 7; i++) {
    const char = cylinder(fire.yard, .045 + i % 3 * .008, .57, [Math.sin(i * 2.4) * .14, .86, -4 + Math.cos(i * 2.4) * .14], new THREE.MeshStandardMaterial({ color: 0x19110b, roughness: .98, emissive: 0x571600, emissiveIntensity: .22 }));
    char.rotation.z = .8 + i * .7;
  }
  const fireUniforms = volume('fire', fire.layer, [3, 4.2, 3], [0, 2.95, -4], `
    float h=p.y+2.1;float height=.65+uIntensity*1.95;
    vec3 flow=vec3(p.x,p.y-uTime*1.25,p.z)*.65;
    float low=n3(flow*.4);vec2 bend=vec2(n3(flow*.43+vec3(.2)),n3(flow*.43+vec3(.7)))-.5;
    float radius=max(.055,.43*(1.0-h/height));
    vec2 q=p.xz+bend*h*(.23+uParameter*.48);
    float n=turbulence(flow*1.25);
    float body=1.0-smoothstep(.28,1.0,length(q)/radius+(n-.5)*.8);
    float tongues=smoothstep(.29,.62,n)*body*(1.0-smoothstep(height*.68,height,h));
    float soot=(1.0-smoothstep(.25,.7,length(q)))*smoothstep(height*.68,height+.25,h)*(1.0-smoothstep(3.4,4.2,h))*.065*low;
    return (tongues*1.9+soot)*uIntensity*smoothstep(0.0,.04,h);`, `
    float h=p.y+2.1;float heat=clamp(d*.55+(1.0-h/(.65+uIntensity*1.95))*.27,0.0,1.0);
    color=mix(vec3(.7,.045,.001),vec3(3.1,.48,.012),smoothstep(.1,.65,heat));
    color=mix(color,vec3(4.0,2.15,.38),smoothstep(.72,.99,heat));
    if(h>.65+uIntensity*1.95)color=vec3(.13,.12,.105)*(.7+shade*.3);`);
  const fireLight = new THREE.PointLight(0xffb05b, 8, 8, 2);
  fireLight.position.set(0, 1.25, -4);
  fire.layer.add(fireLight);
  const embers = points(fire.layer, 85, 15, 0xff9a3b);
  animators.fire = time => {
    updateVolume(fireUniforms, time);
    const { primary, intensity } = getState();
    fireLight.intensity = intensity * 10 * (.92 + Math.sin(time * 9.3) * .06 + Math.sin(time * 13.7) * .02);
    embers.material.uniforms.uIntensity.value = intensity;
    embers.geometry.setDrawRange(0, Math.floor(85 * intensity));
    for (let i = 0; i < 85; i++) {
      const a = embers.seeds[i * 3], b = embers.seeds[i * 3 + 1], c = embers.seeds[i * 3 + 2];
      const age = (time * (.22 + c * .2) + a) % 1;
      embers.positions.set([Math.sin(b * 19 + age * 4) * (.06 + age * .22) + (primary - .5) * age * .4, .9 + age * (1.9 + c * .9), -4 + Math.cos(b * 17 + age * 3) * age * .23], i * 3);
    }
    embers.geometry.attributes.position.needsUpdate = true;
  };

  const snow = makeScene('snow', { position: [4, 2.3, 6.5], target: [0, 2, -5], fov: 48 });
  const snowAmount = { value: .72 };
  snow.yard.traverse(object => {
    if (!object.isMesh || !object.material.isMeshStandardMaterial) return;
    object.material = object.material.clone();
    object.material.onBeforeCompile = shader => {
      shader.uniforms.uSnowAmount = snowAmount;
      shader.vertexShader = `varying vec3 vSnowWorld,vSnowNormal;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowWorld=(modelMatrix*vec4(position,1.0)).xyz;vSnowNormal=normalize(mat3(modelMatrix)*normal);');
      shader.fragmentShader = `uniform float uSnowAmount;varying vec3 vSnowWorld,vSnowNormal;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        float mottling=sin(vSnowWorld.x*4.3+sin(vSnowWorld.z*3.7))*sin(vSnowWorld.z*5.1)*.12;
        float grain=fract(sin(dot(floor(vSnowWorld.xz*170.0),vec2(127.1,311.7)))*43758.5453);
        float slush=exp(-pow((vSnowWorld.x-2.0)*.85,2.0))*exp(-pow((vSnowWorld.z+3.8)*.17,2.0))*.72*(1.0-smoothstep(.08,.4,vSnowWorld.y));
        float cover=smoothstep(.6,.98,vSnowNormal.y)*smoothstep(.0,.45,uSnowAmount+mottling)*(1.0-slush)*step(.001,uSnowAmount);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.49,.53,.54)*(.91+grain*.09),cover*.95);`);
    };
    object.material.customProgramCacheKey = () => 'courtyard-snow';
  });
  const flakes = points(snow.layer, 3600, 35, 0xdde1e1);
  flakes.material.vertexShader = `attribute vec3 aSeed;uniform float uSize,uIntensity,uPixelRatio;varying float vAlpha;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp((6.0+aSeed.z*aSeed.z*48.0)*uPixelRatio/max(-mv.z,.6),1.0,15.0);vAlpha=(.32+aSeed.y*.52);}`;
  flakes.material.fragmentShader = `uniform vec3 uColor;varying float vAlpha;void main(){vec2 p=(gl_PointCoord-.5)*vec2(1.0,1.35);float a=(1.0-smoothstep(.15,.5,length(p)))*vAlpha;gl_FragColor=vec4(uColor,a);${output}}`;
  snow.yard.userData.onToggle = enabled => { snowAmount.value = enabled ? getState().intensity : 0; };
  animators.snow = time => {
    const { primary, intensity } = getState();
    snowAmount.value = snow.layer.visible ? intensity : 0;
    flakes.geometry.setDrawRange(0, Math.floor(3600 * intensity));
    for (let i = 0; i < 3600; i++) {
      const a = flakes.seeds[i * 3], b = flakes.seeds[i * 3 + 1], c = flakes.seeds[i * 3 + 2];
      const age = (a + time * (.022 + c * .065)) % 1;
      flakes.positions.set([-6.5 + b * 18 + (primary - .5) * age * 5 + Math.sin(time * .6 + a * 30) * .18, 10.5 * (1 - age), -8 + c * 16 + Math.sin(time * .35 + b * 40) * .12], i * 3);
    }
    flakes.geometry.attributes.position.needsUpdate = true;
  };

  const water = makeScene('water', { position: [3.7, 3.5, 4.3], target: [0, .4, -4.6], fov: 46 });
  for (const x of [-4.1, 4.1]) box(water.yard, [.22, .55, 7.8], [x, .275, -4.6], stone);
  for (const z of [-8.5, -.7]) box(water.yard, [8.4, .55, .22], [0, .275, z], stone);
  const waterShader = {
    uniforms: { color: { value: new THREE.Color() }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, uNoise: { value: weather.noiseTexture }, uTime: { value: 0 }, uIntensity: { value: .72 }, uParameter: { value: .42 } },
    vertexShader: `uniform mat4 textureMatrix;uniform float uTime,uIntensity,uParameter;varying vec4 vReflection;varying vec3 vWorld,vNormalWater;
      void main(){vec3 p=position;float f=.65+uParameter*1.3;float height=0.0;vec2 slope=vec2(0);
        for(int i=0;i<6;i++){float a=float(i)*1.71;vec2 direction=vec2(cos(a),sin(a));float frequency=f*(.75+float(i)*.59);float phase=dot(p.xy,direction)*frequency+uTime*sqrt(9.8*frequency);float amplitude=uIntensity*.055/(1.0+float(i));height+=sin(phase)*amplitude;slope+=direction*cos(phase)*amplitude*frequency;}
        p.z+=height;vReflection=textureMatrix*vec4(p,1.0);vWorld=(modelMatrix*vec4(p,1.0)).xyz;vNormalWater=normalize(mat3(modelMatrix)*vec3(-slope.x,-slope.y,1));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader: `precision highp sampler3D;uniform sampler2D tDiffuse;uniform sampler3D uNoise;uniform float uTime,uIntensity;varying vec4 vReflection;varying vec3 vWorld,vNormalWater;
      void main(){vec3 p=vec3(vWorld.x*.35,vWorld.z*.35,uTime*.045);float nx=texture(uNoise,p+vec3(.018,0,0)).r-texture(uNoise,p-vec3(.018,0,0)).r;float nz=texture(uNoise,p+vec3(0,.018,0)).r-texture(uNoise,p-vec3(0,.018,0)).r;
        vec3 normal=normalize(vNormalWater+vec3(nx,0,nz)*uIntensity*.85);vec3 view=normalize(cameraPosition-vWorld);
        vec2 uv=vReflection.xy/vReflection.w+normal.xz*.025;
        vec3 reflected=texture2D(tDiffuse,uv).rgb;float fresnel=.025+.92*pow(1.0-max(dot(normal,view),0.0),5.0);
        vec3 color=mix(vec3(.045,.065,.058),reflected,clamp(fresnel+.17,0.0,1.0));
        float highlight=pow(max(dot(reflect(normalize(vec3(.5,-.8,-.2)),normal),view),0.0),140.0)*.15;
        gl_FragColor=vec4(color+highlight,1.0);${output}}`
  };
  const surface = new Reflector(new THREE.PlaneGeometry(8, 7.6, 110, 100), { textureWidth: 768, textureHeight: 768, multisample: 0, clipBias: .003, shader: waterShader });
  surface.material.glslVersion = THREE.GLSL3;
  surface.material.fragmentShader = `out vec4 fragColor;\n#define gl_FragColor fragColor\n${surface.material.fragmentShader}`;
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, .32, -4.6);
  water.layer.add(surface);
  animators.water = time => {
    const { primary, intensity } = getState();
    surface.material.uniforms.uTime.value = time;
    surface.material.uniforms.uParameter.value = primary;
    surface.material.uniforms.uIntensity.value = intensity;
  };

  const lightning = makeScene('lightning', { position: [4.2, 3.1, 10], target: [0, 4.4, -5], fov: 51 }, { ambient: .19, key: .12, environment: .25, sky: .22 });
  const lightningPaths = new THREE.Group();
  lightning.layer.add(lightningPaths);
  const lightningCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.45, 2.5) });
  const lightningGlow = new THREE.MeshBasicMaterial({ color: 0x9cafbc, transparent: true, opacity: .16, depthWrite: false });
  const lightningLight = new THREE.PointLight(0xdbebf3, 0, 16, 2);
  lightningLight.position.set(0, 4.5, -5);
  lightning.layer.add(lightningLight);
  let previousStrike = -1;
  animators.lightning = time => {
    const { primary, intensity } = getState();
    const period = 5.5 - primary * 2.5;
    const strike = Math.floor(time / period);
    const age = time % period;
    if (strike !== previousStrike) {
      previousStrike = strike;
      while (lightningPaths.children.length) { const child = lightningPaths.children[0]; child.geometry.dispose(); lightningPaths.remove(child); }
      const path = [];
      for (let i = 0; i < 48; i++) { const f = i / 47; path.push(new THREE.Vector3((Math.random() - .5) * .65 * Math.sin(f * Math.PI) + Math.sin(f * 8) * .3, 12.5 * (1 - f), -5 + (Math.random() - .5) * .4)); }
      const addBolt = (vertices, radius, material) => lightningPaths.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vertices, false, 'catmullrom', .05), vertices.length * 2, radius, 5, false), material));
      addBolt(path, .011, lightningCore); addBolt(path, .042, lightningGlow);
      for (let i = 0; i < 5; i++) {
        const origin = path[7 + i * 6];
        const branch = Array.from({ length: 10 }, (_, j) => origin.clone().add(new THREE.Vector3(j * .12 * (i % 2 ? -1 : 1) + (Math.random() - .5) * .12, -j * .17, Math.sin(j * 2) * .12)));
        addBolt(branch, .007, lightningCore);
      }
    }
    const pulse = Math.exp(-age * 28) + (age > .2 ? Math.exp(-(age - .2) * 35) * .35 : 0);
    lightningPaths.visible = intensity > 0 && pulse > .015;
    lightningLight.intensity = pulse * intensity * 32;
  };

  const tornado = makeScene('tornado', { position: [5, 3.3, 10.8], target: [0, 4.1, -5], fov: 50 }, { ambient: .42, key: .4, environment: .45, sky: .6 });
  const tornadoUniforms = volume('tornado', tornado.layer, [8.5, 10, 8.5], [0, 5, -5], `
    float h=p.y+5.0;vec2 center=vec2(sin(h*.5-uTime*.12),cos(h*.37+uTime*.1))*h*.065;
    vec2 q=p.xz-center;float r=length(q),angle=atan(q.y,q.x)-uTime*(.55+uParameter*1.6)+h*.65;
    vec3 flow=vec3(cos(angle)*r,h*.43-uTime*.15,sin(angle)*r)*.4;
    float large=n3(flow*.4);float radius=(.2+h*h*.021)*(.74+large*.5);
    float shape=1.0-smoothstep(.48,1.18,r/radius+(turbulence(flow)-.5)*.7);
    float ground=exp(-h*h*2.5)*(1.0-smoothstep(.7,3.6,r))*.45;
    return (shape*smoothstep(.28,.65,turbulence(flow*1.6))*1.6+ground)*uIntensity*(1.0-smoothstep(8.7,10.0,h));`, `
    float h=p.y+5.0;vec3 lit=mix(vec3(.29,.24,.18),vec3(.38,.405,.405),smoothstep(.4,2.8,h));
    color=lit*(.28+shade*.72);`);
  const debrisGeometry = new THREE.BoxGeometry(.07, .04, .09);
  const debris = new THREE.InstancedMesh(debrisGeometry, iron, 140);
  tornado.layer.add(debris);
  const debrisSeeds = Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random()]);
  animators.tornado = time => {
    updateVolume(tornadoUniforms, time);
    const { primary, intensity } = getState();
    debris.count = Math.floor(140 * intensity);
    debrisSeeds.forEach(([a, b, c], i) => {
      const life = (a + time * .055) % 1, h = life ** 2 * 5.5;
      const angle = b * Math.PI * 2 + time * (1.5 + primary * 2) - h;
      const radius = .35 + h * .14 + c * 1.3 * (1 - life);
      dummy.position.set(Math.cos(angle) * radius, .04 + h, -5 + Math.sin(angle) * radius);
      dummy.rotation.set(time * (1 + c), b * 30, time * (1 + a));dummy.scale.setScalar(.35 + c);dummy.updateMatrix();debris.setMatrixAt(i, dummy.matrix);
    });
    debris.instanceMatrix.needsUpdate = true;
  };

  const explosion = makeScene('particles', { position: [5.2, 2.9, 8.5], target: [0, 2.25, -4.6], fov: 48 }, { ambient: .45, key: .5, environment: .45, sky: .65 });
  box(explosion.yard, [.85, .16, .85], [0, .08, -4.6], iron);
  const explosionUniforms = volume('particles', explosion.layer, [12, 9, 12], [0, 4.5, -4.6], `
    float age=uPhase;float h=p.y+4.5;float radius=.2+min(age,1.5)*2.2;
    vec3 q=vec3(p.x,(h-(.25+age*.85))*.8,p.z);
    vec3 flow=q*.55-vec3(0,uPhase*.15,0);float billow=turbulence(flow);
    float sphere=1.0-smoothstep(.3,1.12,length(q)/radius+(billow-.5)*.62);
    float shell=1.0-smoothstep(.4,1.1,length(vec3(p.x,h*3.0,p.z))/(radius*1.35));
    float fade=smoothstep(0.0,.09,age)*(1.0-smoothstep(2.5,4.7,age));
    return (sphere*smoothstep(.24,.65,billow)*1.35+shell*.32)*fade*uIntensity;`, `
    float hot=1.0-smoothstep(.23,.9,uPhase);vec3 smoke=mix(vec3(.12,.1,.075),vec3(.43,.36,.26),shade);
    vec3 flame=mix(vec3(1.5,.2,.009),vec3(3.4,1.65,.14),clamp(d*.65,0.0,1.0));color=mix(smoke,flame,hot);`);
  const rubble = new THREE.InstancedMesh(new THREE.BoxGeometry(.095, .065, .12), stone, 60);
  explosion.layer.add(rubble);
  const rubbleSeeds = Array.from({ length: 60 }, () => [Math.random(), Math.random(), Math.random()]);
  const explosionLight = new THREE.PointLight(0xffc070, 0, 11, 2);
  explosionLight.position.set(0, 1, -4.6);explosion.layer.add(explosionLight);
  animators.particles = time => {
    updateVolume(explosionUniforms, time);
    const { primary, intensity } = getState();
    const age = (time + primary * 5.9) % 5.9;
    explosionUniforms.uPhase.value = age;
    explosionLight.intensity = Math.exp(-age * 13) * intensity * 28;
    rubble.count = Math.floor(60 * intensity);
    rubbleSeeds.forEach(([a, b, c], i) => {
      const angle = a * Math.PI * 2, speed = (1.2 + b * 2.8) * intensity, vertical = 1.5 + c * 3.1;
      const flightTime = vertical * 2 / 9.8;
      const bounceAge = Math.max(0, age - flightTime);
      const height = age < flightTime ? vertical * age - 4.9 * age * age : Math.max(0, vertical * .24 * bounceAge - 4.9 * bounceAge * bounceAge);
      const travel = Math.min(age, flightTime) * speed + Math.min(bounceAge, .7) * speed * .3;
      dummy.position.set(Math.cos(angle) * travel, .08 + height, -4.6 + Math.sin(angle) * travel);
      dummy.rotation.set(Math.min(age, flightTime + .2) * (5 + b), a * 19, age < flightTime ? age * 6 : 0);
      dummy.scale.setScalar((.5 + b) * (1 - THREE.MathUtils.smoothstep(age, 4.5, 5.8)));dummy.updateMatrix();rubble.setMatrixAt(i, dummy.matrix);
    });
    rubble.instanceMatrix.needsUpdate = true;
  };

  const dust = makeScene('dust', { position: [3.8, 2.45, 4.5], target: [0, 2.3, -5], fov: 45 }, { ambient: .17, key: .2, environment: .28, sky: .32 });
  const sunbeam = new THREE.SpotLight(0xffefd4, 70, 14, .3, .7, 2);
  sunbeam.position.set(3.3, 5.3, -8.1);sunbeam.target.position.set(0, .15, -2.2);dust.layer.add(sunbeam, sunbeam.target);
  const dustUniforms = volume('dust', dust.layer, [8, 7, 9], [0, 3.5, -4.5], `
    vec3 origin=vec3(3.3,1.8,-3.6),direction=normalize(vec3(-3.3,-5.15,5.9));vec3 delta=p-origin;
    float distance=dot(delta,direction);float radius=max(.1,distance*.3);float radial=length(delta-direction*distance);
    float cone=(1.0-smoothstep(radius*.35,radius,radial))*smoothstep(0.0,.3,distance)*(1.0-smoothstep(6.0,8.0,distance));
    return cone*(.016+n3(p*.2-vec3(uTime*.012,0,0))*.025)*uIntensity;`, `color=vec3(.8,.67,.46)*(.75+shade*.25);`);
  const motes = points(dust.layer, 4500, 24, 0xc7bba6);
  motes.object.renderOrder = 5;
  motes.material.vertexShader = `attribute vec3 aSeed;uniform float uSize,uIntensity,uPixelRatio;varying float vAlpha;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((10.0+aSeed.z*25.0)*uPixelRatio/max(-mv.z,.5),1.0,4.0);
      vec3 delta=position-vec3(3.3,5.3,-8.1),direction=normalize(vec3(-3.3,-5.15,5.9));float distance=dot(delta,direction);float radius=max(.1,distance*.3);
      float lit=(1.0-smoothstep(radius*.35,radius,length(delta-direction*distance)))*step(0.0,distance);vAlpha=(.035+lit*.82)*uIntensity;}`;
  animators.dust = time => {
    updateVolume(dustUniforms, time);
    const { primary, intensity } = getState();
    motes.material.uniforms.uIntensity.value = intensity;
    motes.geometry.setDrawRange(0, Math.floor(4500 * intensity));
    for (let i = 0; i < 4500; i++) {
      const a = motes.seeds[i * 3], b = motes.seeds[i * 3 + 1], c = motes.seeds[i * 3 + 2];
      motes.positions.set([-3 + ((a * 7 + time * (primary - .5) * .12) % 7 + 7) % 7, .15 + b * 5.5 + Math.sin(time * .18 + a * 20) * .08, -8 + c * 7 + Math.sin(time * .12 + b * 15) * .07], i * 3);
    }
    motes.geometry.attributes.position.needsUpdate = true;
  };

  const dew = makeScene('dew', { position: [.6, 2.4, -.1], target: [0, 2.25, -4], fov: 40 });
  const paneMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .035, transmission: .97, thickness: .012, ior: 1.5, transparent: true, opacity: 1, metalness: 0 });
  const pane = mesh(dew.yard, new THREE.BoxGeometry(3.65, 2.55, .018), paneMaterial, [0, 2.25, -4]);
  pane.userData.castShadow = false;
  for (const x of [-1.9, 1.9]) box(dew.yard, [.11, 2.76, .09], [x, 2.25, -4], steel);
  for (const y of [.88, 3.62]) box(dew.yard, [3.91, .11, .09], [0, y, -4], steel);
  for (const x of [-1.4, 1.4]) cylinder(dew.yard, .028, .85, [x, .44, -4], iron);
  const beadGeometry = new THREE.SphereGeometry(1, 24, 18);
  const beadMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .025, transmission: 1, thickness: .035, ior: 1.333, metalness: 0, clearcoat: 1 });
  const beads = new THREE.InstancedMesh(beadGeometry, beadMaterial, 252);
  beads.userData.castShadow = beads.userData.receiveShadow = false;
  dew.layer.add(beads);
  const beadSeeds = Array.from({ length: 252 }, (_, i) => ({ x: -1.73 + (i % 18 + Math.random() * .55) / 18 * 3.46, y: 1.06 + (Math.floor(i / 18) + Math.random() * .6) / 14 * 2.37, radius: .008 + Math.random() ** 2.5 * .05, seed: Math.random() }));
  dew.yard.userData.onToggle = enabled => { const { primary, intensity } = getState();paneMaterial.roughness = enabled ? .035 + primary * intensity * .19 : .035; };
  animators.dew = time => {
    const { primary, intensity } = getState();
    paneMaterial.roughness = .035 + (dew.layer.visible ? primary * intensity * .19 : 0);
    beads.count = Math.floor(252 * intensity);
    beadSeeds.forEach(({ x, y, radius, seed }, i) => {
      const sliding = radius > .047;
      const dropY = sliding ? 1.02 + ((y - 1.02 - time * .025 * (seed + .3)) % 2.4 + 2.4) % 2.4 : y;
      dummy.position.set(x, dropY, -3.983 + radius * .32);
      dummy.rotation.set(0, 0, 0);dummy.scale.set(radius, radius * (sliding ? 1.42 : 1), radius * .52);dummy.updateMatrix();beads.setMatrixAt(i, dummy.matrix);
    });
    beads.instanceMatrix.needsUpdate = true;
  };

  function pump(parent, position) {
    return buildPump(parent, position, { steel, iron });
  }
  const hologram = makeScene('hologram', { position: [2.6, 2.25, 1.3], target: [0, 1.7, -4.4], fov: 42 }, { ambient: .32, key: .4, environment: .4, sky: .48 });
  box(hologram.yard, [1.7, .27, 1.24], [0, .135, -4.4], iron);
  for (let i = 0; i < 12; i++) box(hologram.yard, [.085, .018, .75], [-.55 + i * .1, .278, -4.4], steel);
  const hologramUniforms = { uTime: { value: 0 }, uIntensity: { value: .72 }, uParameter: { value: .38 } };
  const projectionMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: hologramUniforms,
    vertexShader: `uniform float uTime,uParameter;varying vec3 vNormalProjection,vWorld;void main(){vec3 p=position;vec4 world=modelMatrix*vec4(p,1.0);float fault=step(.985,sin(floor(uTime*3.0)*13.71+floor(world.y*35.0)*2.41));p.x+=fault*uParameter*.015;world=modelMatrix*vec4(p,1.0);vWorld=world.xyz;vNormalProjection=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float uTime,uIntensity,uParameter;varying vec3 vNormalProjection,vWorld;
      void main(){vec3 normal=normalize(vNormalProjection),view=normalize(cameraPosition-vWorld);float edge=pow(1.0-abs(dot(normal,view)),2.0);
        float scan=.78+.22*smoothstep(.1,.8,fract(vWorld.y*150.0-uTime*.8));float shade=.3+.7*max(dot(normal,normalize(vec3(-.5,.8,.4))),0.0);
        float fault=step(.995,sin(floor(uTime*2.0)*17.41+floor(vWorld.y*70.0)*3.3));
        vec3 color=vec3(.14,.42,.39)*(shade+.18*edge);float alpha=(.28+edge*.42)*scan*uIntensity*(1.0-fault*uParameter*.5);
        gl_FragColor=vec4(color,alpha);${output}}`
  });
  const projectedPump = pump(hologram.layer, [0, .5, -4.4]);
  projectedPump.traverse(object => { if (object.isMesh) { object.material = projectionMaterial; object.userData.castShadow = false; } });
  const projectionLight = new THREE.PointLight(0x94c5b9, 3, 4, 2);projectionLight.position.set(0, .45, -4.4);hologram.layer.add(projectionLight);
  animators.hologram = time => {
    const { primary, intensity } = getState();hologramUniforms.uTime.value = time;hologramUniforms.uIntensity.value = intensity;hologramUniforms.uParameter.value = primary;projectionLight.intensity = intensity * 3;
  };

  function renderTarget() { return new THREE.WebGLRenderTarget(640, 360, { type: THREE.HalfFloatType }); }
  function fitTarget(target) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const scale = Math.min(1, 1200 / size.x);
    const width = Math.max(1, Math.round(size.x * scale)), height = Math.max(1, Math.round(size.y * scale));
    if (target.width !== width || target.height !== height) target.setSize(width, height);
  }
  function captureScene(scene, target, captureCamera = camera) {
    fitTarget(target);
    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try { renderer.setRenderTarget(target);renderer.clear();renderer.render(scene, captureCamera); }
    finally { renderer.setRenderTarget(previous);renderer.shadowMap.autoUpdate = shadows; }
  }
  const distortion = makeScene('distortion', { position: [2.7, 2, 3.3], target: [0, 1.9, -4.9], fov: 44 });
  box(distortion.yard, [1.25, .12, .8], [0, .06, -4.9], iron);
  for (let i = 0; i < 18; i++) box(distortion.yard, [.028, .02, .68], [-.56 + i * .066, .13, -4.9], steel);
  const distortionTarget = renderTarget();
  const distortionMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, transparent: true, depthWrite: false,
    uniforms: { uBackground: { value: distortionTarget.texture }, uNoise: { value: weather.noiseTexture }, uTime: { value: 0 }, uIntensity: { value: .72 }, uParameter: { value: .46 } },
    vertexShader: `varying vec2 vUv;varying vec4 vClip;void main(){vUv=uv;vClip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=vClip;}`,
    fragmentShader: `precision highp sampler3D;out vec4 fragColor;
      #define gl_FragColor fragColor
      uniform sampler2D uBackground;uniform sampler3D uNoise;uniform float uTime,uIntensity,uParameter;varying vec2 vUv;varying vec4 vClip;
      void main(){vec2 screen=vClip.xy/vClip.w*.5+.5;vec3 flow=vec3(vUv.x*1.7,vUv.y*.7-uTime*.12,.31);float nx=texture(uNoise,flow+vec3(.02,0,0)).r-texture(uNoise,flow-vec3(.02,0,0)).r;
        float ny=texture(uNoise,flow+vec3(0,.02,0)).r-texture(uNoise,flow-vec3(0,.02,0)).r;
        float mask=smoothstep(0.0,.18,vUv.x)*(1.0-smoothstep(.82,1.0,vUv.x))*smoothstep(0.0,.09,vUv.y)*(1.0-smoothstep(.4,1.0,vUv.y));
        vec2 refract=vec2(nx,ny)*(.035+uParameter*.045)*uIntensity*mask;
        gl_FragColor=vec4(texture(uBackground,screen+refract).rgb,mask);${output}}`
  });
  const heat = mesh(distortion.layer, new THREE.PlaneGeometry(2.6, 3.4), distortionMaterial, [0, 1.82, -4.9]);
  heat.renderOrder = 5;
  animators.distortion = time => { const { primary, intensity } = getState();distortionMaterial.uniforms.uTime.value = time;distortionMaterial.uniforms.uIntensity.value = intensity;distortionMaterial.uniforms.uParameter.value = primary;heat.quaternion.copy(camera.quaternion); };
  captures.distortion = scene => { if (!distortion.layer.visible) return;distortion.layer.visible = false;try { captureScene(scene, distortionTarget); } finally { distortion.layer.visible = true; } };

  const portal = makeScene('portal', { position: [3.3, 2.3, 3.9], target: [0, 2.25, -4.8], fov: 43 });
  const portalPosition = new THREE.Vector3(0, 2.2, -4.8);
  const portalTarget = renderTarget();
  const destination = new THREE.Scene();
  destination.background = new THREE.Color(0x9daba6);destination.environment = weather.environment;destination.environmentIntensity = .55;
  destination.add(new THREE.HemisphereLight(0xffffff, 0x454b43, .6));
  const destinationKey = new THREE.DirectionalLight(0xe8e7da, 1.2);destinationKey.position.set(0, 5, 10);destination.add(destinationKey);
  box(destination, [7, .25, 35], [0, -.14, -10], stone);
  for (const x of [-3.4, 3.4]) box(destination, [.3, 5, 35], [x, 2.5, -10], stone);
  box(destination, [7, .25, 35], [0, 5, -10], stone);
  for (let i = 0; i < 6; i++) {
    for (const x of [-3.2, 3.2]) box(destination, [.28, 5, .4], [x, 2.5, -i * 5], iron);
    box(destination, [1.4, .09, .25], [0, 4.75, -i * 5], new THREE.MeshStandardMaterial({ color: 0xdad9cc, emissive: 0xe3e0cd, emissiveIntensity: .7 }));
    const light = new THREE.PointLight(0xffefd9, 13, 7, 2);light.position.set(0, 4.5, -i * 5);destination.add(light);
  }
  pump(destination, [-1.6, 0, -8]);pump(destination, [1.7, 0, -16]);
  const portalMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: { uDestination: { value: portalTarget.texture }, uIntensity: { value: .72 }, uTime: { value: 0 }, uParameter: { value: .48 } },
    vertexShader: `varying vec4 vClip;varying vec2 vUv;void main(){vUv=uv;vClip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=vClip;}`,
    fragmentShader: `uniform sampler2D uDestination;uniform float uIntensity,uTime,uParameter;varying vec4 vClip;varying vec2 vUv;
      void main(){vec2 p=vUv*2.0-1.0;float r=length(p);vec2 uv=vClip.xy/vClip.w*.5+.5;
        float edge=smoothstep(.8,1.0,r);uv+=p*sin(r*80.0-uTime*(.4+uParameter)*5.0)*edge*.002;
        vec3 image=texture2D(uDestination,uv).rgb;image+=vec3(.18,.13,.055)*pow(edge,8.0)*uIntensity;
        gl_FragColor=vec4(image,smoothstep(0.0,.15,uIntensity));${output}}`
  });
  mesh(portal.layer, new THREE.CircleGeometry(1.35, 96), portalMaterial, portalPosition.toArray());
  mesh(portal.yard, new THREE.TorusGeometry(1.41, .085, 24, 100), steel, portalPosition.toArray());
  for (const x of [-.9, .9]) { box(portal.yard, [.13, .86, .3], [x, .43, -4.8], iron);box(portal.yard, [.62, .1, .65], [x, .05, -4.8], iron); }
  const virtualCamera = camera.clone();
  captures.portal = () => {
    if (!portal.layer.visible) return;
    virtualCamera.copy(camera);virtualCamera.position.sub(portalPosition).add(new THREE.Vector3(0, 2.2, 0));virtualCamera.updateMatrixWorld();captureScene(destination, portalTarget, virtualCamera);
  };
  animators.portal = time => { const { primary, intensity } = getState();portalMaterial.uniforms.uTime.value = time;portalMaterial.uniforms.uParameter.value = primary;portalMaterial.uniforms.uIntensity.value = intensity; };

  const composite = makeScene('compositing', { position: [2.5, 2.3, 1.8], target: [0, .85, -4.6], fov: 42 });
  const yardObjects = [...composite.yard.children].filter(child => child !== composite.layer);
  const subject = pump(composite.yard, [0, 0, -4.6]);
  const foregroundTarget = renderTarget(), backgroundTarget = renderTarget();
  const compareMaterial = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uForeground: { value: foregroundTarget.texture }, uBackground: { value: backgroundTarget.texture }, uSeparator: { value: .54 }, uIntensity: { value: .72 }, uEnabled: { value: 1 }, uWidth: { value: 1280 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `uniform sampler2D uForeground,uBackground;uniform float uSeparator,uIntensity,uEnabled,uWidth;varying vec2 vUv;
      void main(){vec3 source=texture2D(uForeground,vUv).rgb;vec3 background=texture2D(uBackground,vUv).rgb;
        float strength=smoothstep(0.0,.35,uIntensity);float green=source.g-max(source.r,source.b);float key=smoothstep(.035+(1.0-uIntensity)*.085,.12+(1.0-uIntensity)*.19,green)*strength;
        vec3 corrected=source;corrected.g=mix(source.g,min(source.g,max(source.r,source.b)+.055),strength);
        vec3 combined=mix(corrected,background,key);float after=step(uSeparator,vUv.x)*uEnabled;
        vec3 image=mix(source,combined,after);float divider=(1.0-smoothstep(.5/uWidth,1.6/uWidth,abs(vUv.x-uSeparator)))*uEnabled;
        gl_FragColor=vec4(mix(image,vec3(.55),divider*.75),1.0);${output}}`
  });
  const comparison = mesh(composite.layer, new THREE.PlaneGeometry(2, 2), compareMaterial);comparison.frustumCulled = false;comparison.renderOrder = 20;
  composite.yard.userData.onToggle = enabled => { composite.layer.visible = true;compareMaterial.uniforms.uEnabled.value = enabled ? 1 : 0; };
  animators.compositing = () => { const { primary, intensity } = getState();compareMaterial.uniforms.uSeparator.value = primary;compareMaterial.uniforms.uIntensity.value = intensity;compareMaterial.uniforms.uWidth.value = renderer.domElement.width; };
  captures.compositing = scene => {
    const background = scene.background, fog = scene.fog;
    composite.layer.visible = false;
    try {
      yardObjects.forEach(object => { object.visible = false; });
      scene.background = new THREE.Color(0x16c849);scene.fog = null;
      captureScene(scene, foregroundTarget);
      yardObjects.forEach(object => { object.visible = true; });
      subject.visible = false;scene.background = background;scene.fog = fog;
      captureScene(scene, backgroundTarget);
    } finally { subject.visible = true;yardObjects.forEach(object => { object.visible = true; });composite.layer.visible = true;scene.background = background;scene.fog = fog; }
  };

  return {
    prepareFrame(scene, id) {
      const activeVolumes = volumes[id];
      if (activeVolumes && groups[id].userData.effectLayer.visible) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (depthTarget.width !== size.x || depthTarget.height !== size.y) depthTarget.setSize(size.x, size.y);
        activeVolumes.forEach(object => {
          const uniforms = object.material.uniforms;
          uniforms.uResolution.value.copy(size);uniforms.uCamera.value.copy(camera.position);object.updateWorldMatrix(true, false);object.worldToLocal(uniforms.uCamera.value);camera.getWorldDirection(uniforms.uForward.value);
        });
        const layer = groups[id].userData.effectLayer, override = scene.overrideMaterial, target = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
        layer.visible = false;scene.overrideMaterial = depthMaterial;renderer.shadowMap.autoUpdate = false;
        try { renderer.setRenderTarget(depthTarget);renderer.clear();renderer.render(scene, camera); }
        finally { layer.visible = true;scene.overrideMaterial = override;renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate = shadows; }
      }
      captures[id]?.(scene);
    }
  };
}
