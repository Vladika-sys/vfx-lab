import bpy
import bmesh
import json
import math
import os
import struct
import sys
import tempfile
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT = Path(__file__).resolve().parent
(ROOT / 'temporar').mkdir(exist_ok=True)
tempfile.tempdir = str(ROOT / 'temporar')
CM = .01
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'CENTIMETERS'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1100
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 25
scene.view_settings.view_transform = 'AgX'

model = bpy.data.collections.new('Masca — model exportabil')
studio = bpy.data.collections.new('Prezentare — nu se exporta')
reference = bpy.data.collections.new('Referinta faciala')
for collection in (model, studio, reference):
    scene.collection.children.link(collection)

def link_object(obj, collection=model):
    collection.objects.link(obj)
    return obj

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def apply(obj, modifier):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

def fix_normals(obj):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    mesh.to_mesh(obj.data)
    mesh.free()

def object_mesh(name, vertices, faces, collection=model):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    return link_object(bpy.data.objects.new(name, data), collection)

def canonical_point(x, y, depth):
    return (x * CM, -depth * CM, y * CM)

def value_noise(size, gx, gy, rng):
    grid = rng.random((gy + 1, gx + 1)).astype(np.float32)
    xx, yy = np.meshgrid(np.linspace(0, gx, size, endpoint=False), np.linspace(0, gy, size, endpoint=False))
    ix, iy = xx.astype(int), yy.astype(int)
    fx, fy = xx - ix, yy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    return ((grid[iy, ix] * (1 - fx) + grid[iy, ix + 1] * fx) * (1 - fy)
            + (grid[iy + 1, ix] * (1 - fx) + grid[iy + 1, ix + 1] * fx) * fy)

def save_image(name, pixels, filename, non_color=False):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels if pixels.ndim == 3 else pixels[:, :, None]
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(ROOT / 'texturi' / filename)
    image.file_format = 'JPEG' if filename.endswith('.jpg') else 'PNG'
    image.save()
    return image

size = 1024
rng = np.random.default_rng(29)
u, v = np.meshgrid(np.linspace(-1, 1, size), np.linspace(-1, 1, size))
slow = value_noise(size, 5, 11, rng)
fine = value_noise(size, 90, 32, rng)
warp = u + .024 * np.sin(v * 4 + .8 * np.sin(v * 2)) + .01 * np.sin(v * 11 + u * 8)
phase = warp * 135 + slow * 5
growth = .5 + .5 * np.sin(phase)
dark_lines = np.exp(-((np.sin(phase * .5)) / .18) ** 2)
fibers = .5 + .5 * np.sin(warp * 550 + v * 16 + fine * 4)
grain = .56 + .23 * growth + .12 * slow + .035 * fibers - .18 * dark_lines
pores = np.maximum(0, fine - .70) * .17
color = np.stack((.045 + .16 * grain - pores * .3, .016 + .07 * grain - pores * .15,
                  .005 + .025 * grain - pores * .08), axis=2)
color_texture = save_image('Nuc — fibra longitudinala', np.clip(color, 0, 1), 'nuc_culoare.jpg')
roughness = np.clip(.38 + dark_lines * .18 + fine * .12, .34, .72)
rough_texture = save_image('Nuc — rugozitate', roughness[::2, ::2], 'nuc_rugozitate.png', True)
height_map = .03 * growth + .008 * fibers - .025 * dark_lines
dy, dx = np.gradient(height_map)
normal = np.stack((-dx * 5, -dy * 5, np.ones_like(dx)), axis=2)
normal /= np.linalg.norm(normal, axis=2, keepdims=True)
normal_texture = save_image('Nuc — pori si fibra fina', (normal[::2, ::2] + 1) * .5, 'nuc_normale.png', True)

