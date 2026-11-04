import { GAME } from "../game.js";
import {
  GET_HIT,
  GET_PLAYER_ATTACK_SPLASH_SPRITE,
  GET_PLAYER_ATTACK_SPRITE,
  GET_PLAYER_BLAST_MOVEMENT,
  GET_PLAYER_DASH_SPRITE,
  GET_PLAYER_DEAD,
  GET_PLAYER_IDLE_SPRITE,
  GET_PLAYER_JUMP_SPRITE,
  GET_PLAYER_WALK_SPRITE,
  HIT_CONF,
  PLAYER_CONF,
} from "../facade/file.js";
import { Character } from "../parent/character.js";
import { Setting } from "../setting.js";
import { Particle } from "./particle.js";
import { UI } from "./ui.js";
import { MyAudio } from "../facade/audio.js";
import { Blast } from "./blast.js";
import { SkillEffect } from "./skill.js";
import { SHOP_ITEMS } from "../shop.js";
import { DEFAULT_HERO, HEROES, heroOf, heroSfx, heroSprite, preloadHero } from "../heroes.js";

const RUN_STATS_KEY = "wcl-knights-run";

export class Player extends Character {
  move() {}

  // Method for rendering player right circle
  renderLight() {
    const lightRadius = 200;
    const game = GAME.getInstance();
    game.ctx.beginPath();
    game.ctx.fillStyle = "white";
    const midX = Math.round(this.middleXPos());
    const midY = Math.round(this.middleYPos());

    if (midX && midY) {
      var radgrad = game.ctx.createRadialGradient(
        midX,
        midY,
        0,
        midX,
        midY,
        lightRadius
      );
      radgrad.addColorStop(0, "rgba(255,255,255,0.45)");
      radgrad.addColorStop(0.2, "rgba(255,255,255,0.25)");
      radgrad.addColorStop(0.5, "rgba(255,255,255,0.15)");
      radgrad.addColorStop(1, `rgba(${heroOf(this.heroId).glow},0)`);

      game.ctx.fillStyle = radgrad;
      game.ctx.fillRect(0, 0, game.width, game.height);
      game.ctx.globalAlpha = 1;
    }
  }

  importantState(state) {
    const states = ["jump", "attack", "dash"];
    return states.includes(state);
  }

  maxHealth() {
    this.health = this.maxHealthValue;
  }

  changeSprite(state) {
    if (state == "dead") {
    } else if (
      this.state == "dead" ||
      (this.state == "attack" &&
        state != "dash" &&
        state != "attack" &&
        state != "force_idle") ||
      (this.state == "jump" && state != "attack" && state != "jump") ||
      this.state == "dash"
    ) {
      return false;
    }

    if (this.state == state && this.state != "attack" && state != "attack") {
      return false;
    }
    switch (state) {
      case "dash":
        this.game.audio.play(MyAudio.PLAYER_DASH, false);
        this.spriteIdx = 0;
        this.anim = "dash";
        this.config = PLAYER_CONF.dash;
        this.sprite = heroSprite(this.heroId, "dash");
        break;
      case "force_idle":
      case "idle":
        this.anim = "idle";
        this.config = PLAYER_CONF.idle;
        this.sprite = heroSprite(this.heroId, "idle");
        break;
      case "walk":
        if (this.state == state) {
          return;
        }
        this.anim = "walk";
        this.config = PLAYER_CONF.walk;
        this.sprite = heroSprite(this.heroId, "walk");
        break;
      case "attack":
        this.game.audio.playHero(heroSfx(this.heroId, "attack"), MyAudio.PLAYER_ATTACK);
        this.spriteIdx = 0;
        this.anim = "attack" + this.attackState;
        this.sprite = heroSprite(this.heroId, this.anim);
        if (this.attackState == 1) {
          this.config = PLAYER_CONF.attack;
        } else {
          this.config = PLAYER_CONF.attack2;
        }
        this.incrementAttackState();
        break;
      case "blast":
        this.spriteIdx = 0;
        this.anim = "blast";
        this.config = PLAYER_CONF.blast_movement;
        this.sprite = heroSprite(this.heroId, "blast");
        break;
      case "jump":
        this.spriteIdx = 0;
        this.anim = "jump";
        this.config = PLAYER_CONF.jump;
        this.sprite = heroSprite(this.heroId, "jump");
        break;
      case "dead":
        this.spriteIdx = 0;
        this.anim = "dead";
        this.config = PLAYER_CONF.dead;
        this.sprite = heroSprite(this.heroId, "dead");
        break;
    }
    this.finishState = false;
    this.state = state;
    return true;
  }

