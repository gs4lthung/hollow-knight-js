import {
  GET_PLAYER_ATTACK_SPRITE,
  GET_PLAYER_BLAST_MOVEMENT,
  GET_PLAYER_DASH_SPRITE,
  GET_PLAYER_DEAD,
  GET_PLAYER_IDLE_SPRITE,
  GET_PLAYER_JUMP_SPRITE,
  GET_PLAYER_WALK_SPRITE,
  PLAYER_CONF,
} from "./facade/file.js";

// Playable characters. Stats are multipliers of the original knight,
// except maxHealth which is the number of hearts.
// Sprites for the elements live in assets/game/heroes/<id>/ (see manifest.json there).
export const HEROES = {
  knight: {
    name: "Knight",
    color: "#ffffff",
    glow: "160,230,255",
    preview: "assets/game/hero/idle/idle_01.png",
    stats: { speed: 1, jump: 1, maxHealth: 5, range: 1, attackSpeed: 1, dashCooldown: 1 },
    skill: { name: "Soul Blast", description: "A piercing blast of soul." },
  },
  fire: {
    name: "Ember",
    color: "#ff8a1f",
    glow: "255,138,31",
    stats: { speed: 1.2, jump: 1.05, maxHealth: 4, range: 0.8, attackSpeed: 1.25, dashCooldown: 0.8 },
    skill: {
      name: "Fireball",
      description: "A fast fireball that hits hard.",
      w: 200,
      h: 80,
      loop: true,
      place: "front",
      speed: 2600,
      damage: 4,
      life: 2,
    },
  },
  earth: {
    name: "Bastion",
    color: "#8fbf4a",
    glow: "143,191,74",
    stats: { speed: 0.8, jump: 0.85, maxHealth: 8, range: 1.1, attackSpeed: 0.75, dashCooldown: 1.3 },
    skill: {
      name: "Rock Spikes",
      description: "Spikes burst from the ground in front of you.",
      w: 250,
      h: 200,
      loop: false,
      place: "ground-front",
      damage: 5,
      shake: 0.4,
    },
  },
  water: {
    name: "Tide",
    color: "#2bb3a8",
    glow: "43,179,168",
    stats: { speed: 1, jump: 1, maxHealth: 5, range: 1.4, attackSpeed: 0.9, dashCooldown: 1 },
    skill: {
      name: "Healing Wave",
      description: "Heals you and nearby allies, splashes enemies.",
      w: 250,
      h: 150,
      loop: false,
      place: "ground-center",
      damage: 1,
      heal: 2,
      healRadius: 450,
    },
  },
  wind: {
    name: "Zephyr",
    color: "#86c99a",
    glow: "134,201,154",
    stats: { speed: 1.3, jump: 1.2, maxHealth: 3, range: 0.9, attackSpeed: 1.15, dashCooldown: 0.6 },
    skill: {
      name: "Tornado",
      description: "A drifting tornado that keeps hitting.",
      w: 200,
      h: 200,
      loop: true,
      place: "ground-front",
      speed: 220,
      damage: 1,
      hitInterval: 0.35,
      life: 3,
    },
  },
};

export const HERO_IDS = Object.keys(HEROES);
export const DEFAULT_HERO = "knight";

// Animation name used by the player/network -> folder name and frame config
const ANIMS = {
  idle: ["idle", () => PLAYER_CONF.idle],
  walk: ["walk", () => PLAYER_CONF.walk],
  jump: ["jump", () => PLAYER_CONF.jump],
  dash: ["dash", () => PLAYER_CONF.dash],
  attack1: ["attack", () => PLAYER_CONF.attack],
  attack2: ["attack2", () => PLAYER_CONF.attack2],
  blast: ["blast", () => PLAYER_CONF.blast_movement],
  dead: ["dead", () => PLAYER_CONF.dead],
};

const KNIGHT_SPRITES = {
  idle: GET_PLAYER_IDLE_SPRITE,
  walk: GET_PLAYER_WALK_SPRITE,
  jump: GET_PLAYER_JUMP_SPRITE,
  dash: GET_PLAYER_DASH_SPRITE,
  attack1: () => GET_PLAYER_ATTACK_SPRITE(1),
  attack2: () => GET_PLAYER_ATTACK_SPRITE(2),
  blast: GET_PLAYER_BLAST_MOVEMENT,
  dead: GET_PLAYER_DEAD,
};

const SKILL_FRAMES = 8;
const cache = new Map();

function loadFrames(folder, name, count) {
  const frames = [];
  for (let i = 1; i <= count; i++) {
    const img = new Image();
    img.src = `${folder}/${name}_${String(i).padStart(2, "0")}.png`;
    frames.push(img);
  }
  return frames;
}

export function heroOf(id) {
  return HEROES[id] || HEROES[DEFAULT_HERO];
}

export function heroConfig(anim) {
  return ANIMS[anim][1]();
}

export function heroSprite(id, anim) {
  if (!HEROES[id] || id === DEFAULT_HERO) return KNIGHT_SPRITES[anim]();

  const key = `${id}/${anim}`;
  if (!cache.has(key)) {
    const [folder, config] = ANIMS[anim];
    cache.set(key, loadFrames(`assets/game/heroes/${id}/${folder}`, folder, config().max));
  }
  return cache.get(key);
}

export function heroSkillSprite(id) {
  const key = `${id}/skill`;
  if (!cache.has(key)) {
    cache.set(key, loadFrames(`assets/game/heroes/${id}/skill`, "skill", SKILL_FRAMES));
  }
  return cache.get(key);
}

export const SKILL_CONF = { max: SKILL_FRAMES, speed: 4 };

// Load every frame up front so nothing pops in blank the first time it's used
export function preloadHero(id) {
  Object.keys(ANIMS).forEach((anim) => heroSprite(id, anim));
  if (id !== DEFAULT_HERO) heroSkillSprite(id);
}

export function heroPreview(id) {
  return heroOf(id).preview || `assets/game/heroes/${id}/idle/idle_01.png`;
}
