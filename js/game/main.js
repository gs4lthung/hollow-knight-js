import {
  GET_BG_FIRST,
  GET_PLAYER_DEAD,
  GET_PLAYER_IDLE_SPRITE,
  GET_PLAYER_JUMP_SPRITE,
  PLAYER_CONF,
} from "./facade/file.js";
import { Background } from "./model/background.js";
import { GAME } from "./game.js";
import { Ground } from "./model/ground.js";
import { Player } from "./model/player.js";
import { Crawlid } from "./model/crawlid.js";
import { UI } from "./model/ui.js";
import Camera from "./facade/camera.js";
import { Character } from "./parent/character.js";
import { BossDoor } from "./model/bossdoor.js";
import { Setting } from "./setting.js";
import { Object } from "./parent/object.js";
import { Boofly } from "./model/boofly.js";
import { Rest } from "./model/rest.js";
import { Particle } from "./model/particle.js";
import { Meteor } from "./model/meteor.js";
import { Network } from "./facade/network.js";
import { HeroSelect } from "./heroselect.js";
import { Lobby } from "./lobby.js";
import { getPlayerName, setupNameInput } from "./playername.js";
import { GamepadInput, PAD_BUTTON } from "./gamepad.js";
import { Shop } from "./shop.js";

const net = Network.getInstance();
const heroSelect = new HeroSelect("#hero-select");
const lobby = new Lobby(net, heroSelect);
net.onStart = () => beginGame();
setupNameInput(() => lobby.sync());

// Controller in the menus: A starts (or toggles Ready in the lobby), Start lets the host begin
const gamepad = new GamepadInput();
gamepad.onMenuButton = (button) => {
  if (lobby.visible) {
    if (button === PAD_BUTTON.A) lobby.toggleReady();
    if (button === PAD_BUTTON.START) lobby.start();
  } else if (button === PAD_BUTTON.A) {
    startGame(lastMode());
  }
};

function start() {
  if (GAME.START) {
    return;
  }

  GAME.START = true;
  const game = GAME.getInstance();
  game.net = net;
  game.canvas.width = game.width;
  game.canvas.height = game.height;

  const player = new Player(
    game.width / 2 - 250,
    -300,
    Setting.CHARACTER_WIDTH * game.scale,
    Setting.CHARACTER_HEIGHT * game.scale,
    GET_PLAYER_DEAD(),
    PLAYER_CONF.idle
  );

  player.setHero(heroSelect.lock());
  player.name = getPlayerName();
  player.loadRunStats(net.active && net.rejoined);
  game.ui.changeMoney(game.ui.money);
  $("#player-name").blur();
  player.jumping = true;
  player.changeSprite("jump");

  const bg = new Background(
    -500,
    0,
    game.width + 500,
    game.height,
    GET_BG_FIRST(),
    game.ctx,
    30
  );

  // Generate Black
  game.black = Object.GenerateBlack();

  // Generate Foreground
  Background.GenerateForeground();

  // Creating Ground
  Ground.GenerateGround();

  // Creating Platform
  Ground.GeneratePlatform();
  Character.GenerateFlies();

  // Spawn Enemy (only the host simulates enemies in multiplayer)
  if (game.isHost()) game.spawnEnemy();
  const scheduleSpawn = () => {
    game.after(game.enemySpawnInterval(), () => {
      for (let group = 0; group < game.spawnGroups(); group++) {
        game.after(group * Setting.SPAWN_GROUP_GAP, () => {
          if (game.isHost() && !game.bossFight && game.aliveEnemy() < game.maxAliveEnemies()) {
            game.spawnEnemy();
          }
        });
      }
      scheduleSpawn();
    });
  };
  scheduleSpawn();

  // bossDoor.generateDoor();
  // bossDoor.generateBackground();
  const bossDoor = BossDoor.GetInstance();
  game.bossDoor = bossDoor;

  game.bossDoor.generateDoor();
  game.bossDoor.generateBackground();

  // Generate Cheat
  game.cheat.generateCheat();

  // Setting Game Object
  game.mainBackground = bg;

  // Emit Particle At First (because we use cache so we need to wait for the image object created)
  Particle.EmitAllParticle(0, 0);

  // game.backgrounds.push(bg);
  game.player = player;
  game.characters.push(player);

  // Generate Rest
  Rest.GenerateRest();

  window.addEventListener("keypress", (e) => {
    if (!game.pause) game.cheat.addKeys(e.key);
  });

  const shop = Shop.getInstance();

  window.addEventListener("keydown", (e) => {
    if (shop.isOpen) return; // the shop has the keys while it's open
    if (e.key == "Escape") {
      game.pauseGame(true);
    }
    // Disabled NAR Presentation Only
    // if (e.key == "r") {
    //   game.useCamera = !game.useCamera;
    // }
    if (e.key == "f") {
      game.fullscreen();
    }
    if (game.canMove && !game.pause) {
      if (e.key == Setting.PLAYER_ATTACK) {
        player.attack();
      } else if (e.key == Setting.PLAYER_DASH) {
        player.dash();
      } else if (e.key == Setting.PLAYER_BLAST) {
        player.blast();
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (shop.isOpen) return;
    if (game.canMove && !game.pause) {
      if (Setting.PLAYER_JUMP.includes(e.key)) {
        player.jump();
      }
      game.keys[e.key] = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (game.canMove) {
      game.keys[e.key] = false;
    }
  });

  // Camera Initialization
  const setting = {
    distance: game.width,
  };
  const camera = new Camera(game.ctx, setting);
  game.camera = camera;

  // !Debugging Purpose
  game.render();
}

let starting = false;

const MODE_KEY = "wcl-knights-mode";

function lastMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "coop" ? "coop" : "solo";
  } catch {
    return "solo";
  }
}

// mode: "solo" stays offline, "coop" joins the LAN game on this server
async function startGame(mode) {
  if (starting) return;
  starting = true;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // not remembered - fine
  }

  // Fullscreen must be requested straight from the click, before any await
  if (!GAME.getInstance().isFullscreen()) GAME.getInstance().fullscreen();

  if (mode === "coop") {
    const online = await net.goOnline();
    // Friends gather in the lobby first, unless their game is already running
    if (online && !net.inGame) {
      lobby.show();
      return;
    }
  }
  beginGame();
}

function beginGame() {
  if (GAME.START) return;
  lobby.hide();
  gamepad.inGame = true;

  // When Start Remove the Footer
  $("#root-footer").hide();
  $("#start-menu").fadeOut();
  start();
}

// Keep the layout in sync when the browser leaves fullscreen on its own (e.g. Esc)
document.addEventListener("fullscreenchange", () => {
  const game = GAME.getInstance();
  if (!document.fullscreenElement && game.isFullscreen()) game.fullscreen();
});

// startGame();

// Enter repeats whichever mode was used last time
$(`.start-option[data-mode="${lastMode()}"]`).addClass("last-used");

window.addEventListener("keypress", (e) => {
  if (e.key == "Enter") {
    startGame(lastMode());
  }
});

$(".start-option").click((e) => {
  startGame($(e.currentTarget).data("mode"));
});