  incrementAttackState() {
    this.attackState += 1;
    if (this.attackState >= 3) {
      this.attackState = 1;
    }
  }

  attack() {
    if (!this.canAttack || !this.canMove) return;

    // Get Node (x, y) in front of player position
    const node = this.inFrontNode(-10);

    this.changeSprite("attack");
    const offsetX = 30 + (this.attackState == 2 ? 5 : 0);
    const offsetTopY = -20 + (this.attackState == 2 ? 15 : 0);

    const x = this.backward
      ? node.x - this.splashWidth - offsetX
      : node.x + offsetX;
    const y = node.y - this.splashHeight / 2 - offsetTopY;
    const w = this.splashWidth;
    const h = this.splashHeight;

    // Emit The White Particle Effect
    Particle.Emit(
      x,
      y,
      w,
      h,
      GET_PLAYER_ATTACK_SPLASH_SPRITE(this.attackState),
      this.attackState == 1 ? PLAYER_CONF.splash1 : PLAYER_CONF.splash2,
      this.backward,
      this.playerSplashAttack(x, y, w, h)
    );
    this.game.net?.sendEffect({
      k: "slash",
      x: Math.round(x),
      y: Math.round(y),
      w,
      h,
      s: this.attackState,
      b: this.backward ? 1 : 0,
    });

    this.canAttack = false;
  }

  clearKey() {
    this.game.keys = [];
  }

  checkMovement() {
    if (this.state == "dash" && this.spriteIdx == this.config.max - 1) {
      if (this.backward) {
        this.vx = -Setting.CHARACTER_DASH_FORCE;
      } else {
        this.vx = Setting.CHARACTER_DASH_FORCE;
      }
    } else if (this.canMove && this.game.keys[Setting.PLAYER_MOVEMENT_RIGHT]) {
      // this.game.moveBackground(false);
      this.changeSprite("walk");
      this.backward = false;
      this.vx += this.speedX * this.game.delta;
      this.vx += this.speedX * this.game.delta;
    } else if (this.canMove && this.game.keys[Setting.PLAYER_MOVEMENT_LEFT]) {
      // this.game.moveBackground(true);
      this.changeSprite("walk");
      this.vx -= this.speedX * this.game.delta;
      this.backward = true;
    } else if (
      this.state != "dash" &&
      this.state != "blast" &&
      this.isKnockback == ""
    ) {
      this.changeSprite("idle");
      this.vx = 0;
    }
  }

  // Always be called when super class render (object)

  checkStateThatFinished() {
    // Check if attacking state
    if (
      (this.state == "jump" ||
        this.state == "attack" ||
        this.state == "blast") &&
      this.finishState
    ) {
      if (this.state == "attack" && this.jumping) {
        // console.log("set last jump");
        // Check if last state is jumping
        this.config = PLAYER_CONF.jump;

        // Jumping State
        this.spriteIdx = PLAYER_CONF.jump.max - 4;
        this.anim = "jump";
        this.sprite = heroSprite(this.heroId, "jump");
        // this.state = "jump";
        // this.state = "";
      } else {
        // If attack state then change the sprite into idle
        if (this.state == "attack" && this.isKnockback != "") {
          this.changeSprite("force_idle");
        }
        this.state = "";
      }
    }
  }

  playerSplashAttack(x, y, w, h) {
    this.game.enemies.forEach((enemy) => {
      if (enemy.isCollideBlock(x, y, w, h)) {
        if (!enemy.isDead()) {
          this.knockback(Setting.CHARACTER_KNOCKBACK_POWER);
          this.game.audio.play(MyAudio.HIT, false);
          Particle.HitParticle(x + w, y + w / 2);
          this.incrementBlastPower();
        }
        this.game.damageEnemy(enemy);
      }
    });
  }

