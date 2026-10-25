import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export function createFaceGlow(renderer) {
  const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: true });
  const base = makeTarget(), light = makeTarget(), ping = makeTarget(), blur = makeTarget();
  ping.depthBuffer = blur.depthBuffer = false;
  const black = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
  const replacements = new Map();
  const blurMaterial = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { image: { value: null }, direction: { value: new THREE.Vector2() } }, vertexShader,
    fragmentShader: `uniform sampler2D image; uniform vec2 direction; varying vec2 vUv;
      void main(){vec4 c=texture2D(image,vUv)*.227027;
      c+=(texture2D(image,vUv+direction*1.384615)+texture2D(image,vUv-direction*1.384615))*.316216;
      c+=(texture2D(image,vUv+direction*3.230769)+texture2D(image,vUv-direction*3.230769))*.070270;
      gl_FragColor=c;}`,
  });
  const composite = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { base: { value: base.texture }, glow: { value: blur.texture } }, vertexShader,
    fragmentShader: `uniform sampler2D base; uniform sampler2D glow; varying vec2 vUv;
      void main(){vec4 surface=texture2D(base,vUv);vec3 halo=texture2D(glow,vUv).rgb*.48;
      float a=max(surface.a,clamp(max(halo.r,max(halo.g,halo.b))*.48,0.,.82));
      gl_FragColor=vec4(surface.rgb+halo,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb*=a;}`,
  });
  const quad = new FullScreenQuad(blurMaterial), size = new THREE.Vector2();
  let smallWidth = 1, smallHeight = 1;
  function glowMaterial(material) {
    if (!material.emissive || material.emissive.getHex() === 0) return black;
    if (!replacements.has(material)) replacements.set(material, new THREE.MeshBasicMaterial({ color: material.emissive.clone(), toneMapped: false, side: material.side }));
    const replacement = replacements.get(material);
    replacement.color.copy(material.emissive).multiplyScalar(material.emissiveIntensity);
    return replacement;
  }
  return {
    resize() {
      renderer.getDrawingBufferSize(size); base.setSize(size.x, size.y);
      const ratio = Math.min(.5, 512 / Math.max(size.x, size.y));
      smallWidth = Math.max(1, Math.round(size.x * ratio)); smallHeight = Math.max(1, Math.round(size.y * ratio));
      for (const target of [light, ping, blur]) target.setSize(smallWidth, smallHeight);
    },
    render(scene, camera) {
      const saved = [], glowPass = [];
      renderer.setRenderTarget(base); renderer.clear(); renderer.render(scene, camera);
      scene.traverse(object => {
        if (!object.isMesh || !object.material) return;
        if (object.userData.selectiveGlow === 'self') {
          const uniform = object.material.uniforms?.uGlowPass;
          if (uniform) { glowPass.push(uniform); uniform.value = 1; }
          return;
        }
        saved.push([object, object.material]);
        object.material = Array.isArray(object.material) ? object.material.map(glowMaterial) : glowMaterial(object.material);
      });
      try { renderer.setRenderTarget(light); renderer.clear(); renderer.render(scene, camera); }
      finally { for (const [object, material] of saved) object.material = material; glowPass.forEach(uniform => { uniform.value = 0; }); }
      quad.material = blurMaterial; blurMaterial.uniforms.image.value = light.texture;
      blurMaterial.uniforms.direction.value.set(1 / smallWidth, 0);
      renderer.setRenderTarget(ping); renderer.clear(); quad.render(renderer);
      blurMaterial.uniforms.image.value = ping.texture; blurMaterial.uniforms.direction.value.set(0, 1 / smallHeight);
      renderer.setRenderTarget(blur); renderer.clear(); quad.render(renderer);
      renderer.setRenderTarget(null); quad.material = composite; quad.render(renderer);
    },
    dispose() {
      for (const target of [base, light, ping, blur]) target.dispose();
      replacements.forEach(material => material.dispose()); black.dispose();
      blurMaterial.dispose(); composite.dispose(); quad.dispose();
    },
  };
}
