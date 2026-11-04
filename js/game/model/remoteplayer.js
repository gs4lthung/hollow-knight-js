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
  const label = player.name || `P${slot + 1}`;
  const text = player.downed || (player.remote && player.dead) ? `${label} · DOWN` : label;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Prompt and progress ring over a downed teammate we're standing next to
export function drawReviveHint(ctx, target, progress) {
  const x = target.x + target.w / 2;
  const y = target.y - 60;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = "#9dff7a";
    ctx.beginPath();
    ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";
  ctx.strokeText("Hold E to revive", x, y - 34);
  ctx.fillText("Hold E to revive", x, y - 34);
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
      GAME.getInstance().audio.preloadHero(HEROES[heroId].sfx);
      this.anim = null; // force the sprite to reload for the new hero
    }
    if (s.a !== this.anim) {
      this.sprite = heroSprite(this.heroId, s.a);
      this.config = heroConfig(s.a);
      this.anim = s.a;
    }
    this.setNetTarget(s);
    this.slot = s.s;
    this.w = s.w;
    this.h = s.h;
    this.backward = !!s.b;
    this.spriteIdx = s.i;
    this.alpha = s.al;
    this.dead = !!s.d;
    this.canCollide = !this.dead;
    this.name = typeof s.n === "string" ? s.n.slice(0, 12) : "";
    this.deaths = s.dt || 0;
    this.revives = s.rv || 0;
  }

  render() {
    super.render();
    drawPlayerLabel(this.game.ctx, this, this.slot);
  }
}
