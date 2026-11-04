import { GAME } from "../game.js";
import { MOSSLING_CONF, MOSSLING_SPRITE } from "../facade/area2assets.js";
import { MyAudio } from "../facade/audio.js";
import { isInTheLeft } from "../facade/helper.js";
import { Enemy } from "../parent/enemies.js";
import { Setting } from "../setting.js";
import { UI } from "./ui.js";

// Sunken Grove ground enemy: wanders like a crawlid, then charges a knight that
// comes close at the same height. Art faces left (backward = facing right).
export class Mossling extends Enemy {
  static NET_KIND = "g";

  static Generate(x, backward = false) {
    const game = GAME.getInstance();
    const obj = new this(x, game.height - 250, 88, 63, backward);
    game.enemies.push(obj);
    return obj;
  }

  constructor(x, y, w, h, backward) {
    super(x, y, w, h, MOSSLING_SPRITE("walk"), MOSSLING_CONF.walk);
    this.speed = Setting.CRAWLID_SPEED;
    this.backward = backward;
    this.maxSpeed = Setting.CRAWLID_MAX_SPEED;
    this.health = Math.ceil(Setting.MOSSLING_HEALTH * this.game.enemyDifficulty());
    this.mode = "walk";
    this.modeTime = 0;
    this.cooldown = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.modeTime = 0;
    this.sprite = MOSSLING_SPRITE(mode);
    this.config = MOSSLING_CONF[mode];
    this.spriteIdx = 0;
  }

  netAnim() {
    return this.mode;
  }

  applyNetAnim(s) {
    if (s.a !== this.mode && MOSSLING_CONF[s.a]) this.setMode(s.a);
    if (s.d && !this.dead) {
      this.dead = true;
      this.game.audio.play(MyAudio.CRAWLID_DIED, false);
    }
  }

  die() {
    this.game.audio.play(MyAudio.CRAWLID_DIED, false);
    // Knocked away from whoever is closest
    this.backward = !isInTheLeft(this.game.nearestPlayer(this), this);
    this.vx = this.backward ? Setting.KNOCKBACK_POWER : -Setting.KNOCKBACK_POWER;
    this.maxSpeed = Setting.CRAWLID_MAX_SPEED;
    this.setMode("die");
    this.dead = true;
    UI.getInstance().incrementMoney();
    this.game.killedCrawlid += 1;
    this.game.checkCrawlidKilled();
  }

  hit(n = 0) {
    this.takeHit(n);
  }

  parentMethod() {
    this.fadeHitFlash();
    if (this.dead) {
      this.deadTime = (this.deadTime || 0) + this.game.delta;
      if (this.deadTime > Setting.ENEMY_CORPSE_TIME) this.destroy = true;
      return;
    }

    this.modeTime += this.game.delta;
    this.cooldown -= this.game.delta;

    if (this.mode === "charge") {
      this.vx = this.backward ? Setting.MOSSLING_CHARGE_SPEED : -Setting.MOSSLING_CHARGE_SPEED;
      if (this.modeTime > Setting.MOSSLING_CHARGE_TIME) {
        this.setMode("walk");
        this.maxSpeed = Setting.CRAWLID_MAX_SPEED;
        this.cooldown = Setting.MOSSLING_CHARGE_COOLDOWN;
      }
      return;
    }

    const target = this.game.nearestPlayer(this);
    const dx = target.middleXPos() - this.middleXPos();
    const sameHeight = Math.abs(target.middleYPos() - this.middleYPos()) < 120;
    if (!target.dead && sameHeight && Math.abs(dx) < Setting.MOSSLING_CHARGE_RANGE && this.cooldown <= 0) {
      this.backward = dx > 0;
      this.maxSpeed = Setting.MOSSLING_CHARGE_SPEED;
      this.setMode("charge");
      return;
    }

    // Wander like a crawlid
    if (this.backward) this.vx += this.speed * this.game.delta;
    else this.vx -= this.speed * this.game.delta;
  }
}
