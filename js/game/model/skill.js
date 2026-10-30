import { MyAudio } from "../facade/audio.js";
import { GAME } from "../game.js";
import { SKILL_CONF, heroOf, heroSkillSprite } from "../heroes.js";
import { Character } from "../parent/character.js";
import { getDistance } from "../facade/helper.js";
import { Particle } from "./particle.js";
import { UI } from "./ui.js";

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

    const audio = MyAudio.getInstance();
    audio.play(MyAudio.PLAYER_BLAST, false);
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

  hitEnemies() {
    const interval = this.skill.hitInterval;
    this.game.enemies.forEach((enemy) => {
      if (enemy.isDead() || !enemy.isCollideBlock(this.x, this.y, this.w, this.h)) return;
      const last = this.lastHit.get(enemy);
      // One hit per enemy, or one every hitInterval seconds for lingering skills
      if (last !== undefined && (!interval || this.age - last < interval)) return;
      this.lastHit.set(enemy, this.age);
      this.game.audio.play(MyAudio.HIT, false);
      Particle.HitParticle(enemy.middleXPos(), enemy.middleYPos());
      this.game.damageEnemy(enemy, this.skill.damage);
    });
  }

  parentMethod() {
    this.age += this.game.delta;
    this.move();
    if (!this.visualOnly) this.hitEnemies();

    const finished = this.skill.loop
      ? this.age >= this.skill.life
      : this.spriteIdx >= SKILL_CONF.max - 1 && this.finishState;
    if (finished) this.done = true;
  }

  // Called by the game's blast list: true removes the effect
  checkBound() {
    const outside = this.x + this.w < 0 || this.x > this.game.width;
    return this.done || outside;
  }
}
