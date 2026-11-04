# Bastion (earth), Tide (water) and Zephyr (wind), redesigned in the same style as
# Ember (ember_lib.py): an elemental helm with a living crown, glowing eyes, a cloak
# whose hem glows in the element's colour, an elemental blade and particles drifting
# around the body. Built on the shared hero kit's rig and poses (kit_lib.py).
#
#   H = {}
#   for t in ("hero_lib.py", "kit_lib.py", "ember_lib.py", "elements_lib.py"): exec(source_of(t), H)
#   H["build_element"]("earth")            # (re)builds the Kit_earth scene
#   H["render_element"]("earth", raw_dir)  # renders every animation, supersampled
# then finish the frames (see assets/game/heroes/manifest.json "regenerate").

# 0-255 sRGB for the flat toon colours; linear 0-1 for the emissive ones
ELEM = dict(
    earth=dict(
        shell=(112, 94, 72), moss=(74, 100, 46), cloak=(70, 54, 36), trim=(92, 108, 44), leg=(34, 28, 22),
        edge=(0.45, 0.95, 0.18), glow=(0.5, 1.0, 0.22), eye=(0.62, 1.0, 0.25), blade=(0.4, 0.9, 0.2),
        mote=(118, 104, 88),
    ),
    water=dict(
        shell=(64, 146, 196), cloak=(26, 42, 92), trim=(40, 150, 176), leg=(18, 24, 44),
        edge=(0.35, 0.9, 1.0), glow=(0.15, 0.65, 1.0), foam=(0.8, 1.0, 1.0), eye=(0.35, 0.95, 1.0), blade=(0.2, 0.75, 1.0),
        mote=(0.3, 0.85, 1.0),
    ),
    wind=dict(
        shell=(178, 220, 196), cloak=(44, 86, 76), trim=(84, 160, 132), leg=(22, 40, 36),
        edge=(0.5, 1.0, 0.75), glow=(0.45, 1.0, 0.7), tip=(0.9, 1.0, 0.95), eye=(0.55, 1.0, 0.8), blade=(0.45, 1.0, 0.7),
        mote=(96, 176, 104),
    ),
)

def elem_mats(el):
    p, G = ELEM[el], L["glow"]
    m = dict(
        shell=flat(f"MX_{el}_shell", lin(p["shell"]), 0.55, 1.2),
        trim=flat(f"MX_{el}_trim", lin(p["trim"]), 0.6, 1.2),
        leg=flat(f"MX_{el}_leg", lin(p["leg"]), 0.6, 1.4),
        glow=G(f"MX_{el}_glow", p["glow"], 1.3),
        line=G(f"MX_{el}_line", p["edge"], 2.0),
        eye=G(f"MX_{el}_eye", p["eye"], 8.0),
        blade=G(f"MX_{el}_blade", p["blade"], 1.4),
    )
    if el == "earth":
        m["moss"] = flat("MX_earth_moss", lin(p["moss"]), 0.55, 1.25)
        m["mote"] = flat("MX_earth_mote", lin(p["mote"]), 0.55, 1.2)
    if el == "water":
        m["foam"] = G("MX_water_foam", p["foam"], 1.6)
        m["mote"] = G("MX_water_mote", p["mote"], 1.8)
    if el == "wind":
        m["tip"] = G("MX_wind_tip", p["tip"], 1.6)
        m["mote"] = flat("MX_wind_mote", lin(p["mote"]), 0.55, 1.25)
    return m

def _drop_materials(el):
    for m in list(bpy.data.materials):
        if m.name.startswith((f"MK_{el}_", f"MX_{el}_")):
            bpy.data.materials.remove(m)

