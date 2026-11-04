import { GAME } from "../game.js";
import { GET_BOSS_DOOR } from "../facade/file.js";
import { Object } from "../parent/object.js";
import { Setting } from "../setting.js";
import { Background } from "./background.js";
import { UI } from "./ui.js";
import { A2_GATE } from "../facade/area2assets.js";

export class BossDoor {
  // Decide Render First
  static BOSS_BACKGROUND = 1;
  static BOSS_DOOR = 2;
  static BOSS_PORTAL = 3;
  static FREE_OBJECT = 4;

  static instance = null;

  static GetInstance() {
    if (this.instance == null) {
      this.instance = new BossDoor();
    }
    return this.instance;
  }

  generateBackground() {
    const img = this.image(BossDoor.BOSS_BACKGROUND);
    const game = GAME.getInstance();
    const scale = 1.3;
    const w = 591 * scale; // 591 -> IMAGE.png WIDTH
    const h = 801 * scale; // 801 -> IMAGE.png HEIGHT
    const offsetY = 160;
    const x = Setting.WIDTH - w;
    const y = Setting.HEIGHT - h - offsetY;

    const door = new Background(x, y, w, h, img, game.ctx);
    this.bossDoors[BossDoor.BOSS_BACKGROUND] = door;

    // Make all ground black below the top ground. The Grove gate stands on
    // the floor instead (its art has no ground of its own).
    const inset = this.area === 2 ? w : 0;
    this.bossDoors[BossDoor.FREE_OBJECT] = new Object(
      x + inset,
      Setting.HEIGHT - 170,
      w,
      game.height,
      null,
      null,
      game.ctx,
      "black"
    );
  }

  // 1 = the False Knight's door, 2 = the Sunken Grove gate to the Warden
  image(n) {
    return this.area === 2 ? A2_GATE(n) : GET_BOSS_DOOR(n);
  }

  // New area: a fresh, closed door with that area's art
  setArea(area) {
    this.area = area;
    this.fade = 0;
    this.open = false;
    this.showLight = false;
    this.bossDoors = [];
    this.generateDoor();
    this.generateBackground();
  }

  constructor() {
    this.area = 1;
    this.fade = 0;
    this.open = false;
    this.bossDoors = [];
    this.showLight = false;
  }

  openDoor() {
    this.open = true;
    this.generatePortal();
  }

  generateDoor() {
    const img = this.image(BossDoor.BOSS_DOOR);
    const game = GAME.getInstance();
    const scale = 1.3;
    const w = 574 * scale; // PNG WIDTH
    const h = 497 * scale; // PNG HEIGHT
    const offsetY = 160;
    const x = Setting.WIDTH - w;
    const y = Setting.HEIGHT - h - offsetY;

    const door = new Background(x, y, w, h, img, game.ctx);
    this.bossDoors[BossDoor.BOSS_DOOR] = door;
  }

  checkOpen() {
    if (this.open) {
      const game = GAME.getInstance();
      const bg = this.bossDoors[BossDoor.BOSS_DOOR];
      if (bg) {
        bg.x += Setting.OPEN_DOOR_SPEED_X * game.delta;
        bg.y += Setting.OPEN_DOOR_SPEED_Y * game.delta;
      }
    }
  }

  addListener(e) {
    if (e.repeat) return;
    if (Setting.PLAYER_INTERACT.includes(Setting.gameKey(e))) {
      const game = GAME.getInstance();
      game.requestBossScene();
      const ui = UI.getInstance();
      ui.hideTitle();
    }
  }

  checkInside() {
    const game = GAME.getInstance();
    // Check if player inside the
    if (
      !game.bossFight &&
      this.showLight &&
      game.player.x >= 1720 &&
      game.player.x <= 1800
    ) {
      this.changeTitle();
      $("#title").fadeIn(300);
      window.addEventListener("keydown", this.addListener);
    } else {
      $("#title").fadeOut(2000);
      window.removeEventListener("keydown", this.addListener);
    }
  }

  changeTitle() {
    $("#title").html("'Space to interact");
  }

  logic() {
    this.checkInside();
    this.checkOpen();
  }

  render() {
    this.logic();
    if (!this.open) {
      this.bossDoors[BossDoor.BOSS_DOOR].render();
      this.bossDoors[BossDoor.BOSS_BACKGROUND].render();
    }
    if (this.open) {
      this.bossDoors[BossDoor.BOSS_PORTAL].render();
      this.bossDoors[BossDoor.BOSS_DOOR].render();
      if (this.bossDoors[BossDoor.BOSS_DOOR].x > 1300) {
        this.showLight = true;
      }
      this.bossDoors[BossDoor.BOSS_BACKGROUND].render();
      if (this.showLight) {
        const game = GAME.getInstance();
        game.ctx.save();
        game.ctx.globalAlpha = this.fade;
        this.bossDoors[BossDoor.BOSS_PORTAL].render();
        this.fade += Setting.DOOR_FADE_LIGHT * game.delta;
        game.ctx.restore();
      }
    }
    this.bossDoors[BossDoor.FREE_OBJECT].render();
  }

  generatePortal() {
    const img = this.image(BossDoor.BOSS_PORTAL);
    const game = GAME.getInstance();
    const scale = 1.3;
    const w = 574 * scale;
    const h = 497 * scale;
    const offsetY = 140;
    const offsetX = 0;
    const x = Setting.WIDTH - w - offsetX;
    const y = Setting.HEIGHT - h - offsetY;

    const door = new Background(x, y, w, h, img, game.ctx);
    this.bossDoors[BossDoor.BOSS_PORTAL] = door;
  }
}
