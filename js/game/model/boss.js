import { MyAudio } from "../facade/audio.js";
import { Credit } from "../facade/credit.js";
import {
  BOSS_CONF,
  GET_BOSS_ATTACK_PREP_SPRITE,
  GET_BOSS_ATTACK_SPRITE,
  GET_BOSS_DIE_SPRITE,
  GET_BOSS_GHOST_SPRITE,
  GET_BOSS_IDLE_SPRITE,
  GET_BOSS_JUMP_SPRITE,
  GET_BOSS_LAND_SPRITE,
  GET_BOSS_STUN_SPRITE,
} from "../facade/file.js";
import { isInTheLeft, randomInt } from "../facade/helper.js";
import { GAME } from "../game.js";
import { Character } from "../parent/character.js";
import { Enemy } from "../parent/enemies.js";
import { Object } from "../parent/object.js";
import { Setting } from "../setting.js";
import { Ghost } from "./ghost.js";
import { Meteor } from "./meteor.js";

export class Boss extends Enemy {
  static IDLE = 1;
  static ATTACK_PREP = 2;
  static ATTACK = 3;
  static JUMP = 4;
  static LAND = 5;
  static DEATH = 6;
  static STUN = 7;

  static NET_KIND = "B";

  // State -> sprite, config and sound, used to mirror the host's boss.
  // Built lazily: file.js may not be initialised yet when this module loads.
  static netAnims() {
    return {
      [Boss.IDLE]: [GET_BOSS_IDLE_SPRITE, BOSS_CONF.idle],
      [Boss.ATTACK_PREP]: [GET_BOSS_ATTACK_PREP_SPRITE, BOSS_CONF.attack_prep, MyAudio.FALSE_ATTACK],
      [Boss.ATTACK]: [GET_BOSS_ATTACK_SPRITE, BOSS_CONF.attack],
      [Boss.JUMP]: [GET_BOSS_JUMP_SPRITE, BOSS_CONF.jump, MyAudio.FALSE_JUMP],
      [Boss.LAND]: [GET_BOSS_LAND_SPRITE, BOSS_CONF.land, MyAudio.FALSE_LAND],
      [Boss.DEATH]: [GET_BOSS_DIE_SPRITE, BOSS_CONF.die],
      [Boss.STUN]: [GET_BOSS_STUN_SPRITE, BOSS_CONF.stun],
    };
  }

  constructor(x, y, w, h) {
    const sprite = GET_BOSS_IDLE_SPRITE();
    const config = BOSS_CONF.idle;
    super(x, y, w, h, sprite, config);
    super.maxSpeed = Setting.BOSS_MAX_SPEED;
    this.attackTimes = 0;
    this.attacked = false;
    this.armor = Setting.BOSS_ARMOR;
    this.state = Boss.IDLE;
    this.health = Setting.BOSS_HEALTH;
    this.maxHealth = Setting.BOSS_HEALTH;
    this.maxArmor = Setting.BOSS_ARMOR;
    this.isStrike = true;
    this.jumping = false;
  }

  landing() {
    this.jumping = false;
    this.changeState(Boss.LAND);
    this.game.shakeScene(1);
  }

  checkLanding() {
    if (this.jumping) {
      // Check already landing
      if (this.vy == 0) {
        // Already Landing
        this.landing();
      }
    }
  }

  checkOffset() {
    if (!this.backward) {
      super.offsetX = 210;
      super.offsetY = 100;
      super.offsetW = -300;
      super.offsetH = -130;
    } else {
      super.offsetX = 50;
      super.offsetY = 100;
      super.offsetW = -300;
      super.offsetH = -130;
    }
  }

  getTempNode() {
    const temp = this.tempNode;
    this.tempNode = null;
    return temp;
  }

  setTemp(x, y, w, h) {
    this.tempNode = { x, y, w, h };
  }

  setCurrentTemp() {
    this.setTemp(this.x, this.y, this.w, this.h);
  }

  setPosToNode(node) {
    this.x = node.x;
    this.y = node.y;
    this.w = node.w;
    this.h = node.h;
  }

  ghostDie() {
    this.lookAtPlayer();
    Ghost.Generate(this.backward, this.x, this.y, this.w);
  }

  setDefaultSize() {
    const node = this.getTempNode();
    if (node) {
      this.setPosToNode(node);
    } else {
      this.w = Setting.BOSS_WIDTH;
      this.h = Setting.BOSS_HEIGHT;
      this.y = Setting.BOSS_INITIAL_Y;
    }
  }

  checkBound() {
    if (this.x <= 0) {
      this.x = 0;
    } else if (this.x + this.w >= this.game.width) {
      this.x = this.game.width - this.w;
    }
  }

