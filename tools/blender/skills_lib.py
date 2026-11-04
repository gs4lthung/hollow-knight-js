# Skill effects and shared hero FX in the look of the redesigned element heroes
# (ember_lib.py / elements_lib.py). The motion of each skill (timing, paths, canvas
# size the game expects) comes from hero_skills.py; this restyles what you see.
#
#   H = {}
#   for t in ("hero_lib.py", "kit_lib.py", "ember_lib.py", "elements_lib.py", "skills_lib.py"): exec(source_of(t), H)
#   H["restyle_skill"](el, raw_dir)   # rebuilds Skill_<el> and renders its 8 frames
#   element_fx() is called by build_ember / build_element for the cast orb, dash streaks and death burst.

def palette_mats(el):
    """The new hero's materials, by role, for any element (fire included)."""
    if el == "fire":
        E = ember_mats()
        return dict(glow=E["flame"], hot=E["core"], spark=E["ember"], dark=E["trim"], shell=E["stone"])
    M = elem_mats(el)
    hot = dict(earth="line", water="mote", wind="line")[el]  # coloured, not the near-white foam / tips
    return dict(M, hot=M[hot], spark=M["line"], dark=M["trim"])

def soft_glow(el, mat, strength):
    em = next(n for n in mat.node_tree.nodes if n.type == "EMISSION")
    return L["glow"](f"MX_{el}_soft", tuple(em.inputs[0].default_value)[:3], strength)

def element_fx(sc, el):
    """Pre-builds the cast orb, dash streaks and death burst bits with the hero's own
    materials (fx() only creates them when missing, with the old kit colours)."""
    bpy.context.window.scene = sc  # bpy.ops adds objects to the window's scene
    P = palette_mats(el)
    for o in list(sc.objects):
        if o.name.startswith("FX_"): bpy.data.objects.remove(o, do_unlink=True)
    # orb: hot core inside a softer, rough glow shell
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
    orb = bpy.context.active_object; orb.name = "FX_Orb"; orb.lineart.usage = "EXCLUDE"
    L["assign"](orb, soft_glow(el, P["hot"], 1.1))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.45)
    halo = bpy.context.active_object; halo.name = "FX_OrbHalo"; halo.parent = orb; halo.lineart.usage = "EXCLUDE"
    L["assign"](halo, P["glow"])
    d = halo.modifiers.new("D", "DISPLACE"); d.texture = bpy.data.textures["MossBig"]; d.strength = 0.45
    for k in range(5):
        c = L["curve_obj"](sc, f"FX_Streak{k}", [(0, 0, 0), (0.5, 0, 0.05), (1.0, 0, 0)], [1, 0.6, 0.1], 0.14)
        L["assign"](c, P["glow"] if k % 2 else P["spark"]); c.lineart.usage = "EXCLUDE"
    for k in range(12):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
        o = bpy.context.active_object; o.name = f"FX_Burst{k}"; L["assign"](o, P["glow"] if k % 3 else P["dark"])
    for o in sc.objects:
        if o.name.startswith("FX_"): o.hide_render = o.hide_viewport = True

def restyle(sc, el):
    O = SO(sc); P = palette_mats(el)
    def each(prefix, mat):
        for o in sc.objects:
            if base(o).startswith(prefix): L["assign"](o, mat)
    if el == "fire":     # molten-rock meteor wrapped in Ember's flames
        E = ember_mats()
        each("S_Outer", E["flame"]); each("S_Mid", E["stone"]); each("S_Core", E["core"])
        O["S_Mid"].lineart.usage = "INHERIT"
        for k, mat in enumerate((E["flame"], E["core"], E["ember"])): L["assign"](O[f"S_Trail{k}"], mat)
        for k in range(8): L["assign"](O[f"S_Ember{k}"], E["core"] if k % 2 else E["ember"])
    elif el == "earth":  # Bastion's stone with glowing crystal veins
        M = elem_mats("earth")
        each("S_Spike", M["shell"])
        for k in range(len(SPIKES)): L["assign"](O[f"S_SpikeMoss{k}"], M["glow"])
        for k in range(14): L["assign"](O[f"S_Chunk{k}"], M["glow"] if k % 3 == 0 else M["shell"])
        each("S_Dust", M["moss"])
    elif el == "water":  # Tide's colours: aqua wave, deep body, glowing foam
        M = elem_mats("water")
        deep = flat("MX_water_deep", lin(ELEM["water"]["cloak"]), 0.55, 1.3)
        for side in (-1, 1):
            L["assign"](O[f"S_Wave{side}"], M["shell"]); L["assign"](O[f"S_Body{side}"], deep)
        each("S_Foam", M["foam"]); each("S_Bubble", M["foam"]); each("S_Spark", M["mote"])
    else:                # Zephyr's jade tornado with glowing gusts
        M = elem_mats("wind")
        for k in range(9): L["assign"](O[f"S_Ring{k}"], M["shell"] if k % 2 else M["trim"])
        each("S_Leaf", M["mote"])
        for k in range(4): L["assign"](O[f"S_Gust{k}"], M["glow"] if k % 2 else M["tip"])

def restyle_skill(el, raw_dir):
    S = {}; exec(bpy.data.texts["hero_skills.py"].as_string(), S)
    globals()["SPIKES"] = S["SPIKES"]
    sc = S[el + "_build"]()   # new_scene() clears and rebuilds Skill_<el>
    restyle(sc, el)
    L["RAW_ROOT"] = raw_dir
    S["L"]["RAW_ROOT"] = raw_dir
    w, h = S["SPEC"][el]
    for i in range(8):
        S[el + "_frame"](sc, i, 8)
        S["L"]["render"](sc, "skill_" + el, "skill", i + 1, w, h, h / 20)
