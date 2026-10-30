import { MyAudio } from "./facade/audio.js";
import { Cheat } from "./facade/cheat.js";
import { Credit } from "./facade/credit.js";
import { GET_BOSS_BG } from "./facade/file.js";
import { getDistance } from "./facade/helper.js";
import { Boofly } from "./model/boofly.js";
import { Boss } from "./model/boss.js";
import { BossDoor } from "./model/bossdoor.js";
import { Crawlid } from "./model/crawlid.js";
import { Particle } from "./model/particle.js";
import { UI } from "./model/ui.js";
import { Setting } from "./setting.js";

export class GAME {
  static START = false;
  static gameInstance;

  static getInstance = () => {
    if (this.gameInstance == null) {
      this.gameInstance = new GAME();
    }
    return this.gameInstance;
  };

  constructor() {
    this.player;
    this.maxLeftX = 595;
    this.maxRightX = 1400;
    this.maxTop = 350;
    this.scale = Setting.SCALE;
    this.pause = false;
    this.objects = [];
    this.grounds = [];
    this.characters = [];
    this.keys = [];
    this.particles = [];
    this.camera = null;
    this.shake = false;
    this.blasts = [];
    this.backgrounds = [];
    this.foregrounds = [];
    this.mainBackground;
    this.boss = null;
    this.enemies = [];
    this.debugs = [];
    this.flies = [];
    this.gravity = Setting.GRAVITY;
    this.canvas = document.getElementById("myCanvas");
    this.ctx = document.getElementById("myCanvas").getContext("2d");
    this.width = Setting.WIDTH;
    this.height = Setting.HEIGHT;
    this.fps = Setting.FPS;
    this.delta = 0;
    this.bossFight = false;
    this.killedCrawlid = 0;
    this.canMove = true;
    this.bossDoor = null;
    this.blackCheat = false;
    this.useCamera = true;

    this.cheat = Cheat.GetInstance();

    this.lastTime = new Date();
    this.timeEllapsed = 0;
    this.tempTimeInterval = 0;
    this.tempFrameCounter = 0;
    this.credit = false;
    this.ui = UI.getInstance();
    this.audio = MyAudio.getInstance();
    this.audio.play(MyAudio.HOME);

    this.mainWidth = 1000;
    this.mainHeight = 600;

    this.rest = null;
    this.fullscreenFlag = false;
    this.canFullscreen = true;

    // LAN co-op (set in main.js); null/inactive means single player
    this.net = null;
    this.nextNetId = 1;
    this.finished = false;

    // Timers that run on game time, so they stop while the game is paused
    this.timers = [];
  }

  after(seconds, callback) {
    this.timers.push({ remaining: seconds, callback });
  }

  tickTimers(delta) {
    const due = [];
    this.timers = this.timers.filter((timer) => {
      timer.remaining -= delta;
      if (timer.remaining <= 0) {
        due.push(timer.callback);
        return false;
      }
      return true;
    });
    due.forEach((callback) => callback());
  }

  isNetworked() {
    return !!(this.net && this.net.active);
  }

  // Other players are actually connected right now
  hasPeers() {
    return this.isNetworked() && this.net.players.size > 0;
  }

  isHost() {
    return !this.isNetworked() || this.net.isHost;
  }

  isGuest() {
    return !this.isHost();
  }

  // Only touches the DOM when a value actually changes
  updateBossBar() {
    const boss = this.boss;
    const show = !!(this.bossFight && boss && !boss.death);
    if (show !== this.bossBarShown) {
      this.bossBarShown = show;
      $("#boss-bar").stop(true, true)[show ? "fadeIn" : "fadeOut"](500);
    }
    if (!show) return;

    const stunned = boss.state == Boss.STUN;
    const health = Math.max(0, boss.health) / boss.maxHealth;
    const armor = stunned ? 0 : Math.max(0, boss.armor) / boss.maxArmor;
    const key = `${health.toFixed(3)}|${armor.toFixed(3)}|${stunned}`;
    if (key === this.bossBarKey) return;
    this.bossBarKey = key;

    $("#boss-bar .boss-bar-fill").css("width", `${health * 100}%`);
    $("#boss-bar .boss-bar-armor").css("width", `${armor * 100}%`);
    $("#boss-bar").toggleClass("stunned", stunned);
  }

  playerCount() {
    return this.isNetworked() ? 1 + this.net.players.size : 1;
  }

  extraPlayers() {
    return this.playerCount() - 1;
  }

  // Multiplier for enemy and boss health
  difficulty() {
    return 1 + Setting.COOP_HEALTH_PER_PLAYER * this.extraPlayers();
  }

