import { MyAudio } from "../facade/audio.js";
import { GAME } from "../game.js";
import { SKILL_CONF, heroOf, heroSfx, heroSkillSprite } from "../heroes.js";
import { Character } from "../parent/character.js";
import { getDistance } from "../facade/helper.js";
import { Particle } from "./particle.js";
import { UI } from "./ui.js";

const TEAMMATE_VOLUME = 0.6;

// Two elements' skills touching make a combo (keys are the hero ids, sorted).
// Every player sees it, but only one caster deals its damage so it counts once:
// the tornado's owner for Fire Tornado / Sandstorm, the fireball's for Steam Burst.
const COMBOS = {
  "fire+wind": {
    name: "Fire Tornado",
    color: "#ff8a1f",
    apply(fire, wind) {
      fire.done = true; // the fireball feeds the tornado
      wind.boost({ damage: 3, hitInterval: 0.25, extraLife: 1.5, filter: "sepia(1) saturate(5) hue-rotate(-25deg)" });
    },
  },
  "fire+water": {
    name: "Steam Burst",
    color: "#e8f4ff",
    apply(fire, water) {
      fire.done = true;
      // The steam rises from the water, not from where the fireball happens to be
      const x = water.x + water.w / 2;
      const y = water.y + water.h / 2;
      Particle.BlastParticle(x - 100, y - 60);
      UI.getInstance().whiteScreen(120, 0.25);
      if (!fire.visualOnly) fire.burst(x, y, 260, 6);
    },
  },
  "earth+wind": {
    name: "Sandstorm",
    color: "#d9b46a",
    apply(earth, wind) {
      wind.boost({ damage: 2, scale: 1.4, extraLife: 1, filter: "sepia(1) saturate(2) brightness(0.9)" });
    },
  },
};

// An elemental hero's skill (see the skill settings in heroes.js).
// visualOnly: a copy of another player's skill - it can still heal *our* knight,
// but damage is only dealt by the caster's own copy.
export class SkillEffect extends Character {
  static Cast(heroId, player) {
    const skill = heroOf(heroId).skill;
    const { x, y } = SkillEffect.Placement(skill, player);
    const effect = new SkillEffect(heroId, x, y, player.backward, false);
    GAME.getInstance().blasts.push(effect);
    return effect;
  }

  static Spawn(heroId, x, y, backward) {
    const effect = new SkillEffect(heroId, x, y, backward, true);
    GAME.getInstance().blasts.push(effect);
    return effect;
  }

  static Placement(skill, player) {
    const feetY = player.y + player.h;
    const front = (offset) =>
      player.backward ? player.x - skill.w + offset : player.x + player.w - offset;
    switch (skill.place) {
      case "ground-front":
        return { x: front(20), y: feetY - skill.h };
      case "ground-center":
        return { x: player.middleXPos() - skill.w / 2, y: feetY - skill.h };
      default:
        return { x: front(40), y: player.middleYPos() - skill.h / 2 };
    }
  }

  constructor(heroId, x, y, backward, visualOnly) {
    const skill = heroOf(heroId).skill;
    super(x, y, skill.w, skill.h, heroSkillSprite(heroId), SKILL_CONF, false, !skill.loop);
    this.skill = skill;
    this.backward = backward;
    this.visualOnly = visualOnly;
    this.canCollide = false;
    this.maxSpeed = skill.speed || 0;
    this.age = 0;
    this.lastHit = new Map(); // enemy -> time of last hit
    this.done = false;
    this.heroId = heroId;
    this.combined = new Set(); // effects we already made a combo with
    this.damage = skill.damage;
    this.hitInterval = skill.hitInterval;
    this.life = skill.life;
    this.filter = null;

    const audio = MyAudio.getInstance();
    audio.playHero(heroSfx(heroId, "skill"), MyAudio.PLAYER_BLAST, visualOnly ? TEAMMATE_VOLUME : 1);
    if (skill.shake) this.game.shakeScene(skill.shake);
    if (skill.heal) this.healLocalPlayer();
  }

