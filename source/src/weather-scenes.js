import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const assetRoot = `${import.meta.env.BASE_URL}assets/weather/`;
const random = THREE.MathUtils.seededRandom;

function volumeTexture() {
  random(4127);
  const grids = [8, 16, 32].map(size => ({ size, data: Float32Array.from({ length: size ** 3 }, () => random()) }));
  function sample({ size, data }, x, y, z) {
    const ax = Math.floor(x), ay = Math.floor(y), az = Math.floor(z);
    let fx = x - ax, fy = y - ay, fz = z - az;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const at = (dx, dy, dz) => data[((az + dz) % size) * size * size + ((ay + dy) % size) * size + (ax + dx) % size];
    const mix = THREE.MathUtils.lerp;
    return mix(mix(mix(at(0, 0, 0), at(1, 0, 0), fx), mix(at(0, 1, 0), at(1, 1, 0), fx), fy), mix(mix(at(0, 0, 1), at(1, 0, 1), fx), mix(at(0, 1, 1), at(1, 1, 1), fx), fy), fz);
  }
  const size = 64;
  const data = new Uint8Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value = 0;
    grids.forEach((grid, i) => { value += sample(grid, x * grid.size / size, y * grid.size / size, z * grid.size / size) * [.57, .28, .15][i]; });
    data[x + y * size + z * size * size] = Math.round(value * 255);
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export async function buildWeatherScenes({ groups, animators, camera, renderer, getState }) {
  const loader = new THREE.TextureLoader();
  const maps = {};
  await Promise.all(['asphalt_02', 'concrete_wall_006'].flatMap(id => ['Diffuse', 'nor_gl', 'rough'].map(async channel => {
    const texture = await loader.loadAsync(`${assetRoot}${id}-${channel}.jpg`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (channel === 'Diffuse') texture.colorSpace = THREE.SRGBColorSpace;
    maps[`${id}-${channel}`] = texture;
  })));
  const sky = await new HDRLoader().loadAsync(`${assetRoot}overcast.hdr`);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentTarget = generator.fromEquirectangular(sky);
  generator.dispose();

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc5c1b8, roughness: .96, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6f726b, roughness: .68, metalness: .78 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x303834, roughness: .7, metalness: .55 });
  const asphalt = new THREE.MeshPhysicalMaterial({ color: 0x777c78, roughness: 1, metalness: 0, clearcoat: 0, clearcoatRoughness: .35 });
  function textureMaterial(base, id, repeatX, repeatY) {
    const material = base.clone();
    [['map', 'Diffuse'], ['normalMap', 'nor_gl'], ['roughnessMap', 'rough']].forEach(([property, channel]) => {
      material[property] = maps[`${id}-${channel}`].clone();
      material[property].repeat.set(repeatX, repeatY);
      material[property].needsUpdate = true;
    });
    material.normalScale.set(.5, .5);
    return material;
  }
  function box(group, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function pipe(group, radius, height, position, material = steel) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24, 1, true), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function courtyard(wet = false, includeStack = true) {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 34), textureMaterial(asphalt, 'asphalt_02', 12, 14));
    ground.material.color.setHex(wet ? 0x5f6561 : 0x777c78);
    ground.material.clearcoat = wet ? .12 : 0;
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -5);
    ground.receiveShadow = true;
    group.add(ground);
    const wall = textureMaterial(concrete, 'concrete_wall_006', 6, 1.9);
    box(group, [28, 7.6, .45], [0, 3.8, -9], wall);
    box(group, [.45, 7.6, 30], [-8, 3.8, -5], textureMaterial(concrete, 'concrete_wall_006', 7.5, 1.9));
    box(group, [.45, 7.6, 30], [13, 3.8, -5], wall);
    box(group, [28, .3, .65], [0, .15, -8.58], textureMaterial(concrete, 'concrete_wall_006', 7, .15));
    box(group, [.65, .3, 30], [-7.57, .15, -5], wall);
    box(group, [28, .42, .045], [0, .51, -8.74], new THREE.MeshStandardMaterial({ color: 0x53564b, roughness: 1 }));
    box(group, [4.3, 4.5, .12], [2, 2.25, -8.69], darkSteel);
    const doorMetal = new THREE.MeshStandardMaterial({ color: 0x575f5a, roughness: .75, metalness: .38, normalMap: maps['concrete_wall_006-nor_gl'], normalScale: new THREE.Vector2(.12, .12) });
    const doorGeometry = new THREE.PlaneGeometry(4.12, 4.4, 1, 336);
    const doorVertices = doorGeometry.attributes.position;
    for (let i = 0; i < doorVertices.count; i++) doorVertices.setZ(i, Math.sin(doorVertices.getY(i) * Math.PI * 19) * .014);
    doorGeometry.computeVertexNormals();
    const door = new THREE.Mesh(doorGeometry, doorMetal);
    door.position.set(2, 2.28, -8.58);
    door.userData.castShadow = door.userData.receiveShadow = false;
    group.add(door);
    for (const x of [-.23, 4.23]) box(group, [.14, 4.66, .2], [x, 2.3, -8.54], steel);
    box(group, [4.6, .14, .3], [2, 4.62, -8.54], steel);
    box(group, [.55, .035, .06], [2, 1.1, -8.5], steel);
    for (const x of [-5.5, 7.2]) {
      box(group, [2.2, 1.65, .15], [x, 5.6, -8.64], darkSteel);
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x59605e, roughness: .3, metalness: 0, clearcoat: 1 });
      box(group, [2.05, 1.48, .035], [x, 5.6, -8.53], glass);
      box(group, [.048, 1.52, .08], [x, 5.6, -8.49], steel);
      box(group, [2.08, .05, .08], [x, 5.6, -8.49], steel);
    }
    pipe(group, .07, 7.4, [-6.35, 3.7, -8.49]);
    pipe(group, .047, 6.8, [6.2, 3.4, -8.49]);
    for (let i = 0; i < 5; i++) {
      box(group, [.18, .035, .16], [-6.35, .8 + i * 1.4, -8.43], darkSteel);
      box(group, [.13, .035, .13], [6.2, .8 + i * 1.4, -8.43], darkSteel);
    }
    box(group, [.6, .9, .22], [6.95, 1.95, -8.47], steel);
    const conduit = pipe(group, .022, 2.1, [6.95, .95, -8.38], darkSteel);
    conduit.position.y = .8;
    box(group, [1.25, .05, .32], [-4.6, .06, -4.8], darkSteel);
    for (let i = 0; i < 24; i++) box(group, [.025, .035, .28], [-5.17 + i * .05, .095, -4.8], steel);
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xdbd4bf, emissive: 0xffd9ac, emissiveIntensity: .8, roughness: .4 });
    box(group, [.9, .18, .22], [2, 4.99, -8.45], darkSteel);
    box(group, [.77, .075, .12], [2, 4.93, -8.32], lampMaterial);
    const lamp = new THREE.PointLight(0xffdfb5, 8, 7, 2);
    lamp.position.set(2, 4.75, -8.08);
    group.add(lamp);
    if (includeStack) {
    pipe(group, .21, 1.65, [-2.4, .825, -4.8], darkSteel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.21, .023, 12, 40), steel);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(-2.4, 1.66, -4.8);
    group.add(rim);
    const opening = new THREE.Mesh(new THREE.CircleGeometry(.195, 40), new THREE.MeshBasicMaterial({ color: 0x171918 }));
    opening.rotation.x = -Math.PI / 2;
    opening.position.set(-2.4, 1.65, -4.8);
    group.add(opening);
    }
    return group;
  }

  const impactCount = 32;
  const impacts = Array.from({ length: impactCount }, () => new THREE.Vector4(0, 0, -100, 0));
  const reflectionShader = {
    uniforms: { color: { value: new THREE.Color(.5, .5, .5) }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, uNormal: { value: maps['asphalt_02-nor_gl'] }, uTime: { value: 0 }, uRain: { value: 1 }, uImpacts: { value: impacts } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflection; varying vec3 vWorld;
      void main(){vReflection=textureMatrix*vec4(position,1.0);vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D tDiffuse,uNormal;uniform float uTime,uRain;uniform vec4 uImpacts[32];varying vec4 vReflection;varying vec3 vWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=vWorld.xz;float n=noise(p*.32)*.7+noise(p*.91)*.3;float puddle=smoothstep(.42,.67,n);
        vec2 distortion=(texture2D(uNormal,p*.42).xy-.5)*.007*(1.0-puddle*.85);
        for(int i=0;i<32;i++){float age=uTime-uImpacts[i].z;vec2 delta=p-uImpacts[i].xy;float d=length(delta);float ring=d-age*.9;
          float wave=sin(ring*95.0)*exp(-ring*ring*150.0)*exp(-age*4.5)*step(0.0,age)*step(age,1.2)*uImpacts[i].w;
          distortion+=delta/max(d,.01)*wave*.003*uRain;}
        vec2 uv=vReflection.xy/vReflection.w+distortion;
        vec3 reflection=texture2D(tDiffuse,uv).rgb*.4;
        reflection+=(texture2D(tDiffuse,uv+vec2(.002,0)).rgb+texture2D(tDiffuse,uv-vec2(.002,0)).rgb+texture2D(tDiffuse,uv+vec2(0,.002)).rgb+texture2D(tDiffuse,uv-vec2(0,.002)).rgb)*.15;
        vec3 view=normalize(cameraPosition-vWorld);float fresnel=.035+.7*pow(1.0-max(view.y,0.0),5.0);
        gl_FragColor=vec4(reflection,(.035+puddle*.9)*fresnel);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const wetGround = new Reflector(new THREE.PlaneGeometry(28, 34), { textureWidth: 768, textureHeight: 768, clipBias: .003, multisample: 0, shader: reflectionShader });
  wetGround.rotation.x = -Math.PI / 2;
  wetGround.position.set(0, .016, -5);
  wetGround.material.transparent = true;
  wetGround.material.depthWrite = false;
  wetGround.material.uniforms.uImpacts.value = impacts;
  wetGround.renderOrder = 1;
  const rainGroup = courtyard(true);
  rainGroup.add(wetGround);
  const rainLayer = new THREE.Group();
  rainGroup.add(rainLayer);
  rainGroup.userData.effectLayer = rainLayer;
  groups.rain = rainGroup;

  const dropCount = 4200;
  const dropPositions = new Float32Array(dropCount * 3);
  const dropSeeds = new Float32Array(dropCount);
  const dropSpeeds = new Float32Array(dropCount);
  const dropGeometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  dropGeometry.index = quad.index;
  dropGeometry.attributes.position = quad.attributes.position;
  dropGeometry.attributes.uv = quad.attributes.uv;
  dropGeometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(dropPositions, 3).setUsage(THREE.DynamicDrawUsage));
  dropGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(dropSeeds, 1));
  function resetDrop(i, initial = false) {
    const offset = i * 3;
    dropPositions[offset] = -7.1 + Math.random() * 18.8;
    dropPositions[offset + 1] = initial ? .1 + Math.random() * 11 : 9 + Math.random() * 2;
    dropPositions[offset + 2] = -8.1 + Math.random() * 18.2;
    dropSpeeds[i] = 7 + Math.random() * 5;
  }
  for (let i = 0; i < dropCount; i++) { dropSeeds[i] = Math.random(); resetDrop(i, true); }
  const rainMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uWind: { value: 0 }, uIntensity: { value: .72 } },
    vertexShader: `attribute vec3 aOffset;attribute float aSeed;uniform float uWind,uIntensity;varying vec2 vUv;varying float vAlpha;
      void main(){vec4 mv=modelViewMatrix*vec4(aOffset,1.0);vec3 direction=mat3(viewMatrix)*vec3(uWind,-10.0,.12);
        vec2 along=normalize(direction.xy),across=vec2(-along.y,along.x);
        float width=.0025+aSeed*.005;float length=.085+aSeed*.15;
        mv.xy+=across*position.x*width+along*position.y*length;gl_Position=projectionMatrix*mv;
        vUv=uv;vAlpha=(.12+.3*aSeed)*(.5+uIntensity*.5)*smoothstep(.5,2.5,-mv.z);}`,
    fragmentShader: `varying vec2 vUv;varying float vAlpha;void main(){float edge=1.0-abs(vUv.x*2.0-1.0);float tail=sin(vUv.y*3.14159265);gl_FragColor=vec4(vec3(.58,.62,.63),edge*tail*vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const drops = new THREE.Mesh(dropGeometry, rainMaterial);
  drops.frustumCulled = false;
  drops.renderOrder = 2;
  rainLayer.add(drops);

  const splashCount = 256;
  const splashData = new Float32Array(splashCount * 4);
  splashData.fill(-100);
  const splashGeometry = new THREE.BufferGeometry();
  splashGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(splashCount * 3), 3));
  splashGeometry.setAttribute('aImpact', new THREE.BufferAttribute(splashData, 4).setUsage(THREE.DynamicDrawUsage));
  const splashMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec4 aImpact;uniform float uTime,uPixelRatio;varying float vFade;
      void main(){float age=uTime-aImpact.z;float life=clamp(age/.27,0.0,1.0);float seed=aImpact.w;
        vec3 p=vec3(aImpact.x+sin(seed*74.0)*age*.4,.025+age*(.65+seed*.5)-age*age*4.5,aImpact.y+cos(seed*29.0)*age*.4);
        vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(35.0*uPixelRatio/max(-mv.z,1.0),1.0,5.0);
        vFade=(1.0-life)*.38*step(0.0,age)*step(age,.27);}`,
    fragmentShader: `varying float vFade;void main(){float shape=1.0-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(vec3(.57,.6,.6),shape*vFade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const splashes = new THREE.Points(splashGeometry, splashMaterial);
  splashes.frustumCulled = false;
  splashes.renderOrder = 3;
  rainLayer.add(splashes);
  let impactIndex = 0, splashIndex = 0, previousRainTime = -1;
  animators.rain = (time, delta = 0) => {
    const { primary, intensity } = getState();
    const wind = (primary - .5) * 4.2 + Math.sin(time * .35) * .13;
    const activeCount = Math.floor(dropCount * intensity);
    if (time < previousRainTime) {
      impacts.forEach(impact => impact.set(0, 0, -100, 0));
      splashData.fill(-100);
      for (let i = 0; i < dropCount; i++) resetDrop(i, true);
    }
    previousRainTime = time;
    dropGeometry.instanceCount = activeCount;
    rainMaterial.uniforms.uWind.value = wind;
    rainMaterial.uniforms.uIntensity.value = intensity;
    wetGround.material.uniforms.uTime.value = time;
    wetGround.material.uniforms.uRain.value = rainLayer.visible ? intensity : 0;
    splashMaterial.uniforms.uTime.value = time;
    for (let i = 0; i < activeCount; i++) {
      const offset = i * 3;
      dropPositions[offset] += wind * delta;
      dropPositions[offset + 1] -= dropSpeeds[i] * delta;
      if (dropPositions[offset + 1] < 0) {
        const x = dropPositions[offset], z = dropPositions[offset + 2];
        if (x > -7.2 && x < 12 && z > -8.2 && z < 9 && Math.random() < .23) {
          impacts[impactIndex].set(x, z, time, .6 + Math.random() * .4);
          impactIndex = (impactIndex + 1) % impactCount;
          for (let j = 0; j < 3; j++) {
            splashData.set([x, z, time, Math.random()], splashIndex * 4);
            splashIndex = (splashIndex + 1) % splashCount;
          }
        }
        resetDrop(i);
      }
      if (dropPositions[offset] < -7.4 || dropPositions[offset] > 12.2) resetDrop(i);
    }
    dropGeometry.attributes.aOffset.needsUpdate = true;
    splashGeometry.attributes.aImpact.needsUpdate = true;
  };

  const smokeGroup = courtyard();
  groups.smoke = smokeGroup;
  const smokeLayer = new THREE.Group();
  smokeGroup.add(smokeLayer);
  smokeGroup.userData.effectLayer = smokeLayer;
  const depthTarget = new THREE.WebGLRenderTarget(1, 1);
  depthTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const depthMaterial = new THREE.MeshDepthMaterial();
  const smokeMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide,
    uniforms: { uNoise: { value: volumeTexture() }, uDepth: { value: depthTarget.depthTexture }, uResolution: { value: new THREE.Vector2() }, uCamera: { value: new THREE.Vector3() }, uForward: { value: new THREE.Vector3() }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: { value: 0 }, uWind: { value: 0 }, uIntensity: { value: .72 } },
    vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `precision highp sampler3D;out vec4 fragColor;
      #define gl_FragColor fragColor
      #include <packing>
      uniform sampler3D uNoise;uniform sampler2D uDepth;uniform vec2 uResolution;uniform vec3 uCamera,uForward;uniform float uNear,uFar,uTime,uWind,uIntensity;varying vec3 vLocal;
      float noise3(vec3 p){return texture(uNoise,p).r;}
      float density(vec3 p){
        float height=p.y+3.6;float h=max(height,0.0);
        vec2 center=vec2(-.9+uWind*h*.3,.12*sin(h*.55-uTime*.18)*h*.15);
        vec3 flow=vec3(p.x-uWind*h*.2,p.y-uTime*.68,p.z);
        float large=noise3(flow*.11+vec3(.13,0,.34));
        float radius=(.19+sqrt(h)*.29+h*.075)*(.66+large*.84);
        vec2 warp=vec2(noise3(flow*.17),noise3(flow*.17+vec3(.31,.13,.52)))-.5;
        float distance=length(p.xz-center+warp*h*.23)/radius;
        float body=1.0-smoothstep(.38,1.12,distance);
        float n=noise3(flow*.26)*.65+noise3(flow*.67)*.25+noise3(flow*1.6)*.1;
        float detail=smoothstep(.27,.69,n);
        float fade=smoothstep(0.0,.12,height)*(1.0-smoothstep(5.1,7.2,height));
        return body*detail*fade*uIntensity*2.5;
      }
      void main(){
        vec3 ray=normalize(vLocal-uCamera);vec3 inverse=1.0/ray;
        vec3 a=(vec3(-5.0,-3.6,-2.5)-uCamera)*inverse,b=(vec3(5.0,3.6,2.5)-uCamera)*inverse;
        vec3 lo=min(a,b),hi=max(a,b);float near=max(max(lo.x,lo.y),lo.z),far=min(min(hi.x,hi.y),hi.z);
        float depth=texture(uDepth,gl_FragCoord.xy/uResolution).x;
        float sceneDistance=-perspectiveDepthToViewZ(depth,uNear,uFar)/max(dot(ray,uForward),.001);
        far=min(far,sceneDistance-.035);near=max(near,0.0);if(far<=near)discard;
        float stepSize=(far-near)/64.0;
        float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
        vec3 p=uCamera+ray*(near+stepSize*jitter);vec4 sum=vec4(0);
        vec3 sun=normalize(vec3(-.5,.85,.35));
        for(int i=0;i<64;i++){
          float d=density(p);
          if(d>.002){
            float shadow=density(p+sun*.25)*.25+density(p+sun*.65)*.4+density(p+sun*1.15)*.5;
            float light=exp(-shadow*2.8);
            vec3 color=mix(vec3(.09,.105,.108),vec3(.43,.46,.46),light);
            float alpha=1.0-exp(-d*stepSize*2.3);
            sum.rgb+=(1.0-sum.a)*color*alpha;sum.a+=(1.0-sum.a)*alpha;
          }
          if(sum.a>.985)break;p+=ray*stepSize;
        }
        if(sum.a<.003)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const smoke = new THREE.Mesh(new THREE.BoxGeometry(10, 7.2, 5), smokeMaterial);
  smoke.position.set(-1.5, 5.27, -4.8);
  smoke.renderOrder = 4;
  smokeLayer.add(smoke);
  animators.smoke = time => {
    const { primary, intensity } = getState();
    smokeMaterial.uniforms.uTime.value = time;
    smokeMaterial.uniforms.uWind.value = (primary - .5) * 2;
    smokeMaterial.uniforms.uIntensity.value = intensity;
    smoke.updateWorldMatrix(true, false);
    smokeMaterial.uniforms.uCamera.value.copy(camera.position);
    smoke.worldToLocal(smokeMaterial.uniforms.uCamera.value);
    camera.getWorldDirection(smokeMaterial.uniforms.uForward.value);
  };
  return {
    sky, environment: environmentTarget.texture,
    createCourtyard: courtyard, maps,
    noiseTexture: smokeMaterial.uniforms.uNoise.value,
    prepareFrame(scene, id) {
      if (id !== 'smoke' || !smokeLayer.visible) return;
      renderer.getDrawingBufferSize(smokeMaterial.uniforms.uResolution.value);
      const { x: width, y: height } = smokeMaterial.uniforms.uResolution.value;
      if (depthTarget.width !== width || depthTarget.height !== height) depthTarget.setSize(width, height);
      const target = renderer.getRenderTarget();
      const override = scene.overrideMaterial;
      const shadows = renderer.shadowMap.autoUpdate;
      smokeLayer.visible = false;
      scene.overrideMaterial = depthMaterial;
      renderer.shadowMap.autoUpdate = false;
      try {
        renderer.setRenderTarget(depthTarget);
        renderer.clear();
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(target);
        renderer.shadowMap.autoUpdate = shadows;
        scene.overrideMaterial = override;
        smokeLayer.visible = true;
      }
    }
  };
}
