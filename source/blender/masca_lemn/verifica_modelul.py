import bpy
import bmesh
import json
import math
import struct
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root / 'masca_lemn.blend'))
scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()

def bounds(objects):
    points = [obj.matrix_world @ Vector(point) for obj in objects if obj.type == 'MESH' for point in obj.bound_box]
    minimum = [min(p[i] for p in points) for i in range(3)]
    maximum = [max(p[i] for p in points) for i in range(3)]
    return {'min': minimum, 'max': maximum, 'size': [b - a for a, b in zip(minimum, maximum)]}

shell = bpy.data.objects['MaskShell']
jaw = bpy.data.objects['Jaw']
pivot = bpy.data.objects['JawPivot']
assert jaw.parent == pivot
assert bpy.data.objects['JawInlays'].parent == pivot
model = [bpy.data.objects[name] for name in ('MaskShell', 'Jaw', 'BronzeInlays', 'JawInlays')]
neutral_bounds = bounds(model)
assert .13 < neutral_bounds['size'][0] < .18
assert .15 < neutral_bounds['size'][2] < .21
assert all(math.isfinite(co) for obj in model for vertex in obj.data.vertices for co in vertex.co)
assert len([image for image in bpy.data.images if image.packed_file]) >= 3

tree = BVHTree.FromPolygons([shell.matrix_world @ vertex.co for vertex in shell.data.vertices],
                          [list(face.vertices) for face in shell.data.polygons])
for x in (-.032, .032):
    point, _, _, _ = tree.ray_cast(Vector((x, -.25, .0262)), Vector((0, 1, 0)), .5)
    assert point is None, 'Deschiderea ochiului este blocata.'

def center(obj):
    return sum((obj.matrix_world @ vertex.co for vertex in obj.data.vertices), Vector()) / len(obj.data.vertices)

jaw_closed = center(jaw)
scene.frame_set(25)
bpy.context.view_layer.update()
jaw_open = center(jaw)
assert abs(pivot.rotation_euler.x - math.radians(22)) < .0001
assert jaw_open.z < jaw_closed.z - .002
assert (jaw_open - jaw_closed).length > .005
scene.frame_set(1)

non_manifold = {}
for obj in (shell, jaw):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold[obj.name] = sum(not edge.is_manifold for edge in bm.edges)
    bm.free()

data = (root / 'masca_lemn.glb').read_bytes()
assert data[:4] == b'glTF'
assert struct.unpack_from('<I', data, 4)[0] == 2
assert struct.unpack_from('<I', data, 8)[0] == len(data)
length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + length])
assert all('bufferView' in image and 'uri' not in image for image in gltf['images'])
assert all('uri' not in buffer for buffer in gltf['buffers'])
assert len(gltf['materials']) == 3
assert len(gltf['meshes']) == 4
assert any(animation['name'] == 'JawOpen' for animation in gltf['animations'])
assert all(not node.get('name', '').startswith(('Camera', 'Fundal', 'Lumina', 'Fata canonica')) for node in gltf['nodes'])
blender_report = {'neutral_bounds_meters': neutral_bounds, 'jaw_closed_center': list(jaw_closed),
                  'jaw_open_center': list(jaw_open), 'non_manifold_wood_edges': non_manifold,
                  'embedded_images': len(gltf['images']), 'material_primitives': sum(len(mesh['primitives']) for mesh in gltf['meshes'])}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'masca_lemn.glb'))
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
imported_bounds = bounds(list(bpy.context.scene.objects))
for old, new in zip(neutral_bounds['size'], imported_bounds['size']):
    assert abs(old - new) < .001, 'Exportul a schimbat dimensiunile.'
assert bpy.data.objects.get('JawPivot') is not None
blender_report['imported_glb_bounds_meters'] = imported_bounds
blender_report['passed'] = True
(root / 'verificare.json').write_text(json.dumps(blender_report, indent=2), encoding='utf8')
print('VALIDATION_PASS ' + json.dumps(blender_report), flush=True)
