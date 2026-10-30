export class Setting {
  static WIDTH = 2000;
  static HEIGHT = 1200;

  static SCALE = 0.7;

  static PLAYER_MOVEMENT_UP = "ArrowUp";
  static PLAYER_MOVEMENT_LEFT = "ArrowLeft";
  static PLAYER_MOVEMENT_RIGHT = "ArrowRight";
  static PLAYER_MOVEMENT_DOWN = "ArrowDown";
  static PLAYER_JUMP = ["z", "ArrowUp"];
  static PLAYER_ATTACK = "x";
  static PLAYER_DASH = "s";
  static PLAYER_BLAST = "a";

  static PLAYER_INTERACT = [" ", "e"];

  static CHARACTER_WIDTH = 150;
  static CHARACTER_HEIGHT = 170;
  static CHARACTER_SPEED = 2500;
  static CHARACTER_MAX_SPEED = 300;
  static CHARACTER_JUMP_FORCE = 1100;
  static CHARACTER_DASH_FORCE = 1500;
  static CHARACTER_DASH_TIME = 500;
  static CHARACTER_DASH_TIMEOUT = 2000; // 2 seconds
  static CHARACTER_MAX_HEALTH = 5;
  static CHARACTER_RANDOM_DEATH = 300;
  static CHARACTER_SPEED_UP_DEATH = 100;
  static CHARACTER_FADE_VELOCITY = 1;
  static CHARACTER_MAX_DEAD_HEIGHT = 200;
  static CHARACTER_FADE_TIMEOUT = 3000;
  static CHARACTER_INVICIBLE_TIME = 3000; // 1 second
  static CHARACTER_KNOCKBACK_RESISTANCE = 700;
  static CHARACTER_KNOCKBACK_POWER = 700;
  static CHARACTER_BLAST_SPEED = 3000;
  static CHARACTER_BLAST_MAX_SPEED = 3000;
  static CHARACTER_BLAST_TIMEOUT = 10000;
  static CHARACTER_GET_BLAST = 3;
  static CHARACTER_BLAST_DAMAGE = 3;

  static CHARACTER_DEATH_BLACK_SCREEN_TIMEOUT = 2000;

  static GRAVITY = 2650;

  static PARTICLE_SPEED = 300;

  static BOOFLY_WIDTH = 100;
  static BOOFLY_HEIGHT = 100;

  static CRAWLID_SPEED = 24;
  static CRAWLID_MAX_SPEED = 100;

  static BOOFLY_SPEED = 24;
  static BOOFLY_MAX_SPEED = 50;
  static BOOFLY_MAX_CHASE_SPEED = 100;
  static BOOFLY_CHECK_RADIUS = 400;

  static GENERATED_FLIES = 15;
  static FLIES_WIDTH = 100;
  static FLIES_HEIGHT = 100;
  static KNOCKBACK_POWER = 3000;

  static OPEN_DOOR_SPEED_Y = 30;
  static OPEN_DOOR_SPEED_X = 5;
  static DOOR_FADE_LIGHT = 0.5;

  static TOTAL_CRAWLID = 10;

  static BOSS_INITIAL_X = 500;
  static BOSS_INITIAL_Y = Setting.HEIGHT - 350 - 250;
  static BOSS_ATTACK_PREP_TIME = 3000;
  static BOSS_WIDTH = 550;
  static BOSS_HEIGHT = 400;
  static BOSS_ATTACK_TIMES = 3;
  static BOSS_INVERT_MULTIPLIES = 10;
  static BOSS_JUMP_FORCE = 1500;
  static BOSS_JUMP_RANDOM = 300;
  static BOSS_HEALTH = 30;
  static BOSS_ARMOR = 10;
  static BOSS_JUMP_SPEED = 1000;
  static BOSS_DEATH_SPEED = 800;
  static BOSS_STUN_TIME = 5000;
  static BOSS_MAX_SPEED = 300;

  static ENEMY_SPAWN_TIME = 10000; // 10 seconds
  static ENEMY_SPAWN_PER_TIME = 3;
  static ENEMY_DIED_STOP = 200;
  static ENEMY_CORPSE_TIME = 5; // seconds before a dead enemy is removed

  static SHAKE_SIZE = 20;

  // Co-op scaling, applied per extra player (2 players = 1 extra)
  static CRAWLID_HEALTH = 1;
  static BOOFLY_HEALTH = 1;
  static COOP_HEALTH_PER_PLAYER = 0.5; // enemy & boss health x1.5 / x2 / x2.5
  static COOP_KILLS_PER_PLAYER = 5; // boss door needs 10 / 15 / 20 / 25 kills
  static MAX_ALIVE_ENEMIES = 10;
  static COOP_ENEMIES_PER_PLAYER = 4; // max alive enemies 10 / 14 / 18 / 22
  static COOP_SPAWN_RATE_PER_PLAYER = 0.3; // spawns x1.3 / x1.6 / x1.9 as often
  static COOP_DOUBLE_SPAWN_PLAYERS = 3; // from 3 players each spawn brings 2 groups
  static SPAWN_GROUP_GAP = 0.8; // seconds between the groups so they don't stack
  static COOP_METEORS_PER_PLAYER = 1; // boss slam meteors 3 / 4 / 5 / 6
  static COOP_CAMERA_ZOOM = 1.25; // base view 25% wider with teammates
  static CAMERA_TEAMMATE_MARGIN = 400; // extra space kept around far teammates
  static ENEMY_HIT_FLASH_DECAY = 5; // how fast the white hit flash fades

  // Co-op revive
  static REVIVE_TIME = 2; // seconds holding interact next to a downed teammate
  static REVIVE_RANGE = 130; // px between the two knights' centres
  static PARTY_WIPE_TIME = 4000; // ms of "party has fallen" before everyone respawns
  static SCOREBOARD_TIME = 9000; // ms the scoreboard shows before the credits

  static TOTAL_PLATFORM = 10;
  static PLATFORM_HEIGHT = 30;

  static METEOR_WIDTH = 150;
  static METEOR_HEIGHT = 140;
  static METEOR_SPAWN_PER_ATTACK = 3;
  static METEOR_SPEED = 1000;

  static DEATH_SCREEN_TIME = 3000;
  static CREDIT_SCENE_SPEED = 10;
}