def glow_lines(sc, head, D, mat, paths, name, lift=1.04, bevel=0.06):
    """Glowing lines drawn on the camera side of the helm (cracks, swirls)."""
    hx, hy, hz = D["head"]
    for k, path in enumerate(paths):
        pts = [on_helm(hx, hy, hz, x, z, lift) for x, z in path]
        c = L["curve_obj"](sc, f"{name}{k}", pts, [0.5] + [1.0] * (len(pts) - 2) + [0.4], bevel)
        c.parent = head; L["assign"](c, mat); c.lineart.usage = "EXCLUDE"

# ---------------- Bastion: mossy boulder helm, crown of glowing crystals ----------------
CRYSTALS = [(-1.1, 1.8, 0.55, -14), (-0.25, 3.0, 0.72, 2), (0.65, 2.3, 0.62, 18), (1.4, 1.5, 0.48, 32)]

def head_earth(sc, head, D, M):
    hx, hy, hz = D["head"]
    blob(sc, "H_Helm", head, (0, 0, 0), (hx, hy, hz), M["shell"], disp="MossBig", strength=0.32)
    blob(sc, "H_Moss", head, (0.15, 0, hz * 0.52), (hx * 0.92, hy * 0.92, hz * 0.5), M["moss"], disp="MossBig", strength=0.25)
    plume = empty(sc, "H_Plume", head, (0.1, 0, hz * 0.8))
    for k, (x, h, r, lean) in enumerate(CRYSTALS):
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=r, radius2=0.02, depth=h)
        c = bpy.context.active_object; c.name = f"H_Crystal{k}"; c.parent = plume
        c.location = (x + math.sin(math.radians(lean)) * h / 2, 0, h / 2 - 0.2)
        c.rotation_euler = (0, math.radians(lean), math.radians(30 * k))
        L["assign"](c, M["glow"])
    glow_lines(sc, head, D, M["line"], [[(-0.3, 0.6), (0.1, 0.15), (-0.1, -0.35), (0.25, -0.8)], [(1.2, 0.3), (0.95, -0.15), (1.25, -0.6)]], "H_Crack")

# ---------------- Tide: droplet helm, crown of a curling wave ----------------
def head_water(sc, head, D, M):
    hx, hy, hz = D["head"]
    o = blob(sc, "H_Helm", head, (0, 0, 0), (1, 1, 1), M["shell"])
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:  # draw the top up into a droplet point that leans back
        if v.co.z > 0:
            k = v.co.z ** 2
            v.co.x = v.co.x * (1 - 0.55 * k) + 0.35 * k
            v.co.y *= 1 - 0.55 * k
            v.co.z *= 1 + 0.45 * k
    bm.to_mesh(o.data); bm.free(); o.scale = (hx, hy, hz)
    plume = empty(sc, "H_Plume", head, (0.2, 0, hz * 0.55))
    # the wave rises up the back, curls over to the front and breaks into foam
    wave = [(1.4, 0, -0.3), (1.2, 0, 1.2), (0.3, 0, 2.3), (-0.8, 0, 2.2), (-1.3, 0, 1.5), (-0.9, 0, 1.1)]
    w = L["curve_obj"](sc, "H_Wave", wave, [1.0, 1.0, 0.9, 0.7, 0.45, 0.1], 0.72); w.parent = plume; L["assign"](w, M["glow"])
    foam = [(0.1, -0.3, 2.45), (-0.8, -0.3, 2.4), (-1.45, -0.3, 1.7), (-1.15, -0.3, 1.3)]
    f = L["curve_obj"](sc, "H_Foam", foam, [0.8, 0.9, 0.6, 0.1], 0.34); f.parent = plume; L["assign"](f, M["foam"])
    glow_lines(sc, head, D, M["line"], [[(-0.6, 0.9), (-0.2, 0.55), (0.2, 0.75)], [(0.9, 0.2), (1.2, -0.25)]], "H_Shine", bevel=0.05)

# ---------------- Zephyr: jade helm with glowing swirls, streaming wind ribbons ----------------
RIBBONS = [(0.9, 4.2, 0.55), (0.3, 3.6, 0.46), (-0.3, 3.0, 0.4)]  # (height on helm, length, width)

