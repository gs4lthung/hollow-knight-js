import { GAME } from "../game.js";
import { THORN_CONF, THORN_SPRITE, WARDEN_CONF, WARDEN_GHOST, WARDEN_SPRITE } from "../facade/area2assets.js";
import { MyAudio } from "../facade/audio.js";
import { Enemy } from "../parent/enemies.js";
import { Setting } from "../setting.js";
import { Ghost } from "./ghost.js";

const GROUND_Y = Setting.HEIGHT - 200;

// A thorn bursting from the ground under a knight. A glowing mark warns first;
// it only hurts while it's sticking out.
export class Thorn extends Enemy {
  static NET_KIND = "t";

  constructor(x) {
    const w = 90;
    const h = 200;
    super(x - w / 2, GROUND_Y - h + 10, w, h, THORN_SPRITE(), THORN_CONF, false, true);
    this.isProjectile = true;
    this.harmless = true;
    this.warning = true;
    this.age = 0;
  }

  netAnim() {
    return this.warning ? "warn" : "out";
  }

  applyNetAnim(s) {
    this.warning = s.a === "warn";
  }

  hit() {} // can't be destroyed

  checkBound() {
    return false;
  }

  parentMethod() {
    this.age += this.game.delta;
    if (this.warning) {
      this.spriteIdx = 0;
      if (this.age >= Setting.THORN_WARNING_TIME) this.warning = false;
      return;
    }
    this.harmless = this.spriteIdx < 2 || this.spriteIdx > 5;
    if (this.finishState) {
      this.dead = true;
      this.destroy = true;
    }
  }

  render() {
    if (!this.warning) return super.render();
    if (this.remote) this.netSmooth();
    else this.logic();
    // Pulsing mark on the ground where the thorn will come out
    const ctx = this.game.ctx;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this.game.timeEllapsed * 20);
    ctx.fillStyle = "#7dffd8";
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2, GROUND_Y + 8, this.w * 0.6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Sunken Grove boss: tall and quick. Walks in and slashes, leaps at far knights,
// and summons thorns under everyone. Like the False Knight its armor has to be
// broken first; while stunned its health can be hit.
// Art faces right like the False Knight (backward = facing left).
export class Warden extends Enemy {
  static NET_KIND = "W";

  constructor(x, y) {
    const size = Setting.WARDEN_SIZE;
    super(x, y, size, size, WARDEN_SPRITE("idle"), WARDEN_CONF.idle);
    this.isBoss = true;
    this.displayName = "Grove Warden";
    this.maxSpeed = 900;
    this.health = this.maxHealth = Setting.WARDEN_HEALTH;
    this.armor = this.maxArmor = Setting.WARDEN_ARMOR;
    this.death = false;
    this.slashActive = false;
    this.summoned = false;
    this.setState("idle");
  }

  isStunned() {
    return this.state === "stun";
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
    this.sprite = WARDEN_SPRITE(state);
    this.config = WARDEN_CONF[state];
    this.spriteIdx = 0;
    this.finishState = false;
    this.harmless = state === "stun" || state === "die";
    this.slashActive = false;
    this.summoned = false;
  }

  // Body hitbox in the middle of the big frame; the slash reaches out in front
  updateHitbox() {
    const size = Setting.WARDEN_SIZE;
    this.offsetX = size * 0.37;
    this.offsetW = -size * 0.74;
    this.offsetY = size * 0.25;
    this.offsetH = -size * 0.25;
    if (this.slashActive) {
      this.offsetW += Setting.WARDEN_SLASH_REACH;
      if (this.backward) this.offsetX -= Setting.WARDEN_SLASH_REACH;
    }
  }

  checkBound() {
    if (this.x < -this.w * 0.3) this.x = -this.w * 0.3;
    if (this.x + this.w * 0.7 > this.game.width) this.x = this.game.width - this.w * 0.7;
    return false;
  }

  netAnim() {
    return this.state;
  }

  netState() {
    return {
      ...super.netState(),
      ar: this.armor,
      mar: this.maxArmor,
      mhp: this.maxHealth,
      dd: this.death ? 1 : 0,
      sa: this.slashActive ? 1 : 0,
    };
  }

  applyNetAnim(s) {
    if (s.a !== this.state && WARDEN_CONF[s.a]) {
      const harmless = this.harmless;
      this.setState(s.a);
      this.harmless = harmless;
      if (s.a === "land") this.game.audio.play(MyAudio.FALSE_LAND, false);
    }
    if (s.dd && !this.death) {
      this.death = true;
      this.ghostDie();
    }
    this.armor = s.ar;
    this.maxArmor = s.mar;
    this.maxHealth = s.mhp;
    this.slashActive = !!s.sa;
    this.updateHitbox();
  }

