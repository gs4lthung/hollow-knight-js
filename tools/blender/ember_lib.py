# Ember, the fire hero: a cracked stone helm crowned with live flames, molten
# glowing eyes, a tattered red-black cloak whose hem is burning, a heated blade
# and embers drifting off the body. Built on the shared hero kit's rig and poses.
#
# In wcl_art.blend (this file is also stored there as the text "ember_lib.py"):
#   H = {}; exec(T["hero_lib.py"], H); exec(T["kit_lib.py"], H); exec(T["ember_lib.py"], H)
#   H["build_ember"]()                     # (re)builds the Kit_fire scene
#   H["render_ember"](raw_dir)             # renders every animation, supersampled
# then finish the frames (see assets/game/heroes/manifest.json "regenerate").

PAL_EMBER = dict(
    stone=(78, 66, 64),        # charred stone helm
    cloak=(66, 22, 20),        # red-black cloak
    trim=(118, 40, 24),
    leg=(30, 18, 18),
    burn=(1.0, 0.3, 0.04),    # burning hem / cracks (linear, emissive)
    flame=(1.0, 0.16, 0.02),   # outer flame tongues
    core=(1.0, 0.55, 0.08),    # inner flame tongues
    spark=(1.0, 0.45, 0.1),    # drifting embers
    eye=(1.0, 0.62, 0.12),
    blade=(1.0, 0.3, 0.06),
)

def _drop_old_materials():
    for m in list(bpy.data.materials):
        if m.name.startswith(("MK_fire_", "ME_")):
            bpy.data.materials.remove(m)

