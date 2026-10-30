import { isInTheLeft } from "../facade/helper.js";
import { GAME } from "../game.js";
import { Character } from "./character.js";
import { Setting } from "../setting.js";

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
