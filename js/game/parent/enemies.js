import { isInTheLeft } from "../facade/helper.js";
import { GAME } from "../game.js";
import { Character } from "./character.js";
import { Setting } from "../setting.js";
import { PLACEHOLDER_FILTER } from "../facade/area2assets.js";

export class Enemy extends Character {
  constructor(x, y, w, h, sprite, config, gravity = true) {
    super(x, y, w, h, sprite, config, gravity);
  }

  // Multi-hit enemies (co-op): returns true when this hit killed it
  takeHit(n = 0) {
    if (this.dead) return false;
    this.health -= n || this.game.player.damage;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    this.invert = 1; // white flash so the hit reads
    return false;
  }

  // Area 2 placeholder art is drawn tinted; combined with the white hit flash
  checkInvert() {
    const filters = [];
    if (this.sprite && this.sprite.placeholder) filters.push(PLACEHOLDER_FILTER);
    if (this.invert > 0) filters.push(`invert(${this.invert})`);
    if (filters.length) this.game.ctx.filter = filters.join(" ");
  }

  fadeHitFlash() {
    if (this.invert > 0) {
      this.invert = Math.max(0, this.invert - Setting.ENEMY_HIT_FLASH_DECAY * this.game.delta);
    }
  }

  checkBound() {
    if (
      (this.backward && this.x + this.w + 1 > this.game.width) ||
      (!this.backward && this.x - 1 < 0)
    ) {
      this.vx = 0;
      this.backward = !this.backward;
      return true;
    }
    return false;
  }
}
