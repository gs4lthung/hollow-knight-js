# Hero art brief: 4 elemental knights for WCL Knights

Goal: four new playable characters (fire, earth, water, wind) that look like they
belong in the same world as the original knight in `assets/game/hero/`.

## Why the first attempt didn't fit

`tools/blender/hero_sprites.py` built the heroes from flat 3D primitives with a
toon outline. The result is clean "vector cartoon", but the base game is
**hand-painted 2D**: the knight has
- a big white mask with black eye holes and horns,
- a small dark cloak with soft painted shading (not flat fills),
- thin dark outlines that vary in weight, slightly rough edges,
- a muted, dark palette, with the white mask as the brightest thing on screen,
- a lot of motion in the cloak; the body stays simple.

Open a few frames to see it: `assets/game/hero/idle/idle_01.png`, `walk/walk_03.png`,
`attack/attack_01.png`, `jump/jump_05.png`.

## Design direction (keep the knight's DNA)

Every hero keeps: white/pale mask with black eyes, horns, small dark cloaked body,
a nail-like weapon. Element shows through **horn shape, cloak colour/tint, a glow
accent and small details**, not through a completely new character style.
Body shape changes:

| Element | Body | Mask / horns | Cloak | Accent |
|---|---|---|---|---|
| fire | short, stocky | horns shaped like flame tongues | deep red-black | ember glow in eyes, sparks |
| earth | wide, heavy | thick stubby horns, cracked stone mask | brown-black, mossy hem | moss, small stones on shoulders |
| water | tall, slender | long swept-back horns | deep blue, long flowing | foam-white hem, droplets |
| wind | small, light | leaf/feather-like horns | pale grey-green | trailing scarf, leaves |

Keep the palette dark and muted like the base; accents (glow/foam/sparks) small.

## Technical requirements (the game code depends on these exactly)

Output folder: `assets/game/heroes/<element>/<anim>/<anim>_NN.png` (NN = 01, 02, ...),
for element in `fire`, `earth`, `water`, `wind`. The existing files there can be
overwritten.

| anim folder | frames | canvas (px) |
|---|---|---|
| idle | 5 | 125 x 150 |
| walk | 8 | 125 x 150 |
| jump | 11 | 125 x 150 |
| attack | 2 | 125 x 150 |
| attack2 | 2 | 125 x 150 |
| dash | 2 | 187 x 150 |
| dead | 4 | 125 x 150 |
| blast (casting pose) | 2 | 125 x 150 |
| skill (effect) | 8 | see below |

- Transparent PNG (RGBA), facing **right**, feet on the bottom baseline like the
  originals; nothing clipped at the canvas edges.
- Pose sequence per animation should mirror the original knight's frames.
- jump: frames 01-07 take-off and rise, frame 08 is held while in the air,
  frames 09-11 landing.
- Skill effect frames (`skill/skill_NN.png`, 8 frames, facing right):
  fire fireball with trail 200x80 (loops), earth rock spikes from the ground
  250x200 (plays once), water healing wave 250x150 (plays once),
  wind tornado 200x200 (loops). Match the painted look of the base game's effects
  in `assets/game/particle/`.
- Frame counts/sizes are checked by the game loader; see
  `assets/game/heroes/manifest.json` (update it if anything changes) and
  `PLAYER_CONF` at the top of `js/game/facade/file.js`.

## Suggested approach

Painted 2D is hard to get from 3D primitives. Better options, roughly best first:
1. **Derive from the original knight frames**: take each original frame and
   repaint/recolour it per element (cloak tint, horn shape, accents), and change the
   body proportions by warping (squash for fire, widen for earth, stretch for water,
   shrink for wind). This keeps the poses and painted style automatically.
2. **Blender Grease Pencil** (2D drawing inside Blender) traced over the original
   frames as reference images, then rendered with transparent background.
3. 3D models only if rendered with a painterly/hand-drawn look (soft shading,
   textured strokes), never flat fills.

## Verify before finishing

- Build a side-by-side lineup with the original knight (idle frame) and look at it:
  same world, same style, each element obvious at small size (about 105x119 px in game).
- Script-check every folder: frame count, canvas size, RGBA, nothing touching edges.
- Make `assets/game/heroes/<element>/preview.png` contact sheets.

## Not part of the art task

The game code that uses these sprites (character select, stats, skills) is being
added separately; `js/game/heroes.js` holds the stats and skill settings. As long
as the files follow the layout above, new art drops in without code changes.