  checkCollideEnemy() {
    const x = this.x + this.offsetX / 2;
    const y = this.y + this.offsetY / 2 + 15;
    const w = this.w - this.offsetX;
    const h = this.h - this.offsetY;

    if (this.cheat || this.invicible || this.dead || this.shopping || this.state == "dash")
      return;

    for (const enemy of this.game.enemies) {
      if (enemy.isCollideBlock(x, y, w, h) && !enemy.dead && !enemy.harmless && !enemy.isPredictedDead?.()) {
        // Collide With Enemy!
        // Projectiles (spores) pop on impact
        if (enemy.isProjectile) this.game.damageEnemy(enemy, 1);
        Particle.PlayerHit(this.x, this.y, this.backward);
        this.game.audio.play(MyAudio.PLAYER_HIT, false);
        this.clearKey();
        this.hit();
        if (this.game.hasPeers()) {
          // Can't freeze the shared world for a hit-stop with other players in it
          this.invicible = true;
        } else {
          this.game.pauseGame(false, false);
          setTimeout(() => {
            this.invicible = true;
            this.game.resumeGame();
          }, 500);
        }
        return;
      }
    }
  }

  die() {
    this.dead = true;
    this.deaths += 1;
    this.saveRunStats();
    this.changeSprite("dead");
    this.clearKey();
    this.canMove = false;
    this.vx = 0;
    this.vy = 0;

    // With teammates around you're only downed: you stay put until revived
    if (this.game.hasPeers()) {
      this.downed = true;
      this.game.ui.showDowned(true);
      return;
    }

    this.canCollide = false;
    this.gravity = false;
    setTimeout(() => {
      this.fade = true;
    }, Setting.CHARACTER_FADE_TIMEOUT);
    setTimeout(() => {
      // In multiplayer you respawn instead of reloading the page
      const respawn = this.game.isNetworked()
        ? () => this.game.respawnPlayer()
        : null;
      this.game.ui.deadScreen(respawn);
    }, Setting.CHARACTER_DEATH_BLACK_SCREEN_TIMEOUT);
  }

  blast() {
    if (
      this.isGrounded() &&
      this.blastPower > 0 &&
      this.changeSprite("blast")
    ) {
      this.spawnedBlast = false;
      this.decrementBlastPower();
      this.spawnBlast();
    }
  }
  spawnBlast() {
    if (this.heroId !== DEFAULT_HERO) {
      this.castSkill();
      return;
    }
    Particle.BlastParticle(this.x, this.y);
    const blast = new Blast(this.x, this.y + this.h / 2, this.backward);
    this.game.blasts.push(blast);
    this.game.net?.sendEffect({
      k: "blast",
      px: Math.round(this.x),
      py: Math.round(this.y),
      x: Math.round(this.x),
      y: Math.round(this.y + this.h / 2),
      b: this.backward ? 1 : 0,
    });
    this.spawnedBlast = true;
  }

  // Elemental heroes replace the soul blast with their own skill
  castSkill() {
    const effect = SkillEffect.Cast(this.heroId, this);
    this.game.net?.sendEffect({
      k: "skill",
      hr: this.heroId,
      x: Math.round(effect.x),
      y: Math.round(effect.y),
      b: this.backward ? 1 : 0,
    });
    this.spawnedBlast = true;
  }

  setHero(id) {
    const hero = heroOf(id);
    this.heroId = HEROES[id] ? id : DEFAULT_HERO;
    this.stats = hero.stats;
    this.speedX = Setting.CHARACTER_SPEED * hero.stats.speed;
    this.maxSpeed = Setting.CHARACTER_MAX_SPEED * hero.stats.speed;
    this.maxHealthValue = hero.stats.maxHealth;
    this.health = this.maxHealthValue;
    this.splashWidth = 150 * hero.stats.range;
    this.splashHeight = 150 * hero.stats.range;
    this.attackSpeed = 0.4 / hero.stats.attackSpeed;
    preloadHero(this.heroId);
    this.game.audio.preloadHero(hero.sfx);
    this.game.ui.setMaxHealth(this.maxHealthValue);
  }

