"""Check the Area 2 art against docs/area2-art-brief.md and build its manifest and review sheets.

  python tools/blender/area2_check.py

Fails (exit 1) if any folder has the wrong frame count, an animation mixes canvas sizes,
or a PNG is not RGBA. Writes assets/game/area2/manifest.json, preview_enemies.png,
preview_boss.png and lineup.png. The art itself is rendered in Blender from
tools/blender/wcl_art.blend and finished with finish_frames.py.
"""
import json
import os
import sys

from PIL import Image

PROJECT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ROOT = os.path.join(PROJECT, "assets", "game", "area2")
REL = "assets/game/area2"

# folder -> {anim: (frames, notes)}; facing as the game code expects it
ANIMS = {
    "enemies/mossling": dict(facing="left", anims={"walk": 4, "charge": 4, "die": 5}),
    "enemies/spore_drifter": dict(facing="left", anims={"fly": 5, "spit": 4, "die": 3}),
    "enemies/spore": dict(facing="any", anims={"fly": 3}),
    "boss": dict(facing="right", anims={"idle": 5, "walk": 6, "slash_prep": 4, "slash": 6, "leap": 6, "land": 3,
                                        "summon": 6, "stun": 10, "die": 1, "ghost_die": 4, "thorn": 8}),
}
LEVEL = {
    "background": (1339, 789), "boss_background": (1339, 789), "foreground": (3061, 1042),
    "floor_1": (285, 48), "floor_2": (233, 41), "floor_3": (301, 48), "floor_4": (285, 48),
    "floor_5": (288, 44), "floor_6": (341, 68), "platform": (275, 66),
    "gate_background": (591, 801), "gate": (574, 497), "gate_portal": (574, 497),
}
BG = (30, 36, 38, 255)


def check():
    problems, manifest = [], {"format": "<folder>/<anim>/<anim>_NN.png (NN from 01), RGBA; see docs/area2-art-brief.md",
                              "source": "tools/blender/wcl_art.blend (scenes Mossling, SporeDrifter, Spore, Warden, "
                                        "WardenGhost, Thorn, GroveBG, GroveFG, GroveTiles, GroveGate)",
                              "animations": {}, "level": {}}
    for folder, spec in ANIMS.items():
        for anim, count in spec["anims"].items():
            d = os.path.join(ROOT, folder, anim)
            files = sorted(f for f in os.listdir(d) if f.endswith(".png")) if os.path.isdir(d) else []
            want = [f"{anim}_{i:02d}.png" for i in range(1, count + 1)]
            if files != want:
                problems.append(f"{folder}/{anim}: expected {want[0]}..{want[-1]} ({count}), found {len(files)}")
            sizes, modes = set(), set()
            for f in files:
                im = Image.open(os.path.join(d, f))
                sizes.add(im.size); modes.add(im.mode)
            if len(sizes) > 1:
                problems.append(f"{folder}/{anim}: mixed canvas sizes {sorted(sizes)}")
            if modes - {"RGBA"}:
                problems.append(f"{folder}/{anim}: not RGBA ({modes})")
            w, h = next(iter(sizes)) if sizes else (0, 0)
            manifest["animations"][f"{folder}/{anim}"] = dict(frames=len(files), expected=count, width=w, height=h,
                                                             facing=spec["facing"], path=f"{REL}/{folder}/{anim}/{anim}_NN.png")
    for name, size in LEVEL.items():
        p = os.path.join(ROOT, "level", name + ".png")
        if not os.path.exists(p):
            problems.append(f"level/{name}.png missing")
            continue
        im = Image.open(p)
        if im.mode != "RGBA":
            problems.append(f"level/{name}.png: not RGBA ({im.mode})")
        if im.size != size:
            problems.append(f"level/{name}.png: size {im.size}, expected {size}")
        manifest["level"][name] = dict(width=im.size[0], height=im.size[1], path=f"{REL}/level/{name}.png")
    with open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return problems


def frames(folder, anim):
    d = os.path.join(ROOT, folder, anim)
    return [Image.open(os.path.join(d, f)).convert("RGBA") for f in sorted(os.listdir(d)) if f.endswith(".png")]


def sheet(rows, out, scale=1.0, pad=8):
    rows = [[im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS) for im in r] for r in rows]
    W = max(sum(i.width + pad for i in r) for r in rows) + pad
    H = sum(max(i.height for i in r) + pad for r in rows) + pad
    canvas = Image.new("RGBA", (W, H), BG)
    y = pad
    for r in rows:
        x, rh = pad, max(i.height for i in r)
        for im in r:
            cell = Image.new("RGBA", im.size, (42, 50, 52, 255)); cell.alpha_composite(im)
            canvas.alpha_composite(cell, (x, y + rh - im.height))
            x += im.width + pad
        y += rh + pad
    canvas.save(out)


def previews():
    sheet([frames(f, a) for f, a in (("enemies/mossling", "walk"), ("enemies/mossling", "charge"), ("enemies/mossling", "die"),
                                     ("enemies/spore_drifter", "fly"), ("enemies/spore_drifter", "spit"),
                                     ("enemies/spore_drifter", "die"), ("enemies/spore", "fly"))],
          os.path.join(ROOT, "preview_enemies.png"))
    sheet([frames("boss", a) for a in ANIMS["boss"]["anims"]], os.path.join(ROOT, "preview_boss.png"), scale=0.35)
    game = os.path.join(PROJECT, "assets", "game")
    pairs = [Image.open(os.path.join(game, p)).convert("RGBA") for p in
             ("crawlid/walk/crawlid_01.png", "area2/enemies/mossling/walk/walk_01.png",
              "boofly/fly/fly_01.png", "area2/enemies/spore_drifter/fly/fly_01.png",
              "boss/idle/idle_01.png", "area2/boss/idle/idle_01.png")]
    sheet([pairs], os.path.join(ROOT, "lineup.png"))  # 1:1 pixels, bottom aligned


if __name__ == "__main__":
    found = check()
    previews()
    for p in found:
        print("FAIL", p)
    print("problems:", len(found))
    sys.exit(1 if found else 0)
