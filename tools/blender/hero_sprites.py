"""Procedural sprite generator for the four elemental heroes (fire, earth, water, wind).

Run headless:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup \
      --python tools/blender/hero_sprites.py -- --element all

Options (after the "--"):
  --element fire|earth|water|wind|all   which hero(s) to render (default: all)
  --anims idle,walk,...                 only render these animations (default: all + skill)
  --out <dir>                           output root (default: <project>/assets/game/heroes)
  --ss <n>                              supersampling factor (default 4)

Each character is a 2D "cut-out puppet" built from flat prisms, tubes and flattened
ellipsoids in the XZ plane, seen by an orthographic camera looking down +Y (1 Blender
unit == 1 output pixel, z = 0 is the ground line). Depth (Y) is only used for layer
order. Outlines come from inverted-hull Solidify modifiers + backface culling, rendered
with Workbench flat lighting at SS x resolution. paint() then re-shades every flat colour
shape with soft light from the upper front, a brush texture, heavier lines on the shadow
side and rough edges; glowing accents get a small bloom after the box-downsample.
"""

import argparse
import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np

PROJECT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DEFAULT_OUT = os.path.join(PROJECT, "assets", "game", "heroes")
ORIGINAL_HERO = os.path.join(PROJECT, "assets", "game", "hero")

OUTLINE = 1.6  # outline thickness in output pixels

# name, frame count, canvas (w, h) -- mirrors PLAYER_CONF and the original frame sizes
ANIMS = [
    ("idle", 5, (125, 150)),
    ("walk", 8, (125, 150)),
    ("jump", 11, (125, 150)),
    ("attack", 2, (125, 150)),
    ("attack2", 2, (125, 150)),
    ("dash", 2, (187, 150)),
    ("dead", 4, (125, 150)),
    ("blast", 2, (125, 150)),
]

SKILLS = {
    "fire": dict(size=(200, 80), frames=8, loop=True),
    "earth": dict(size=(250, 200), frames=8, loop=False),
    "water": dict(size=(250, 150), frames=8, loop=False),
    "wind": dict(size=(200, 200), frames=8, loop=True),
}

# Layer depths (smaller = closer to camera)
L_FX_BACK = 26
L_WPN_BACK = 18
L_LEG_BACK = 14
L_LEG_FRONT = 11
L_TAIL = 8.5
L_TRIM = 7
L_CLOAK = 4
L_SHELL = 1
L_PAULDRON = -2
L_HORN = -3
L_COLLAR = -4.5
L_HEAD = -9
L_EYES = -14
L_EYES2 = -16
L_ARM_FRONT = -19
L_WPN_FRONT = -21
L_FX_FRONT = -25


# --------------------------------------------------------------------------------------
# 2D affine helpers (x right, z up), angles in degrees, positive = counter-clockwise
# --------------------------------------------------------------------------------------
def T(x, z):
    return np.array([[1.0, 0, x], [0, 1.0, z], [0, 0, 1.0]])