def material(name, color, metallic=0, roughness=.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return mat

wood = material('Nuc ceruit', (.28, .13, .055), roughness=.43)
nodes, links = wood.node_tree.nodes, wood.node_tree.links
principled = nodes.get('Principled BSDF')
for image, socket in ((color_texture, 'Base Color'), (rough_texture, 'Roughness')):
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    links.new(node.outputs['Color'], principled.inputs[socket])
normal_image = nodes.new('ShaderNodeTexImage')
normal_image.image = normal_texture
normal_node = nodes.new('ShaderNodeNormalMap')
normal_node.inputs['Strength'].default_value = .35
links.new(normal_image.outputs['Color'], normal_node.inputs['Color'])
links.new(normal_node.outputs['Normal'], principled.inputs['Normal'])
principled.inputs['Coat Weight'].default_value = .14
principled.inputs['Coat Roughness'].default_value = .3
inner = material('Lemn interior — umbra calda', (.065, .028, .014), roughness=.72)
bronze = material('Bronz periat', (.30, .16, .055), metallic=.82, roughness=.36)

vertices, faces = [], []
with open(ROOT / 'referinte' / 'canonical_face_model.obj', encoding='utf8') as source:
    for line in source:
        fields = line.split()
        if not fields:
            continue
        if fields[0] == 'v':
            vertices.append(tuple(map(float, fields[1:4])))
        elif fields[0] == 'f':
            faces.append(tuple(int(value.split('/')[0]) - 1 for value in fields[1:]))

raw = object_mesh('Fata canonica — reper de potrivire', [canonical_point(*v) for v in vertices], faces, reference)
raw.hide_render = True
raw.hide_set(True)
raw.display_type = 'WIRE'
raw['source'] = 'MediaPipe canonical_face_model.obj — Apache-2.0'

carved = []
for x, y, z in vertices:
    brow = .29 * math.exp(-((abs(x) - 3.0) / 2.0) ** 2 - ((y - 3.7) / .72) ** 2)
    cheek = .14 * math.exp(-((abs(x) - 4.0) / 1.8) ** 2 - ((y + .8) / 1.5) ** 2)
    carved.append(canonical_point(x * 1.025, y * 1.012, z + .30 + brow + cheek))

base = object_mesh('Coaja de lemn', carved, faces)
fix_normals(base)
base.data.materials.append(wood)
base.data.materials.append(inner)
subdivision = base.modifiers.new('Suprafata sculptata', 'SUBSURF')
subdivision.levels = 1
apply(base, subdivision)
solid = base.modifiers.new('Grosime lemn — 2.4 mm', 'SOLIDIFY')
solid.thickness = .0024
solid.offset = -1
solid.use_even_offset = True
solid.material_offset = 1
solid.material_offset_rim = 0
apply(base, solid)

def prism(name, outline, near=-6, far=15):
    n = len(outline)
    verts = [canonical_point(x, y, depth) for depth in (near, far) for x, y in outline]
    polys = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    polys.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    cutter = object_mesh(name, verts, polys)
    fix_normals(cutter)
    return cutter

def cut(obj, cutter, operation='DIFFERENCE'):
    boolean = obj.modifiers.new(cutter.name, 'BOOLEAN')
    boolean.operation = operation
    boolean.solver = 'EXACT'
    boolean.object = cutter
    apply(obj, boolean)
    bpy.data.objects.remove(cutter, do_unlink=True)

for side in (-1, 1):
    outline = []
    angle = side * .07
    for i in range(48):
        t = i / 48 * math.tau
        px, py = 1.64 * math.cos(t), .78 * math.sin(t)
        outline.append((side * 3.20 + px * math.cos(angle) - py * math.sin(angle),
                        2.62 + px * math.sin(angle) + py * math.cos(angle)))
    cut(base, prism('Deschidere ochi', outline))

jaw = base.copy()
jaw.data = base.data.copy()
model.objects.link(jaw)
jaw.name = 'Jaw'
upper_line = [(-10, -3.5), (-6, -3.8), (-4, -3.85), (-2, -3.7), (0, -3.55),
              (2, -3.7), (4, -3.85), (6, -3.8), (10, -3.5)]
cut(base, prism('Separatie deasupra gurii', upper_line + [(10, -14), (-10, -14)]))
jaw_line = [(-10, -3.9), (-6, -4.1), (-4, -4.4), (-2, -4.8), (0, -4.95),
            (2, -4.8), (4, -4.4), (6, -4.1), (10, -3.9)]
cut(jaw, prism('Separatie sub gura', jaw_line + [(10, -14), (-10, -14)]), 'INTERSECT')
base.name = 'MaskShell'

for obj in (base, jaw):
    decimate = obj.modifiers.new('Optimizare pentru telefon', 'DECIMATE')
    decimate.ratio = .74
    apply(obj, decimate)
    bevel = obj.modifiers.new('Muchii rotunjite — 0.35 mm', 'BEVEL')
    bevel.width = .00035
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(38)
    apply(obj, bevel)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    uv = obj.data.uv_layers.new(name='Fibra lemnului')
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x / CM + 8.5) / 17, (co.z / CM + 10) / 19)

