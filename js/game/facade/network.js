import { GAME } from "../game.js";
import { Boofly } from "../model/boofly.js";
import { Boss } from "../model/boss.js";
import { Blast } from "../model/blast.js";
import { Crawlid } from "../model/crawlid.js";
import { Meteor } from "../model/meteor.js";
import { Mossling } from "../model/mossling.js";
import { Spore, SporeDrifter } from "../model/sporedrifter.js";
import { Thorn, Warden } from "../model/warden.js";
import { Particle } from "../model/particle.js";
import { SkillEffect } from "../model/skill.js";
import {
  PLAYER_COLORS,
  RemotePlayer,
  drawPlayerLabel,
  drawReviveHint,
} from "../model/remoteplayer.js";
import { Setting } from "../setting.js";
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

// Per-tab code so a refresh mid-game gets the same slot back (see server.js).
// sessionStorage survives a refresh but not closing the tab.
function rejoinToken() {
  try {
    let token = sessionStorage.getItem("wcl-knights-rejoin");
    if (!token) {
      token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("wcl-knights-rejoin", token);
    }
    return token;
  } catch {
    return "";
  }
}

// The address this page was opened at is what friends can use too (e.g. through
// IIS); the server's own LAN links only help when opened from localhost
function shareUrls(serverUrls) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const here = local ? [] : [`${location.origin}/game.html`];
  return [...new Set([...here, ...serverUrls])];
}
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
    this.joinUrls = [];
    this.ready = Promise.resolve(false); // solo until goOnline() is called
    this.inGame = false; // the group already started when we joined
    this.lobby = []; // [{ id, slot, hero, ready, host }]
    this.onLobby = () => {};
    this.onStart = () => {};
  }

  sendLobby(hero, ready, name) {
    this.send({ t: "lobby", hero, ready, name });
  }

  // Host only: everyone in the lobby starts together
  requestStart() {
    this.send({ t: "start" });
  }

  // "Play with Friends": join the LAN game, or fall back to solo with a message
  goOnline() {
    this.ready = this.connect().then((online) => {
      if (!online && !this.statusText) {
        this.setStatus("No LAN server found - playing solo");
      }
      return online;
    });
    return this.ready;
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
        ws = new WebSocket(`${protocol}://${location.host}/ws?token=${rejoinToken()}`);
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
        this.joinUrls = shareUrls(msg.urls || []);
        this.inGame = !!msg.inGame;
        this.rejoined = !!msg.rejoined;
        this.updateStatus();
        settle(true);
        return;
      case "lobby":
        this.lobby = msg.players;
        this.onLobby(this.lobby);
        return;
      case "start":
        this.onStart();
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
        this.onLobby(this.lobby);
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
          if (enemy) game.applyHit(enemy, msg.n, this.slotOf(msg.from));
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
      case "revive":
        game.revivePlayer();
        break;
    }
  }

  onEvent(game, msg) {
    switch (msg.e) {
      case "boss":
        if (!game.bossFight) game.changeBossScene();
        break;
      case "finish":
        game.scoreRows = msg.rows;
        game.finishGame();
        break;
      case "wipe":
        game.partyWipe();
        break;
      case "grove-opens":
        game.ui.showTitle(Setting.AREA2_TRANSITION_DELAY, "The way to the Sunken Grove opens");
        break;
      case "area2":
        game.syncStage("area2");
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
      case Mossling.NET_KIND:
        enemy = new Mossling(s.x, s.y, s.w, s.h, !!s.b);
        break;
      case SporeDrifter.NET_KIND:
        enemy = new SporeDrifter(s.x, s.y, s.w, s.h);
        break;
      case Spore.NET_KIND:
        enemy = new Spore(s.x, s.y, 0, 0);
        break;
      case Thorn.NET_KIND:
        enemy = new Thorn(s.x + s.w / 2);
        break;
      case Warden.NET_KIND:
        enemy = new Warden(s.x, s.y);
        GAME.getInstance().boss = enemy;
        break;
      default:
        return null;
    }
    enemy.remote = true;
    enemy.netId = s.id;
    return enemy;
  }

  // Slot of a connected player by id (the scoreboard is kept per slot so it survives rejoins)
  slotOf(id) {
    const player = this.players.get(id) || this.lobby.find((p) => p.id === id);
    return player ? player.slot : id;
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
    this.send({ ...game.player.netPlayerState(), s: this.slot, n: game.player.name });
    if (this.isHost) this.send(game.buildSnapshot());
  }

  // Drawn inside the camera transform
  render() {
    if (!this.active) return;
    const game = GAME.getInstance();
    this.players.forEach((player) => player.render());
    drawPlayerLabel(game.ctx, game.player, this.slot);

    const p = game.player;
    if (p.reviveCandidate) {
      const progress = p.reviveTarget ? p.reviveProgress / Setting.REVIVE_TIME : 0;
      drawReviveHint(game.ctx, p.reviveCandidate, progress);
    }
  }

  updateStatus() {
    if (!this.active) return;
    // The boss door needs more kills with more players
    if (GAME.START) GAME.getInstance().ui.changeMoney(GAME.getInstance().ui.money);
    const count = this.players.size + 1;
    let text = `P${this.slot + 1}${this.isHost ? " · Host" : ""} · ${count}/${MAX_PLAYERS} players`;
    // While waiting alone, tell the host which link friends should open
    if (count == 1 && this.joinUrls.length) {
      text += ` · friends join at ${this.joinUrls[0]}`;
    }
    this.setStatus(text);
  }

  setStatus(text) {
    this.statusText = text;
    $("#net-status")
      .text(text)
      .css("color", this.active ? PLAYER_COLORS[this.slot] : "white")
      .show();
  }
}
