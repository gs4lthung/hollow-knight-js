import { GAME } from "../game.js";
import { FLIES_CONF, GET_FLIES_SPRITE } from "../facade/file.js";
import {
  checkBlockCollide,
  checkCollide,
  isDrawable,
  isInTheLeft,
} from "../facade/helper.js";
import { Setting } from "../setting.js";

export class Character {
  static GenerateFlies() {
    const game = GAME.getInstance();
    const w = Setting.FLIES_WIDTH;
    const h = Setting.FLIES_HEIGHT;
    for (let i = 0; i < Setting.GENERATED_FLIES; i++) {
      const x = Math.random() * game.width;
      const y = Math.random() * game.height - 350;
      game.flies.push(
        new this(x, y, w, h, GET_FLIES_SPRITE(), FLIES_CONF, false)
      );
    }
  }

  constructor(
    x,
    y,
    w,
    h,
    sprite,
    config,
    gravity = true,
    oneTimeRender = false
  ) {
    this.finishState = false;
    this.oneTimeRender = oneTimeRender;
    this.canCollide = true;
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetW = 0;
    this.offsetH = 0;
    this.savedNode = null;
    this.gravity = gravity;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.sprite = sprite;
    this.spriteIdx = 0;
    this.speedX = Setting.CHARACTER_SPEED;
    this.speedY = 1;
    this.vx = 0;
    this.vy = 0;
    this.invert = 0;
    this.maxSpeed = Setting.CHARACTER_MAX_SPEED;
    this.config = config;
    this.game = GAME.getInstance();
    this.jumpForce = Setting.CHARACTER_JUMP_FORCE;
    this.spriteInterval = 0;
    this.backward = false;
    this.state = "";
    this.invicible = false;
    this.tempInvicible = false;
    this.health = 5;
    this.dead = false;
    this.callbacks = [];
    this.jumping = false;
    this.alpha = 1;
    this.postJump = false;
  }
  getAlpha() {
    if (this.alpha <= 0) {
      return 0;
    } else {
      return this.alpha;
    }
  }

  knockback(n) {
    const velocity = this.backward ? -n : n;
    this.vx = -velocity;
    this.isKnockback = this.backward ? "knockback_right" : "knockback_left";
  }

  checkInvicible() {
    // Get the alpha
    if (this.invicible) {
      this.alpha += 2 * this.game.delta;
      this.alpha %= 1;
    } else {
      this.alpha = 1;
    }

    // Check if is invicible set 100 / 60 second to set to uninvicible
    if (this.invicible && !this.tempInvicible) {
      this.tempInvicible = true;
      this.game.after(Setting.CHARACTER_INVICIBLE_TIME / 1000, () => {
        this.tempInvicible = false;
        this.invicible = false;
      });
    }
  }

  middleXPos() {
    return this.x + this.w / 2;
  }
  middleYPos() {
    return this.y + this.h / 2;
  }

  // this method will called in rendered (for child class)
  parentMethod() {}

  isGrounded() {
    let collideFlag = false;
    this.game.objects.forEach((obj) => {
      if (obj.isCollideBlock(this.x, this.y, this.w, this.h + 1)) {
        collideFlag = true;
      }
    });
    this.game.grounds.forEach((obj) => {
      if (obj.isCollideBlock(this.x, this.y, this.w, this.h + 1)) {
        collideFlag = true;
      }
    });
    return collideFlag;
  }

  inFrontNode(offsetX) {
    const y = this.middleYPos();
    let x = 0;
    if (this.backward) {
      x = this.middleXPos() - offsetX;
    } else {
      x = this.middleXPos() + offsetX;
    }
    return { x, y };
  }

  isCollide(x, y) {
    if (!this.canCollide) return false;
    return checkCollide(this.x, this.y, this.w, this.h, x, y);
  }

  isCollideBlock(x, y, w, h) {
    const tempx = this.x + this.offsetX;
    const tempy = this.y + this.offsetY;
    const tempw = this.w + this.offsetW;
    const temph = this.h + this.offsetH;

    if (!this.canCollide) return false;
    return checkBlockCollide(tempx, tempy, tempw, temph, x, y, w, h);
  }

  checkBound() {
    // 50 -> Player Offset X
    if (
      (!this.backward && this.x + this.w + 1 > this.game.width) ||
      (this.backward && this.x - 1 < 0)
    ) {
      // this.backward = true;
      // this.vx = 0;
      return true;
    }
    return false;
  }

  checkFinishState() {
    if (this.spriteIdx >= this.config.max) {
      this.finishState = true;
    }
  }

