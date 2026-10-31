import {
  BOSS_CONF,
  GET_BOOFLY_DIE,
  GET_BOOFLY_FLY,
  GET_BOSS_ATTACK_PREP_SPRITE,
  GET_BOSS_ATTACK_SPRITE,
  GET_BOSS_DIE_SPRITE,
  GET_BOSS_GHOST_SPRITE,
  GET_BOSS_IDLE_SPRITE,
  GET_BOSS_JUMP_SPRITE,
  GET_BOSS_LAND_SPRITE,
  GET_BOSS_STUN_SPRITE,
  GET_CRAWLID_DIE,
  GET_CRAWLID_WALK,
} from "./file.js";

// Area 2 (Sunken Grove) art, laid out as in docs/area2-art-brief.md.
// Any file that doesn't exist yet falls back to an existing sprite, and the
// frame list / image is marked `placeholder` so it can be drawn tinted.
const ROOT = "assets/game/area2";
// Shifts the first area's blue-violet towards the Grove's teal-green
export const PLACEHOLDER_FILTER = "hue-rotate(-65deg) saturate(1.3)";

const cache = new Map();

function loadImage(src, fallbackSrc, onFallback) {
  const img = new Image();
  img.onerror = () => {
    if (!fallbackSrc || img.dataset.fellBack) return;
    img.dataset.fellBack = "1";
    onFallback();
    img.src = fallbackSrc;
  };
  img.src = src;
  return img;
}

// <folder>/<anim>/<anim>_NN.png, falling back frame by frame to `fallback()`
function frames(key, folder, anim, count, fallback) {
  if (cache.has(key)) return cache.get(key);
  const list = [];
  const backup = fallback();
  for (let i = 1; i <= count; i++) {
    const src = `${folder}/${anim}/${anim}_${String(i).padStart(2, "0")}.png`;
    const fallbackSrc = backup[(i - 1) % backup.length].src;
    list.push(loadImage(src, fallbackSrc, () => (list.placeholder = true)));
  }
  cache.set(key, list);
  return list;
}

function single(name, fallbackSrc) {
  if (cache.has(name)) return cache.get(name);
  const img = loadImage(`${ROOT}/level/${name}.png`, fallbackSrc, () => (img.placeholder = true));
  cache.set(name, img);
  return img;
}

// ---- Level
export const A2_BACKGROUND = () => single("background", "assets/game/object/background_2.png");
export const A2_BOSS_BACKGROUND = () => single("boss_background", "assets/game/object/background_1.png");
export const A2_FOREGROUND = () => single("foreground", "assets/game/foreground/foreground.png");
export const A2_PLATFORM = () => [single("platform", "assets/game/platform/platform.png")];
const FLOOR_TILES = 6;
const floorTile = (n) => single(`floor_${n}`, "assets/game/object/floor_6.png");
export const A2_FLOOR = () => [floorTile(1 + Math.floor(Math.random() * FLOOR_TILES))];
// 1: gate background, 2: gate, 3: portal (same order as GET_BOSS_DOOR)
export const A2_GATE = (n) =>
  single(["gate_background", "gate", "gate_portal"][n - 1], `assets/game/boss_door/boss_door_${n}.png`);

// ---- Enemies (face left, like the crawlid)
const ENEMIES = `${ROOT}/enemies`;
export const MOSSLING_CONF = {
  walk: { max: 4, speed: 10 },
  charge: { max: 4, speed: 4 },
  die: { max: 5, speed: 3 },
};
export const MOSSLING_SPRITE = (anim) =>
  frames(`mossling/${anim}`, `${ENEMIES}/mossling`, anim, MOSSLING_CONF[anim].max, anim === "die" ? GET_CRAWLID_DIE : GET_CRAWLID_WALK);

export const DRIFTER_CONF = {
  fly: { max: 5, speed: 3 },
  spit: { max: 4, speed: 6 },
  die: { max: 3, speed: 10 },
};
export const DRIFTER_SPRITE = (anim) =>
  frames(`drifter/${anim}`, `${ENEMIES}/spore_drifter`, anim, DRIFTER_CONF[anim].max, anim === "die" ? GET_BOOFLY_DIE : GET_BOOFLY_FLY);

export const SPORE_CONF = { max: 3, speed: 5 };
export const SPORE_SPRITE = () =>
  frames("spore/fly", `${ENEMIES}/spore`, "fly", SPORE_CONF.max, () => [{ src: "assets/game/particle/blast_particle/blast_01.png" }]);

// ---- Boss (faces right, like the False Knight)
const BOSS = `${ROOT}/boss`;
export const WARDEN_CONF = {
  idle: { max: 5, speed: 7 },
  walk: { max: 6, speed: 6 },
  slash_prep: { max: 4, speed: 6 },
  slash: { max: 6, speed: 4 },
  leap: { max: 6, speed: 5 },
  land: { max: 3, speed: 5 },
  summon: { max: 6, speed: 5 },
  stun: { max: 10, speed: 5 },
  die: { max: 1, speed: 5 },
};
const WARDEN_FALLBACK = {
  idle: GET_BOSS_IDLE_SPRITE,
  walk: GET_BOSS_IDLE_SPRITE,
  slash_prep: GET_BOSS_ATTACK_PREP_SPRITE,
  slash: GET_BOSS_ATTACK_SPRITE,
  leap: GET_BOSS_JUMP_SPRITE,
  land: GET_BOSS_LAND_SPRITE,
  summon: GET_BOSS_ATTACK_PREP_SPRITE,
  stun: GET_BOSS_STUN_SPRITE,
  die: GET_BOSS_DIE_SPRITE,
};
export const WARDEN_SPRITE = (anim) => frames(`warden/${anim}`, BOSS, anim, WARDEN_CONF[anim].max, WARDEN_FALLBACK[anim]);
export const WARDEN_GHOST = () => frames("warden/ghost_die", BOSS, "ghost_die", BOSS_CONF.ghost_die.max, GET_BOSS_GHOST_SPRITE);

export const THORN_CONF = { max: 8, speed: 3 };
export const THORN_SPRITE = () =>
  frames("thorn", `${BOSS}`, "thorn", THORN_CONF.max, () => [{ src: "assets/game/object/spikes_still.png" }]);

// Warm the cache so frames are loaded before they're first drawn
export function preloadArea2() {
  A2_BACKGROUND();
  A2_BOSS_BACKGROUND();
  A2_FOREGROUND();
  A2_PLATFORM();
  for (let n = 1; n <= FLOOR_TILES; n++) floorTile(n);
  [1, 2, 3].forEach(A2_GATE);
  Object.keys(MOSSLING_CONF).forEach(MOSSLING_SPRITE);
  Object.keys(DRIFTER_CONF).forEach(DRIFTER_SPRITE);
  SPORE_SPRITE();
  Object.keys(WARDEN_CONF).forEach(WARDEN_SPRITE);
  WARDEN_GHOST();
  THORN_SPRITE();
}