def ribbon_points(k, t):
    dz, ln, _ = RIBBONS[k]
    pts = []
    for j in range(6):
        u = j / 5
        wave = 0.35 * u * math.sin(t * 2 + u * 4 + k * 1.3)
        pts.append((0.3 + u * ln, 0.2 * k, dz + 0.5 * u + wave))
    return pts

def head_wind(sc, head, D, M):
    hx, hy, hz = D["head"]
    blob(sc, "H_Helm", head, (0, 0, 0.05), (hx, hy, hz * 1.05), M["shell"])
    plume = empty(sc, "H_Plume", head, (0.5, 0, hz * 0.35))
    for k, (_, _, w) in enumerate(RIBBONS):
        r = L["curve_obj"](sc, f"H_Ribbon{k}", ribbon_points(k, 0), [1.0, 0.95, 0.85, 0.7, 0.5, 0.05], w)
        r.parent = plume; r.scale = (1, 0.55, 1); L["assign"](r, M["glow"] if k != 1 else M["tip"])
        r.data.bevel_resolution = 1
    swirl = [(-1.2 + 0.35 * math.cos(a) * (1 - a / 9) , 0.7 + 0.35 * math.sin(a) * (1 - a / 9)) for a in [i * 0.9 for i in range(8)]]
    glow_lines(sc, head, D, M["line"], [swirl, [(0.4, 1.0), (0.9, 0.7), (1.3, 0.85)], [(0.6, -0.6), (1.1, -0.9)]], "H_Swirl", bevel=0.055)

HEAD_BUILDERS = dict(earth=head_earth, water=head_water, wind=head_wind)
HEM = dict(earth=(0.9, 0.55, 1.2, 2.2), water=(0.8, 0.5, 2.0, 3.4), wind=(1.2, 0.55, 1.6, 2.6))  # tatter depth, band, hot, noise scale
# drifting particles around the body: (x, start height, drift, size) in body space, facing -X
MOTES = [(1.7, 0.8, 0.4, 1.0), (-1.5, 1.6, -0.4, 0.8), (2.2, 2.8, 0.3, 0.7), (-2.0, 3.3, 0.5, 0.9),
         (1.0, 4.5, -0.5, 0.75), (2.6, 4.1, 0.2, 0.6)]

def build_element(el):
    _drop_materials(el)
    M = elem_mats(el)
    HEADS[el] = lambda sc, head, D, _M: HEAD_BUILDERS[el](sc, head, D, M)
    sc = build_kit(el)
    O = SO(sc); D = DIMS[el]; p = ELEM[el]
    depth, band, hot, scale = HEM[el]
    cm = O["H_CloakMesh"]
    tatter(cm, D, depth, {"earth": 21, "water": 31, "wind": 41}[el])
    L["assign"](cm, hem_material(f"MX_{el}_cloak", p["cloak"], p["edge"], evaluated_zmin(cm), band, hot, scale))
    for name in ("H_Collar", "H_Guard"):
        L["assign"](O[name], M["trim"])
    for name in ("H_LegMeshN", "H_LegMeshF", "H_FootN", "H_FootF", "H_Arm", "H_HandMesh", "H_Hilt"):
        L["assign"](O[name], M["leg"])
    L["assign"](O["H_Blade"], M["blade"])
    for k in range(2):
        e = O[f"H_Eye{k}"]; e.scale = tuple(s * 1.3 for s in e.scale); L["assign"](e, M["eye"])
    for k in range(len(MOTES)):
        if el == "earth":    # little pebbles
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
        elif el == "water":  # droplets
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1)
        else:                # leaves
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1)
        o = bpy.context.active_object; o.name = f"H_Mote{k}"; o.parent = O["H_Body"]
        L["assign"](o, M["mote"])
        if el != "earth": o.lineart.usage = "EXCLUDE" if el == "water" else "INHERIT"
    EXTRA_POSE[el] = lambda sc, P: pose_element(sc, el, P)
    element_fx(sc, el)  # skills_lib.py: cast orb, dash streaks, death burst in the hero's colours
    return sc

