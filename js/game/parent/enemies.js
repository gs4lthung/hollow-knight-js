import { isInTheLeft } from "../facade/helper.js";
import { GAME } from "../game.js";
import { Character } from "./character.js";
import { Setting } from "../setting.js";
import { PLACEHOLDER_FILTER } from "../facade/area2assets.js";

export class Enemy extends Character {
  constructor(x, y, w, h, sprite, config, gravity = true) {
    super(x, y, w, h, sprite, config, gravity);
    this.pendingHits = []; // guest: our hits the host hasn't shown yet [{ n, at }]
  }

  // Guest: show our hit now instead of a round trip later. The host still decides;
  // this only flashes the enemy and, if our hits should have killed it, stops it
  // hurting us while the host's confirmation is on its way.
  predictHit(n) {
    this.pendingHits.push({ n, at: performance.now() });
    this.invert = 1;
  }

  // A snapshot's health went from `before` to `after`: those hits have landed
  confirmHits(before, after) {
    const now = performance.now();
    this.pendingHits = this.pendingHits.filter((h) => now - h.at < Setting.NET_PREDICT_TIME);
    let landed = Math.max(0, (before ?? after) - after);
    while (landed > 0 && this.pendingHits.length) {
      const hit = this.pendingHits[0];
      const used = Math.min(hit.n, landed);
      hit.n -= used;
      landed -= used;
      if (hit.n <= 0) this.pendingHits.shift();
    }
  }

  // Our not-yet-confirmed hits take it to 0 (bosses wait for the host: armor, stuns)
  isPredictedDead() {
    if (!this.remote || this.isBoss || !this.pendingHits.length) return false;
    const now = performance.now();
    const pending = this.pendingHits
      .filter((h) => now - h.at < Setting.NET_PREDICT_TIME)
      .reduce((sum, h) => sum + h.n, 0);
    return this.health - pending <= 0;
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

  // Mirrors don't run logic(), so fade a predicted flash here (the host's own flash comes in netInvert)
  netSmooth() {
    super.netSmooth();
    if (this.invert > (this.netInvert || 0)) {
      this.invert = Math.max(this.netInvert || 0, this.invert - Setting.ENEMY_HIT_FLASH_DECAY * this.game.delta);
    }
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