def surface_tree(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    positions = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    tree = BVHTree.FromPolygons(positions, [list(face.vertices) for face in mesh.polygons])
    evaluated.to_mesh_clear()
    return tree

upper_tree, jaw_tree = surface_tree(base), surface_tree(jaw)
upper_detail, jaw_detail = [], []

def project(tree, x, y, offset=.00012):
    origin = Vector((x * CM, -.25, y * CM))
    point, normal, _, _ = tree.ray_cast(origin, Vector((0, 1, 0)), .5)
    if point is None:
        return None
    return point + normal * offset

def line_inlay(name, points, tree=upper_tree, bucket=upper_detail, radius=.00035):
    sampled = []
    for start, end in zip(points, points[1:]):
        for t in np.linspace(0, 1, 9, endpoint=False):
            point = project(tree, start[0] * (1 - t) + end[0] * t, start[1] * (1 - t) + end[1] * t)
            if point is not None:
                sampled.append(point)
    last = project(tree, *points[-1])
    if last is not None:
        sampled.append(last)
    if len(sampled) < 2:
        return
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.resolution_u = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(sampled) - 1)
    for item, point in zip(spline.points, sampled):
        item.co = (*point, 1)
    obj = link_object(bpy.data.objects.new(name, curve))
    obj.data.materials.append(bronze)
    activate(obj)
    bpy.ops.object.convert(target='MESH')
    bucket.append(bpy.context.object)

def diamond(name, x, y, width, height, tree=upper_tree, bucket=upper_detail):
    outline = [(x, y + height / 2), (x + width / 2, y), (x, y - height / 2), (x - width / 2, y), (x, y + height / 2)]
    line_inlay(name, outline, tree, bucket, .00030)

diamond('Romb central', 0, 6.4, 1.25, 2.25)
diamond('Romb central interior', 0, 6.4, .55, 1.10)
line_inlay('Axa fruntii', [(0, 8.05), (0, 7.53)])
line_inlay('Axa nasului', [(0, 5.24), (0, 4.4)], radius=.00028)
for side in (-1, 1):
    line_inlay('Creasta sprancenei', [(side * 1.5, 4.05), (side * 3.0, 4.64), (side * 4.65, 4.05)])
    line_inlay('Creasta sprancenei dubla', [(side * 1.65, 4.50), (side * 3.0, 5.10), (side * 4.55, 4.52)], radius=.00025)
    line_inlay('Motiv pometi', [(side * 4.4, .9), (side * 5.25, -.1), (side * 4.72, -1.32), (side * 5.28, -2.30)])
    diamond('Romb obraz', side * 5.5, -2.95, .50, .85)
    for y in (3.8, .6):
        point = project(upper_tree, side * 6.0, y, .00020)
        if point is not None:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.00085, location=point)
            rivet = bpy.context.object
            for collection in list(rivet.users_collection):
                collection.objects.unlink(rivet)
            model.objects.link(rivet)
            rivet.name = 'Nit bronz'
            rivet.scale.y = .45
            rivet.data.materials.append(bronze)
            upper_detail.append(rivet)
diamond('Romb barbie', 0, -7.35, 1.18, 1.55, jaw_tree, jaw_detail)
for side in (-1, 1):
    line_inlay('Contur maxilar', [(side * .95, -8.05), (side * 2.4, -7.52), (side * 3.6, -6.48)], jaw_tree, jaw_detail, .00028)

def join_details(objects, name):
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

upper_metal = join_details(upper_detail, 'BronzeInlays')
jaw_metal = join_details(jaw_detail, 'JawInlays')
root = link_object(bpy.data.objects.new('MaskRoot', None))
root.empty_display_type = 'PLAIN_AXES'
root.empty_display_size = .025
root['canonical_to_meters'] = .01
root['description'] = 'Masca din nuc, insertii de bronz, maxilar articulat'
root['face_reference'] = 'MediaPipe canonical face; +X right, +Y up, +Z forward in GLB'
for obj in (base, upper_metal):
    if obj is not None:
        obj.parent = root

