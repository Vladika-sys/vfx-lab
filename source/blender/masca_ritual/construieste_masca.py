import bpy
import bmesh
import math
import json
import struct
import tempfile
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT = Path(__file__).resolve().parent
for folder in ('texturi', 'randari', 'temporar'):
    (ROOT / folder).mkdir(exist_ok=True)
tempfile.tempdir = str(ROOT / 'temporar')
CM = .01
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 25
scene.view_settings.view_transform = 'AgX'
model = bpy.data.collections.new('Ritual — model exportabil')
studio = bpy.data.collections.new('Atelier — doar prezentare')
scene.collection.children.link(model)
scene.collection.children.link(studio)

def point(x, y, z):
    return Vector((x * CM, -z * CM, y * CM))

def link(obj, collection=model):
    collection.objects.link(obj)
    return obj

def mesh(name, vertices, faces, mat=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = link(bpy.data.objects.new(name, data))
    if mat:
        data.materials.append(mat)
    return obj

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def apply(obj, mod):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True

def material(name, color, roughness=.6, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat

bone = material('Os ars — suprafata sculptata', (.42, .34, .23))
inner = material('Interior carbonizat', (.012, .008, .007), .91)
iron = material('Fier oxidat — capse si nervuri', (.065, .045, .032), .52, .72)
blood = material('Sange coagulat — margini umede', (.12, .004, .006), .22)
ember = material('EmberFissures', (1, .025, .003), .5, emission=3.2)
tooth = material('Fildes patat', (.53, .41, .26), .42)

cracks = [
    [(-.8, 8.4), (-1.3, 7.5), (-.9, 6.8), (-1.9, 5.9), (-1.6, 5.1), (-2.4, 4.4)],
    [(-1, 6.8), (.1, 6.3), (.7, 5.5), (.35, 4.7), (.8, 3.8)],
    [(-1.9, 5.9), (-3.0, 6.2), (-3.8, 5.5)],
    [(3.8, 7.1), (3.1, 6.2), (3.6, 5.6), (3, 4.6), (3.8, 3.7)],
    [(5.7, 2), (5, 1.3), (5.3, .4), (4.6, -.5), (4.9, -1.4), (4.1, -2.5), (4.4, -3.7)],
    [(4.6, -.5), (3.7, -.8), (3.3, -1.5)],
    [(-5.4, 1.0), (-4.8, .2), (-5.1, -.8), (-4.3, -1.7), (-4.6, -2.8), (-3.8, -3.8)],
    [(1.0, -5.3), (.5, -6.2), (1.2, -7.0), (.75, -8.1), (1.35, -9.4)],
    [(.5, -6.2), (-.6, -6.7), (-1.2, -7.8)],
    [(4.0, -5.1), (3.4, -6), (3.7, -6.8), (2.8, -7.4)],
]
streaks = [
    [(-2.9, 1.9), (-2.95, .8), (-3.2, .0), (-3.1, -1.1), (-3.45, -2.4), (-3.25, -3.1)],
    [(-3.65, 1.65), (-3.8, .8), (-3.7, -.2), (-3.95, -1.7)],
    [(2.3, 2.0), (2.5, 1.3), (2.4, .6), (2.65, -.6)],
    [(4.9, -1.8), (5.1, -2.7), (4.85, -3.7)],
    [(-.4, -5), (-.7, -6.3), (-.45, -7.3)],
]

size = 2048
rng = np.random.default_rng(2510)
u, v = np.meshgrid(np.linspace(-10, 10, size), np.linspace(-11, 15, size))
def noise(gx, gy):
    grid = rng.random((gy + 1, gx + 1))
    xx, yy = (u + 10) / 20 * gx, (v + 11) / 26 * gy
    xx, yy = np.minimum(xx, gx - .00001), np.minimum(yy, gy - .00001)
    ix, iy = xx.astype(int), yy.astype(int)
    fx, fy = xx - ix, yy - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    return (grid[iy, ix] * (1 - fx) + grid[iy, ix + 1] * fx) * (1 - fy) + (grid[iy + 1, ix] * (1 - fx) + grid[iy + 1, ix + 1] * fx) * fy

large, medium, fine = noise(10, 15), noise(85, 110), noise(390, 410)
def distance(paths):
    result = np.full_like(u, 100)
    for path in paths:
        for a, b in zip(path, path[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = np.clip(((u - a[0]) * dx + (v - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
            result = np.minimum(result, np.hypot(u - a[0] - t * dx, v - a[1] - t * dy))
    return result

crack_distance, blood_distance = distance(cracks), distance(streaks)
burn = np.clip((abs(u) - 4.2) / 3.6, 0, .82) + .3 * (1 - large) + .65 * np.clip((v - 9.5) / 4.5, 0, 1)
burn = np.clip(burn, 0, .96)
patina = .68 + .25 * large + .12 * medium
color = np.stack([patina * .22, patina * .175, patina * .115], axis=-1) * (1 - burn[:, :, None])
pores = np.clip((.29 - fine) * 2, 0, .48)
color *= 1 - pores[:, :, None]
soot = np.exp(-crack_distance ** 2 / .12 ** 2) * .85
color *= 1 - soot[:, :, None]
stain = np.exp(-(blood_distance / (.16 + .12 * medium)) ** 2)
for i in range(42):
    x, y = rng.normal(-3.3, .65), rng.uniform(-3.3, 1.7)
    radius = rng.uniform(.025, .11)
    stain = np.maximum(stain, np.exp(-((u - x) / radius) ** 2 - ((v - y) / (radius * 1.7)) ** 2) * .8)
stain = np.clip(stain * (1.2 + .35 * fine), 0, 1)
color = color * (1 - stain[:, :, None]) + np.array([.115, .004, .008]) * stain[:, :, None]
roughness = np.clip(.63 + .22 * fine - .4 * stain, .2, .91)
height = .06 * medium + .012 * fine - .18 * soot + .055 * stain
dy, dx = np.gradient(height)
norm = np.stack([-dx * 25, -dy * 25, np.ones_like(dx)], axis=-1)
norm /= np.linalg.norm(norm, axis=-1, keepdims=True)
def image(name, array, filename, data=False):
    h, w = array.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = array if array.ndim == 3 else array[:, :, None]
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(ROOT / 'texturi' / filename)
    img.file_format = 'JPEG' if filename.endswith('.jpg') else 'PNG'
    img.save()
    return img

images = [image('Os — arsuri, pori si sange', np.clip(color, 0, 1), 'os_culoare.jpg'),
          image('Os — rugozitate si pete umede', roughness[::2, ::2], 'os_rugozitate.png', True),
          image('Os — microrelief si fisuri', ((norm + 1) / 2)[::2, ::2], 'os_normale.png', True)]
bsdf = bone.node_tree.nodes.get('Principled BSDF')
for img, socket in zip(images[:2], ('Base Color', 'Roughness')):
    node = bone.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    bone.node_tree.links.new(node.outputs['Color'], bsdf.inputs[socket])
node = bone.node_tree.nodes.new('ShaderNodeTexImage'); node.image = images[2]
normal = bone.node_tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .65
bone.node_tree.links.new(node.outputs['Color'], normal.inputs['Color'])
bone.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])

vertices, faces = [], []
for line in (ROOT / 'referinte' / 'canonical_face_model.obj').read_text().splitlines():
    words = line.split()
    if words and words[0] == 'v': vertices.append(tuple(map(float, words[1:4])))
    elif words and words[0] == 'f': faces.append(tuple(int(x.split('/')[0]) - 1 for x in words[1:]))

def sculpt(x, y, z):
    brow = .8 * math.exp(-((abs(x) - 3) / 2.3) ** 2 - ((y - 3.9) / .8) ** 2)
    cheek = .9 * math.exp(-((abs(x) - 4.3) / 1.3) ** 2 - ((y + .6) / 1.3) ** 2)
    hollow = .38 * math.exp(-((abs(x) - 3.8) / 1.5) ** 2 - ((y + 2.5) / 1.1) ** 2)
    chin = max(0, min(1, (-y - 5) / 4))
    return point(x * (1.055 + .055 * chin), y - .95 * chin, z + .75 + brow + cheek - hollow)

shell = mesh('MaskShell', [sculpt(*p) for p in vertices], faces, bone)
normals(shell)
sub = shell.modifiers.new('Relief continuu', 'SUBSURF'); sub.levels = 2; apply(shell, sub)
for vertex in shell.data.vertices:
    x, y = vertex.co.x / CM, vertex.co.z / CM
    nearest = 100
    for path in cracks:
        for a, b in zip(path, path[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
            nearest = min(nearest, math.hypot(x - a[0] - t * dx, y - a[1] - t * dy))
    vertex.co.y += .0013 * math.exp(-(nearest / .12) ** 2)
solid = shell.modifiers.new('Grosime — 3 mm', 'SOLIDIFY'); solid.thickness = .003; solid.offset = -1; apply(shell, solid)

def prism(name, outline):
    n = len(outline)
    coords = [point(x, y, z) for z in (-8, 18) for x, y in outline]
    polys = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    polys += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    cutter = mesh(name, coords, polys); normals(cutter)
    return cutter

def cut(obj, outline, operation='DIFFERENCE'):
    cutter = prism('Volum de decupare', outline)
    mod = obj.modifiers.new('Decupaj', 'BOOLEAN'); mod.solver = 'EXACT'; mod.operation = operation; mod.object = cutter
    apply(obj, mod); bpy.data.objects.remove(cutter, do_unlink=True)

for side in (-1, 1):
    outline = []
    for a in np.linspace(0, math.tau, 48, endpoint=False):
        x = 1.78 * math.cos(a)
        outline.append((side * 3.23 + x, 2.6 + .67 * math.sin(a) + side * x * .11))
    cut(shell, outline)
cut(shell, [(0, .8), (-.72, -1.3), (0, -2.2), (.72, -1.3)])
jaw = shell.copy(); jaw.data = shell.data.copy(); model.objects.link(jaw); jaw.name = 'Jaw'
def split(obj, y, upper):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(0, 0, y * CM), plane_no=(0, 0, 1), dist=.000001,
        clear_inner=upper, clear_outer=not upper)
    edges = [e for e in result['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
    if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data); bm.free()
    assert len(obj.data.polygons) > 50, 'Separarea maxilarului a eliminat geometria.'
split(shell, -4.05, True)
split(jaw, -3.85, False)
for obj in (shell, jaw):
    dec = obj.modifiers.new('Geometrie pentru camera live', 'DECIMATE'); dec.ratio = .68; apply(obj, dec)
    bevel = obj.modifiers.new('Muchii ciobite', 'BEVEL'); bevel.width = .00045; bevel.segments = 2; bevel.limit_method = 'ANGLE'; bevel.angle_limit = .7; apply(obj, bevel)
    normals(obj)
    uv = obj.data.uv_layers.new(name='Suprafata sculptata')
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x / CM + 10) / 20, (co.z / CM + 11) / 26)

def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ p.co for p in obj.data.vertices], [list(f.vertices) for f in obj.data.polygons])
upper_tree, jaw_tree = tree(shell), tree(jaw)
def project(x, y, offset=.0004):
    chosen = jaw_tree if y < -4.05 else upper_tree
    p, n, _, _ = chosen.ray_cast(Vector((x * CM, -.25, y * CM)), Vector((0, 1, 0)), .6)
    return p + n * offset if p is not None else None

upper, lower = [shell], [jaw]
def curve(name, coords, radius, mat, bucket=upper):
    if len(coords) < 2: return None
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'; data.resolution_u = 2; data.bevel_depth = radius; data.bevel_resolution = 2
    spline = data.splines.new('POLY'); spline.points.add(len(coords) - 1)
    for p, co in zip(spline.points, coords): p.co = (*co, 1)
    obj = link(bpy.data.objects.new(name, data)); obj.data.materials.append(mat)
    activate(obj); bpy.ops.object.convert(target='MESH'); obj = bpy.context.object; bucket.append(obj)
    return obj

def surface_line(name, path, radius, mat, bucket=upper, offset=.0004):
    coords = []
    for a, b in zip(path, path[1:]):
        for t in np.linspace(0, 1, 10, endpoint=False):
            p = project(a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, offset)
            if p is not None: coords.append(p)
    end = project(*path[-1], offset)
    if end is not None: coords.append(end)
    return curve(name, coords, radius, mat, bucket)

for i, path in enumerate(cracks):
    bucket = lower if path[0][1] < -4.05 else upper
    surface_line('Fisura incandescenta', path, .00012 if i % 3 else .00017, ember, bucket, .0003)

for side in (-1, 1):
    surface_line('Nervura maxilarului', [(side * 5.0, -5.1), (side * 3.9, -7), (side * 1.7, -8.9)], .00045, iron, lower)

for path in streaks:
    bucket = lower if path[0][1] < -4.05 else upper
    surface_line('Sange — filament umed', path, .00035, blood, bucket, .0007)

def tube(name, points, radii, mat, bucket=upper, rings=24):
    pts = [Vector(p) for p in points]; verts, polys = [], []
    for i, (p, radius) in enumerate(zip(pts, radii)):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        axis = tangent.cross(Vector((0, 1, 0))).normalized()
        cross = tangent.cross(axis).normalized()
        for j in range(rings):
            a = j * math.tau / rings
            verts.append(p + (axis * math.cos(a) + cross * math.sin(a)) * radius)
    for i in range(len(pts) - 1):
        for j in range(rings): polys.append((i * rings + j, i * rings + (j + 1) % rings, (i + 1) * rings + (j + 1) % rings, (i + 1) * rings + j))
    polys += [tuple(reversed(range(rings))), tuple((len(pts) - 1) * rings + j for j in range(rings))]
    obj = mesh(name, verts, polys, mat); normals(obj); bucket.append(obj)
    return obj

for side in (-1, 1):
    origin = project(side * 4.35, 6.25)
    if origin is None: origin = point(side * 4.35, 6.25, 2)
    controls = [origin, point(side * 5.5, 8.5, 2), point(side * 6.3, 11.0, 1.0),
                point(side * 6.0, 13.1 if side > 0 else 12.2, 2.1), point(side * 4.9, 14.1 if side > 0 else 12.8, 3.0)]
    dense, radii = [], []
    for i in range(72):
        t = i / 71; a = min(3, int(t * 4)); f = t * 4 - a
        p0, p1, p2, p3 = controls[max(0, a - 1)], controls[a], controls[a + 1], controls[min(4, a + 2)]
        dense.append((p1 * 2 + (-p0 + p2) * f + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * f * f + (-p0 + p1 * 3 - p2 * 3 + p3) * f ** 3) * .5)
        radii.append((.012 * (1 - t) ** .85 + .00010) * (1 + .05 * math.sin(t * 95)))
    horn = tube('Corn de os — varf asimetric', dense, radii, bone, rings=20)

for x, y in [(-1.1, 7.45), (-1.25, 7.0), (4.95, .65), (4.85, .2), (-4.8, -1.0)]:
    p, q = project(x - .22, y), project(x + .22, y + .13)
    if p is not None and q is not None:
        curve('Capsa de reparatie', [p, p + Vector((0, -.0015, .0007)), q + Vector((0, -.0015, .0007)), q], .00065, iron)

for side in (-1, 1):
    for i in range(4):
        x = side * (.48 + i * .69)
        top = project(x, -3.55)
        if top is not None:
            length = .65 if i != 2 else 1.0
            tube('Colt superior', [top, top + point(0, -.3, .18), top + point(side * .08, -length, .22)], [.0034, .0027, .00025], tooth, rings=12)
        bottom = project(x, -4.7)
        if bottom is not None:
            tube('Colt inferior', [bottom, bottom + point(0, .3, .22), bottom + point(side * .05, .62, .28)], [.003, .002, .0002], tooth, lower, rings=12)


liner_vertices = [point(x * 1.045, y - max(0, -y - 4) * .15, z + .4) for x, y, z in vertices]
liner_faces = [f for f in faces if max(vertices[i][1] for i in f) < 1.3]
mouth_ring = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
mouth_center = sum((liner_vertices[i] for i in mouth_ring), Vector()) / len(mouth_ring)
center_index = len(liner_vertices); liner_vertices.append(mouth_center)
liner_faces += [(center_index, mouth_ring[i], mouth_ring[(i + 1) % len(mouth_ring)]) for i in range(len(mouth_ring))]
liner = mesh('MouthLiner', liner_vertices, liner_faces, inner)
normals(liner)
liner['deform_lower_face'] = True
for obj in list(model.objects):
    if obj.type != 'MESH' or obj.data.uv_layers: continue
    uv = obj.data.uv_layers.new(name='Patina de os')
    for loop in obj.data.loops:
        co = obj.matrix_world @ obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x / CM + 10) / 20, (co.z / CM + 11) / 26)
root = link(bpy.data.objects.new('MaskRoot', None))
root['canonical_to_meters'] = .01
root['description'] = 'Ritual — os ars, coarne, sange, fisuri incandescente'
root['jaw_max_radians'] = math.radians(16)
root['chin_reference'] = list(vertices[152])
root['coverage_overlap_cm'] = .2
root['face_reference'] = 'MediaPipe canonical face — modified, Apache-2.0'
pivot = link(bpy.data.objects.new('JawPivot', None)); pivot.parent = root; pivot.location = point(0, -3.0, -.7)
pivot['open_max_radians'] = math.radians(16)
def join(objects, name):
    activate(objects[0])
    for obj in objects: obj.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.object; obj.name = name
    return obj

upper_object = join(upper, 'MaskShell')
lower_object = join(lower, 'Jaw')
for obj in (upper_object, liner): obj.parent = root
bpy.context.view_layer.update()
world = lower_object.matrix_world.copy(); lower_object.parent = pivot; lower_object.matrix_world = world
pivot.rotation_mode = 'XYZ'
pivot.rotation_euler.x = 0; pivot.keyframe_insert(data_path='rotation_euler', frame=1)
pivot.rotation_euler.x = math.radians(16); pivot.keyframe_insert(data_path='rotation_euler', frame=25)
pivot.animation_data.action.name = 'JawOpen'; scene.frame_set(1)

world = bpy.data.worlds.new('Atelier sombre'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.025, .033, .045, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .3; scene.world = world
def area(name, position, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
    obj = link(bpy.data.objects.new(name, data), studio); obj.location = position
    obj.rotation_euler = (Vector((0, -.035, .025)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
area('Key — relief', (-.25, -.36, .35), 12, .22, (1, .78, .62))
area('Fill — rece', (.24, -.16, .08), 4, .18, (.42, .62, 1))
area('Rim — rosu', (.18, .08, .19), 16, .15, (1, .12, .06))
camera_data = bpy.data.cameras.new('Camera atelier'); camera_data.type = 'ORTHO'; camera_data.ortho_scale = .31
camera = link(bpy.data.objects.new('Camera atelier', camera_data), studio); scene.camera = camera
def view(position):
    camera.location = position
    camera.rotation_euler = (Vector((0, -.025, .02)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
view((.17, -.5, .095))
compositor = bpy.data.node_groups.new('Ritual — halou fin', 'CompositorNodeTree')
compositor.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
scene.compositing_node_group = compositor
render = compositor.nodes.new('CompositorNodeRLayers')
glare = compositor.nodes.new('CompositorNodeGlare')
glare.inputs['Type'].default_value = 'Fog Glow'
glare.inputs['Threshold'].default_value = 1.5
glare.inputs['Strength'].default_value = .35
output = compositor.nodes.new('NodeGroupOutput')
compositor.links.new(render.outputs['Image'], glare.inputs['Image'])
compositor.links.new(glare.outputs['Image'], output.inputs['Image'])
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces.active.shading.type = 'MATERIAL'; a.spaces.active.region_3d.view_distance = .43
            a.spaces.active.region_3d.view_location = (0, -.025, .02)
            a.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
bpy.ops.object.select_all(action='DESELECT')
for obj in model.objects: obj.select_set(True)
bpy.context.view_layer.objects.active = upper_object
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'masca_ritual.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'masca_ritual.glb'), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=True, export_extras=True, export_materials='EXPORT', export_force_sampling=True)
data = (ROOT / 'masca_ritual.glb').read_bytes()
gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
triangles = 0
for obj in model.objects:
    if obj.type == 'MESH': obj.data.calc_loop_triangles(); triangles += len(obj.data.loop_triangles)
manifest = {'blend': 'masca_ritual.blend', 'glb': 'masca_ritual.glb', 'glb_bytes': len(data), 'triangles': triangles,
    'nodes': [n.get('name') for n in gltf['nodes']], 'materials': [m.get('name') for m in gltf['materials']],
    'jaw_max_radians': math.radians(16), 'units': 'meters', 'coverage_overlap_cm': .2}
(ROOT / 'model.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
print('MODEL_READY ' + json.dumps(manifest), flush=True)
for name, position, frame in [('ritual_perspectiva.png', (.17, -.5, .095), 1), ('ritual_fata.png', (0, -.5, .02), 1), ('ritual_maxilar.png', (.17, -.5, .095), 25)]:
    scene.frame_set(frame); view(position)
    scene.render.filepath = str(ROOT / 'randari' / name); bpy.ops.render.render(write_still=True)
print('RENDERS_READY', flush=True)
