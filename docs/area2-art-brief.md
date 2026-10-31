# Art brief: Area 2 "Sunken Grove", new enemies and a second boss

Goal: a second area for WCL Knights. After the False Knight falls, a gate opens to
the **Sunken Grove**: a flooded, mossy cavern with two new enemies and a new boss,
the **Grove Warden**. The game code will be written against the exact layout below,
so new art drops in without code changes.

## Style (most important)

Everything must look like it belongs next to the existing art. Before drawing,
open and study:

| Look at | Why |
|---|---|
| `assets/game/crawlid/walk/crawlid_01.png`, `assets/game/boofly/fly/fly_01.png` | enemy style and scale |
| `assets/game/boss/idle/idle_01.png`, `assets/game/boss/attack/attack_01.png` | boss style, pose, canvas size |
| `assets/game/object/background_2.png`, `assets/game/foreground/foreground.png` | level backdrop and front layer |
| `assets/game/object/floor_1.png` … `floor_6.png`, `assets/game/platform/platform.png` | ground and platforms |
| `assets/game/boss_door/boss_door_1.png` … `_3.png` | boss gate set |

The base game is **hand-painted 2D**: soft painted shading, thin dark outlines of
varying weight, muted dark palette, simple readable silhouettes, creatures with
pale masks/shells and dark bodies. Not flat vector fills, not 3D-looking renders.

**Sunken Grove palette:** deep teal and green-black, moss green highlights, soft
cyan glow from spores and water, pale bone-white masks. Keep it as dark as the
first area; glows are small accents.

## Facing and canvas rules (the game code depends on these)

- **Small enemies face LEFT** in the files (like the crawlid and boofly).
- **The boss faces RIGHT** in the files (like the False Knight: see `boss/jump/jump_04.png`,
  it leaps to the right with the mace trailing behind).
- The game mirrors them when they turn around.
- Transparent PNG (RGBA). Every frame of one animation uses the **same canvas size**.
- Ground creatures: feet on the bottom edge of the canvas. Nothing clipped.
- Frame files: `<anim>_NN.png`, numbered from `01`.
- Scale: draw at roughly the same pixel size as the reference creature listed
  for each item, so they read correctly next to the knights in game.

## 1. Level art: `assets/game/area2/level/`

| File | Size (px) | Notes |
|---|---|---|
| `background.png` | 1339 x 789 | main backdrop of the Grove (same role/size as `object/background_2.png`): dark cavern wall, roots, hanging moss, a few glowing spores |
| `boss_background.png` | 1339 x 789 | the Warden's arena backdrop (same role as `object/background_1.png`) |
| `foreground.png` | 3061 x 1042 | transparent front silhouettes (roots, ferns, rocks) along the bottom and edges, like `foreground/foreground.png` |
| `floor_1.png` … `floor_6.png` | about 230–340 x 40–70 each | ground tiles: mossy stone with shallow water, like `object/floor_N.png` |
| `platform.png` | 275 x 66 | floating root/stone ledge, like `platform/platform.png` |
| `gate_background.png` | 591 x 801 | arch around the Warden's gate (like `boss_door_1.png`) |
| `gate.png` | 574 x 497 | the closed gate: a curtain of roots/vines (like `boss_door_2.png`) |
| `gate_portal.png` | 574 x 497 | glowing teal opening shown when the gate opens (like `boss_door_3.png`) |

## 2. Enemies: `assets/game/area2/enemies/<name>/<anim>/<anim>_NN.png`

### Mossling: ground charger (reference: crawlid, about 120 x 85). Folder: `enemies/mossling/`
A small beetle covered in moss with a hard pale head plate. Walks slowly, then
lowers its head and charges.

| anim | frames | notes |
|---|---|---|
| `walk` | 4 | slow loop |
| `charge` | 4 | head down, legs blurred, fast loop |
| `die` | 5 | flips over, moss falls off; last frame lying still |

### Spore Drifter: flying shooter (reference: boofly, about 116 x 136). Folder: `enemies/spore_drifter/`
A floating puffball creature with small wings and a pale mask. Hovers and puffs
spores at the knights.

| anim | frames | notes |
|---|---|---|
| `fly` | 5 | hovering loop |
| `spit` | 4 | inflates, then puffs; the shot leaves on frame 3 |
| `die` | 3 | deflates and drops |

Projectile: `assets/game/area2/enemies/spore/fly/fly_NN.png`, **3 frames, 48 x 48**,
a glowing teal spore ball, looping.

## 3. Boss: Grove Warden: `assets/game/area2/boss/<anim>/<anim>_NN.png`

A tall, thin guardian (mantis/moth-like knight) wrapped in a mossy cloak, with a pale
horned mask and a long thorn glaive. It should feel like a different fight from the
round, heavy False Knight: **tall, fast, agile**. Canvas about **600 x 600** per
frame (False Knight frames are 550–620 wide), feet at the bottom, **facing right**
(like the False Knight).

| anim | frames | notes |
|---|---|---|
| `idle` | 5 | breathing, glaive held low |
| `walk` | 6 | stalking forward |
| `slash_prep` | 4 | raises the glaive behind its head |
| `slash` | 6 | wide horizontal sweep; hit lands on frames 3–4 |
| `leap` | 6 | crouch, jump, airborne (last frame held in the air) |
| `land` | 3 | lands with glaive stabbed down |
| `summon` | 6 | plants the glaive; thorns rise from the ground |
| `stun` | 10 | knocked down, mask exposed; last frames held on the ground |
| `die` | 1 | collapsed |
| `ghost_die` | 4 | its spirit leaving, about 275 x 202 (like `boss/ghost_die`) |

Boss attack effect: `assets/game/area2/boss/thorn/thorn_NN.png`, **8 frames,
120 x 260**, a thorn spike bursting up from the ground and retracting (plays once,
base on the bottom edge). Direction doesn't matter (it points straight up).

## 4. Deliverables and checks

1. All files above, in exactly these folders and names.
2. `assets/game/area2/manifest.json`: for every animation and image, its frame count
   and canvas size (same idea as `assets/game/heroes/manifest.json`).
3. Contact sheets for review:
   - `assets/game/area2/preview_enemies.png`: every enemy animation and the spore.
   - `assets/game/area2/preview_boss.png`: every boss animation and the thorn.
   - `assets/game/area2/lineup.png`: Mossling and Spore Drifter next to the
     crawlid and boofly, and the Warden next to the False Knight's idle frame,
     **all at the same scale**. Look at it: same world? Right relative sizes?
4. A script check that every folder has exactly the frame count above, all frames
   in an animation share one canvas size, and every PNG is RGBA.

## Suggested approach

Same lessons as the hero art (`docs/hero-art-brief.md`): painted 2D is hard to get
from simple 3D primitives. In order of preference:
1. Paint in 2D, using the existing creatures as reference images; deriving from
   existing frames (repaint, recolour, reshape) is fine and keeps the style.
2. Blender Grease Pencil drawn over reference images, rendered with a transparent
   background.
3. 3D only with a painterly look (soft shading, textured strokes, hand-drawn
   outlines), never flat fills.

Do one item first (for example the Mossling) and get it approved before the rest.

## Not part of the art task

Gameplay code (area transition, enemy AI, the Warden's attack patterns, spawning,
co-op scaling, sounds) will be written separately from these files. No `.js`,
`.html` or `.css` edits needed for the art.
