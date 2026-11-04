"""Check the elemental hero sprites and rebuild their previews, lineup and manifest note.

  python tools/blender/heroes_check.py

The art is rendered in Blender from tools/blender/wcl_art.blend: the heroes share one body
(scenes Kit_<element>; kit_lib.py run after hero_lib.py, render_kit) and the skills come from
Skill_<element> (hero_skills.py). Animations are finished with finish_frames.py
(--settle-each --mirror --outline=2; jump with --ground instead of --settle-each). Fails (exit 1) on a wrong
frame count, canvas size or mode, a frame touching the left/right/top edge, or a hero
animation frame (other than jump) not standing on the bottom edge.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

PROJECT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ROOT = os.path.join(PROJECT, "assets", "game", "heroes")
ELEMENTS = ("fire", "earth", "water", "wind")
ANIMS = [("idle", 5, (125, 150)), ("walk", 8, (125, 150)), ("jump", 11, (125, 150)), ("attack", 2, (125, 150)),
         ("attack2", 2, (125, 150)), ("dash", 2, (187, 150)), ("dead", 4, (125, 150)), ("blast", 2, (125, 150))]
SKILL = {"fire": (200, 80), "earth": (250, 200), "water": (250, 150), "wind": (200, 200)}
BG = (30, 36, 38, 255)


def check_folder(el, anim, count, size, grounded):
    problems = []
    d = os.path.join(ROOT, el, anim)
    files = sorted(f for f in os.listdir(d) if f.endswith(".png")) if os.path.isdir(d) else []
    if files != [f"{anim}_{i:02d}.png" for i in range(1, count + 1)]:
        return [f"{el}/{anim}: expected {count} frames, found {len(files)}"]
    for f in files:
        im = Image.open(os.path.join(d, f))
        if im.size != size or im.mode != "RGBA":
            problems.append(f"{el}/{anim}/{f}: {im.size} {im.mode}, expected {size} RGBA")
            continue
        a = np.asarray(im)[..., 3] > 8
        if a[:, 0].any() or a[:, -1].any() or a[0].any():
            problems.append(f"{el}/{anim}/{f}: touches an edge")
        if grounded and not a[-3:].any():
            problems.append(f"{el}/{anim}/{f}: not on the baseline")
    return problems


def contact_sheet(el):
    rows = [[Image.open(os.path.join(ROOT, el, a, f"{a}_{i:02d}.png")).convert("RGBA") for i in range(1, n + 1)] for a, n, _ in ANIMS]
    rows.append([Image.open(os.path.join(ROOT, el, "skill", f"skill_{i:02d}.png")).convert("RGBA") for i in range(1, 9)])
    pad = 6
    W = max(sum(i.width + pad for i in r) for r in rows) + pad
    H = sum(max(i.height for i in r) + pad for r in rows) + pad
    sheet = Image.new("RGBA", (W, H), BG)
    y = pad
    for r in rows:
        x, rh = pad, max(i.height for i in r)
        for im in r:
            cell = Image.new("RGBA", im.size, (42, 50, 52, 255)); cell.alpha_composite(im)
            sheet.alpha_composite(cell, (x, y + rh - im.height))
            x += im.width + pad
        y += rh + pad
    sheet.save(os.path.join(ROOT, el, "preview.png"))


def lineup():
    files = [os.path.join(PROJECT, "assets", "game", "hero", "idle", "idle_01.png")] + \
            [os.path.join(ROOT, el, "idle", "idle_01.png") for el in ELEMENTS]
    ims = [Image.open(f).convert("RGBA") for f in files]
    sheet = Image.new("RGBA", (sum(i.width for i in ims), 150), BG)
    x = 0
    for im in ims:
        sheet.alpha_composite(im, (x, 150 - im.height)); x += im.width
    sheet.save(os.path.join(ROOT, "lineup.png"))


def update_manifest():
    path = os.path.join(ROOT, "manifest.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["regenerate"] = ("Open tools/blender/wcl_art.blend and exec, in one namespace, the texts hero_lib.py, kit_lib.py, "
                          "ember_lib.py, elements_lib.py and skills_lib.py (the last three are also in tools/blender/). "
                          "Heroes: build_ember() + render_ember(raw_dir) for fire, build_element(el) + render_element(el, raw_dir) "
                          "for earth / water / wind, then tools/blender/finish_frames.py --mirror --outline=2 "
                          "(--settle-each, or --ground for jump). Skills: restyle_skill(el, raw_dir), then finish_frames.py "
                          "with no flags. Finally tools/blender/heroes_check.py.")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    found = []
    for el in ELEMENTS:
        for anim, count, size in ANIMS:
            found += check_folder(el, anim, count, size, grounded=anim != "jump")
        found += check_folder(el, "skill", 8, SKILL[el], grounded=False)
        contact_sheet(el)
    lineup()
    update_manifest()
    for p in found:
        print("FAIL", p)
    print("problems:", len(found))
    sys.exit(1 if found else 0)