def pose_element(sc, el, P):
    kit_extra(sc, P)
    O = SO(sc); t = P["t"]; D = DIMS[el]
    if el == "earth":
        for k in range(len(CRYSTALS)):  # crystals pulse
            s = 1 + 0.06 * math.sin(t * 2 + k * 1.4)
            O[f"H_Crystal{k}"].scale = (s, s, s)
    elif el == "water":
        fall = 0.6 if P["burst"] else 1.0  # the wave collapses as Tide falls
        O["H_Wave"].scale = (fall, fall, fall * (1 + 0.06 * math.sin(t * 2)))
        O["H_Foam"].scale = (fall * (1 + 0.08 * math.sin(t * 3 + 1)), fall, fall)
    else:
        for k in range(len(RIBBONS)):
            L["set_points"](O[f"H_Ribbon{k}"], ribbon_points(k, t))
    for k, (x, z0, drift, size) in enumerate(MOTES):
        o = O[f"H_Mote{k}"]
        # fallen (death burst): the burst takes over, and the motes would spill off the canvas
        o.hide_render = o.hide_viewport = bool(P["burst"])
        if el == "earth":    # pebbles bob in place, slowly turning
            z = z0 + 0.25 * math.sin(t + k * 1.1) + 0.6
            o.location = (x * 1.05, -1.4, z); s = 0.13 * size; o.scale = (s, s * 0.85, s * 0.8)
            o.rotation_euler = (t + k, t * 0.5, k)
        elif el == "water":  # droplets rise and fade
            z = (z0 + t / (2 * math.pi) * 2.0) % (D["H"] + 2.8) + 0.4
            o.location = (x + drift * math.sin(t + k), -1.4, z)
            fade = 1 - max(0.0, (z - D["H"]) / 3.2); s = 0.11 * size * max(0.35, fade); o.scale = (s * 0.8, s * 0.8, s * 1.25)
        else:                # leaves swirl around the body
            a = t + k * (2 * math.pi / len(MOTES))
            o.location = (math.cos(a) * 2.4, -1.4 if math.sin(a) < 0 else 1.4, z0 * 0.8 + 0.6 + 0.4 * math.sin(a * 2))
            s = 0.2 * size; o.scale = (s, s * 0.3, s * 0.55); o.rotation_euler = (0, a * 2, 0)

# Extra sideways nudge (old px, + = towards the front) for frames whose crown would
# otherwise poke out of the canvas: Tide's wave when dashing / falling, Zephyr's
# ribbons trailing behind in the attack wind-up
NUDGE = {("water", "dash", 2): -8, ("water", "dead", 3): -7, ("water", "dead", 4): 2, ("wind", "attack", 1): 6}

def render_element(el, raw_dir, only=None, frames=None):
    """Renders like render_kit (same per-animation offsets), plus NUDGE."""
    L["RAW_ROOT"] = raw_dir
    sc = bpy.data.scenes[f"Kit_{el}"]
    for anim, n, w in ANIMS_SPEC:
        if only and anim not in only: continue
        for i, P in enumerate(anim_poses(CHARS[el], anim, n), start=1):
            if frames and (anim, i) not in frames: continue
            if anim == "dead":
                P = dict(P, x=P["x"] - (4, 16, 20, 30)[i - 1], burst=min(P["burst"], 0.6))
                if P["weaponDrop"]: P["weaponDrop"] = (80,) + tuple(P["weaponDrop"][1:])
            if anim == "dash": P = dict(P, x=P["x"] - 16)
            if anim in ("attack", "attack2") and el == "water": P = dict(P, x=P["x"] - 6)  # longer arm
            P = dict(P, x=P["x"] + NUDGE.get((el, anim, i), 0))
            pose(sc, el, P, w)
            L["render"](sc, "kit_" + el, anim, i, w, 150, 7.5)