  killsForBossDoor() {
    return Setting.TOTAL_CRAWLID + Setting.COOP_KILLS_PER_PLAYER * this.extraPlayers();
  }

  maxAliveEnemies() {
    return Setting.MAX_ALIVE_ENEMIES + Setting.COOP_ENEMIES_PER_PLAYER * this.extraPlayers();
  }

  spawnGroups() {
    return this.playerCount() >= Setting.COOP_DOUBLE_SPAWN_PLAYERS ? 2 : 1;
  }

  enemySpawnInterval() {
    const rate = 1 + Setting.COOP_SPAWN_RATE_PER_PLAYER * this.extraPlayers();
    return Setting.ENEMY_SPAWN_TIME / 1000 / rate;
  }

  // Follow our own knight; with teammates, pull back so they stay in view
  updateCamera() {
    const camera = this.camera;
    const tan = Math.tan(camera.fieldOfView);
    let target = this.width;

    if (this.hasPeers()) {
      target *= Setting.COOP_CAMERA_ZOOM;
      let spreadX = 0;
      let spreadY = 0;
      this.net.remotePlayers().forEach((p) => {
        if (p.dead) return;
        spreadX = Math.max(spreadX, Math.abs(p.x - this.player.x));
        spreadY = Math.max(spreadY, Math.abs(p.y - this.player.y));
      });
      const margin = Setting.CAMERA_TEAMMATE_MARGIN;
      const aspect = this.canvas.width / this.canvas.height;
      const neededWidth = Math.max(2 * spreadX + margin, (2 * spreadY + margin) * aspect);
      target = Math.max(target, neededWidth / tan);
    }

    // Never wider than the whole level
    target = Math.min(target, this.width / tan);
    camera.distance += (target - camera.distance) * Math.min(1, this.delta * 3);
    camera.moveTo(this.player.x + 100, this.player.y - 50);
  }

