import * as THREE from 'three';

export function createCoffeeEffect({ pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5) } = {}) {
  const group = new THREE.Group();
  const stage = new THREE.Group();
  stage.rotation.x = Math.PI / 2;
  group.add(stage);
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xd8d1b9, roughness: .24, clearcoat: .65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x382116, roughness: .32 });
  const beanMaterial = new THREE.MeshStandardMaterial({ color: 0x533123, roughness: .55 });
  const groove = new THREE.MeshStandardMaterial({ color: 0x21150e, roughness: .7 });
  const add = (geometry, material, parent = stage) => {
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  };
  const saucer = add(new THREE.CylinderGeometry(.37, .34, .025, 64), porcelain);
  saucer.position.y = .025;
  const rim = add(new THREE.TorusGeometry(.327, .013, 12, 80), porcelain);
  rim.rotation.x = Math.PI / 2; rim.position.y = .043;
  const cup = new THREE.Group(); stage.add(cup);
  const profile = [[.12,.05],[.15,.06],[.19,.10],[.219,.30],[.225,.36],[.212,.368],[.200,.35],[.177,.12],[.13,.09]];
  add(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)), 64), porcelain, cup);
  const handle = add(new THREE.TorusGeometry(.11, .027, 16, 40), porcelain, cup);
  handle.position.set(.237, .235, 0); handle.scale.set(.75, 1, 1);
  const coffee = add(new THREE.CircleGeometry(.201, 64), dark, cup);
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = .335;
  const crema = add(new THREE.TorusGeometry(.185, .005, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x95724c, roughness: .58 }), cup);
  crema.rotation.x = -Math.PI / 2; crema.position.y = .336;
  const beanGeometry = new THREE.SphereGeometry(1, 20, 12);
  const beanCount = 14;
  const beanBodies = new THREE.InstancedMesh(beanGeometry, beanMaterial, beanCount);
  const beanSeams = new THREE.InstancedMesh(new THREE.TorusGeometry(.038, .003, 5, 16, Math.PI), groove, beanCount);
  for (const mesh of [beanBodies, beanSeams]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .3, 0), .9);
    stage.add(mesh);
  }
  const bean = new THREE.Object3D(), instanceMatrix = new THREE.Matrix4();
  const bodyLocal = new THREE.Matrix4().makeScale(.032, .023, .052);
  const seamLocal = new THREE.Matrix4().compose(new THREE.Vector3(0, .019, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, .3, .2)), new THREE.Vector3(.5, 1, 1));
  const steamGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(90 * 3);
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const steamMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uPixelRatio: { value: pixelRatio } },
    vertexShader: `uniform float uPixelRatio;varying float fade;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;float scale=length(modelViewMatrix[0].xyz);gl_PointSize=clamp((24.0+position.y*35.0)*uPixelRatio*scale/max(-p.z,1.0),2.0,32.0);fade=(1.0-smoothstep(.4,.94,position.y))*.085;}`,
    fragmentShader: `varying float fade;void main(){float d=length(gl_PointCoord-.5)*2.0;float a=exp(-d*d*5.0)*fade;gl_FragColor=vec4(.88,.88,.84,a);}`,
  });
  const steam = new THREE.Points(steamGeometry, steamMaterial); steam.frustumCulled = false; stage.add(steam);
  let time = 0, reveal = 0, reaction = 3;
  function update(delta) {
    time += delta; reveal = Math.min(1, reveal + delta * 1.2); reaction += delta;
    const ease = reveal * reveal * (3 - 2 * reveal);
    const energy = Math.max(0, 1 - reaction / 2);
    stage.scale.setScalar(.02 + ease * .98);
    cup.rotation.y = Math.sin(time * .35) * .3 + energy * Math.sin(reaction * 5) * .4;
    coffee.rotation.z = time * .13 + energy;
    for (let i = 0; i < beanCount; i++) {
      const angle = i * 2.39996 + time * (.19 + i % 3 * .025) + energy * Math.sin(reaction * 3);
      const radius = .43 + (i % 3) * .065 + energy * .1;
      bean.position.set(Math.cos(angle) * radius, .13 + i % 4 * .095 + Math.sin(time + i) * .035, Math.sin(angle) * radius);
      bean.rotation.set(time * .2 + i, angle, i * .7);
      bean.updateMatrix();
      beanBodies.setMatrixAt(i, instanceMatrix.multiplyMatrices(bean.matrix, bodyLocal));
      beanSeams.setMatrixAt(i, instanceMatrix.multiplyMatrices(bean.matrix, seamLocal));
    }
    beanBodies.instanceMatrix.needsUpdate = beanSeams.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 90; i++) {
      const age = (i / 90 + time * (.09 + i % 3 * .015)) % 1;
      positions[i * 3] = Math.sin(age * 5 + i * 1.7) * (.025 + age * .1);
      positions[i * 3 + 1] = .35 + age * .62;
      positions[i * 3 + 2] = Math.cos(age * 4 + i * .8) * (.025 + age * .08);
    }
    steamGeometry.attributes.position.needsUpdate = true;
  }
  update(0);
  return {
    group, update,
    found() { reveal = 0; },
    react() { reaction = 0; },
    dispose() {
      const geometries = new Set(), materials = new Set();
      group.traverse(object => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material);
      });
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); group.removeFromParent();
    },
  };
}