  logic() {
    // Incrementing the sprite
    this.spriteInterval += 60 * this.game.delta;
    if (this.spriteInterval > this.config.speed) {
      this.spriteIdx += 1;
      this.checkFinishState();
      this.spriteInterval = 0;
    }

    if (this.oneTimeRender && this.spriteIdx >= this.config.max - 1) {
      this.spriteIdx = this.config.max - 1;
    }

    // If death then sprite index will no go back
    if (this.dead) {
      if (this.spriteIdx >= this.config.max) {
        this.spriteIdx = this.config.max - 1;
      }
    }

    // Call parent method
    this.parentMethod();

    // If not grounded then gravity will turn down the player

    if (
      !this.checkBound() &&
      !this.isCollideObject() &&
      !this.isHitUpperWall()
    ) {
      this.x += this.vx * this.game.delta;
      this.diedStop();
    }

    this.y += this.vy * this.game.delta;

    if (this.canCollide) {
      if (this.vy < 0 && this.isHitUpperWall()) {
        this.vy = 0;
      } else if (this.isGrounded()) {
        this.vy = 0;
      } else {
        if (this.gravity) {
          this.vy += this.game.gravity * this.game.delta;
        }
      }
    }

    // Check velocity at max speed
    this.checkMaxSpeed();
    this.checkBound();

    this.checkInvicible();

    this.callbacks.forEach((cb) => {
      cb();
    });
  }

  saveScale() {
    this.savedNode = {
      w: this.w,
      h: this.h,
    };
  }

  restoreScale() {
    if (this.savedNode) {
      this.w = this.savedNode.w;
      this.h = this.savedNode.h;
      this.savedNode = null;
    } else {
    }
  }

  getCurrNode() {
    return {
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      vx: this.vx,
      vy: this.vy,
    };
  }
  save() {
    const node = {
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      vx: this.vx,
      vy: this.vy,
    };
    this.savedNode = { ...node };
  }

  restore() {
    if (this.savedNode) {
      this.x = this.savedNode.x;
      this.y = this.savedNode.y;
      this.w = this.savedNode.w;
      this.h = this.savedNode.h;
      this.vx = this.savedNode.vx;
      this.vy = this.savedNode.vy;
      this.savedNode = null;
    } else {
    }
  }

  debug() {
    const game = GAME.getInstance();
    game.debug(this.x, this.y, this.w, this.h, "red");
  }

  isHitUpperWall() {
    // this.game.debug(
    //   this.x - 10 + this.w / 2,
    //   this.y + 50 + this.vy * this.game.delta,
    //   20,
    //   1
    // );
    // if (this.vy < 0) return;
    return this.game.isCollideObjectBlock(
      this.x - 10 + this.w / 2,
      this.y + 50 + this.vy * this.game.delta,
      20,
      1
    );
  }

  canJump() {
    return (
      this.isGrounded() &&
      !this.game.isCollideObject(
        this.x + this.w / 2,
        this.y + this.vy * this.game.delta
      )
    );
  }

  lookAtPlayer() {
    let lastBackward = this.backward;
    const game = GAME.getInstance();
    if (isInTheLeft(game.nearestPlayer(this), this)) {
      this.backward = true;
    } else {
      this.backward = false;
    }
    return lastBackward == this.backward;
  }
  /* Moving the canvas by dx and dy. */

  lookAt(obj) {
    if (isInTheLeft(obj, this)) {
      this.backward = true;
    } else {
      this.backward = false;
    }
  }

  isDead() {
    return this.dead;
  }

  checkMaxSpeed() {
    if (this.vx > this.maxSpeed) {
      this.vx = this.maxSpeed;
    } else if (this.vx < -this.maxSpeed) {
      this.vx = -this.maxSpeed;
    }
    // if (this.vy < -this.maxSpeed) {
    //   this.vy = -this.maxSpeed;
    // }
  }

  diedStop() {
    if (this.dead && this.vx > 0) {
      this.vx -= Setting.ENEMY_DIED_STOP * this.game.delta;
    } else if (this.dead && this.vx < 0) {
      this.vx += Setting.ENEMY_DIED_STOP * this.game.delta;
    }
  }

  checkInvert() {
    if (this.invert !== null && this.invert > 0) {
      this.game.ctx.filter = `invert(${this.invert})`;
    }
  }

  isCollideObject() {
    if (this.canCollide) {
      let flag = false;
      // Probe the edge we're moving towards (right edge when moving right)
      const step = this.vx * this.game.delta;
      const edgeX = this.vx > 0 ? this.x + this.w + step : this.x + step;
      this.game.objects.forEach((obj) => {
        if (obj.isCollide(edgeX, this.y + this.h / 2)) {
          flag = true;
        }
      });
      return flag;
    } else {
      return false;
    }
  }