def hem_material(name, base_rgb, edge_rgb, zmin, band, hot=2.5, scale=2.6):
    """Toon cloak whose hem glows (smouldering cloth, foam, moss light...): object-space
    height, broken up with noise, mixes the flat cloak colour into an emissive edge.
    base_rgb is 0-255 sRGB like the palettes, edge_rgb linear 0-1."""
    m = flat(name, lin(base_rgb), 0.55, 1.3)
    nt = m.node_tree; N, Lk = nt.nodes, nt.links
    ramp = next(n for n in N if n.type == "VALTORGB")
    emit = next(n for n in N if n.type == "EMISSION")
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ"); Lk.new(tc.outputs["Object"], sep.inputs[0])
    noise = N.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = scale
    Lk.new(tc.outputs["Object"], noise.inputs["Vector"])
    # height, pushed up and down by noise so the burnt edge is ragged
    cen = N.new("ShaderNodeMath"); cen.operation = "SUBTRACT"
    Lk.new(noise.outputs["Fac"], cen.inputs[0]); cen.inputs[1].default_value = 0.5
    wob = N.new("ShaderNodeMath"); wob.operation = "MULTIPLY_ADD"
    Lk.new(cen.outputs[0], wob.inputs[0]); wob.inputs[1].default_value = band
    Lk.new(sep.outputs["Z"], wob.inputs[2])
    mr = N.new("ShaderNodeMapRange"); mr.clamp = True
    Lk.new(wob.outputs[0], mr.inputs["Value"])
    mr.inputs["From Min"].default_value = zmin + band * 0.4
    mr.inputs["From Max"].default_value = zmin + band * 1.4
    mr.inputs["To Min"].default_value = 1.0; mr.inputs["To Max"].default_value = 0.0
    edge = N.new("ShaderNodeValToRGB"); er = edge.color_ramp; er.interpolation = "CONSTANT"
    er.elements[0].position = 0.0; er.elements[0].color = (0, 0, 0, 1)
    er.elements[1].position = 0.55; er.elements[1].color = (1, 1, 1, 1)
    e2 = er.elements.new(0.85); e2.color = (2.2, 2.2, 2.2, 1)  # hottest right at the edge
    Lk.new(mr.outputs["Result"], edge.inputs["Fac"])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.clamp_factor = True
    # Mix has float / vector / colour sockets of the same names: use the colour ones
    Lk.new(edge.outputs["Color"], mix.inputs[0])
    Lk.new(ramp.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (*edge_rgb, 1)
    Lk.new(mix.outputs[2], emit.inputs["Color"])
    st = N.new("ShaderNodeMath"); st.operation = "MULTIPLY_ADD"
    Lk.new(edge.outputs["Color"], st.inputs[0]); st.inputs[1].default_value = hot; st.inputs[2].default_value = 1.0
    Lk.new(st.outputs[0], emit.inputs["Strength"])
    return m

def burning_cloak_material(zmin, band):
    return hem_material("ME_cloak", PAL_EMBER["cloak"], PAL_EMBER["burn"], zmin, band)

def evaluated_zmin(o):
    """Lowest point after modifiers (subdivision / folds pull the hem well up)."""
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    z = min(v.co.z for v in me.vertices); ev.to_mesh_clear()
    return z

def tatter(cm, D, depth, seed, share=0.45):
    """Rip the cloak's hem: raise random bottom vertices."""
    random.seed(seed)
    for v in cm.data.vertices:
        if v.co.z < -D["H"] / 2 + 0.9:
            v.co.z += random.uniform(0, depth) * (1 if random.random() < share else 0.25)

def ember_mats():
    G = L["glow"]
    return dict(
        stone=flat("ME_stone", lin(PAL_EMBER["stone"]), 0.55, 1.25),
        trim=flat("ME_trim", lin(PAL_EMBER["trim"]), 0.6, 1.2),
        leg=flat("ME_leg", lin(PAL_EMBER["leg"]), 0.6, 1.4),
        flame=G("ME_flame", PAL_EMBER["flame"], 1.1),
        core=G("ME_core", PAL_EMBER["core"], 1.3),
        crack=G("ME_crack", PAL_EMBER["burn"], 2.0),
        eye=G("ME_eye", PAL_EMBER["eye"], 9.0),
        blade=G("ME_blade", PAL_EMBER["blade"], 1.6),
        ember=G("ME_ember", PAL_EMBER["spark"], 2.2),
    )

def on_helm(hx, hy, hz, x, z, lift=1.03):
    """Point on the camera-facing (-Y) side of the helm ellipsoid."""
    r = max(0.0, 1 - (x / hx) ** 2 - (z / hz) ** 2)
    return (x, -hy * math.sqrt(r) * lift, z)

# crown: (x along the helm, height, width, lean back in degrees), facing -X
CROWN = [(-1.25, 1.5, 0.42, -8), (-0.6, 2.3, 0.55, 4), (0.15, 3.0, 0.62, 14), (0.85, 2.4, 0.55, 24), (1.45, 1.6, 0.42, 34)]
# glowing cracks across the stone (helm-local x, z), drawn on the camera side
CRACKS = [
    [(-0.2, 1.6), (0.15, 1.1), (-0.05, 0.75), (0.3, 0.35)],
    [(0.9, 1.2), (0.65, 0.8), (0.95, 0.45)],
    [(1.35, -0.2), (1.0, -0.55), (1.2, -1.0)],
]

def k_ember(sc, head, D, M):
    hx, hy, hz = D["head"]
    E = ember_mats()
    # stone helm: slightly squared, rough surface
    helm = blob(sc, "H_Helm", head, (0, 0, 0.05), (hx * 1.02, hy, hz * 1.08), E["stone"], disp="MossBig", strength=0.12)
    plume = empty(sc, "H_Plume", head, (0.1, 0, hz * 0.85))
    for k, (x, h, w, lean) in enumerate(CROWN):
        a = math.radians(lean)
        tip = (x + math.sin(a) * h, 0, math.cos(a) * h)
        mid = (x + math.sin(a) * h * 0.55 + 0.15, 0, math.cos(a) * h * 0.55)
        f = L["curve_obj"](sc, f"H_Flame{k}", [(x, 0, -0.2), mid, tip], [1.0, 0.7, 0.02], w)
        f.parent = plume; L["assign"](f, E["flame"])
        c = L["curve_obj"](sc, f"H_FlameCore{k}", [(x, -0.25, -0.1), (mid[0], -0.25, mid[2] * 0.8), (tip[0] * 0.8 + x * 0.2, -0.25, tip[2] * 0.62)],
                           [1.0, 0.6, 0.02], w * 0.5)
        c.parent = plume; L["assign"](c, E["core"]); c.lineart.usage = "EXCLUDE"
    for k, path in enumerate(CRACKS):
        pts = [on_helm(hx * 1.02, hy, hz * 1.08, x, z) for x, z in path]
        cr = L["curve_obj"](sc, f"H_Crack{k}", pts, [0.6] + [1.0] * (len(pts) - 2) + [0.4], 0.07)
        cr.parent = head; L["assign"](cr, E["crack"]); cr.lineart.usage = "EXCLUDE"

def build_ember():
    _drop_old_materials()
    HEADS["fire"] = k_ember
    sc = build_kit("fire")
    O = SO(sc); E = ember_mats(); D = DIMS["fire"]
    # tattered, burning cloak: deeper rips in the hem, glowing edge
    cm = O["H_CloakMesh"]
    tatter(cm, D, 1.1, 11)
    L["assign"](cm, burning_cloak_material(evaluated_zmin(cm), 0.55))
    # body parts in the ember palette
    for name in ("H_Collar", "H_Guard"):
        L["assign"](O[name], E["trim"])
    for name in ("H_LegMeshN", "H_LegMeshF", "H_FootN", "H_FootF", "H_Arm", "H_HandMesh", "H_Hilt"):
        L["assign"](O[name], E["leg"])
    L["assign"](O["H_Blade"], E["blade"])
    # bigger, hotter eyes in the dark visor
    for k in range(2):
        e = O[f"H_Eye{k}"]; e.scale = tuple(s * 1.35 for s in e.scale); L["assign"](e, E["eye"])
    # embers drifting up around the body (placed per frame in pose_ember)
    for k in range(7):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
        o = bpy.context.active_object; o.name = f"H_Ember{k}"; o.parent = O["H_Body"]
        o.lineart.usage = "EXCLUDE"; L["assign"](o, E["ember"])
    EXTRA_POSE["fire"] = pose_ember
    element_fx(sc, "fire")  # skills_lib.py: cast orb, dash streaks, death burst in Ember's colours
    return sc

# embers: (x offset, start height, drift, size) in body space, facing -X
EMBERS = [(1.6, 0.6, 0.5, 0.11), (-1.3, 1.4, -0.4, 0.09), (2.1, 2.6, 0.3, 0.07), (-1.9, 3.2, 0.6, 0.1),
          (0.9, 4.6, -0.5, 0.08), (2.6, 4.0, 0.2, 0.06), (-0.6, 5.6, 0.4, 0.07)]

def pose_ember(sc, P):
    kit_extra(sc, P)
    O = SO(sc); t = P["t"]; D = DIMS["fire"]
    for k in range(len(CROWN)):  # flames flicker, each out of step with the next
        s = 1 + 0.14 * math.sin(t * 3 + k * 1.7)
        O[f"H_Flame{k}"].scale = (1, 1, s)
        O[f"H_FlameCore{k}"].scale = (1, 1, 1 + 0.2 * math.sin(t * 3 + k * 1.7 + 0.8))
    rise = (t / (2 * math.pi)) * 2.2
    for k, (x, z0, drift, size) in enumerate(EMBERS):
        o = O[f"H_Ember{k}"]
        z = (z0 + rise) % (D["H"] + 3.2) + 0.4
        o.location = (x + drift * math.sin(t + k), -1.4, z)
        fade = 1 - max(0.0, (z - D["H"]) / 3.6)
        s = size * max(0.35, fade); o.scale = (s, s, s)

def render_ember(raw_dir, only=None):
    L["RAW_ROOT"] = raw_dir
    sc = bpy.data.scenes["Kit_fire"]
    for anim, n, w in ANIMS_SPEC:
        if only and anim not in only: continue
        render_kit(sc, "fire", anim, n, w)