  facingSign() {
    return this.backward ? -1 : 1;
  }

  choose(target) {
    const far = Math.abs(target.middleXPos() - this.middleXPos()) > 520;
    const r = Math.random();
    if (far) this.setState(r < 0.55 ? "leap" : "walk");
    else this.setState(r < 0.5 ? "slash_prep" : r < 0.8 ? "summon" : "leap");
    if (this.state === "slash_prep") this.game.audio.play(MyAudio.FALSE_ATTACK, false);
    if (this.state === "leap") {
      this.game.audio.play(MyAudio.FALSE_JUMP, false);
      this.vy = -Setting.WARDEN_LEAP_FORCE;
      this.vx = Math.max(-900, Math.min(900, (target.middleXPos() - this.middleXPos()) / 0.95));
    }
  }

  summonThorns() {
    const targets = [this.game.player, ...(this.game.net ? this.game.net.remotePlayers() : [])].filter((p) => p && !p.dead);
    targets.forEach((p) => this.game.enemies.push(new Thorn(p.middleXPos())));
    this.game.enemies.push(new Thorn(150 + Math.random() * (this.game.width - 300)));
    this.game.audio.play(MyAudio.FALSE_STRIKE, false);
  }

  parentMethod() {
    this.fadeHitFlash();
    this.stateTime += this.game.delta;
    this.updateHitbox();
    if (this.death) {
      this.vx *= 0.9;
      return;
    }

    const target = this.game.nearestPlayer(this);
    const dx = target.middleXPos() - this.middleXPos();

    switch (this.state) {
      case "idle":
        this.vx = 0;
        if (this.stateTime > 0.7) {
          this.lookAtPlayer();
          this.choose(target);
        }
        break;
      case "walk":
        this.lookAtPlayer();
        this.vx = Math.sign(dx) * Setting.WARDEN_WALK_SPEED;
        if (Math.abs(dx) < 230 || this.stateTime > 2) {
          this.setState("slash_prep");
          this.game.audio.play(MyAudio.FALSE_ATTACK, false);
        }
        break;
      case "slash_prep":
        this.vx = 0;
        if (this.stateTime > 0.55) this.setState("slash");
        break;
      case "slash":
        this.vx = this.stateTime < 0.25 ? this.facingSign() * Setting.WARDEN_LUNGE_SPEED : this.vx * 0.85;
        this.slashActive = this.stateTime > 0.1 && this.stateTime < 0.45;
        if (this.stateTime > 0.7) this.setState("idle");
        break;
      case "leap":
        if (this.spriteIdx >= this.config.max - 1) this.spriteIdx = this.config.max - 1;
        if (this.stateTime > 0.25 && this.isGrounded()) {
          this.setState("land");
          this.game.audio.play(MyAudio.FALSE_LAND, false);
          this.game.shakeScene(0.5);
        }
        break;
      case "land":
        this.vx = 0;
        if (this.stateTime > 0.45) this.setState("idle");
        break;
      case "summon":
        this.vx = 0;
        if (!this.summoned && this.stateTime > 0.5) {
          this.summoned = true;
          this.summonThorns();
        }
        if (this.stateTime > 1.4) this.setState("idle");
        break;
      case "stun":
        this.vx *= 0.9;
        if (this.spriteIdx >= this.config.max - 1) this.spriteIdx = this.config.max - 1;
        if (this.stateTime > Setting.WARDEN_STUN_TIME) {
          this.armor = this.maxArmor;
          this.setState("idle");
        }
        break;
    }
  }

  stun() {
    this.setState("stun");
    this.vx = -this.facingSign() * 400;
  }

  ghostDie() {
    this.lookAtPlayer();
    Ghost.Generate(this.backward, this.x, this.y + this.h - 520, this.w, WARDEN_GHOST());
  }

  die() {
    this.death = true;
    this.setState("die");
    this.ghostDie();
    this.game.bossDefeated(this);
  }

  hit(n = 0) {
    if (this.death) return;
    const damage = n || this.game.player.damage;
    this.invert = 1;
    if (this.state === "stun") {
      this.health -= damage;
      this.game.audio.play(MyAudio.FALSE_HEAD_HIT, false);
      if (this.health <= 0) this.die();
    } else {
      this.armor -= damage;
      if (this.armor <= 0) this.stun();
    }
  }
}