  checkFade() {
    if (this.fade) {
      this.alpha -= Setting.CHARACTER_FADE_VELOCITY * this.game.delta;
    }
  }

  checkDeadState() {
    if (this.state == "dead" && !this.downed) {
      const r = Setting.CHARACTER_RANDOM_DEATH;
      const max = r;
      const min = -r;
      const xR = Math.round(Math.random() * (max - min) + min);
      const yR = Math.round(Math.random() * (max - min) + min);
      this.x += xR * this.game.delta;
      this.y += yR * this.game.delta;

      const multiplier = Setting.CHARACTER_SPEED_UP_DEATH * this.game.delta;

      this.deadMaxY -= multiplier;
      if (this.deadMaxY <= 0) {
        this.vy = 0;
      } else {
        this.vy -= multiplier;
      }

      if (this.config.max - 1 == this.spriteIdx) {
        this.spriteIdx = this.config.max - 1;
      }
    }
  }

  hit() {
    this.health -= 1;
    // Change UI
    const ui = UI.getInstance();
    ui.changeHealth(this.health);

    if (this.health <= 0) {
      this.die();
    }
  }

  checkAttack() {
    if (!this.canAttack) {
      if (this.attackInterval >= this.attackSpeed) {
        this.attackInterval = 0;
        this.canAttack = true;
      } else {
        this.attackInterval += this.game.delta;
      }
    }
  }

  isGrounded() {
    return (
      this.game.isCollideObjectBlock(
        this.x + 40,
        this.y + this.h + this.vy * this.game.delta,
        30,
        1
      ) ||
      this.game.isCollideObjectGrounded(
        this.x + 40,
        this.y + this.h + this.vy * this.game.delta,
        30,
        1
      )
    );
  }

  isCollideObject() {
    let flag = false;

    this.game.objects.forEach((obj) => {
      const offsetX = 35 + this.vx * this.game.delta;
      const offsetBackwardX = -70 + this.vx * this.game.delta;
      const inc = !this.backward ? 1 + offsetBackwardX + this.w : -1 + offsetX;

      // this.game.debug(obj.x, obj.y, obj.w, obj.h, "yellow");

      const x = this.x + inc;
      const y = this.y + 80 + this.vy * this.game.delta;
      const w = this.w / 4 + 10;
      const h = 30;

      // this.game.debug(x, y, w, h, "blue");
      if (obj.isCollideBlock(x, y, w, h)) {
        flag = true;
      }
    });
    return flag;
  }

  checkDashState() {
    if (this.state == "dash") {
      const lastIdx = this.config.max - 1;
      // Keep Getting Last Index
      if (this.spriteIdx > lastIdx) {
        this.spriteIdx = lastIdx;
      }
    }
  }

  isBoundMaxCamera() {
    const x = this.x;
    const maxLeft = this.game.maxLeftX;
    const maxRight = this.game.maxRightX - 100;
    if (x < maxLeft || x > maxRight) {
      return true;
    } else {
      return false;
    }
  }

  isNotMovingX() {
    return this.vx == 0;
  }

  isKnockbackState() {
    return (
      this.isKnockback == "knockback_left" ||
      this.isKnockback == "knockback_right"
    );
  }

  checkBackground() {
    // Change Background
    const game = GAME.getInstance();
    if (!this.isBoundMaxCamera() && !this.isNotMovingX()) {
      game.moveBackground(game.player.backward);
    }
  }

  checkIdleState() {
    if (this.state == "idle") {
      this.restoreDefaultScale();
    }
  }

  checkKnockbackState() {
    // Recover From X Knockback
    if (this.isKnockback == "knockback_left") {
      this.vx += Setting.CHARACTER_KNOCKBACK_RESISTANCE * this.game.delta;
      if (this.vx >= 0) {
        this.isKnockback = "";
      }
    } else if (this.isKnockback == "knockback_right") {
      this.vx -= Setting.CHARACTER_KNOCKBACK_RESISTANCE * this.game.delta;
      if (this.vx <= 0) {
        this.isKnockback = "";
      }
    }
  }