  improvePos(offsetX) {
    const node = this.getTempNode();
    if (node) {
      this.setPosToNode(node);
    } else {
      this.w = Setting.BOSS_WIDTH;
      this.h = Setting.BOSS_HEIGHT;
      this.y = Setting.BOSS_INITIAL_Y;
    }

    if (this.backward) {
      this.x += offsetX;
    } else {
      this.x -= offsetX;
    }
  }

  improveSize(offsetX, offsetY) {
    const node = this.getTempNode();
    if (node) {
      this.setPosToNode(node);
    }
    this.setCurrentTemp();
    this.offset = offsetX;
    if (this.backward) {
      this.x += -offsetX - 50;
    } else {
      this.x += offsetX + 50;
    }
    this.y -= offsetY;
    this.w = Setting.BOSS_WIDTH + offsetX;
    this.h = Setting.BOSS_HEIGHT + offsetY;
  }

  changeState(state) {
    if (this.state) this.spriteIdx = 0;
    switch (state) {
      case Boss.IDLE:
        this.sprite = GET_BOSS_IDLE_SPRITE();
        this.config = BOSS_CONF.idle;
        this.setDefaultSize();
        break;
      case Boss.ATTACK_PREP:
        this.game.audio.play(MyAudio.FALSE_ATTACK, false);
        this.sprite = GET_BOSS_ATTACK_PREP_SPRITE();
        this.config = BOSS_CONF.attack_prep;
        this.improvePos(130);
        break;
      case Boss.ATTACK:
        this.sprite = GET_BOSS_ATTACK_SPRITE();
        this.config = BOSS_CONF.attack;
        this.improveSize(50, 150);
        break;
      case Boss.JUMP:
        this.game.audio.play(MyAudio.FALSE_JUMP, false);
        this.sprite = GET_BOSS_JUMP_SPRITE();
        this.config = BOSS_CONF.jump;
        this.setDefaultSize();
        break;
      case Boss.LAND:
        this.game.audio.play(MyAudio.FALSE_LAND, false);
        this.sprite = GET_BOSS_LAND_SPRITE();
        this.config = BOSS_CONF.land;
        this.setDefaultSize();
        break;
      case Boss.DEATH:
        this.sprite = GET_BOSS_DIE_SPRITE();
        this.config = BOSS_CONF.die;
        break;
      case Boss.STUN:
        this.sprite = GET_BOSS_STUN_SPRITE();
        this.config = BOSS_CONF.stun;
        this.improveSize(50, 100);
        break;
    }
    this.state = state;
  }

  checkAttack() {
    if (this.state == Boss.ATTACK && this.spriteIdx == 2 && this.isStrike) {
      // Strike
      const meteors =
        Setting.METEOR_SPAWN_PER_ATTACK +
        Setting.COOP_METEORS_PER_PLAYER * this.game.extraPlayers();
      for (let i = 0; i < meteors; i++) {
        Meteor.GenerateMeteor();
      }
      this.game.audio.play(MyAudio.FALSE_STRIKE, false);
      this.game.shakeScene(2);
      this.isStrike = false;
    }
    if (this.state == Boss.ATTACK && this.spriteIdx >= this.config.max - 1) {
      this.isStrike = true;
      this.spriteIdx = 0;
      this.attackTimes += 1;
      if (this.attackTimes >= Setting.BOSS_ATTACK_TIMES) {
        this.attackTimes = 0;
        this.changeState(Boss.IDLE);
      }
    }
  }

  jump() {
    if (!this.lookAtPlayer()) {
      const offsetX = 150;
      if (this.backward) {
        this.x += offsetX;
      } else {
        this.x -= offsetX;
      }
    }

    this.changeState(Boss.JUMP);
    const jumpForce = randomInt(
      Setting.BOSS_JUMP_FORCE - Setting.BOSS_JUMP_RANDOM,
      Setting.BOSS_JUMP_FORCE + Setting.BOSS_JUMP_RANDOM
    );
    this.vy = -jumpForce;
    this.jumping = true;
  }

  attack() {
    this.lookAtPlayer();
    this.changeState(Boss.ATTACK_PREP);
    this.game.after(Setting.BOSS_ATTACK_PREP_TIME / 1000, () => {
      if (this.state == Boss.ATTACK_PREP) {
        this.changeState(Boss.ATTACK);
      }
    });
  }

  incrementInvert(n) {
    this.invert += n;
    if (this.invert >= 1) {
      this.invert = 1;
    }
  }

