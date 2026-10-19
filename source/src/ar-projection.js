import * as THREE from 'three';

export function createProjectionMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vNormal,vView;varying float vHeight;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-view.xyz);vHeight=position.y;gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float uTime;varying vec3 vNormal,vView;varying float vHeight;
      void main(){float edge=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.0);
        float scan=.82+.18*smoothstep(.1,.85,fract(vHeight*95.0-uTime*.65));
        gl_FragColor=vec4(vec3(.12,.52,.44)*(.7+edge*.65),(.42+edge*.35)*scan);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