  // Every client heals its own knight if it stands in the wave
  healLocalPlayer() {
    const player = this.game.player;
    if (!player || player.dead) return;
    const distance = getDistance(
      player.middleXPos(),
      player.middleYPos(),
      this.x + this.w / 2,
      this.y + this.h / 2
    );
    if (distance > this.skill.healRadius) return;
    player.health = Math.min(player.maxHealthValue, player.health + this.skill.heal);
    UI.getInstance().changeHealth(player.health);
    UI.getInstance().whiteScreen(150, 0.2);
  }

  move() {
    if (!this.skill.speed) return;
    this.vx = this.backward ? -this.skill.speed : this.skill.speed;
  }

  // Combo upgrade for a lingering skill (the tornado)
  boost({ damage, hitInterval, extraLife = 0, scale = 1, filter }) {
    this.damage = damage;
    if (hitInterval) this.hitInterval = hitInterval;
    if (this.life) this.life += extraLife;
    if (scale !== 1) {
      const bottom = this.y + this.h;
      this.x -= (this.w * (scale - 1)) / 2;
      this.w *= scale;
      this.h *= scale;
      this.y = bottom - this.h;
    }
    this.filter = filter;
  }

  // One-off area damage around (x, y)
  burst(x, y, radius, damage) {
    this.game.enemies.forEach((enemy) => {
      if (enemy.isDead()) return;
      if (getDistance(enemy.middleXPos(), enemy.middleYPos(), x, y) > radius) return;
      Particle.HitParticle(enemy.middleXPos(), enemy.middleYPos());
      this.game.damageEnemy(enemy, damage);
    });
    this.game.audio.play(MyAudio.HIT, false);
  }

  checkCombos() {
    this.game.blasts.forEach((other) => {
      if (!(other instanceof SkillEffect) || other === this || other.heroId === this.heroId) return;
      if (this.done || other.done || this.combined.has(other)) return;
      const key = [this.heroId, other.heroId].sort().join("+");
      const combo = COMBOS[key];
      if (!combo || !other.isCollideEffect(this)) return;
      this.combined.add(other);
      other.combined.add(this);
      const [first, second] = this.heroId < other.heroId ? [this, other] : [other, this];
      combo.apply(first, second);
      this.game.floatText(combo.name + "!", (this.x + other.x + other.w) / 2, Math.min(this.y, other.y) - 20, combo.color);
    });
  }

  isCollideEffect(other) {
    return (
      this.x < other.x + other.w &&
      other.x < this.x + this.w &&
      this.y < other.y + other.h &&
      other.y < this.y + this.h
    );
  }

  hitEnemies() {
    const interval = this.hitInterval;
    this.game.enemies.forEach((enemy) => {
      if (enemy.isDead() || !enemy.isCollideBlock(this.x, this.y, this.w, this.h)) return;
      const last = this.lastHit.get(enemy);
      // One hit per enemy, or one every hitInterval seconds for lingering skills
      if (last !== undefined && (!interval || this.age - last < interval)) return;
      this.lastHit.set(enemy, this.age);
      this.game.audio.play(MyAudio.HIT, false);
      Particle.HitParticle(enemy.middleXPos(), enemy.middleYPos());
      this.game.damageEnemy(enemy, this.damage);
    });
  }

  parentMethod() {
    this.age += this.game.delta;
    this.move();
    this.checkCombos();
    if (!this.visualOnly) this.hitEnemies();

    const finished = this.skill.loop
      ? this.age >= this.life
      : this.spriteIdx >= SKILL_CONF.max - 1 && this.finishState;
    if (finished) this.done = true;
  }

  render() {
    if (!this.filter) return super.render();
    // Combo tint (fire tornado / sandstorm)
    const ctx = this.game.ctx;
    ctx.save();
    ctx.filter = this.filter;
    super.render();
    ctx.restore();
  }

  // Called by the game's blast list: true removes the effect
  checkBound() {
    const outside = this.x + this.w < 0 || this.x > this.game.width;
    return this.done || outside;
  }
}
