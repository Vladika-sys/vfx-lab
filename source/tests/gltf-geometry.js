import * as THREE from 'three';

export function gltfGeometry(bytes) {
  const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const binary = bytes.subarray(20 + length + 8);
  function accessor(index) {
    const item = data.accessors[index], view = data.bufferViews[item.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[item.type];
    const types = { 5126: [Float32Array, 4, 'getFloat32'], 5125: [Uint32Array, 4, 'getUint32'], 5123: [Uint16Array, 2, 'getUint16'], 5121: [Uint8Array, 1, 'getUint8'] };
    const [Type, size, method] = types[item.componentType], result = new Type(item.count * width);
    const source = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const offset = (view.byteOffset || 0) + (item.byteOffset || 0), stride = view.byteStride || width * size;
    for (let i = 0; i < item.count; i++) for (let j = 0; j < width; j++) result[i * width + j] = source[method](offset + i * stride + j * size, true);
    return new THREE.BufferAttribute(result, width);
  }
  const nodes = data.nodes.map(node => {
    const group = new THREE.Group(); group.name = node.name || '';
    if (node.translation) group.position.fromArray(node.translation);
    if (node.rotation) group.quaternion.fromArray(node.rotation);
    if (node.scale) group.scale.fromArray(node.scale);
    if (node.mesh !== undefined) for (const primitive of data.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', accessor(primitive.attributes.POSITION));
      if (primitive.indices !== undefined) geometry.setIndex(accessor(primitive.indices));
      const info = data.materials[primitive.material];
      const material = new THREE.MeshStandardMaterial({ side: info.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
      material.name = info.name;
      group.add(new THREE.Mesh(geometry, material));
    }
    return group;
  });
  data.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group(); data.scenes[data.scene || 0].nodes.forEach(i => scene.add(nodes[i]));
  scene.updateMatrixWorld(true);
  return scene;
}