  checkBlast() {
    if (
      this.state == "blast" &&
      this.spriteIdx == this.config.max - 1 &&
      this.spawnedBlast == false
    ) {
      this.spawnBlast();
    }
  }

  parentMethod() {
    this.checkKnockbackState();
    this.checkIdleState();
    this.checkBackground();
    this.checkJumping();
    this.checkAttack();
    this.checkCollideEnemy();
    this.checkStateThatFinished();
    this.checkMovement();
    this.checkDashState();
    this.renderLight();
    this.checkLand();
    this.checkDeadState();
    this.checkFade();
    this.checkBlast();
    this.checkDowned();
    this.checkRevive();
  }

  // Kept per tab so a rejoin after a refresh keeps our scoreboard numbers
  saveRunStats() {
    try {
      sessionStorage.setItem(
        RUN_STATS_KEY,
        JSON.stringify({
          deaths: this.deaths,
          revives: this.revives,
          coinsSpent: this.coinsSpent,
          upgrades: this.upgrades,
        })
      );
    } catch {
      // not kept - fine
    }
  }

  // rejoined: restore the numbers from before the refresh, otherwise start fresh
  loadRunStats(rejoined) {
    try {
      const saved = rejoined && JSON.parse(sessionStorage.getItem(RUN_STATS_KEY));
      this.deaths = saved?.deaths || 0;
      this.revives = saved?.revives || 0;
      this.coinsSpent = saved?.coinsSpent || 0;
      // Re-apply bought upgrades (needs the hero's stats set first)
      SHOP_ITEMS.forEach((item) => {
        const level = Math.min(saved?.upgrades?.[item.id] || 0, item.costs.length);
        for (let i = 0; i < level; i++) item.apply(this);
        if (level) this.upgrades[item.id] = level;
      });
    } catch {
      this.deaths = 0;
      this.revives = 0;
    }
    this.saveRunStats();
  }

  // Downed but everyone else left: nobody can revive us, so get back up
  checkDowned() {
    if (this.downed && !this.game.hasPeers()) this.game.respawnPlayer();
  }

  // Hold interact next to a downed teammate to bring them back
  checkRevive() {
    this.reviveCandidate = null;
    if (this.dead || !this.game.hasPeers()) {
      this.reviveTarget = null;
      return;
    }
    this.reviveCandidate =
      this.game.net
        .remotePlayers()
        .find(
          (p) =>
            p.dead &&
            Math.abs(p.middleXPos() - this.middleXPos()) < Setting.REVIVE_RANGE &&
            Math.abs(p.middleYPos() - this.middleYPos()) < Setting.REVIVE_RANGE
        ) || null;

    const holding = Setting.PLAYER_INTERACT.some((key) => this.game.keys[key]);
    const target = holding ? this.reviveCandidate : null;
    if (target !== this.reviveTarget) {
      this.reviveTarget = target;
      this.reviveProgress = 0;
    }
    if (!target) return;

    this.reviveProgress += this.game.delta;
    if (this.reviveProgress >= Setting.REVIVE_TIME) {
      this.game.net.send({ t: "revive", to: target.id });
      target.dead = false; // until their next update, so we don't revive twice
      this.revives += 1;
      this.saveRunStats();
      this.reviveTarget = null;
      this.reviveProgress = 0;
    }
  }

  jump() {
    if (this.canMove && this.canJump() && this.state != "dash") {
      this.game.audio.play(MyAudio.PLAYER_JUMP, false);
      this.jumping = true;
      this.vy -= Setting.CHARACTER_JUMP_FORCE * this.stats.jump;
      this.changeSprite("jump");
    }
  }

  initPlayer() {
    this.splashWidth = 150;
    this.splashHeight = 150;
    this.attackSprite = GET_PLAYER_ATTACK_SPLASH_SPRITE(this.attackState);
  }

  initAllSprite() {
    // Initial all sprite first (because there's some bug if init later)
    GET_PLAYER_WALK_SPRITE();
    GET_PLAYER_ATTACK_SPLASH_SPRITE(1);
    GET_PLAYER_ATTACK_SPLASH_SPRITE(2);
    GET_PLAYER_ATTACK_SPRITE();
    GET_PLAYER_WALK_SPRITE();
    GET_PLAYER_IDLE_SPRITE();
  }