pivot = link_object(bpy.data.objects.new('JawPivot', None))
pivot.parent = root
pivot.location = canonical_point(0, -3.7, 1.2)
pivot.empty_display_type = 'SPHERE'
pivot.empty_display_size = .004
pivot['open_axis'] = 'X'
pivot['open_max_radians'] = math.radians(22)
bpy.context.view_layer.update()
for obj in (jaw, jaw_metal):
    if obj is not None:
        world = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = world
        bpy.context.view_layer.update()

pivot.rotation_mode = 'XYZ'
pivot.rotation_euler.x = 0
pivot.keyframe_insert(data_path='rotation_euler', frame=1)
pivot.rotation_euler.x = math.radians(22)
pivot.keyframe_insert(data_path='rotation_euler', frame=25)
pivot.animation_data.action.name = 'JawOpen'
scene.frame_set(1)

world = bpy.data.worlds.new('Atelier — lumina ambientala')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15, .18, .22, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
scene.world = world

floor_mat = material('Fundal prezentare', (.055, .065, .07), roughness=.88)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.109))
floor = bpy.context.object
floor.name = 'Fundal studio'
for collection in list(floor.users_collection):
    collection.objects.unlink(floor)
studio.objects.link(floor)
floor.data.materials.append(floor_mat)

def area(name, position, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = link_object(bpy.data.objects.new(name, data), studio)
    obj.location = position
    obj.rotation_euler = (Vector((0, -.035, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

area('Lumina principala', (-.24, -.32, .32), 15, .25, (1, .82, .64))
area('Lumina de umplere', (.24, -.22, .04), 5, .24, (.7, .83, 1))
area('Contur', (.15, .15, .23), 20, .18, (1, .86, .66))
camera_data = bpy.data.cameras.new('Camera prezentare')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = .25
camera = link_object(bpy.data.objects.new('Camera prezentare', camera_data), studio)
scene.camera = camera

def camera_pose(position):
    camera.location = position
    camera.rotation_euler = (Vector((0, -.025, -.004)) - camera.location).to_track_quat('-Z', 'Y').to_euler()

camera_pose((.20, -.48, .12))
for screen in bpy.data.screens:
    for space_area in screen.areas:
        if space_area.type == 'VIEW_3D':
            space_area.spaces.active.shading.type = 'MATERIAL'
            space_area.spaces.active.region_3d.view_location = (0, -.025, -.004)
            space_area.spaces.active.region_3d.view_distance = .34
            space_area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()

bpy.ops.object.select_all(action='DESELECT')
for obj in model.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.file.pack_all()
blend_path = ROOT / 'masca_lemn.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
glb_path = ROOT / 'masca_lemn.glb'
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', use_selection=True,
                          export_yup=True, export_animations=True, export_extras=True,
                          export_materials='EXPORT', export_force_sampling=True)

triangles = 0
for obj in model.objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
data = glb_path.read_bytes()
json_length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + json_length].decode('utf8'))
manifest = {
    'blend': blend_path.name, 'glb': glb_path.name, 'glb_bytes': len(data),
    'triangles': triangles, 'mesh_objects': [obj.name for obj in model.objects if obj.type == 'MESH'],
    'gltf_nodes': [node.get('name') for node in gltf.get('nodes', [])],
    'animations': [animation.get('name') for animation in gltf.get('animations', [])],
    'jaw_open_axis': 'Blender X / glTF X', 'jaw_open_max_radians': math.radians(22),
    'units': 'meters', 'canonical_to_meters': .01,
    'reference_sha256': '8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618',
}
(ROOT / 'model.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf8')
print('MODEL_READY ' + json.dumps(manifest), flush=True)

for name, position, frame in (
    ('masca_lemn_perspectiva.png', (.20, -.48, .12), 1),
    ('masca_lemn_fata.png', (0, -.50, .005), 1),
    ('masca_lemn_maxilar.png', (.20, -.48, .12), 25),
):
    scene.frame_set(frame)
    camera_pose(position)
    scene.render.filepath = str(ROOT / 'randari' / name)
    bpy.ops.render.render(write_still=True)
scene.frame_set(1)
camera_pose((.20, -.48, .12))
print('RENDERS_READY', flush=True)
