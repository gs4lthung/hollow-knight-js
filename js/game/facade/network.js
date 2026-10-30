import { GAME } from "../game.js";
import { Boofly } from "../model/boofly.js";
import { Boss } from "../model/boss.js";
import { Blast } from "../model/blast.js";
import { Crawlid } from "../model/crawlid.js";
import { Meteor } from "../model/meteor.js";
import { Particle } from "../model/particle.js";
import { SkillEffect } from "../model/skill.js";
import {
  PLAYER_COLORS,
  RemotePlayer,
  drawPlayerLabel,
} from "../model/remoteplayer.js";
import { MyAudio } from "./audio.js";
import {
  BOOFLY_CONF,
  CRAWLID_CONF,
  GET_BOOFLY_FLY,
  GET_CRAWLID_WALK,
  GET_PLAYER_ATTACK_SPLASH_SPRITE,
  PLAYER_CONF,
} from "./file.js";

const SEND_INTERVAL = 1 / 30;
const MAX_PLAYERS = 4;

// LAN co-op client. Talks to server.js over a WebSocket.
// The host simulates enemies and broadcasts snapshots; every client
// simulates its own knight and broadcasts its state.
// When the page isn't served by server.js this stays inactive (single player).
export class Network {
  static instance;

  static getInstance() {
    if (this.instance == null) {
      this.instance = new Network();
    }
    return this.instance;
  }

  constructor() {
    this.active = false;
    this.isHost = true;
    this.id = null;
    this.slot = 0;
    this.players = new Map(); // id -> RemotePlayer
    this.sendTimer = 0;
    this.statusText = "";
    this.ready = this.connect();
  }

  connect() {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (online) => {
        if (settled) return;
        settled = true;
        resolve(online);
      };

      if (location.protocol === "file:") return settle(false);

      let ws;
      try {
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        ws = new WebSocket(`${protocol}://${location.host}/ws`);
      } catch {
        return settle(false);
      }
      this.ws = ws;

      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        this.onMessage(msg, settle);
      };
      ws.onerror = () => settle(false);
      ws.onclose = () => {
        settle(false);
        if (this.active) this.onDisconnect();
      };
      setTimeout(() => settle(false), 2000);
    });
  }

  send(msg) {
    if (this.active && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onDisconnect() {
    this.active = false;
    this.isHost = true;
    this.players.clear();
    if (GAME.START) GAME.getInstance().becomeHost();
    this.setStatus("Disconnected - single player");
  }

  onMessage(msg, settle) {
    switch (msg.t) {
      case "welcome":
        this.active = true;
        this.id = msg.id;
        this.slot = msg.slot;
        this.isHost = msg.host;
        this.updateStatus();
        settle(true);
        return;
      case "full":
        this.setStatus("Server full (4/4) - single player");
        settle(false);
        return;
      case "host": {
        const wasHost = this.isHost;
        this.isHost = msg.id === this.id;
        if (this.isHost && !wasHost && GAME.START) {
          GAME.getInstance().becomeHost();
        }
        this.updateStatus();
        return;
      }
      case "leave":
        this.players.delete(msg.id);
        this.updateStatus();
        return;
    }

    // Everything below needs the game world to exist
    if (!GAME.START) return;
    const game = GAME.getInstance();

    switch (msg.t) {
      case "p": {
        let player = this.players.get(msg.from);
        if (!player) {
          player = new RemotePlayer(msg.from, msg.s);
          this.players.set(msg.from, player);
          this.updateStatus();
        }
        player.applyNet(msg);
        break;
      }
      case "snap":
        if (!this.isHost) game.applySnapshot(msg);
        break;
      case "hit":
        if (this.isHost) {
          const enemy = game.enemies.find((e) => e.netId === msg.id);
          if (enemy) enemy.hit(msg.n);
        }
        break;
      case "boss":
        if (this.isHost) game.requestBossScene();
        break;
      case "ev":
        this.onEvent(game, msg);
        break;
      case "fx":
        this.onEffect(game, msg);
        break;
    }
  }

  onEvent(game, msg) {
    switch (msg.e) {
      case "boss":
        if (!game.bossFight) game.changeBossScene();
        break;
      case "finish":
        game.finishGame();
        break;
      case "shake":
        if (msg.s === 2) game.audio.play(MyAudio.FALSE_STRIKE, false);
        game.shakeScene(msg.s);
        break;
    }
  }

  // Visual-only copies of another player's attacks
  onEffect(game, msg) {
    if (msg.k === "slash") {
      Particle.Emit(
        msg.x,
        msg.y,
        msg.w,
        msg.h,
        GET_PLAYER_ATTACK_SPLASH_SPRITE(msg.s),
        msg.s == 1 ? PLAYER_CONF.splash1 : PLAYER_CONF.splash2,
        !!msg.b
      );
    } else if (msg.k === "blast") {
      Particle.BlastParticle(msg.px, msg.py);
      game.blasts.push(new Blast(msg.x, msg.y, !!msg.b, true));
    } else if (msg.k === "skill") {
      SkillEffect.Spawn(msg.hr, msg.x, msg.y, !!msg.b);
    }
  }

  sendEffect(effect) {
    this.send({ t: "fx", ...effect });
  }

  createMirror(s) {
    let enemy;
    switch (s.k) {
      case Crawlid.NET_KIND:
        enemy = new Crawlid(s.x, s.y, s.w, s.h, GET_CRAWLID_WALK(), CRAWLID_CONF.walk, !!s.b);
        break;
      case Boofly.NET_KIND:
        enemy = new Boofly(s.x, s.y, s.w, s.h, GET_BOOFLY_FLY(), BOOFLY_CONF.fly, !!s.b);
        break;
      case Boss.NET_KIND:
        enemy = new Boss(s.x, s.y, s.w, s.h);
        GAME.getInstance().boss = enemy;
        break;
      case Meteor.NET_KIND:
        enemy = new Meteor(s.x, s.y, s.w, s.h);
        break;
      default:
        return null;
    }
    enemy.remote = true;
    enemy.netId = s.id;
    return enemy;
  }

  remotePlayers() {
    return [...this.players.values()];
  }

  // Called once per frame from the game loop
  tick(delta) {
    if (!this.active) return;
    this.sendTimer += delta;
    if (this.sendTimer < SEND_INTERVAL) return;
    this.sendTimer = 0;

    const game = GAME.getInstance();
    this.send({ ...game.player.netPlayerState(), s: this.slot });
    if (this.isHost) this.send(game.buildSnapshot());
  }

  // Drawn inside the camera transform
  render() {
    if (!this.active) return;
    const game = GAME.getInstance();
    this.players.forEach((player) => player.render());
    drawPlayerLabel(game.ctx, game.player, this.slot);
  }

  updateStatus() {
    if (!this.active) return;
    const count = this.players.size + 1;
    this.setStatus(
      `P${this.slot + 1}${this.isHost ? " · Host" : ""} · ${count}/${MAX_PLAYERS} players`
    );
  }

  setStatus(text) {
    this.statusText = text;
    $("#net-status")
      .text(text)
      .css("color", this.active ? PLAYER_COLORS[this.slot] : "white")
      .show();
  }
}