  renderBackward(idx) {
    this.game.ctx.save();
    this.game.ctx.globalAlpha = this.getAlpha();
    this.game.ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    this.game.ctx.scale(-1, 1);
    this.checkInvert();

    this.game.ctx.drawImage(
      this.sprite[idx],
      -this.w / 2,
      -this.h / 2,
      this.w,
      this.h
    );
    this.game.ctx.restore();
  }

  renderForward(idx) {
    this.game.ctx.save();
    this.game.ctx.globalAlpha = this.getAlpha();
    this.checkInvert();
    this.game.ctx.scale(1, 1);
    this.game.ctx.drawImage(this.sprite[idx], this.x, this.y, this.w, this.h);
    this.game.ctx.restore();
  }

  // Network sync: the host sends netState(), guests mirror it with applyNet()
  netState() {
    return {
      id: this.netId,
      k: this.constructor.NET_KIND,
      x: Math.round(this.x),
      y: Math.round(this.y),
      ...this.netVelocity(),
      w: Math.round(this.w),
      h: Math.round(this.h),
      b: this.backward ? 1 : 0,
      i: this.spriteIdx,
      d: this.dead ? 1 : 0,
      c: this.canCollide ? 1 : 0,
      a: this.netAnim(),
      v: Math.round((this.invert || 0) * 100) / 100,
      hp: this.health, // kept so a promoted host continues with the right health
      hm: this.harmless ? 1 : 0, // touching it doesn't hurt (stunned boss, thorn not out yet)
    };
  }

  netAnim() {
    return 0;
  }

  applyNet(s) {
    this.setNetTarget(s);
    this.w = s.w;
    this.h = s.h;
    this.backward = !!s.b;
    this.spriteIdx = s.i;
    this.canCollide = !!s.c;
    this.netInvert = s.v;
    this.invert = Math.max(s.v || 0, this.invert || 0);
    this.confirmHits(this.health, s.hp);
    this.health = s.hp;
    this.harmless = !!s.hm;
    this.applyNetAnim(s);
  }

  applyNetAnim(s) {}

  confirmHits() {}

  onNetRemove() {}

  // Velocity for dead reckoning, measured from how far we really moved since the
  // last update (vx alone lies when pushing against a wall). Call once per send.
  // A teleport (respawn, area change) reports 0 so receivers don't fling it onward.
  netVelocity() {
    const now = performance.now();
    const last = this.lastNetPos;
    this.lastNetPos = { x: this.x, y: this.y, at: now };
    if (!last) return { vx: 0, vy: 0 };
    const dt = (now - last.at) / 1000;
    const dx = this.x - last.x;
    const dy = this.y - last.y;
    if (dt <= 0 || dt > 0.5 || Math.abs(dx) > Setting.NET_SNAP_DISTANCE || Math.abs(dy) > Setting.NET_SNAP_DISTANCE) {
      return { vx: 0, vy: 0 };
    }
    return { vx: Math.round(dx / dt), vy: Math.round(dy / dt) };
  }

  // A network update's position and velocity (s.vx / s.vy may be missing from old peers)
  setNetTarget(s) {
    if (this.tx === undefined) {
      this.x = s.x;
      this.y = s.y;
    }
    this.tx = s.x;
    this.ty = s.y;
    this.tvx = s.vx || 0;
    this.tvy = s.vy || 0;
    this.netAt = performance.now();
  }

  // Dead reckoning: updates arrive 20-30x a second and are already a little old,
  // so carry the last position forward along its velocity (by the time since it
  // arrived, plus part of the ping) and glide towards that guess. Moving things
  // stay smooth and close to where the sender really has them; the guess is
  // capped so a missed update can't send anything flying off.
  netSmooth() {
    if (this.tx === undefined) return;
    const since = (performance.now() - this.netAt) / 1000;
    const ping = this.game.net && this.game.net.ping ? this.game.net.ping / 1000 : 0;
    const ahead = Math.min(since + Math.min(ping / 2, Setting.NET_MAX_LEAD), Setting.NET_MAX_EXTRAPOLATE);
    const gx = this.tx + this.tvx * ahead;
    const gy = this.ty + this.tvy * ahead;
    const dx = gx - this.x;
    const dy = gy - this.y;
    if (Math.abs(dx) > Setting.NET_SNAP_DISTANCE || Math.abs(dy) > Setting.NET_SNAP_DISTANCE) {
      this.x = gx;
      this.y = gy;
    } else {
      const k = Math.min(1, this.game.delta * Setting.NET_SMOOTH);
      this.x += dx * k;
      this.y += dy * k;
    }
  }

  render() {
    if (this.remote) {
      this.netSmooth();
    } else {
      this.logic();
    }
    const idx = this.spriteIdx % this.config.max;

    if (isDrawable(this.sprite[idx])) {
      if (this.invert) {
      }

      if (this.backward) {
        this.renderBackward(idx);
      } else {
        this.renderForward(idx);
      }
    }
  }
}
