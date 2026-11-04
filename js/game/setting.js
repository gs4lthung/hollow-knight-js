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

  // The key a game binding should see. Letters are lower-cased so Caps Lock and
  // Shift don't break attack / dash / blast, and the printed letter wins so
  // AZERTY / QWERTZ keep their labels. Only when e.key isn't a usable letter
  // (an IME such as Vietnamese Telex reports "Process", other alphabets give
  // their own letters) do we fall back to the physical key in e.code.
  // Synthetic events from the gamepad have no code and use e.key as is.
  static gameKey(e) {
    const key = e.key || "";
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (/^[a-z]$/.test(lower)) return lower;
    const physical = /^Key([A-Z])$/.exec(e.code || "");
    if (physical && (key.length === 1 || key === "Process" || key === "Unidentified")) {
      return physical[1].toLowerCase();
    }
    return lower;
  }

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
  static COOP_HEALTH_PER_PLAYER = 0.5; // boss health x1.5 / x2 / x2.5
  static COOP_ENEMY_HEALTH_PER_PLAYER = 0.25; // regular enemies x1.25 / x1.5 / x1.75
  static COOP_KILLS_PER_PLAYER = 5; // boss door needs 10 / 15 / 20 / 25 kills
  static MAX_ALIVE_ENEMIES = 10;
  static COOP_ENEMIES_PER_PLAYER = 2; // max alive enemies 10 / 12 / 14 / 16
  static COOP_SPAWN_RATE_PER_PLAYER = 0.15; // spawns x1.15 / x1.3 / x1.45 as often
  static COOP_DOUBLE_SPAWN_PLAYERS = 4; // only a full party gets 2 groups per spawn
  static SPAWN_GROUP_GAP = 0.8; // seconds between the groups so they don't stack
  static COOP_METEORS_PER_PLAYER = 1; // boss slam meteors 3 / 4 / 5 / 6
  static COOP_CAMERA_ZOOM = 1.25; // base view 25% wider with teammates
  static CAMERA_TEAMMATE_MARGIN = 400; // extra space kept around far teammates
  static ENEMY_HIT_FLASH_DECAY = 5; // how fast the white hit flash fades

  // Netcode (co-op)
  static NET_MAX_EXTRAPOLATE = 0.15; // s: how far ahead of the last update we guess
  static NET_MAX_LEAD = 0.1; // s: at most this much of the ping is made up for
  static NET_SMOOTH = 20; // how fast the drawn position catches up with the guess
  static NET_SNAP_DISTANCE = 400; // farther off than this: jump instead of gliding
  static NET_PREDICT_TIME = 1000; // ms a guest trusts its own hit before the host confirms

  // Area 2: Sunken Grove
  static MOSSLING_HEALTH = 2;
  static MOSSLING_CHARGE_SPEED = 480;
  static MOSSLING_CHARGE_RANGE = 450; // px: charges when a knight is this close at the same height
  static MOSSLING_CHARGE_TIME = 1.1; // seconds
  static MOSSLING_CHARGE_COOLDOWN = 2;
  static DRIFTER_HEALTH = 2;
  static DRIFTER_SHOOT_EVERY = 3; // seconds, plus up to 1 s random
  static SPORE_SPEED = 420;
  static SPORE_LIFE = 4;
  static WARDEN_SIZE = 460; // drawn size of the 600x600 frames
  static WARDEN_HEALTH = 40;
  static WARDEN_ARMOR = 12;
  static WARDEN_STUN_TIME = 4;
  static WARDEN_WALK_SPEED = 260;
  static WARDEN_LUNGE_SPEED = 750;
  static WARDEN_LEAP_FORCE = 1350;
  static WARDEN_SLASH_REACH = 260;
  static THORN_WARNING_TIME = 0.6; // glowing mark on the ground before a thorn bursts out
  static AREA2_TITLE_TIME = 3000;
  static AREA2_TRANSITION_DELAY = 4000; // ms after the False Knight falls

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