  decrementInvert(n) {
    this.invert -= n;
    if (this.invert <= 0) {
      this.invert = 0;
    }
  }
  checkIncrementInvert() {
    if (this.attacked) {
      const inc = Setting.BOSS_INVERT_MULTIPLIES * this.game.delta;
      this.incrementInvert(inc);
    } else {
      const dec = Setting.BOSS_INVERT_MULTIPLIES * this.game.delta;
      this.decrementInvert(dec);
    }
    if (this.invert >= 1) {
      this.attacked = false;
    }
  }

  checkJumpState() {
    if (this.jumping) {
      if (this.backward) {
        this.vx += -Setting.BOSS_JUMP_SPEED * this.game.delta;
      } else {
        this.vx += Setting.BOSS_JUMP_SPEED * this.game.delta;
      }
      if (this.spriteIdx >= this.config.max - 1) {
        this.spriteIdx = this.config.max - 1;
      }
    }
  }

  checkLandState() {
    if (this.state == Boss.LAND) {
      this.vx = 0;
      if (this.spriteIdx >= this.config.max - 1) {
        this.changeState(Boss.IDLE);
      }
    }
  }

  checkDeathState() {
    if (this.state == Boss.DEATH) {
      this.vx = 0;
      this.spriteIdx = 1;
    }
  }
  checkStunState() {
    if (this.state == Boss.STUN) {
      if (this.spriteIdx >= this.config.max - 1) {
        this.vx = 0;
        this.spriteIdx = this.config.max - 1;
        this.canCollide = true;
      }
    }
  }

  randomState() {
    if (this.state == Boss.IDLE) {
      this.state = "";
      this.game.after(1, () => {
        if (this.state == "") {
          const attack = Math.random() < 0.5;
          if (attack) {
            this.attack();
          } else {
            this.jump();
          }
        }
      });
    }
  }

  checkIdleState() {
    if (this.state == Boss.IDLE) this.setDefaultSize();
  }

  parentMethod() {
    this.checkIdleState();
    this.checkJumpState();
    this.checkOffset();
    this.checkIncrementInvert();
    this.checkAttack();
    this.checkLanding();
    this.checkLandState();
    this.checkDeathState();
    this.checkStunState();
    this.checkBound();
    this.randomState();
  }

  die() {
    if (this.state == Boss.JUMP) return;
    this.death = true;
    this.ghostDie();
    this.canCollide = false;
    this.lookAtPlayer();
    if (this.backward) {
      this.vx = Setting.BOSS_DEATH_SPEED;
    } else {
      this.vx = -Setting.BOSS_DEATH_SPEED;
    }
    this.maxSpeed = Setting.BOSS_DEATH_SPEED;
    this.changeState(Boss.DEATH);

    this.game.finishGame();
  }

  decrementHealth(n = 0) {
    const game = GAME.getInstance();
    const dmg = n == 0 ? game.player.damage : n;
    if (this.state == Boss.STUN) {
      this.health -= dmg;
      game.audio.play(MyAudio.FALSE_HEAD_HIT, false);
      if (this.health <= 0) {
        this.die();
      }
    } else {
      this.armor -= dmg;
      if (this.armor <= 0) {
        this.stun();
      }
    }
  }

  stun() {
    if (this.state == Boss.JUMP) return;
    this.canCollide = false;
    this.lookAtPlayer();
    if (this.backward) {
      this.vx = Setting.BOSS_DEATH_SPEED;
    } else {
      this.vx = -Setting.BOSS_DEATH_SPEED;
    }
    this.maxSpeed = Setting.BOSS_DEATH_SPEED;
    this.changeState(Boss.STUN);
    this.game.after(Setting.BOSS_STUN_TIME / 1000, () => {
      if (!this.death) {
        this.maxSpeed = Setting.BOSS_MAX_SPEED;
        this.changeState(Boss.IDLE);
        this.armor = this.maxArmor || Setting.BOSS_ARMOR;
        const offsetX = 550;
        if (this.backward) {
          this.x += offsetX;
        } else {
          this.x += -offsetX;
        }
      }
    });
  }

  netAnim() {
    return this.state;
  }

  netState() {
    return { ...super.netState(), ar: this.armor, mar: this.maxArmor, mhp: this.maxHealth };
  }

  applyNetAnim(s) {
    const anim = Boss.netAnims()[s.a];
    if (anim && s.a !== this.state) {
      const [getSprite, config, sound] = anim;
      this.sprite = getSprite();
      this.config = config;
      if (sound !== undefined) this.game.audio.play(sound, false);
      if (s.a === Boss.DEATH && !this.death) {
        this.death = true;
        this.ghostDie();
      }
    }
    this.state = s.a;
    this.armor = s.ar;
    this.maxArmor = s.mar;
    this.maxHealth = s.mhp;
    this.checkOffset();
  }

  hit(n = 0) {
    this.decrementHealth(n);
    this.attacked = true;
  }
}
