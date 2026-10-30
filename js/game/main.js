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

const net = Network.getInstance();
const heroSelect = new HeroSelect("#hero-select");

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

  window.addEventListener("keydown", (e) => {
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

async function startGame() {
  if (starting) return;
  starting = true;

  // When Start Remove the Footer
  $("#root-footer").hide();

  $("#start-menu").fadeOut();
  // Fullscreen must be requested straight from the click, before any await
  if (!GAME.getInstance().isFullscreen()) GAME.getInstance().fullscreen();

  // Wait to learn whether we're the host before building the world
  await net.ready;
  start();
}

// Keep the layout in sync when the browser leaves fullscreen on its own (e.g. Esc)
document.addEventListener("fullscreenchange", () => {
  const game = GAME.getInstance();
  if (!document.fullscreenElement && game.isFullscreen()) game.fullscreen();
});

// startGame();

window.addEventListener("keypress", (e) => {
  if (e.key == "Enter") {
    startGame();
  }
});

$("#start").click(() => {
  startGame();
});
