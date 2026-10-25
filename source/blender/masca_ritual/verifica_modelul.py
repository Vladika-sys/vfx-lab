import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root / 'masca_ritual.blend'))
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
shell, jaw, liner, pivot = [bpy.data.objects[name] for name in ('MaskShell', 'Jaw', 'MouthLiner', 'JawPivot')]
assert jaw.parent == pivot
assert len(shell.data.polygons) > 1000 and len(jaw.data.polygons) > 1000
assert len([image for image in bpy.data.images if image.packed_file]) == 3
for obj in (shell, jaw, liner):
    assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
tree = BVHTree.FromPolygons([shell.matrix_world @ vertex.co for vertex in shell.data.vertices], [list(poly.vertices) for poly in shell.data.polygons])
for x in (-.0323, .0323):
    hit = tree.ray_cast(Vector((x, -.25, .026)), Vector((0, 1, 0)), .5)[0]
    assert hit is None, 'Deschiderea ochiului este blocata.'
def bounds():
    objects = (shell, jaw, liner)
    points = [obj.matrix_world @ Vector(p) for obj in objects for p in obj.bound_box]
    return [max(p[i] for p in points) - min(p[i] for p in points) for i in range(3)]
size = bounds()
assert .15 < size[0] < .20 and .22 < size[2] < .28
bpy.context.scene.frame_set(25); bpy.context.view_layer.update()
assert abs(pivot.rotation_euler.x - math.radians(16)) < 1e-5
data = (root / 'masca_ritual.glb').read_bytes()
assert data[:4] == b'glTF' and len(data) == struct.unpack_from('<I', data, 8)[0]
gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
assert all('bufferView' in image and 'uri' not in image for image in gltf['images'])
assert len(gltf['materials']) == 6
assert any(material.get('name') == 'EmberFissures' and material['emissiveFactor'][0] > 0 for material in gltf['materials'])
assert any(node.get('name') == 'MouthLiner' for node in gltf['nodes'])
assert all(not node.get('name', '').startswith(('Camera', 'Key', 'Fill', 'Rim')) for node in gltf['nodes'])
report = {'passed': True, 'neutral_bounds_blender_meters': size, 'embedded_images': len(gltf['images']),
    'materials': len(gltf['materials']), 'glb_bytes': len(data), 'eye_openings': 'clear', 'jaw_max_degrees': 16,
    'note': 'Potrivirea dinamica a barbiei este verificata separat prin testele JavaScript pe GLB.'}
(root / 'verificare.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print('VALIDATION_PASS ' + json.dumps(report), flush=True)
