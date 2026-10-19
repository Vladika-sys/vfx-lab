import * as THREE from 'three';

export function buildPump(parent, position, { steel, iron }) {
  const assembly = new THREE.Group();
  assembly.position.set(...position);
  parent.add(assembly);
  function mesh(geometry, material, at) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...at);
    assembly.add(object);
    return object;
  }
  const box = (size, at, material = steel) => mesh(new THREE.BoxGeometry(...size), material, at);
  const cylinder = (radius, height, at, material = steel) => mesh(new THREE.CylinderGeometry(radius, radius, height, 40), material, at);
  box([1.6, .14, 1.15], [0, .07, 0], iron);
  cylinder(.32, 1.05, [0, .8, 0]).rotation.z = Math.PI / 2;
  for (const x of [-.61, .61]) {
    cylinder(.42, .065, [x, .8, 0]).rotation.z = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      cylinder(.027, .12, [x, .8 + Math.cos(angle) * .35, Math.sin(angle) * .35], iron).rotation.z = Math.PI / 2;
    }
  }
  for (let i = 0; i < 13; i++) {
    mesh(new THREE.TorusGeometry(.325, .012, 8, 60), steel, [-.48 + i * .08, .8, 0]).rotation.y = Math.PI / 2;
  }
  cylinder(.12, .68, [.35, 1.27, 0]);
  mesh(new THREE.TorusGeometry(.21, .12, 20, 32, Math.PI / 2), steel, [.56, 1.6, 0]).rotation.z = Math.PI / 2;
  cylinder(.15, .37, [.73, 1.81, 0]).rotation.z = Math.PI / 2;
  for (const x of [-.4, .4]) box([.16, .25, .58], [x, .24, 0], iron);
  cylinder(.13, .055, [-.22, 1.27, .25], iron).rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(.112, 32), new THREE.MeshStandardMaterial({ color: 0xd3d0b9, roughness: .7 }), [-.22, 1.27, .284]);
  box([.012, .08, .003], [-.22, 1.3, .288], iron).rotation.z = -.5;
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI * .16 - 2.2;
    box([.007, .012, .002], [-.22 + Math.sin(angle) * .091, 1.27 + Math.cos(angle) * .091, .287], iron).rotation.z = -angle;
  }
  return assembly;
}