def R(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def S(sx, sz=None):
    return np.array([[sx, 0, 0], [0, sz if sz is not None else sx, 0], [0, 0, 1.0]])


def ap(M, pts):
    return [(M[0, 0] * x + M[0, 1] * z + M[0, 2], M[1, 0] * x + M[1, 1] * z + M[1, 2]) for x, z in pts]


def ap1(M, p):
    return ap(M, [p])[0]


def dirv(deg, length=1.0):
    return (math.cos(math.radians(deg)) * length, math.sin(math.radians(deg)) * length)


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------------------
# Scene + drawing primitives
# --------------------------------------------------------------------------------------
_MATS = {}


def hex_lin(h):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def material(hexcol):
    m = _MATS.get(hexcol)
    if m is None:
        m = bpy.data.materials.new("c" + hexcol.lstrip("#"))
        m.diffuse_color = (*hex_lin(hexcol), 1.0)
        _MATS[hexcol] = m
    return m


class Canvas:
    """Draws flat shapes into the scene. All geometry is generated in world space."""

    def __init__(self, outline_hex, outline=OUTLINE):
        self.ol_mat = material(outline_hex)
        self.ol = outline

    def _finish(self, bm, col, outline):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("o", me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material(col))
        me.materials.append(self.ol_mat)
        th = self.ol if outline is True else (outline or 0)
        if th > 0:
            m = ob.modifiers.new("ol", "SOLIDIFY")
            m.thickness = th
            m.offset = 1.0
            m.use_flip_normals = True
            m.material_offset = 1
            m.use_rim = False
        return ob

    def poly(self, pts, layer, col, depth=1.5, outline=True):
        clean = []
        for p in pts:
            if not clean or abs(p[0] - clean[-1][0]) + abs(p[1] - clean[-1][1]) > 1e-3:
                clean.append(p)
        if len(clean) > 2 and abs(clean[0][0] - clean[-1][0]) + abs(clean[0][1] - clean[-1][1]) < 1e-3:
            clean.pop()
        if len(clean) < 3:
            return
        bm = bmesh.new()
        y0, y1 = layer - depth / 2, layer + depth / 2
        f = [bm.verts.new((x, y0, z)) for x, z in clean]
        b = [bm.verts.new((x, y1, z)) for x, z in clean]
        n = len(clean)
        try:
            bm.faces.new(f)
            bm.faces.new(list(reversed(b)))
        except ValueError:
            pass
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((f[i], f[j], b[j], b[i]))
            except ValueError:
                pass
        self._finish(bm, col, outline)

    def ell(self, M, rx, rz, layer, col, ry=1.2, outline=True, seg=24):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0)
        for v in bm.verts:
            x, y, z = v.co
            wx, wz = ap1(M, (x * rx, z * rz))
            v.co = (wx, layer + y * ry, wz)
        self._finish(bm, col, outline)

    def circ(self, c, r, layer, col, outline=True, rz=None):
        self.ell(T(*c), r, rz if rz else r, layer, col, outline=outline)

    def tube(self, pts, radii, layer, col, outline=True, seg=8):
        n = len(pts)
        if n < 2:
            return
        if isinstance(radii, (int, float)):
            radii = [radii] * n
        bm = bmesh.new()
        rings = []
        for i, (x, z) in enumerate(pts):
            if i == 0:
                dx, dz = pts[1][0] - x, pts[1][1] - z
            elif i == n - 1:
                dx, dz = x - pts[i - 1][0], z - pts[i - 1][1]
            else:
                dx, dz = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
            ln = math.hypot(dx, dz) or 1.0
            nx, nz = -dz / ln, dx / ln
            r = max(0.25, radii[i])
            ry = min(r, 1.5)
            ring = []
            for k in range(seg):
                a = 2 * math.pi * k / seg
                ring.append(bm.verts.new((x + nx * r * math.cos(a), layer + ry * math.sin(a), z + nz * r * math.cos(a))))
            rings.append(ring)
        for i in range(n - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(seg):
                kk = (k + 1) % seg
                bm.faces.new((a[k], a[kk], b[kk], b[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        self._finish(bm, col, outline)


def clear_scene():
    for ob in list(bpy.data.objects):
        if ob.type != "CAMERA":
            bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def setup_scene(ss):
    sc = bpy.context.scene
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.display.render_aa = "OFF"  # exact flat colours; paint() needs them to find each shape
    sc.render.dither_intensity = 0.0
    sh = sc.display.shading
    sh.light = "FLAT"
    sh.color_type = "MATERIAL"
    sh.show_backface_culling = True
    sh.show_object_outline = False
    sh.show_cavity = False
    sh.show_shadows = False
    sh.show_specular_highlight = False
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.clip_start = 1
    cam.clip_end = 2000
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.rotation_euler = (math.radians(90), 0, 0)
    return sc


def render_frame(w, h, ss, path, tmpdir, look, settle=False):
    sc = bpy.context.scene
    cam = sc.camera
    cam.data.ortho_scale = max(w, h)
    cam.location = (w / 2.0, -500.0, h / 2.0)
    sc.render.resolution_x = w * ss
    sc.render.resolution_y = h * ss
    tmp = os.path.join(tmpdir, "frame.png")
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp, check_existing=False)
    px = np.empty(w * ss * h * ss * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = px.reshape(h * ss, w * ss, 4)
    painted, emissive = paint(px, ss, look)
    small = add_glow(downsample(painted, ss), emissive.reshape(h, ss, w, ss).mean(axis=(1, 3)))
    if settle:  # drop the figure onto the baseline (row 0 is the bottom)
        rows = np.nonzero(small[..., 3].max(axis=1) > 0.03)[0]
        if len(rows) and rows[0] > 0:
            small = np.concatenate([small[rows[0]:], np.zeros_like(small[:rows[0]])])
    save_png(small, path)
    return small


# --------------------------------------------------------------------------------------
# Painterly pass: the flat render is re-shaded per colour shape so it reads as painted
# --------------------------------------------------------------------------------------
LIGHT = np.array([0.55, 0.62, 0.56]) / np.linalg.norm([0.55, 0.62, 0.56])  # from the upper front
FLAT = LIGHT[2]  # lambert value of a surface facing the camera
SHADOW_TINT = np.array([0.16, 0.14, 0.25])


def hex_rgb8(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _box(a, r, axis):
    widths = [(r + 1, r) if ax == axis else (0, 0) for ax in range(2)]
    c = np.cumsum(np.pad(a, widths), axis=axis)
    if axis == 0:
        return (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
    return (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)


def blur(a, r, passes=3):
    for _ in range(passes):
        a = _box(_box(a, r, 0), r, 1)
    return a


def value_noise(h, w, gh, gw, rng):
    g = rng.uniform(-1, 1, (gh + 2, gw + 2))
    ys, xs = np.linspace(0, gh, h), np.linspace(0, gw, w)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    top = g[y0][:, x0] * (1 - fx) + g[y0][:, x0 + 1] * fx
    bot = g[y0 + 1][:, x0] * (1 - fx) + g[y0 + 1][:, x0 + 1] * fx
    return top * (1 - fy) + bot * fy


def brush_texture(h, w, ss, seed):
    """Soft blotches plus short horizontal strokes, values roughly -1..1."""
    rng = np.random.default_rng(seed)
    blotch = value_noise(h, w, max(2, h // (5 * ss)), max(2, w // (5 * ss)), rng)
    strokes = value_noise(h, w, max(2, h // (2 * ss)), max(2, w // (9 * ss)), rng)
    return 0.55 * blotch + 0.45 * strokes, rng.uniform(0, 1, (h, w))


def _near(c, palette):
    return any(max(abs(c[i] - p[i]) for i in range(3)) <= 3 for p in palette)


def paint(px, ss, look):
    """px: (h, w, 4) flat render at ss x size. Returns the painted image and the emissive mask."""
    h, w = px.shape[:2]
    rgb, alpha = px[..., :3].copy(), px[..., 3].copy()
    solid = alpha > 0.5
    q = np.clip(np.round(rgb * 255), 0, 255).astype(np.int32)
    key = (q[..., 0] << 16) | (q[..., 1] << 8) | q[..., 2]
    tex, grain = brush_texture(h, w, ss, look["seed"])

    # whole-silhouette roundness, so the figure is lit as one form as well as per part
    rb = 9 * ss
    gy, gx = np.gradient(blur(solid.astype(np.float32), rb))
    bx, by = -gx * rb * 1.35, -gy * rb * 1.35

    lam_all = np.full((h, w), FLAT, np.float32)
    outline = np.zeros((h, w), bool)
    emissive = np.zeros((h, w), bool)
    r = 3 * ss
    for k in np.unique(key[solid]):
        c = ((k >> 16) & 255, (k >> 8) & 255, k & 255)
        m = (key == k) & solid
        if _near(c, look["outline"]):
            outline |= m
            continue
        if _near(c, look["emissive"]):
            emissive |= m
            continue
        ys, xs = np.nonzero(m)
        if len(ys) < (2 * ss) ** 2:
            continue  # tiny details stay flat
        y0, y1 = max(0, ys.min() - 4 * r), min(h, ys.max() + 4 * r + 1)
        x0, x1 = max(0, xs.min() - 4 * r), min(w, xs.max() + 4 * r + 1)
        sub = m[y0:y1, x0:x1]
        gy2, gx2 = np.gradient(blur(sub.astype(np.float32), r))
        nx = -gx2 * r * 3 + bx[y0:y1, x0:x1]
        ny = -gy2 * r * 3 + by[y0:y1, x0:x1]
        lam = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / np.sqrt(nx * nx + ny * ny + 1)
        lam_all[y0:y1, x0:x1][sub] = lam[sub]

    s = np.clip((lam_all - FLAT) * 1.5, -1, 1)
    lit, dark = np.maximum(s, 0)[..., None], np.maximum(-s, 0)[..., None]
    shadow = rgb * 0.56 + SHADOW_TINT * 0.12
    light = np.minimum(1.0, rgb * 1.16 + 0.05)
    col = (rgb + (light - rgb) * lit + (shadow - rgb) * dark) * (1 + 0.07 * tex)[..., None]
    fill = solid & ~outline & ~emissive
    rgb[fill] = np.clip(col[fill], 0, 1)

    # heavier line on the shadow side: grow the outline into dark fill, toward the light
    line_col = np.array(look["outline"][0]) / 255.0
    grow = np.zeros_like(outline)
    for d in range(1, ss // 2 + 2):
        grow[d:, d:] |= outline[:-d, :-d]
    grow &= fill & (lam_all < FLAT - 0.12)
    rgb[grow] = line_col

    # slightly rough outer edge: knock out a few silhouette pixels
    inner = solid.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        inner &= np.roll(solid, (dy, dx), axis=(0, 1))
    edge = solid & ~inner
    alpha[edge & (grain > 0.55 + 0.25 * (tex > 0))] = 0.0
    return np.concatenate([rgb, alpha[..., None]], axis=2), emissive.astype(np.float32)


def add_glow(small, emissive, r=2, strength=0.85):
    a = small[..., 3:4]
    pre = small[..., :3] * a
    src = pre * emissive[..., None]
    glow = np.stack([blur(src[..., i], r) for i in range(3)], axis=-1) * strength
    ga = np.clip(glow.max(axis=2, keepdims=True), 0, 1) * 0.8
    na = 1 - (1 - a) * (1 - ga)
    npre = np.clip(pre + glow, 0, None)
    out = np.concatenate([np.where(na > 1e-5, npre / np.maximum(na, 1e-5), 0.0), na], axis=2)
    return np.clip(out, 0, 1)


def downsample(px, ss):
    h, w = px.shape[0] // ss, px.shape[1] // ss
    a = px[..., 3:4]
    pre = np.concatenate([px[..., :3] * a, a], axis=2)
    pre = pre.reshape(h, ss, w, ss, 4).mean(axis=(1, 3))
    out = pre.copy()
    alpha = pre[..., 3:4]
    out[..., :3] = np.where(alpha > 1e-5, pre[..., :3] / np.maximum(alpha, 1e-5), 0.0)
    return np.clip(out, 0, 1)


def save_png(arr, path):
    """arr: (h, w, 4) float array, bottom row first (Blender order)."""
    h, w = arr.shape[:2]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = bpy.data.images.new("out", w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def load_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


# --------------------------------------------------------------------------------------
# Shape helpers
# --------------------------------------------------------------------------------------
def flame_pts(base_w, h, lean=0.0, flick=0.0, n=8):
    right, left = [], []
    for i in range(n + 1):
        s = i / n
        w = base_w / 2 * (1 - s) ** 0.85 * (1 + 0.35 * math.sin(math.pi * s))
        cx = lean * s * s * h + flick * math.sin(s * math.pi * 1.6) * s
        right.append((cx + w, s * h))
        left.append((cx - w, s * h))
    bottom = [(0, -base_w * 0.35)]
    return bottom + right + list(reversed(left[:-1]))


def leaf_pts(length, width, n=8, curl=0.0):
    top, bot = [], []
    for i in range(n + 1):
        s = i / n
        w = width / 2 * math.sin(math.pi * s) ** 0.8
        c = curl * s * s
        top.append((s * length, c + w))
        bot.append((s * length, c - w))
    return top + list(reversed(bot[1:-1]))


def ring_pts(cx, cz, rx, rz, n=24, a0=0.0, a1=360.0):
    return [(cx + rx * math.cos(math.radians(lerp(a0, a1, i / n))), cz + rz * math.sin(math.radians(lerp(a0, a1, i / n)))) for i in range(n + 1)]


def band_pts(cx, cz, rx, rz, thick, a0, a1, n=16):
    outer = ring_pts(cx, cz, rx + thick / 2, rz + thick / 2, n, a0, a1)
    inner = ring_pts(cx, cz, rx - thick / 2, max(0.5, rz - thick / 2), n, a0, a1)
    return outer + list(reversed(inner))


def rock_pts(cx, cz, r, seed, n=7):
    rng = np.random.default_rng(seed)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.25, 0.25)
        rr = r * rng.uniform(0.7, 1.1)
        pts.append((cx + rr * math.cos(a), cz + rr * math.sin(a)))
    return pts


# --------------------------------------------------------------------------------------
# Character definitions
# --------------------------------------------------------------------------------------
CHARS = {
    "fire": dict(
        outline="#2a0806", x=58,
        leg=9, leg_w=3.6, leg_gap=4.5, foot=4.6, foot_r=2.5, leg_col="#3d130c", leg_back="#250908",
        H=27, hem=-4, wt=26, wb=40, teeth=4, tooth=4.5, back_x=3, flare_amt=14, flare_lift=6, wave_amt=1.6,
        cloak="#7a2418", trim="#c8561e", trim_ext=3.2,
        head_rx=21, head_rz=18, head_dx=3, head_dz=14, head="#3e2c27",
        sh_x=5, arm=8, idle_arm=-70, idle_wpn=-35, idle_front=True, reach_dx=0, wlen=28,
        gait=34, bob=1.6, lean_walk=-10, breath=1.0,
        fx=["#ffd84a", "#ff8a1f", "#e2401c"],
        emissive=["#ff8a2a", "#ffe08a", "#ffd84a", "#ff8a1f", "#fff47a", "#ff7a1a", "#fffbe0"],
    ),
    "earth": dict(
        outline="#1f160d", x=60,
        leg=11, leg_w=5.2, leg_gap=7, foot=6.5, foot_r=3.0, leg_col="#3a2a18", leg_back="#251a0f",
        H=36, hem=-4, wt=40, wb=56, teeth=3, tooth=3.5, back_x=2, flare_amt=7, flare_lift=3, wave_amt=0.6,
        cloak="#6e4a2a", trim="#5f8a2e", trim_ext=2.6,
        head_rx=22, head_rz=18, head_dx=5, head_dz=10, head="#8a8172",
        sh_x=9, arm=10, idle_arm=-40, idle_wpn=-50, idle_front=True, reach_dx=-12, wlen=40,
        gait=20, bob=0.8, lean_walk=-4, breath=0.6,
        fx=["#a39a88", "#6e4a2a", "#5f8a2e"],
        emissive=["#d8e86a"],
    ),
    "water": dict(
        outline="#08132e", x=58,
        leg=20, leg_w=3.0, leg_gap=3.5, foot=4.2, foot_r=2.1, leg_col="#13234a", leg_back="#0b1530",
        H=48, hem=-15, wt=20, wb=36, teeth=5, tooth=4.0, back_x=7, flare_amt=16, flare_lift=5, wave_amt=2.4,
        cloak="#234588", trim="#2bb3a8", trim_ext=3.0, foam="#e9fbff",
        head_rx=15, head_rz=21, head_dx=2, head_dz=17, head="#182f66",
        sh_x=4, arm=12, idle_arm=-150, idle_wpn=125, idle_front=False, reach_dx=-17, wlen=57,
        gait=24, bob=1.0, lean_walk=-5, breath=1.2,
        fx=["#e9fbff", "#5fd6cc", "#2b6fd6"],
        emissive=["#7fe8e0", "#b8ffe8"],
    ),
    "wind": dict(
        outline="#1f3a33", x=60,
        leg=8, leg_w=2.6, leg_gap=3.2, foot=3.6, foot_r=1.9, leg_col="#2c4a42", leg_back="#1d332d",
        H=22, hem=-3, wt=20, wb=30, teeth=4, tooth=5.0, back_x=3, flare_amt=12, flare_lift=6, wave_amt=2.0,
        cloak="#a8c4ad", trim="#6f9e7c", trim_ext=3.0,
        head_rx=17, head_rz=16, head_dx=2, head_dz=12, head="#93bf9c",
        sh_x=4, arm=7, idle_arm=-150, idle_wpn=135, idle_front=False, reach_dx=0, wlen=34,
        gait=30, bob=2.0, lean_walk=-8, breath=1.4,
        fx=["#ffffff", "#9fe8c0", "#8fd0ff"],
        emissive=[],
    ),
}

DEFAULT_POSE = dict(
    z=0.0, lean=0.0, sx=1.0, sy=1.0, legF=0.0, legB=0.0, legLen=1.0, grounded=True,
    wpnFront=False, flare=0.0, wave=0.0, headRot=0.0, headDz=0.0, trail=0.0, t=0.0,
    weaponDrop=None, cast=None, streak=0.0, burst=0.0, armUp=None,
)


def cloak_pts(C, P, extra=0.0):
    H, hem = C["H"], C["hem"] - extra
    wt, wb = C["wt"] / 2 + extra * 0.3, C["wb"] / 2 + extra * 0.5
    teeth, tooth = C["teeth"], C["tooth"]
    pts = [(wt * 0.35, H + 2), (wt * 0.85, H * 0.92), (wt, H * 0.75), (lerp(wt, wb, 0.55) + 1.5, lerp(H * 0.75, hem, 0.5)), (wb, hem + 1)]
    xb = -wb - C["back_x"]
    m = teeth * 2
    for i in range(1, m):
        s = i / m
        x = lerp(wb, xb, s)
        z = hem + (tooth if i % 2 == 0 else -0.5)
        pts.append((x, z))
    pts += [(xb, hem + 1), (lerp(-wt, xb, 0.55) - 1.5, lerp(H * 0.75, hem, 0.5)), (-wt - 1, H * 0.75), (-wt * 0.8, H * 0.92), (-wt * 0.35, H + 2)]
    out = []
    span = max(1.0, H - hem)
    for x, z in pts:
        k = min(1.0, max(0.0, (H - z) / span))
        dx = -P["flare"] * C["flare_amt"] * k ** 1.5 + math.sin(P["wave"] + z * 0.25 + x * 0.08) * C["wave_amt"] * k
        dz = abs(P["flare"]) * C["flare_lift"] * k ** 2 * (1 if P["flare"] > 0 else 0.3)
        out.append((x + dx, z + dz))
    return out


def draw_hero(cv, el, C, P):
    L = C["leg"] * P["legLen"]
    base = C["foot_r"] + OUTLINE * 0.6
    if P["grounded"]:
        hipz = P["z"] + base + L * max(math.cos(math.radians(P["legF"])), math.cos(math.radians(P["legB"])))
    else:
        hipz = P["z"] + base + L
    Mroot = T(P["x"], hipz) @ R(P["lean"]) @ S(P["sx"], P["sy"])

    # legs
    for ang, dx, layer, col in ((P["legB"], -C["leg_gap"], L_LEG_BACK, C["leg_back"]), (P["legF"], C["leg_gap"], L_LEG_FRONT, C["leg_col"])):
        top = ap1(Mroot, (dx, 2))
        Ml = T(*top) @ R(ang)
        ln = top[1] - hipz + L
        cv.tube(ap(Ml, [(0, 0), (0, -ln)]), [C["leg_w"], C["leg_w"] * 0.85], layer, col)
        cv.ell(Ml @ T(C["foot"] * 0.35, -ln) @ R(-ang * 0.5), C["foot"], C["foot_r"], layer, col)

    H = C["H"]
    # cloak (+ glowing/foam trim behind it)
    cv.poly(ap(Mroot, cloak_pts(C, P, C["trim_ext"])), L_TRIM, C["trim"])
    cv.poly(ap(Mroot, cloak_pts(C, P)), L_CLOAK, C["cloak"])

    # head
    Mhead = Mroot @ T(C["head_dx"], H + C["head_dz"] + P["headDz"]) @ R(P["headRot"])
    if el in HEAD:
        HEAD[el](cv, C, P, Mhead)
    else:
        cv.ell(Mhead, C["head_rx"], C["head_rz"], L_HEAD, C["head"], ry=3.0, seg=32)

    EXTRA[el](cv, C, P, Mroot, Mhead)
    FACE[el](cv, C, P, Mhead)

    # arm + weapon
    shoulder = ap1(Mroot, (C["sh_x"], H * 0.72))
    arm_dir = (P["armUp"] if P["armUp"] is not None else P["armA"]) + P["lean"]
    hand = (shoulder[0] + dirv(arm_dir, C["arm"])[0], shoulder[1] + dirv(arm_dir, C["arm"])[1])
    front = P["wpnFront"]
    arm_layer = L_ARM_FRONT if front else L_WPN_BACK - 2
    cv.tube([shoulder, hand], [C["leg_w"] * 0.75, C["leg_w"] * 0.7], arm_layer, C["leg_col"])
    if P["weaponDrop"] is not None:
        wx, wz, wa = P["weaponDrop"]
        WEAPON[el](cv, C, T(wx, wz) @ R(wa), L_WPN_FRONT)
    else:
        WEAPON[el](cv, C, T(*hand) @ R(P["wpnA"]), L_WPN_FRONT if front else L_WPN_BACK)
    if P["cast"]:
        cast_fx(cv, el, C, (hand[0] + 6, hand[1] + 1), P["cast"], P["t"])
    if P["streak"]:
        streak_fx(cv, C, P, Mroot)
    if P["burst"]:
        burst_fx(cv, C, P, ap1(Mroot, (0, H * 0.6)))
    return Mroot, Mhead


# ---- heads + faces --------------------------------------------------------------------
def head_earth(cv, C, P, Mh):
    crag = [(-20, -8), (-21.5, 4), (-16, 13.5), (-5, 18), (9, 17), (19, 10.5), (22, -1), (19.5, -12), (8, -17), (-9, -16.5)]
    cv.poly(ap(Mh, crag), L_HEAD, C["head"])
    cv.poly(ap(Mh, [(-19, -6), (-9, -14.5), (8, -15.5), (18.5, -10), (6, -9.5), (-8, -8.5)]), L_HEAD - 1, "#6f675a", outline=False)


def face_fire(cv, C, P, Mh):
    # visor: dark recess with a glowing slit
    cv.poly(ap(Mh, [(0, 2.5), (18.5, 2), (19.5, -3.5), (1.5, -5.5)]), L_EYES, "#170a07")
    g = 0.4 * math.sin(P["t"] * 2)
    cv.poly(ap(Mh, [(3.5, 0.6 + g), (17, 0.4), (17.6, -2.4), (4, -2.8 - g)]), L_EYES2, "#ff8a2a", outline=False)
    cv.poly(ap(Mh, [(6, -0.4), (15, -0.6), (15.3, -1.7), (6.2, -1.9)]), L_EYES2 - 1.5, "#ffe08a", outline=False)


def face_earth(cv, C, P, Mh):
    # deep brow crevice with two small eyes glowing in it
    cv.poly(ap(Mh, [(0, 4.5), (20.5, 3.5), (21, -3), (1, -2.5)]), L_EYES, "#211b14")
    cv.ell(Mh @ T(8, 0.8), 2.4, 1.6, L_EYES2, "#d8e86a", outline=False)
    cv.ell(Mh @ T(16.5, 0.4), 1.8, 1.4, L_EYES2, "#d8e86a", outline=False)
    for pts in ([(-14, 9), (-9, 3), (-12, -6)], [(4, -8), (10, -13)], [(-3, 13), (2, 9)]):
        cv.tube(ap(Mh, pts), 0.7, L_EYES, "#5e574b", outline=False)


def face_water(cv, C, P, Mh):
    # shadowed face inside the hood, two small sea-glass eyes
    cv.ell(Mh @ T(5.5, -4) @ R(-8), 8.2, 11, L_EYES, "#081329")
    cv.ell(Mh @ T(7, -2), 1.8, 2.5, L_EYES2, "#7fe8e0", outline=False)
    cv.ell(Mh @ T(11.6, -2.3), 1.4, 2.2, L_EYES2, "#7fe8e0", outline=False)


def face_wind(cv, C, P, Mh):
    # open face in the hood: small dark eyes and a bit of colour on the cheek
    cv.ell(Mh @ T(5.5, -2.5), 9.5, 9.5, L_EYES, "#e3d3ad")
    cv.ell(Mh @ T(10.5, -6.3), 2.3, 1.2, L_EYES2 + 1, "#d9927e", outline=False)
    cv.ell(Mh @ T(7.5, -1.5), 1.5, 2.3, L_EYES2, "#22302a", outline=False)
    cv.ell(Mh @ T(13, -1.8), 1.2, 2.1, L_EYES2, "#22302a", outline=False)
    cv.circ(ap1(Mh, (7.9, -0.6)), 0.55, L_EYES2 - 1, "#ffffff", outline=False)
    cv.circ(ap1(Mh, (13.3, -0.9)), 0.45, L_EYES2 - 1, "#ffffff", outline=False)


# ---- head decoration + body extras ---------------------------------------------------
def extra_fire(cv, C, P, Mr, Mh):
    t, trail = P["t"], P["trail"]
    # helm: ridge over the crown, brim with rivets along the bottom
    cv.tube(ap(Mh, [(-16, 8), (-7, 16), (6, 16.5), (14, 11)]), 2.0, L_EYES + 1, "#5a3d33")
    cv.poly(ap(Mh, band_pts(0, -0.5, 20, 16.8, 3.2, 200, 340, 18)), L_EYES + 1, "#5a3d33")
    for ang in (220, 255, 290, 322):
        cv.circ(ap1(Mh, (20 * math.cos(math.radians(ang)), -0.5 + 16.8 * math.sin(math.radians(ang)))), 0.9, L_EYES - 0.5, "#8a5f4c", outline=False)
    # flame plume rising from the top of the helm, blown back
    fl = 1.4 * math.sin(t * 2)
    h = 26 * (1 + 0.06 * math.sin(t * 3))
    Mf = Mh @ T(-4, 15) @ R(12 + trail * 0.4)
    cv.poly(ap(Mf, flame_pts(13, h, -0.6, fl)), L_HORN, "#c4321a")
    cv.poly(ap(Mf, flame_pts(8, h * 0.72, -0.55, fl * 0.8)), L_HORN - 1.5, "#ff8a1f", outline=False)
    cv.poly(ap(Mf, flame_pts(4, h * 0.42, -0.45, fl * 0.5)), L_HORN - 2.5, "#ffd84a", outline=False)
    for k, (ex, ez) in enumerate(((-16, 26), (-7, 34), (4, 29))):
        s = ((t / (2 * math.pi)) + k * 0.37) % 1.0
        p = ap1(Mh, (ex - 6 * s - trail * 0.2, ez + 12 * s))
        cv.circ(p, 1.6 * (1 - s) + 0.4, L_FX_FRONT, "#ffd84a" if k % 2 else "#ff8a1f", outline=0.8)
    H = C["H"]
    cv.poly(ap(Mr, [(-12, H - 2), (-4, H + 3.5), (6, H + 3.5), (13, H - 2), (4, H - 4), (-6, H - 4)]), L_COLLAR, "#4a120c")


def extra_earth(cv, C, P, Mr, Mh):
    H = C["H"]
    # back shell
    shell = Mr @ T(-7, H * 0.6)
    cv.ell(shell, 27, 24, L_SHELL, "#8f8b80", ry=1.0, seg=32)
    cv.poly(ap(shell, [(-27, -2), (-20, -15), (-6, -23), (-12, -6)]), L_SHELL - 1.2, "#76726a", outline=False)
    for pts in ([(-3, 23), (-6, 12), (-1, 2), (-7, -10)], [(-24, 8), (-15, 6), (-12, -6)], [(8, 18), (12, 8)]):
        cv.tube(ap(shell, pts), 0.8, L_SHELL - 2, "#5e5a52", outline=False)
    for cx, cz, rx, rz in ((-8, 21, 13, 5), (6, 20, 8, 4), (-21, 12, 6, 4)):
        cv.ell(shell @ T(cx, cz), rx, rz, L_SHELL - 2.5, "#5f8a2e", outline=0.9)
    # front shoulder plate
    cv.poly(ap(Mr, [(2, H * 0.98), (14, H * 1.02), (23, H * 0.78), (21, H * 0.52), (8, H * 0.5), (1, H * 0.7)]), L_PAULDRON, "#a39a88")
    cv.poly(ap(Mr, [(4, H * 0.95), (13, H * 0.98), (19, H * 0.82), (10, H * 0.8)]), L_PAULDRON - 1.5, "#bdb5a2", outline=False)
    # moss cap with a small sprout
    sway = math.sin(P["t"]) * 4 + P["trail"] * 0.3
    cv.tube(ap(Mh, [(2, 16), (2.5, 21), (1.5, 25)]), [1.1, 0.9, 0.7], L_HORN, "#4f7a2a")
    for ang, ln in ((140 + sway, 8), (40 + sway, 7)):
        cv.poly(ap(Mh @ T(1.5, 24.5) @ R(ang), leaf_pts(ln, ln * 0.55)), L_HORN - 0.5, "#7fae4a")
    cv.ell(Mh @ T(-4, 15.5), 13, 4.6, L_EYES, "#5f8a2e", outline=0.9)
    cv.ell(Mh @ T(9, 15), 6.5, 3.2, L_EYES, "#5f8a2e", outline=0.9)
    cv.circ(ap1(Mh, (-7, 17.5)), 1.4, L_EYES2, "#8fc04e", outline=False)


def extra_water(cv, C, P, Mr, Mh):
    H = C["H"]
    t, tr = P["t"], P["trail"]
    # wave crest rising off the back of the hood and curling forward over it
    w = math.sin(t) * 1.4 + tr * 0.12
    crest = [(-11, 10), (-11, 21), (-5, 29), (4, 32), (11, 29), (13, 24), (9, 21.5)]
    crest = [(x - w * (i / 6) * 0.6, z + w * (i / 6)) for i, (x, z) in enumerate(crest)]
    cv.tube(ap(Mh, crest), [5.0, 4.6, 4.0, 3.3, 2.6, 1.9, 1.0], L_HORN, "#2a62a8")
    for i in (2, 3, 4):
        x, z = crest[i]
        cv.circ(ap1(Mh, (x + 0.5, z + 2.2)), 1.9 - 0.3 * (i - 2), L_HORN - 1.5, C["foam"], outline=0.9)
    # foam hem scallops
    hem_pts = cloak_pts(C, P, C["trim_ext"])
    for x, z in sorted(hem_pts, key=lambda p: p[1])[:6]:
        cv.circ(ap1(Mr, (x, z + 1.5)), 2.4, L_TRIM - 1.2, C["foam"], outline=0.9)
    cv.poly(ap(Mr, [(-10, H - 1), (-4, H + 3), (7, H + 3), (11, H - 1), (2, H - 3.5)]), L_COLLAR, "#2bb3a8")


def extra_wind(cv, C, P, Mr, Mh):
    H = C["H"]
    t, tr = P["t"], P["trail"]
    # two leaf "ears" on the hood, swept back
    for (base, ang, ln, layer, ph) in (((-4, 14), 150, 25, L_HORN, 0.0), ((-9, 11), 172, 20, L_HORN + 2, 1.3)):
        a = ang + math.sin(t + ph) * 6 + tr * 0.4
        Ml = Mh @ T(*base) @ R(a)
        cv.poly(ap(Ml, leaf_pts(ln, ln * 0.5, curl=-2.0)), layer, "#7fae86")
        cv.tube(ap(Ml, [(1, 0), (ln * 0.85, -1.6)]), 0.45, layer - 1.5, "#4f7f5c", outline=False)
    # scarf band + two trailing tails ending in feathers
    cv.poly(ap(Mr, [(-11, H - 2), (-7, H + 3.5), (8, H + 3.5), (12, H - 1.5), (3, H - 5), (-6, H - 4.5)]), L_COLLAR, "#6fa9c9")
    for k, (ln, ph, layer, col) in enumerate(((9, 0.0, L_TAIL, "#6fa9c9"), (7, 1.4, L_TAIL + 2, "#5a92b5"))):
        base_ang = 180 - 12 - tr + k * 14
        pts = []
        for i in range(ln):
            bx, bz = dirv(base_ang, i * 4.4)
            nx, nz = dirv(base_ang + 90, math.sin(t + i * 0.85 + ph) * (0.5 + i * 0.55))
            pts.append((-6 + bx + nx, H + 1 + bz + nz))
        cv.tube(ap(Mr, pts), [lerp(3.4, 1.8, i / (ln - 1)) for i in range(ln)], layer, col)
        dx, dz = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        Mf = Mr @ T(*pts[-1]) @ R(math.degrees(math.atan2(dz, dx)))
        cv.poly(ap(Mf, leaf_pts(10, 5.5)), layer - 0.6, "#e6eee6")


# ---- weapons (local +x = blade direction, origin at the hand) -----------------------
def weapon_fire(cv, C, Mw, layer):
    cv.tube(ap(Mw, [(-5, 0), (2, 0)]), 1.9, layer + 1, "#2a1410")
    cv.poly(ap(Mw, [(2, -4), (4, -4), (4, 4), (2, 4)]), layer, "#6b2c18")
    top = [(4, 2), (12, 3.2), (20, 4.8), (28, 8)]
    bot = [(24.5, 3.4), (16, -0.6), (8, -2.2), (4, -2.2)]
    cv.poly(ap(Mw, top + bot), layer + 0.5, "#4a1712")
    edge = [(8, -2.2), (16, -0.6), (24.5, 3.4), (28, 8), (22.5, 2.4), (15.5, 0.6), (8, -0.8)]
    cv.poly(ap(Mw, edge), layer - 1.2, "#ffbe4a", outline=False)


def weapon_earth(cv, C, Mw, layer):
    cv.tube(ap(Mw, [(-6, 0), (25, 0)]), 2.3, layer + 1, "#5a3a1e")
    head = [(22, -7), (27, -10.5), (36, -8.5), (40, -1), (38, 8), (29, 10.5), (22, 7.5)]
    cv.poly(ap(Mw, head), layer, "#8f8b80")
    cv.poly(ap(Mw, [(23, -6), (28, -9.5), (36, -7.5), (38, -2), (30, -3)]), layer - 1, "#6f6b62", outline=False)
    cv.ell(Mw @ T(31, 9), 6, 2.8, layer - 1.5, "#5f8a2e", outline=0.9)


def weapon_water(cv, C, Mw, layer):
    cv.tube(ap(Mw, [(-18, 0), (40, 0)]), 1.7, layer + 1, "#7fd6e0")
    cv.poly(ap(Mw, [(38, 0), (44, 3.8), (55, 0.4), (57, 0), (55, -0.4), (44, -3.8)]), layer, "#e9fbff")
    cv.poly(ap(Mw, [(34, 0.5), (39, 0.5), (35, -5)]), layer + 0.6, "#2bb3a8")
    cv.circ(ap1(Mw, (-18, 0)), 2.4, layer, "#2bb3a8")


def weapon_wind(cv, C, Mw, layer):
    cv.tube(ap(Mw, [(-6, 0), (0, 0)]), 1.6, layer + 1, "#2c4a42")
    cv.tube(ap(Mw, [(1, 0), (34, 0)]), [1.8, 0.5], layer + 0.5, "#eefcff")
    cv.poly(ap(Mw @ T(0, 0) @ R(90), leaf_pts(6, 4)), layer - 0.6, "#8fdc9f")
    cv.poly(ap(Mw @ T(0, 0) @ R(-90), leaf_pts(6, 4)), layer - 0.6, "#8fdc9f")
    cv.poly(ap(Mw @ T(-6, 0) @ R(200), leaf_pts(9, 3.5, curl=2)), layer + 1.2, "#7cc7f2")


HEAD = dict(earth=head_earth)
FACE = dict(fire=face_fire, earth=face_earth, water=face_water, wind=face_wind)
EXTRA = dict(fire=extra_fire, earth=extra_earth, water=extra_water, wind=extra_wind)
WEAPON = dict(fire=weapon_fire, earth=weapon_earth, water=weapon_water, wind=weapon_wind)


# ---- small effects used inside character frames --------------------------------------
def cast_fx(cv, el, C, c, power, t):
    a, b, d = C["fx"]
    s = power
    if el == "fire":
        M = T(*c) @ R(-90) @ S(s)
        cv.poly(ap(M, flame_pts(12, 16, 0.0, 1.0)), L_FX_FRONT, d)
        cv.poly(ap(M, flame_pts(7, 10, 0.0, 0.6)), L_FX_FRONT - 1, b, outline=False)
        cv.circ(c, 2.5 * s, L_FX_FRONT - 2, a, outline=False)
    elif el == "earth":
        for k, (dx, dz, r) in enumerate(((0, 0, 5), (7, 5, 3.4), (6, -6, 3))):
            cv.poly(rock_pts(c[0] + dx * s, c[1] + dz * s, r * s, 11 + k), L_FX_FRONT - k, a if k else "#8f8b80")
    elif el == "water":
        cv.poly(band_pts(c[0], c[1], 7 * s, 7 * s, 2.6, 0, 360, 24), L_FX_FRONT, b, outline=0.9)
        for k in range(5):
            ang = t * 30 + k * 72
            p = (c[0] + math.cos(math.radians(ang)) * 10 * s, c[1] + math.sin(math.radians(ang)) * 10 * s)
            cv.circ(p, 1.8 * s, L_FX_FRONT - 1, a, outline=0.8)
        cv.circ(c, 3 * s, L_FX_FRONT - 2, a, outline=0.8)
    else:
        pts = []
        for i in range(22):
            ang = i * 32 + t * 40
            r = 1 + i * 0.5 * s
            pts.append((c[0] + math.cos(math.radians(ang)) * r, c[1] + math.sin(math.radians(ang)) * r * 0.8))
        cv.tube(pts, [lerp(0.6, 1.6, i / 21) for i in range(22)], L_FX_FRONT, d, outline=0.8)
        cv.poly(ap(T(c[0] + 8 * s, c[1] + 6 * s) @ R(30), leaf_pts(8, 4)), L_FX_FRONT - 1, b)


def streak_fx(cv, C, P, Mr):
    a, b, d = C["fx"]
    H = C["H"]
    n = 5
    for k in range(n):
        z = lerp(-2, H + 6, k / (n - 1))
        x0 = -C["wb"] / 2 - 4
        ln = P["streak"] * (34 + 22 * math.sin(k * 2.1 + 1))
        p0 = ap1(Mr, (x0, z))
        pts = [(p0[0] - ln * s, p0[1] + math.sin(s * 3 + k) * 1.2) for s in np.linspace(0, 1, 6)]
        cv.tube(pts, [lerp(2.2, 0.5, s) for s in np.linspace(0, 1, 6)], L_FX_BACK + k * 0.1, (a, b, d)[k % 3], outline=0.8)


def burst_fx(cv, C, P, c):
    a, b, d = C["fx"]
    rng = np.random.default_rng(7)
    for k in range(12):
        ang = rng.uniform(0, 360)
        r = P["burst"] * rng.uniform(16, 34)
        p = (c[0] + math.cos(math.radians(ang)) * r, c[1] + math.sin(math.radians(ang)) * r * 0.8)
        if p[1] < 3:
            continue
        sz = rng.uniform(1.2, 2.8) * (1.3 - 0.4 * P["burst"])
        cv.poly(rock_pts(p[0], p[1], sz, k, n=5), L_FX_FRONT, (a, b, d)[k % 3], outline=0.8)


# --------------------------------------------------------------------------------------
# Animation poses
# --------------------------------------------------------------------------------------
def pose(C, **kw):
    P = dict(DEFAULT_POSE)
    P.update(x=C["x"], armA=C["idle_arm"], wpnA=C["idle_wpn"], wpnFront=C["idle_front"])
    P.update(kw)
    return P


def anim_poses(el, C, anim, n):
    tau = 2 * math.pi
    out = []
    for i in range(n):
        t = tau * i / n
        if anim == "idle":
            P = pose(C, t=t, wave=t, sy=1 + 0.025 * C["breath"] * math.sin(t), sx=1 - 0.012 * math.sin(t),
                     headDz=0.8 * C["breath"] * math.sin(t), flare=0.05 + 0.05 * math.sin(t), trail=4 * math.sin(t))
        elif anim == "walk":
            g = C["gait"]
            P = pose(C, t=t, wave=t * 2, legF=g * math.sin(t), legB=-g * math.sin(t), lean=C["lean_walk"],
                     headDz=C["bob"] * abs(math.cos(t)) - C["bob"] * 0.5, flare=0.3 + 0.1 * math.cos(2 * t), trail=10,
                     wpnA=C["idle_wpn"] + 5 * math.sin(t), sy=1 + 0.02 * math.cos(2 * t))
        elif anim == "jump":
            P = jump_pose(C, i, t)
        elif anim == "attack":
            P = (pose(C, t=t, lean=8, armA=110, wpnA=150, wpnFront=False, flare=0.1, legF=6, legB=-8, headRot=4, trail=4) if i == 0 else
                 pose(C, t=t, lean=-14, armA=-12, wpnA=-18, wpnFront=True, flare=0.45, legF=22, legB=-22, headRot=-5, trail=14, x=C["x"] + 4 + C["reach_dx"]))
        elif anim == "attack2":
            P = (pose(C, t=t, lean=-6, armA=-150, wpnA=-165, wpnFront=False, sy=0.94, flare=0.15, legF=14, legB=-14, legLen=0.9, trail=6, x=C["x"] + 4) if i == 0 else
                 pose(C, t=t, lean=-16, armA=25, wpnA=28, wpnFront=True, flare=0.55, legF=26, legB=-26, headRot=6, trail=16, x=C["x"] + 4 + C["reach_dx"]))
        elif anim == "dash":
            P = (pose(C, t=t, x=118 + C["reach_dx"], lean=-22, legF=10, legB=-30, flare=0.6, trail=18, wpnA=C["idle_wpn"] + 10, sx=0.96) if i == 0 else
                 pose(C, t=t, x=128 + C["reach_dx"], lean=-32, grounded=False, z=6, legF=-40, legB=-70, legLen=0.8, flare=1.1, trail=28,
                      wpnA=C["idle_wpn"] + 20, sx=1.12, sy=0.92, streak=1.0))
        elif anim == "dead":
            drop = (min(C["x"] + 22, 116 - C["wlen"]), 2.5, 8)
            P = [
                pose(C, t=t, x=C["x"] + 12, lean=16, headRot=16, armA=60, wpnA=80, flare=-0.3, legF=12, legB=-18, trail=-8),
                pose(C, t=t, x=C["x"] - max(0, C["H"] - 25) * 0.85, lean=-18, headRot=-18, legLen=0.55, legF=40, legB=-55, flare=0.2, weaponDrop=drop, armA=-60),
                pose(C, t=t, x=C["x"] - max(0, C["H"] - 25) * 0.85, lean=-40, headRot=-26, legLen=0.4, legF=60, legB=-70, flare=0.3, weaponDrop=drop, armA=-80, sy=0.92, burst=0.35),
                pose(C, t=t, x=C["x"] - max(0, C["H"] - 25) * 0.85, lean=-48, headRot=-30, legLen=0.35, legF=70, legB=-75, flare=0.35, weaponDrop=drop, armA=-85, sy=0.88, burst=1.0),
            ][i]
        elif anim == "blast":
            P = (pose(C, t=t, lean=6, sy=0.95, legLen=0.85, legF=10, legB=-12, armA=-160, wpnA=-115, wpnFront=False, flare=-0.15, cast=0.55, trail=2) if i == 0 else
                 pose(C, t=t, lean=-10, armA=0, wpnA=-115, wpnFront=False, legF=20, legB=-20, flare=0.6, cast=1.0, trail=14, x=C["x"] + 2))
        else:
            raise ValueError(anim)
        out.append(P)
    return out


def jump_pose(C, i, t):
    # 1..7 take-off / rising, 8 (idx max-4) held while airborne/falling, 9..11 landing
    if i <= 5:
        k = i / 5
        return pose(C, t=t, wave=t * 2, grounded=False, z=lerp(1, 4, k), lean=-6, legF=lerp(-5, 22, k), legB=lerp(-25, -10, k),
                    legLen=lerp(1.0, 0.75, k), sy=lerp(1.08, 1.0, k), sx=lerp(0.94, 1.0, k), flare=lerp(-0.25, 0.2, k),
                    armA=C["idle_arm"] - 10, trail=lerp(-12, 4, k))
    if i == 6:
        return pose(C, t=t, wave=t * 2, grounded=False, z=4, lean=-2, legF=18, legB=-8, legLen=0.8, flare=0.45, trail=12)
    if i == 7:
        return pose(C, t=t, wave=t * 2, grounded=False, z=3, lean=2, legF=8, legB=-6, legLen=1.0, flare=0.8, trail=24,
                    armA=C["idle_arm"] + 25, headRot=4)
    k = i - 8
    return pose(C, t=t, wave=t, sy=(0.84, 0.93, 1.0)[k], sx=(1.1, 1.04, 1.0)[k], legLen=(0.65, 0.85, 1.0)[k], legF=(18, 10, 4)[k],
                legB=(-18, -10, -4)[k], flare=(0.5, 0.2, 0.08)[k], trail=(10, 4, 1)[k])


# --------------------------------------------------------------------------------------
# Skill effects
# --------------------------------------------------------------------------------------
def skill_fire(cv, i, n, W, H):
    t = 2 * math.pi * i / n
    cx, cz = 152, 40
    # trail: three layered flame tongues lying horizontally pointing back
    for k, (col, scale, ol) in enumerate((("#c42a12", 1.0, True), ("#ff7a1a", 0.72, False), ("#ffd84a", 0.42, False))):
        pts = []
        m = 14
        for j in range(m + 1):
            s = j / m
            x = cx - s * 135 * scale
            w = 17 * scale * (1 - s) ** 0.9 + 1.0
            wob = math.sin(t * 2 + s * 9) * 3 * s
            pts.append((x, cz + w + wob))
        for j in range(m, -1, -1):
            s = j / m
            x = cx - s * 120 * scale
            w = 17 * scale * (1 - s) ** 0.9 + 1.0
            wob = math.sin(t * 2 + s * 9 + 1.2) * 3 * s
            pts.append((x, cz - w + wob))
        cv.poly(pts, 6 - k * 2, col, outline=ol)
    # ball with flickering spikes
    spikes = []
    for j in range(20):
        a = 2 * math.pi * j / 20
        r = 21 + (4 + 2.5 * math.sin(t * 2 + j * 1.7)) * (j % 2)
        spikes.append((cx + r * math.cos(a), cz + r * math.sin(a) * 0.95))
    cv.poly(spikes, -2, "#e2401c")
    cv.circ((cx + 1, cz), 15, -4, "#ff8a1f", outline=False)
    cv.circ((cx + 3, cz + 1), 9.5, -6, "#ffd84a", outline=False)
    cv.circ((cx + 4, cz + 1.5), 4.5, -8, "#fffbe0", outline=False)
    rng = np.random.default_rng(3)
    for k in range(7):
        s = ((i / n) + k / 7) % 1.0
        x = cx - 30 - s * 140
        z = cz + rng.uniform(-22, 22) * (0.4 + s)
        if 3 < z < H - 3 and x > 3:
            cv.circ((x, z), 2.4 * (1 - s) + 0.6, -10, "#ffd84a" if k % 2 else "#ff8a1f", outline=0.8)


def skill_earth(cv, i, n, W, H):
    grow = [0.15, 0.45, 0.8, 1.0, 1.0, 0.85, 0.55, 0.2][i]
    crumble = [0, 0, 0, 0, 0.15, 0.4, 0.75, 1.0][i]
    spikes = [(60, 70, 16, -12), (95, 125, 20, -5), (130, 170, 26, 2), (168, 110, 19, 8), (204, 60, 14, 14)]
    for k, (x, h, w, tilt) in enumerate(spikes):
        hh = h * grow
        if hh < 4:
            continue
        tip = (x + tilt * grow, hh)
        pts = [(x - w, 0), (x - w * 0.55, hh * 0.45), tip, (x + w * 0.6, hh * 0.5), (x + w, 0)]
        layer = 4 if k % 2 else 0
        cv.poly(pts, layer, "#8f8b80")
        cv.poly([(x - w * 0.9, 0), (x - w * 0.5, hh * 0.45), tip, (x - w * 0.05, hh * 0.3), (x + w * 0.1, 0)], layer - 1.2, "#6f6b62", outline=False)
        cv.tube([(x + w * 0.3, hh * 0.1), (x + w * 0.1, hh * 0.35), (x + w * 0.35, hh * 0.55)], 0.8, layer - 1.5, "#4f4b44", outline=False)
        if grow > 0.7:
            cv.ell(T(tip[0] - 2, hh * 0.78), w * 0.35, 3, layer - 2, "#5f8a2e", outline=0.9)
    # ground shockwave dust
    sw = [0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.7, 0.45][i]
    for side in (-1, 1):
        for j in range(4):
            cx = 130 + side * (40 + 70 * sw + j * 9)
            r = (9 - j * 1.6) * sw + 2
            if r + 3 < cx < W - r - 3:
                cv.circ((cx, r * 0.6 + 1), r, -6 - j, ("#a08560", "#8a6e4a")[j % 2], outline=0.9)
    rng = np.random.default_rng(5)
    if crumble:
        for k in range(14):
            x0 = rng.uniform(40, 220)
            vx = rng.uniform(-30, 30)
            vy = rng.uniform(40, 120)
            s = crumble
            x = x0 + vx * s
            z = 30 + vy * s - 100 * s * s
            if 4 < z < H - 6:
                cv.poly(rock_pts(x, z, rng.uniform(2.5, 5.5), k, n=5), -10, ("#8f8b80", "#6f6b62", "#a08560")[k % 3], outline=0.9)
    else:
        for k in range(8):
            x = rng.uniform(40, 220)
            z = 6 + grow * rng.uniform(10, 90)
            cv.poly(rock_pts(x, z, rng.uniform(2, 4.5), k, n=5), -10, ("#8f8b80", "#a08560")[k % 2], outline=0.9)


def skill_water(cv, i, n, W, H):
    p = i / (n - 1)
    rise = math.sin(min(1.0, p * 1.6) * math.pi / 2)
    fade = 1 - max(0.0, (p - 0.6) / 0.4)
    cx = 125
    # two curling waves rolling outward from the hero (stronger toward the front/right)
    for side, strength in ((1, 1.0), (-1, 0.75)):
        hgt = 70 * rise * fade * strength + 6
        reach = 30 + 58 * p * strength
        base_x = cx + side * reach * 0.4
        pts = [(cx + side * 6, 0)]
        m = 12
        for j in range(m + 1):
            s = j / m
            x = base_x + side * s * reach * 0.8
            z = hgt * math.sin(s * math.pi * 0.85) * (1 - 0.15 * s)
            pts.append((x, z))
        curl_x = base_x + side * reach * 0.8
        pts += [(curl_x + side * 8, hgt * 0.45), (curl_x + side * 2, hgt * 0.25), (curl_x + side * 10, 0)]
        if side < 0:
            pts = list(reversed(pts))
        cv.poly(pts, 4, "#1f5fc8")
        inner = [(x, z * 0.7) for x, z in pts]
        cv.poly(inner, 2.5, "#2bb3a8", outline=False)
        foam_pts = [(base_x + side * s * reach * 0.8, hgt * math.sin(s * math.pi * 0.85) * (1 - 0.15 * s)) for s in np.linspace(0.25, 1.0, 8)]
        cv.tube(foam_pts, [2.0, 3.0, 3.5, 3.5, 3.5, 3.0, 2.5, 2.0], 1, "#e9fbff", outline=0.9)
    # bubbles + healing sparkles rising
    rng = np.random.default_rng(11)
    for k in range(12):
        x0 = cx + rng.uniform(-70, 70)
        sp = rng.uniform(0.6, 1.2)
        z = 10 + p * sp * 120 + rng.uniform(0, 15)
        r = rng.uniform(3, 7) * (1 - 0.5 * p)
        if z + r < H - 3 and fade > 0.15:
            cv.poly(band_pts(x0, z, r, r, 1.6, 0, 360, 20), -4, "#e9fbff", outline=0.8)
            cv.circ((x0 + r * 0.35, z + r * 0.35), max(0.6, r * 0.22), -6, "#ffffff", outline=False)
    for k in range(5):
        x = cx + rng.uniform(-60, 60)
        z = 30 + p * 90 + rng.uniform(-10, 10)
        s = (2.5 + 2.5 * math.sin(p * math.pi)) * fade
        if s > 0.8 and z + s < H - 2:
            cv.poly([(x - s, z), (x - s * 0.25, z + s * 0.25), (x, z + s), (x + s * 0.25, z + s * 0.25), (x + s, z), (x + s * 0.25, z - s * 0.25), (x, z - s), (x - s * 0.25, z - s * 0.25)],
                    -8, "#b8ffe8", outline=0.8)


def skill_wind(cv, i, n, W, H):
    t = 2 * math.pi * i / n
    cx = 100
    rings = 9
    for k in range(rings):
        s = k / (rings - 1)
        z = 14 + s * 160
        rx = 10 + 70 * s ** 1.3
        rz = 3 + 9 * s
        x = cx + math.sin(t + s * 3.0) * 10 * s
        thick = 3.5 + 3 * s
        gap = (math.degrees(t) * 2 + k * 47) % 360
        # back half (darker), front half split by a moving gap so the ring reads as spinning
        cv.poly(band_pts(x, z, rx, rz, thick, 0, 180, 18), 6, "#86c99a", outline=0.9)
        a0, a1 = 180 + 10, 360 - 10
        g0, g1 = 180 + (gap % 180), 180 + (gap % 180) + 40
        for b0, b1 in ((a0, min(g0, a1)), (min(g1, a1), a1)):
            if b1 - b0 > 8:
                cv.poly(band_pts(x, z, rx, rz, thick, b0, b1, 12), -2, "#e9fff2" if k % 2 else "#bfe9c6", outline=0.9)
    # gust streaks
    for k in range(4):
        z = 40 + k * 38
        s = ((i / n) + k * 0.27) % 1.0
        x0 = 20 + s * 120
        pts = [(x0 + j * 9, z + math.sin(j * 0.9 + t) * 3) for j in range(6)]
        if pts[-1][0] < W - 4:
            cv.tube(pts, [0.6, 1.4, 1.8, 1.8, 1.4, 0.6], -6, "#8fd0ff", outline=0.8)
    # leaves orbiting
    for k in range(5):
        a = t + k * 2 * math.pi / 5
        s = 0.25 + 0.15 * k
        z = 20 + s * 150
        rx = 12 + 70 * s ** 1.3
        x = cx + math.cos(a) * rx
        zz = z + math.sin(a) * (3 + 9 * s)
        layer = -8 if math.sin(a) < 0 else 8
        cv.poly(ap(T(x, zz) @ R(math.degrees(a) * 2), leaf_pts(9, 4.5)), layer, "#8fdc9f", outline=0.9)


SKILL_FN = dict(fire=skill_fire, earth=skill_earth, water=skill_water, wind=skill_wind)


# --------------------------------------------------------------------------------------
# Contact sheet / lineup
# --------------------------------------------------------------------------------------
def composite(dst, src, x, y_top):
    """dst/src are top-row-first RGBA float arrays; alpha-over src at (x, y_top)."""
    h, w = src.shape[:2]
    region = dst[y_top:y_top + h, x:x + w]
    a = src[..., 3:4]
    region[..., :3] = src[..., :3] * a + region[..., :3] * (1 - a)
    region[..., 3:4] = a + region[..., 3:4] * (1 - a)


def contact_sheet(out_dir, el, rows, bg=(0.16, 0.17, 0.22, 1.0), pad=6):
    imgs = []
    for folder, name, cnt in rows:
        imgs.append([np.flipud(load_png(os.path.join(out_dir, folder, f"{name}_{k:02d}.png"))) for k in range(1, cnt + 1)])
    width = max(sum(im.shape[1] + pad for im in row) + pad for row in imgs)
    height = sum(max(im.shape[0] for im in row) + pad for row in imgs) + pad
    sheet = np.zeros((height, width, 4), dtype=np.float32)
    sheet[:] = bg
    y = pad
    for row in imgs:
        x = pad
        rh = max(im.shape[0] for im in row)
        for im in row:
            cell = sheet[y:y + im.shape[0], x:x + im.shape[1]]
            cell[..., :3] = cell[..., :3] * 0.85 + 0.03  # show cell bounds
            composite(sheet, im, x, y)
            x += im.shape[1] + pad
        y += rh + pad
    save_png(np.flipud(sheet), os.path.join(out_dir, "preview.png"))


def lineup(out_root, elements):
    files = [os.path.join(ORIGINAL_HERO, "idle", "idle_01.png")] + [os.path.join(out_root, e, "idle", "idle_01.png") for e in elements]
    ims = [np.flipud(load_png(f)) for f in files]
    w = sum(im.shape[1] for im in ims)
    sheet = np.zeros((150, w, 4), dtype=np.float32)
    sheet[:] = (0.16, 0.17, 0.22, 1.0)
    x = 0
    for im in ims:
        composite(sheet, im, x, 0)
        x += im.shape[1]
    sheet[-1:, :, :3] = (0.6, 0.6, 0.6)
    save_png(np.flipud(sheet), os.path.join(out_root, "lineup.png"))


# --------------------------------------------------------------------------------------
# Manifest
# --------------------------------------------------------------------------------------
STATS = {
    "fire": dict(move_speed=1.2, jump_force=1.05, max_health=4, attack_range=0.8, attack_speed=1.25, dash_cooldown=0.8,
                 body="short and stocky, iron helm with a glowing visor and a flame plume", weapon="short curved ember blade",
                 skill="Fireball: a fast horizontal projectile that leaves a flame trail and deals high damage on hit."),
    "earth": dict(move_speed=0.8, jump_force=0.85, max_health=8, attack_range=1.1, attack_speed=0.75, dash_cooldown=1.3,
                  body="wide and heavy, craggy stone head with a moss cap, rocky back shell", weapon="stone club",
                  skill="Rock Spikes: slams the ground; stone spikes erupt in front of the hero, damaging and knocking up enemies in an area."),
    "water": dict(move_speed=1.0, jump_force=1.0, max_health=5, attack_range=1.4, attack_speed=0.9, dash_cooldown=1.0,
                  body="tall and slender, deep-blue hood with a curling wave crest, long robe", weapon="long spear",
                  skill="Healing Tide: a water wave bursts around the hero, restoring 1-2 health and pushing nearby enemies away."),
    "wind": dict(move_speed=1.3, jump_force=1.2, max_health=3, attack_range=0.9, attack_speed=1.15, dash_cooldown=0.6,
                 body="small and light, leaf-eared hood, trailing scarf", weapon="light leaf rapier",
                 skill="Gust Tornado: a small tornado travels forward, lifting and repeatedly hitting enemies caught in it; can also boost the hero upward."),
}


def write_manifest(out_root):
    data = {
        "format": "Same layout as assets/game/hero: <anim>/<anim>_NN.png (NN from 01), transparent RGBA, facing right, feet on the bottom baseline.",
        "baseline": "Original knight = 1.0 for relative stats (Setting.CHARACTER_SPEED, CHARACTER_JUMP_FORCE); max_health is absolute (original CHARACTER_MAX_HEALTH = 5).",
        "jump_structure": "jump_01..07 take-off/rise (play once), jump_08 (index max-4) held while airborne, jump_09..11 landing - same as the original.",
        "blast_note": "blast/ is the casting pose, loaded like GET_PLAYER_BLAST_MOVEMENT (PLAYER_CONF.blast_movement.max = 2).",
        "regenerate": "\"C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe\" --background --factory-startup --python tools/blender/hero_sprites.py -- --element all",
        "elements": {},
    }
    for el in CHARS:
        folder = f"assets/game/heroes/{el}"
        anims = {}
        for name, cnt, (w, h) in ANIMS:
            d = os.path.join(out_root, el, name)
            found = len([f for f in os.listdir(d) if f.endswith(".png")]) if os.path.isdir(d) else 0
            anims[name] = dict(frames=found, expected=cnt, width=w, height=h, path=f"{folder}/{name}/{name}_NN.png")
        sk = SKILLS[el]
        d = os.path.join(out_root, el, "skill")
        found = len([f for f in os.listdir(d) if f.endswith(".png")]) if os.path.isdir(d) else 0
        data["elements"][el] = dict(
            folder=folder,
            animations=anims,
            skill=dict(path=f"{folder}/skill/skill_NN.png", frames=found, width=sk["size"][0], height=sk["size"][1],
                       loop=sk["loop"], description=STATS[el]["skill"]),
            palette=dict(cloak=CHARS[el]["cloak"], trim=CHARS[el]["trim"], head=CHARS[el]["head"], fx=CHARS[el]["fx"]),
            stats={k: v for k, v in STATS[el].items() if k != "skill"},
        )
    with open(os.path.join(out_root, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# --------------------------------------------------------------------------------------
def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--element", default="all")
    ap_.add_argument("--anims", default="")
    ap_.add_argument("--out", default=DEFAULT_OUT)
    ap_.add_argument("--ss", type=int, default=4)
    args = ap_.parse_args(argv)

    elements = list(CHARS) if args.element == "all" else args.element.split(",")
    only = set(a for a in args.anims.split(",") if a)
    setup_scene(args.ss)
    tmpdir = tempfile.mkdtemp(prefix="hero_sprites_")

    for el in elements:
        C = CHARS[el]
        out_dir = os.path.join(args.out, el)
        look = dict(outline=[hex_rgb8(C["outline"])], emissive=[hex_rgb8(c) for c in C["emissive"]], seed=sum(map(ord, el)))
        for name, cnt, (w, h) in ANIMS:
            if only and name not in only:
                continue
            for k, P in enumerate(anim_poses(el, C, name, cnt), start=1):
                clear_scene()
                draw_hero(Canvas(C["outline"]), el, C, P)
                render_frame(w, h, args.ss, os.path.join(out_dir, name, f"{name}_{k:02d}.png"), tmpdir, look, settle=name != "jump")
            print(f"[hero_sprites] {el}/{name}: {cnt} frames")
        if not only or "skill" in only:
            sk = SKILLS[el]
            w, h = sk["size"]
            for k in range(sk["frames"]):
                clear_scene()
                SKILL_FN[el](Canvas(C["outline"], outline=1.4), k, sk["frames"], w, h)
                render_frame(w, h, args.ss, os.path.join(out_dir, "skill", f"skill_{k + 1:02d}.png"), tmpdir, look)
            print(f"[hero_sprites] {el}/skill: {sk['frames']} frames")
        rows = [(n, n, c) for n, c, _ in ANIMS] + [("skill", "skill", SKILLS[el]["frames"])]
        if all(os.path.exists(os.path.join(out_dir, f, f"{nm}_01.png")) for f, nm, _ in rows):
            contact_sheet(out_dir, el, rows)
    if all(os.path.exists(os.path.join(args.out, e, "idle", "idle_01.png")) for e in CHARS):
        lineup(args.out, list(CHARS))
    write_manifest(args.out)
    print("[hero_sprites] done ->", args.out)


if __name__ == "__main__":
    main()
