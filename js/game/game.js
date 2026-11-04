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
import {
  A2_BACKGROUND,
  A2_BOSS_BACKGROUND,
  A2_FLOOR,
  A2_FOREGROUND,
  A2_PLATFORM,
  preloadArea2,
} from "./facade/area2assets.js";
import { Ground } from "./model/ground.js";
import { Mossling } from "./model/mossling.js";
import { Rest } from "./model/rest.js";
import { SporeDrifter } from "./model/sporedrifter.js";
import { Warden } from "./model/warden.js";

// The run: Area 1 -> False Knight -> Sunken Grove -> Grove Warden
const STAGES = ["area1", "boss1", "area2", "boss2"];

// ~30 ticks a second from a worker, for scheduleFrame() while the tab is hidden
const BackgroundTicker = {
  worker: null,
  callback: null,
  next(callback) {
    this.callback = callback;
    if (!this.worker) {
      try {
        const code = "setInterval(() => postMessage(0), 33);";
        this.worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
        this.worker.onmessage = () => {
          const run = this.callback;
          this.callback = null;
          if (run) run();
        };
      } catch {
        // No workers: a plain timer still beats stopping (if throttled to ~1/s)
        const id = setTimeout(callback, 33);
        this.callback = null;
        return () => clearTimeout(id);
      }
    }
    return () => {
      if (this.callback === callback) this.callback = null;
    };
  },
};

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

    // Which part of the run we're in (see STAGES) and the team kill count when
    // this area started (each area's gate needs its own kills)
    this.stage = "area1";
    this.areaStartKills = 0;

    // Floating combat text (combo names)
    this.floatTexts = [];

    // Scoreboard: kills and boss damage per player, kept by the host
    this.stats = {};
    this.scoreRows = null;
    this.wipePending = false;
  }

  floatText(text, x, y, color = "white") {
    this.floatTexts.push({ text, x, y, color, age: 0 });
  }

  renderFloatTexts() {
    const life = 1.4;
    this.floatTexts = this.floatTexts.filter((t) => (t.age += this.delta) < life);
    this.floatTexts.forEach((t) => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, (life - t.age) * 2);
      this.ctx.font = "bold 34px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.lineWidth = 5;
      this.ctx.strokeStyle = "black";
      this.ctx.fillStyle = t.color;
      const y = t.y - t.age * 60;
      this.ctx.strokeText(t.text, t.x, y);
      this.ctx.fillText(t.text, t.x, y);
      this.ctx.restore();
    });
  }

  myStatsKey() {
    return this.isNetworked() ? String(this.net.slot) : "me";
  }

  statsFor(key) {
    key = String(key);
    if (!this.stats[key]) this.stats[key] = { kills: 0, bossDamage: 0 };
    return this.stats[key];
  }

  // Host side: apply a hit and credit the attacker for kills / boss damage
  applyHit(enemy, n, attackerKey) {
    const isBoss = !!enemy.isBoss;
    const wasDown = enemy.dead || enemy.death;
    const bossBefore = isBoss ? enemy.health + Math.max(0, enemy.armor) : 0;
    enemy.hit(n);
    const stats = this.statsFor(attackerKey);
    if (isBoss) {
      stats.bossDamage += Math.max(0, bossBefore - (enemy.health + Math.max(0, enemy.armor)));
    } else if (!wasDown && enemy.dead && !enemy.isProjectile) {
      stats.kills += 1;
    }
  }

  // Everyone in the game right now, with their per-player numbers
  buildScoreRows() {
    const players = [{ key: this.myStatsKey(), slot: this.net?.slot ?? 0, p: this.player }];
    if (this.net) {
      this.net.remotePlayers().forEach((p) => players.push({ key: String(p.slot), slot: p.slot, p }));
    }
    return players
      .map(({ key, slot, p }) => ({
        slot,
        name: p.name || "",
        hero: p.heroId,
        kills: this.statsFor(key).kills,
        bossDamage: this.statsFor(key).bossDamage,
        deaths: p.deaths || 0,
        revives: p.revives || 0,
      }))
      .sort((a, b) => a.slot - b.slot);
  }

  // Team wipe: everyone is down, so the host restarts the fight for all
  checkPartyWipe() {
    if (!this.hasPeers() || !this.isHost() || this.wipePending) return;
    const everyone = [this.player, ...this.net.remotePlayers()];
    if (everyone.every((p) => p.dead)) {
      this.net.send({ t: "ev", e: "wipe" });
      this.partyWipe();
    }
  }

  partyWipe() {
    if (this.wipePending) return;
    this.wipePending = true;
    this.ui.showDowned(false);
    this.ui.partyFallen(true);
    setTimeout(() => {
      this.ui.partyFallen(false);
      this.respawnPlayer();
      if (this.isHost() && this.bossFight && this.boss && !this.boss.death) {
        // The boss recovers and its meteors vanish
        this.boss.health = this.boss.maxHealth;
        this.boss.armor = this.boss.maxArmor;
        this.enemies = this.enemies.filter((e) => e === this.boss);
      }
      this.wipePending = false;
    }, Setting.PARTY_WIPE_TIME);
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

    const stunned = boss.isStunned();
    const health = Math.max(0, boss.health) / boss.maxHealth;
    const armor = stunned ? 0 : Math.max(0, boss.armor) / boss.maxArmor;
    const key = `${boss.displayName}|${health.toFixed(3)}|${armor.toFixed(3)}|${stunned}`;
    if (key === this.bossBarKey) return;
    this.bossBarKey = key;

    $("#boss-bar .boss-bar-name").text(boss.displayName);
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

  // Multiplier for boss health and armor
  difficulty() {
    return 1 + Setting.COOP_HEALTH_PER_PLAYER * this.extraPlayers();
  }

  // Multiplier for regular enemies' health (lower than the boss's: there are more of them)
  enemyDifficulty() {
    return 1 + Setting.COOP_ENEMY_HEALTH_PER_PLAYER * this.extraPlayers();
  }

  // Room for one more spawn group (spawnEnemy adds a whole group) under the cap
  canSpawnGroup() {
    return this.aliveEnemy() + Setting.ENEMY_SPAWN_PER_TIME <= this.maxAliveEnemies();
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
        const damage = n || this.player.damage;
        this.net.send({ t: "hit", to: "host", id: enemy.netId, n: damage });
        if (enemy.predictHit) enemy.predictHit(damage);
      }
      return;
    }
    this.applyHit(enemy, n, this.myStatsKey());
  }

  // withStats: include the scoreboard (sent now and then; guests keep the last one)
  buildSnapshot(withStats = true) {
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
      stage: this.stage,
      ak: this.areaStartKills,
      st: withStats ? this.stats : undefined, // so a promoted host keeps the scoreboard
    };
  }

  applySnapshot(s) {
    if (s.st) this.stats = s.st;
    if (s.stage) this.syncStage(s.stage);
    if (s.ak !== undefined) this.areaStartKills = s.ak;
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
    // The old host left while the False Knight's death was leading into the Grove
    if (this.stage === "boss1" && this.boss && this.boss.death) this.bossDefeated(this.boss);
  }

  respawnPlayer() {
    const p = this.player;
    p.state = "";
    p.dead = false;
    p.downed = false;
    this.ui.showDowned(false);
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

  // A teammate revived us: stand up where we fell with half our hearts
  revivePlayer() {
    const p = this.player;
    if (!p.dead) return;
    const { x, y } = p;
    this.respawnPlayer();
    p.x = x;
    p.y = y - 20;
    p.health = Math.ceil(p.maxHealthValue / 2);
    this.ui.changeHealth(p.health);
    this.ui.whiteScreen(150, 0.3);
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
    return this.enemies.filter((e) => !e.dead && !e.death && !e.isProjectile).length;
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
    const leaving = this.net ? this.net.leaveGame() : Promise.resolve();
    leaving.then(() => window.location.reload());
  }

  spawnEnemy() {
    if (this.stage === "area2") {
      Mossling.Generate(this.width, true);
      SporeDrifter.Generate();
      Mossling.Generate(0, false);
      return;
    }
    Crawlid.GenerateCrawlid(this.width, true);
    Boofly.Generate();
    Crawlid.GenerateCrawlid(0, false);
  }

  checkCrawlidKilled() {
    const ui = UI.getInstance();
    const door = BossDoor.GetInstance();
    if (ui.money - this.areaStartKills >= this.killsForBossDoor() && !door.open) {
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
    if (this.isHost()) {
      this.scoreRows = this.buildScoreRows();
      if (this.isNetworked()) this.net.send({ t: "ev", e: "finish", rows: this.scoreRows });
    }
    // Nothing is shared after this point; leaving now lets the next group use the
    // lobby, and a refresh during the credits goes to the menu instead of back here
    if (this.isNetworked()) {
      const wasGuest = this.isGuest();
      this.net.leaveGame();
      // On our own from here, like after a disconnect: run the (finished) world locally
      if (wasGuest) this.becomeHost();
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

      // Scoreboard first, then the credits roll
      if (this.scoreRows) this.ui.showScoreboard(this.scoreRows);
      setTimeout(() => {
        this.ui.hideScoreboard();
        this.credit = true;
      }, Setting.SCOREBOARD_TIME);
    }, 3000);
  }

  changeBossScene() {
    const grove = this.stage === "area2";
    this.stage = grove ? "boss2" : "boss1";

    // Settup Background
    this.mainBackground.sprite = grove ? A2_BOSS_BACKGROUND() : GET_BOSS_BG();
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

    // Hide the door counter during the fight
    this.ui.changeMoney(this.ui.money);

    // Create Boss (guests get a mirror of the host's boss from snapshots)
    if (this.isGuest()) return;
    let boss;
    if (grove) {
      boss = new Warden(this.width - 700, this.height - 200 - Setting.WARDEN_SIZE);
      boss.health = boss.maxHealth = Math.ceil(Setting.WARDEN_HEALTH * this.difficulty());
      boss.armor = boss.maxArmor = Math.ceil(Setting.WARDEN_ARMOR * this.difficulty());
    } else {
      boss = new Boss(Setting.BOSS_INITIAL_X, Setting.BOSS_INITIAL_Y, Setting.BOSS_WIDTH, Setting.BOSS_HEIGHT);
      boss.health = boss.maxHealth = Math.ceil(Setting.BOSS_HEALTH * this.difficulty());
      boss.armor = boss.maxArmor = Math.ceil(Setting.BOSS_ARMOR * this.difficulty());
    }
    this.enemies.push(boss);
    this.boss = boss;
  }

  // Host: a boss fell. The False Knight opens the way to the Grove; the Warden ends the run.
  bossDefeated(boss) {
    if (!this.isHost()) return;
    if (this.stage !== "boss1") {
      this.finishGame();
      return;
    }
    this.ui.showTitle(Setting.AREA2_TRANSITION_DELAY, "The way to the Sunken Grove opens");
    if (this.isNetworked()) this.net.send({ t: "ev", e: "grove-opens" });
    setTimeout(() => {
      if (this.stage !== "boss1") return;
      this.enterArea2();
      if (this.isNetworked()) this.net.send({ t: "ev", e: "area2" });
    }, Setting.AREA2_TRANSITION_DELAY);
  }

  // Catch up to the host's stage (also used for late joiners / rejoiners)
  syncStage(target) {
    let guard = 4;
    while (STAGES.indexOf(this.stage) < STAGES.indexOf(target) && guard-- > 0) {
      if (this.stage === "boss1") this.enterArea2();
      else this.changeBossScene();
    }
  }

  // Area 2: the Sunken Grove. New look, new enemies, a bench, and a gate to the Warden.
  enterArea2() {
    if (STAGES.indexOf(this.stage) >= STAGES.indexOf("area2")) return;
    preloadArea2();
    this.stage = "area2";
    this.bossFight = false;
    this.boss = null;
    this.enemies.length = 0;
    // Drop leftovers from the boss room (the False Knight's ghost)
    this.characters = this.characters.filter((c) => c === this.player);

    this.mainBackground.sprite = A2_BACKGROUND();
    this.mainBackground.reset();
    this.backgrounds.forEach((bg) => {
      bg.sprite = A2_FOREGROUND();
      bg.reset();
    });
    this.grounds.forEach((ground) => {
      if (ground instanceof Ground) ground.sprite = A2_FLOOR();
    });
    this.objects.length = 0;
    Ground.GeneratePlatform(A2_PLATFORM());
    Rest.GenerateRest();
    this.bossDoor.setArea(2);

    this.areaStartKills = this.ui.money;
    this.ui.changeMoney(this.ui.money);
    this.audio.stopAllAudio();
    this.audio.play(MyAudio.HOME);
    this.ui.showTitle(Setting.AREA2_TITLE_TIME, "Sunken Grove");
    this.respawnPlayer();
    // First wave right away instead of waiting for the spawn timer
    if (this.isHost()) this.spawnEnemy();
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
      this.checkPartyWipe();
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
      this.renderFloatTexts();
      if (this.useCamera) this.camera.end();
    }
    if (this.net && this.player) this.net.tick(this.delta);
    this.scheduleFrame();
  }

  // Browsers stop requestAnimationFrame in a hidden or minimised tab. Alone that's
  // a fine pause, but in co-op it freezes our knight for everyone, and if we're the
  // host every enemy with it. So while hidden in co-op, a worker's timer (not
  // throttled like the page's own) keeps the game ticking.
  scheduleFrame() {
    if (!this.renderBound) {
      this.renderBound = () => {
        this.frameRequest = null;
        this.render();
      };
      document.addEventListener("visibilitychange", () => {
        if (!this.frameRequest) return;
        if (this.frameRequest.raf) cancelAnimationFrame(this.frameRequest.raf);
        else this.frameRequest.cancel();
        this.frameRequest = null;
        this.scheduleFrame();
      });
    }
    if (document.hidden && this.isNetworked()) {
      this.frameRequest = { cancel: BackgroundTicker.next(this.renderBound) };
    } else {
      this.frameRequest = { raf: requestAnimationFrame(this.renderBound) };
    }
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
