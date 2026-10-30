import { GET_PLAYER_IDLE_SPRITE, PLAYER_CONF } from "../facade/file.js";
import { DEFAULT_HERO, HEROES, heroConfig, heroSprite, preloadHero } from "../heroes.js";
import { GAME } from "../game.js";
import { Character } from "../parent/character.js";
import { Setting } from "../setting.js";

export const PLAYER_COLORS = ["#ffffff", "#5ad1ff", "#ffb347", "#9dff7a"];

export function drawPlayerLabel(ctx, player, slot) {
  ctx.save();
  ctx.globalAlpha = player.getAlpha();
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "black";
  ctx.fillStyle = PLAYER_COLORS[slot] || "white";
  const x = player.x + player.w / 2;
  const y = player.y - 8;
  ctx.strokeText(`P${slot + 1}`, x, y);
  ctx.fillText(`P${slot + 1}`, x, y);
  ctx.restore();
}

// Another player's knight, drawn from the state they send us
export class RemotePlayer extends Character {
  constructor(id, slot) {
    const game = GAME.getInstance();
    super(
      0,
      -1000,
      Setting.CHARACTER_WIDTH * game.scale,
      Setting.CHARACTER_HEIGHT * game.scale,
      GET_PLAYER_IDLE_SPRITE(),
      PLAYER_CONF.idle,
      false
    );
    this.remote = true;
    this.id = id;
    this.slot = slot;
    this.anim = "idle";
    this.heroId = DEFAULT_HERO;
  }

  applyNet(s) {
    const heroId = HEROES[s.hr] ? s.hr : DEFAULT_HERO;
    if (heroId !== this.heroId) {
      this.heroId = heroId;
      preloadHero(heroId);
      this.anim = null; // force the sprite to reload for the new hero
    }
    if (s.a !== this.anim) {
      this.sprite = heroSprite(this.heroId, s.a);
      this.config = heroConfig(s.a);
      this.anim = s.a;
    }
    if (this.tx === undefined) {
      this.x = s.x;
      this.y = s.y;
    }
    this.slot = s.s;
    this.tx = s.x;
    this.ty = s.y;
    this.w = s.w;
    this.h = s.h;
    this.backward = !!s.b;
    this.spriteIdx = s.i;
    this.alpha = s.al;
    this.dead = !!s.d;
    this.canCollide = !this.dead;
  }

  render() {
    super.render();
    drawPlayerLabel(this.game.ctx, this, this.slot);
  }
}