  nearestPlayer(entity) {
    const players = [this.player];
    if (this.net) players.push(...this.net.remotePlayers());
    const alive = players.filter((p) => p && !p.dead);
    if (alive.length == 0) return this.player;

    const cx = entity.x + entity.w / 2;
    const cy = entity.y + entity.h / 2;
    let nearest = alive[0];
    let nearestDistance = Infinity;
    alive.forEach((p) => {
      const d = getDistance(p.x + p.w / 2, p.y + p.h / 2, cx, cy);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = p;
      }
    });
    return nearest;
  }

  // Guests don't own enemies, so their hits are sent to the host
  damageEnemy(enemy, n = 0) {
    if (this.isGuest()) {
      if (enemy.netId != null) {
        this.net.send({ t: "hit", to: "host", id: enemy.netId, n: n || this.player.damage });
      }
      return;
    }
    enemy.hit(n);
  }

  buildSnapshot() {
    const enemies = this.enemies
      .filter((e) => e.constructor.NET_KIND && !e.destroy)
      .map((e) => {
        if (e.netId == null) e.netId = this.nextNetId++;
        return e.netState();
      });
    return {
      t: "snap",
      e: enemies,
      m: this.ui.money,
      door: this.bossDoor.open ? 1 : 0,
      boss: this.bossFight ? 1 : 0,
    };
  }

  applySnapshot(s) {
    if (s.boss && !this.bossFight) this.changeBossScene();
    if (s.door && !this.bossDoor.open) this.bossDoor.openDoor();
    if (s.m !== this.ui.money) {
      this.ui.money = s.m;
      this.ui.changeMoney(s.m);
    }

    const existing = new Map(this.enemies.map((e) => [e.netId, e]));
    const next = [];
    s.e.forEach((state) => {
      let enemy = existing.get(state.id);
      if (enemy) {
        existing.delete(state.id);
      } else {
        enemy = this.net.createMirror(state);
        if (!enemy) return;
      }
      enemy.applyNet(state);
      next.push(enemy);
    });
    existing.forEach((enemy) => enemy.onNetRemove());
    this.enemies.length = 0;
    this.enemies.push(...next);
  }

  // The host left and we were promoted: start simulating the mirrored enemies
  becomeHost() {
    this.enemies.forEach((enemy) => {
      enemy.remote = false;
      enemy.vx = 0;
      enemy.vy = 0;
      if (enemy.netId != null && enemy.netId >= this.nextNetId) {
        this.nextNetId = enemy.netId + 1;
      }
    });
    if (this.boss && this.boss.state === "") this.boss.changeState(Boss.IDLE);
  }

  respawnPlayer() {
    const p = this.player;
    p.state = "";
    p.dead = false;
    p.fade = false;
    p.alpha = 1;
    p.canCollide = true;
    p.canMove = true;
    p.gravity = true;
    p.isKnockback = "";
    p.deadMaxY = Setting.CHARACTER_MAX_DEAD_HEIGHT;
    p.vx = 0;
    p.vy = 0;
    p.restoreDefaultScale();
    p.x = this.bossFight ? 30 + p.w : this.width / 2 - 250;
    p.y = -300;
    p.maxHealth();
    this.ui.changeHealth(p.health);
    p.jumping = true;
    p.changeSprite("jump");
    p.invicible = true; // brief spawn protection
  }

  requestBossScene() {
    if (this.bossFight) return;
    if (this.isGuest()) {
      this.net.send({ t: "boss", to: "host" });
      return;
    }
    this.changeBossScene();
    if (this.isNetworked()) this.net.send({ t: "ev", e: "boss" });
  }

  aliveEnemy() {
    return this.enemies.filter((e) => !e.dead && !e.death).length;
  }

  isFullscreen() {
    return this.fullscreenFlag;
  }

  fullscreen() {
    if (!this.canFullscreen) return;

    this.fullscreenFlag = !this.fullscreenFlag;
    if (this.fullscreenFlag) {
      $("#root-nav").hide();
      $(".canvas-container").css({
        width: "100vw",
        height: "100vh",
        border: "none",
      });
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement) document.exitFullscreen();
      $("#root-nav").show();
      $(".canvas-container").css({
        width: this.mainWidth + "px",
        height: this.mainHeight + "px",
        border: "1px solid white",
      });
    }
  }

  backToMenu() {
    window.location.reload();
  }

  spawnEnemy() {
    Crawlid.GenerateCrawlid(this.width, true);
    Boofly.Generate();
    Crawlid.GenerateCrawlid(0, false);
  }

  checkCrawlidKilled() {
    const ui = UI.getInstance();
    const door = BossDoor.GetInstance();
    if (ui.money >= this.killsForBossDoor() && !door.open) {
      door.openDoor();
    }
  }

  debug(x, y, w, h, color = "red") {
    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();
  }
  addDebugs(x, y, w, h, color = "red") {
    this.debugs.push({ x: x, y: y, w: w, h: h, color: color });
  }
  renderDebugs() {
    this.debugs.forEach((obj) => {
      this.ctx.fillStyle = obj.color;
      this.ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    });
  }

  checkCredit() {
    // Credit
    if (this.credit) {
      const credit = Credit.getInstance();
      credit.showCredit();
    }
  }

  finishGame() {
    if (this.finished) return;
    this.finished = true;
    if (this.isNetworked() && this.isHost()) {
      this.net.send({ t: "ev", e: "finish" });
    }
    this.audio.fadeVideo();

    setTimeout(() => {
      // Hide The UI
      this.ui.hideUi();

      // Set Audio
      this.audio.play(MyAudio.VICTORY, false);

      // Set Black Scren After Boss Has Died
      $("#black-screen").css("opacity", 0.4);
      $("#black-screen").fadeIn(1000);

      setTimeout(() => {
        // Set credit scroll up
        this.credit = true;
      }, 3000);
    }, 3000);
  }

  changeBossScene() {
    // Settup Background
    this.mainBackground.sprite = GET_BOSS_BG();
    this.mainBackground.reset();
    this.backgrounds.forEach((bg) => {
      bg.reset();
    });

    // Clear Enemy
    this.bossFight = true;
    this.enemies.length = 0;

    // Clear Object
    this.objects.length = 0;

    // Teleport Player
    const offsetX = 30;
    this.player.x = offsetX + 0 + this.player.w;

    // Playing Audio
    this.audio.stopAllAudio();
    this.audio.play(MyAudio.BOSS);

    // Create Boss (guests get a mirror of the host's boss from snapshots)
    if (this.isGuest()) return;
    const boss = new Boss(
      Setting.BOSS_INITIAL_X,
      Setting.BOSS_INITIAL_Y,
      Setting.BOSS_WIDTH,
      Setting.BOSS_HEIGHT
    );
    boss.health = boss.maxHealth = Math.ceil(Setting.BOSS_HEALTH * this.difficulty());
    boss.armor = boss.maxArmor = Math.ceil(Setting.BOSS_ARMOR * this.difficulty());
    this.enemies.push(boss);
    this.boss = boss;
  }

  shakeScene(t) {
    if (this.isNetworked() && this.isHost()) {
      this.net.send({ t: "ev", e: "shake", s: t });
    }
    this.shake = true;
    this.after(t, () => {
      this.shake = false;
    });
  }

  isCollideObjectGrounded(x, y) {
    let flag = false;
    this.grounds.forEach((obj) => {
      if (obj.isCollide(x, y)) {
        flag = true;
      }
    });
    return flag;
  }

  isCollideObject(x, y) {
    let flag = false;
    this.objects.forEach((obj) => {
      if (obj.isCollide(x, y)) {
        flag = true;
      }
    });
    return flag;
  }

  isCollideObjectBlock(x, y, w, h) {
    let flag = false;
    this.objects.forEach((obj) => {
      if (obj.isCollideBlock(x, y, w, h)) {
        flag = true;
      }
    });
    return flag;
  }

  calculateFps() {
    this.tempFrameCounter += 1;
  }

  calculateTimeEllapse(delta) {
    this.timeEllapsed += delta;
    this.tempTimeInterval += delta;

    if (this.tempTimeInterval > 1) {
      this.ui.fps(this.tempFrameCounter);
      this.tempTimeInterval = 0;
      this.tempFrameCounter = 0;
    }
  }

  getDelta() {
    const nowTime = new Date();
    // Clamp so a stalled or hidden tab doesn't teleport everything on return
    const delta = Math.min((nowTime - this.lastTime) / 1000, 0.1);
    this.calculateTimeEllapse(delta);

    this.delta = delta;
    this.lastTime = nowTime;
    return delta;
  }

  renderParticle() {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].render();
      if (this.particles[i].dead) {
        this.particles.splice(i, 1);
      }
    }
  }

  pauseGame(openUi = false, audio = true) {
    if (!this.pause) {
      if (openUi) {
        this.ui.showPause();
      }
      if (audio) this.audio.setVolume(0);
      this.keys = [];
      this.save();
      this.pause = true;
    } else {
      this.resumeGame();
    }
  }
  resumeGame() {
    this.restore();
    this.audio.setVolumeFromRange();
    this.ui.hidePause();
    this.pause = false;
  }

  // Save & Restore Make Bug
  save() {
    // this.player.save();
    // this.enemies.forEach((enemy) => {
    //   enemy.save();
    // });
  }
  restore() {
    // setTimeout(() => {
    //   this.player.restore();
    //   this.enemies.forEach((enemy) => {
    //     enemy.restore();
    //   });
    // }, 1);
  }

  enemyAlive() {
    let flag = 0;
    this.enemies.forEach((enemy) => {
      if (!enemy.death) {
        flag += 1;
      }
    });
    return flag;
  }

  renderBlast() {
    for (let i = 0; i < this.blasts.length; i++) {
      const blast = this.blasts[i];
      blast.render();

      // Check Blast Death
      if (blast.checkBound()) {
        this.blasts.splice(i, 1);
        i--;
      }
    }
  }

  enemyRender() {
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.render();
      if (enemy.destroy) {
        this.enemies.splice(i, 1);
        i--;
      }
    }
  }

  render() {
    this.calculateFps();
    this.getDelta();
    // With other players connected the world keeps running while the menu is open
    if (!this.pause || this.hasPeers()) {
      this.tickTimers(this.delta);
      this.checkCredit();
      this.updateBossBar();
      this.updateCamera();
      if (this.useCamera) this.camera.begin();
      this.cheat.checkKeys();
      if (this.useCamera && this.shake) {
        this.camera.shake();
      }
      if (this.black) this.black.render();
      this.mainBackground.render();
      this.grounds.forEach((obj) => {
        obj.render();
      });
      this.objects.forEach((object) => {
        object.render();
      });
      if (!this.bossFight) this.bossDoor.render();
      if (this.black && this.blackCheat) this.black.render();

      this.renderBlast();
      this.enemyRender();
      this.characters.forEach((character) => {
        character.render();
      });
      if (this.net) this.net.render();
      this.flies.forEach((fly) => {
        fly.render();
      });
      this.backgrounds.forEach((obj) => {
        // Fore ground
        obj.render();
      });
      this.renderParticle();
      if (this.useCamera) this.camera.end();
    }
    if (this.net && this.player) this.net.tick(this.delta);
    requestAnimationFrame(this.render.bind(this));
  }

  moveBackground(backward) {
    if (backward) {
      this.mainBackground.x -= this.mainBackground.vx * this.delta;
    } else {
      this.mainBackground.x += this.mainBackground.vx * this.delta;
    }
    this.backgrounds.forEach((bg) => {
      if (backward) {
        bg.x -= bg.vx * this.delta;
      } else {
        bg.x += bg.vx * this.delta;
      }
    });
  }
}
