import { GAME } from "../game.js";
import { DRIFTER_CONF, DRIFTER_SPRITE, SPORE_CONF, SPORE_SPRITE } from "../facade/area2assets.js";
import { MyAudio } from "../facade/audio.js";
import { getDistance, isInTheLeft } from "../facade/helper.js";
import { Enemy } from "../parent/enemies.js";
import { Setting } from "../setting.js";
import { Particle } from "./particle.js";
import { UI } from "./ui.js";

// A spore shot. Hurts a knight on touch and pops; knights can also hit it.
export class Spore extends Enemy {
  static NET_KIND = "s";

  constructor(x, y, vx, vy) {
    super(x, y, 40, 40, SPORE_SPRITE(), SPORE_CONF, false);
    this.isProjectile = true;
    this.dirX = vx;
    this.dirY = vy;
    this.maxSpeed = Setting.SPORE_SPEED;
    this.life = 0;
    this.health = 1;
  }

  pop() {
    if (this.dead) return;
    this.dead = true;
    this.destroy = true;
    Particle.HitParticle(this.middleXPos(), this.middleYPos());
  }

  hit() {
    this.pop();
  }

  onNetRemove() {
    Particle.HitParticle(this.middleXPos(), this.middleYPos());
  }

  checkBound() {
    if (this.x < -this.w || this.x > this.game.width) this.pop();
    return false;
  }

  parentMethod() {
    this.life += this.game.delta;
    this.vx = this.dirX;
    this.vy = this.dirY;
    if (this.life > Setting.SPORE_LIFE || (this.life > 0.2 && this.isGrounded())) this.pop();
  }
}

// Sunken Grove flyer: hovers at a distance and puffs spores at the nearest knight.
// Art faces left (backward = facing right).
export class SporeDrifter extends Enemy {
  static NET_KIND = "d";

  static Generate() {
    const game = GAME.getInstance();
    const left = Math.random() < 0.5;
    const x = left ? 0 : Setting.WIDTH - 80;
    const y = 450 + Math.random() * 250;
    const obj = new this(x, y, 80, 94);
    game.enemies.push(obj);
    return obj;
  }

  constructor(x, y, w, h) {
    super(x, y, w, h, DRIFTER_SPRITE("fly"), DRIFTER_CONF.fly, false);
    this.health = Math.ceil(Setting.DRIFTER_HEALTH * this.game.enemyDifficulty());
    this.maxSpeed = 160;
    this.mode = "fly";
    this.shootTimer = 2 + Math.random();
    this.shot = false;
  }

  setMode(mode) {
    this.mode = mode;
    this.sprite = DRIFTER_SPRITE(mode);
    this.config = DRIFTER_CONF[mode];
    this.spriteIdx = 0;
    this.finishState = false;
  }

  netAnim() {
    return this.mode;
  }

  applyNetAnim(s) {
    if (s.a !== this.mode && DRIFTER_CONF[s.a]) this.setMode(s.a);
    if (s.d && !this.dead) {
      this.dead = true;
      this.game.audio.play(MyAudio.VENGE_DIED, false);
    }
  }

  die() {
    this.game.audio.play(MyAudio.VENGE_DIED, false);
    this.setMode("die");
    this.gravity = true;
    this.vx = 0;
    this.dead = true;
    UI.getInstance().incrementMoney();
    this.game.killedCrawlid += 1;
    this.game.checkCrawlidKilled();
  }

  hit(n = 0) {
    this.takeHit(n);
  }

  // Bounce off the walls instead of flipping around like ground enemies
  checkBound() {
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > this.game.width) this.x = this.game.width - this.w;
    return false;
  }

  shoot(target) {
    const sx = this.middleXPos();
    const sy = this.middleYPos();
    const distance = Math.max(1, getDistance(target.middleXPos(), target.middleYPos(), sx, sy));
    const vx = ((target.middleXPos() - sx) / distance) * Setting.SPORE_SPEED;
    const vy = ((target.middleYPos() - sy) / distance) * Setting.SPORE_SPEED;
    this.game.enemies.push(new Spore(sx - 20, sy - 20, vx, vy));
  }

  parentMethod() {
    this.fadeHitFlash();
    if (this.dead) {
      this.deadTime = (this.deadTime || 0) + this.game.delta;
      if (this.deadTime > Setting.ENEMY_CORPSE_TIME) this.destroy = true;
      return;
    }

    const target = this.game.nearestPlayer(this);
    this.backward = !isInTheLeft(target, this); // face the knight

    // Hover off to the side of the knight, a bit above
    const side = this.middleXPos() < target.middleXPos() ? -1 : 1;
    const wantX = target.middleXPos() + side * 350;
    const wantY = Math.max(250, target.y - 220);
    this.vx = Math.max(-150, Math.min(150, (wantX - this.middleXPos()) * 1.5));
    this.vy = Math.max(-120, Math.min(120, (wantY - this.y) * 1.5));

    if (this.mode === "spit") {
      if (!this.shot && this.spriteIdx >= 2) {
        this.shot = true;
        this.shoot(target);
      }
      if (this.finishState) this.setMode("fly");
      return;
    }

    this.shootTimer -= this.game.delta;
    const close = getDistance(target.middleXPos(), target.middleYPos(), this.middleXPos(), this.middleYPos()) < 800;
    if (this.shootTimer <= 0 && close && !target.dead) {
      this.shootTimer = Setting.DRIFTER_SHOOT_EVERY + Math.random();
      this.shot = false;
      this.setMode("spit");
    }
  }
}