  restoreDefaultScale() {
    this.w = Setting.CHARACTER_WIDTH * this.game.scale;
    this.h = Setting.CHARACTER_HEIGHT * this.game.scale;
  }

  dash() {
    if (this.canDash && this.canJump() && !this.jumping && !this.postJump) {
      // If dash state cannot be activated then return
      if (!this.changeSprite("dash")) return;

      this.vx = 1000;
      this.w = 150; // Sprite width of dash
      this.canDash = false;
      Particle.DashParticle(this.x, this.y, this.backward);
      this.saveScale();
      this.game.after(Setting.CHARACTER_DASH_TIME / 1000, () => {
        this.restoreDefaultScale();
        this.state = "";
        this.changeSprite("idle");
        const cooldown = (Setting.CHARACTER_DASH_TIMEOUT / 1000) * this.stats.dashCooldown;
        this.game.after(cooldown, () => {
          this.canDash = true;
        });
      });
    }
  }

  checkLand() {
    if (this.jumping && this.isGrounded()) {
      this.jumping = false;
      this.postJump = true;
    }
  }

  checkJumping() {
    if (this.postJump) {
      this.config = {
        max: this.config.max,
        speed: 4,
      };
      if (this.spriteIdx == this.config.max - 1) {
        this.changeSprite("idle");
        this.postJump = false;
      }
    }
    if (this.jumping && this.state != "attack") {
      const lastIdx = this.config.max - 4;
      if (this.spriteIdx >= lastIdx) {
        this.spriteIdx = lastIdx;
      }
    }
  }

  decrementBlastPower() {
    this.blastPower -= 1;
    const ui = UI.getInstance();
    ui.setSkillText(this.blastPower);
  }

  incrementBlastPower() {
    this.blastHitInterval += 1;
    if (this.blastHitInterval >= this.hitsPerCharge) {
      this.blastPower += 1;
      this.blastHitInterval = 0;

      // Set the blast power ui
      const ui = UI.getInstance();
      ui.setSkillText(this.blastPower);
    }
  }

  netPlayerState() {
    return {
      t: "p",
      x: Math.round(this.x),
      y: Math.round(this.y),
      ...this.netVelocity(),
      w: Math.round(this.w),
      h: Math.round(this.h),
      b: this.backward ? 1 : 0,
      i: this.spriteIdx,
      a: this.anim,
      al: Math.round(this.getAlpha() * 100) / 100,
      d: this.dead ? 1 : 0,
      hr: this.heroId,
      dt: this.deaths,
      rv: this.revives,
    };
  }

  constructor(x, y, w, h, sprite, maxSprite) {
    super(x, y, w, h, sprite, maxSprite);
    this.anim = "idle";
    this.heroId = DEFAULT_HERO;
    this.stats = HEROES[DEFAULT_HERO].stats;
    this.deaths = 0;
    this.revives = 0;
    // Shop: coins spent, upgrade levels by item id, and what Soul Catcher changes
    this.coinsSpent = 0;
    this.upgrades = {};
    this.hitsPerCharge = Setting.CHARACTER_GET_BLAST;
    this.shopping = false;
    this.downed = false;
    this.reviveProgress = 0;
    this.reviveTarget = null;
    this.reviveCandidate = null;
    this.maxHealthValue = Setting.CHARACTER_MAX_HEALTH;
    this.isKnockback = "";
    this.attackState = 1;
    this.cheat = false;
    this.fade = false;
    this.deadMaxY = Setting.CHARACTER_MAX_DEAD_HEIGHT;
    this.canMove = true;
    this.initPlayer();
    this.initAllSprite();
    this.canDash = true;
    this.canAttack = true;
    this.attackSpeed = 0.4;
    this.damage = 1;
    this.attackInterval = 0;
    this.spawnedBlast = false;
    this.offsetX = 60;
    this.offsetY = 40;
    this.health = Setting.CHARACTER_MAX_HEALTH;
    this.blastHitInterval = 0;
    this.blastPower = 0;
  }
}
