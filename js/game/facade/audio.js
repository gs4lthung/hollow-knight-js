import { GAME } from "../game.js";

const SFX_COPIES = 4;

export class MyAudio {
  static instance;
  static HOME = 0;
  static BOSS = 1;
  static PLAYER_ATTACK = 2;
  static HIT = 3;
  static CRAWLID_DIED = 4;
  static VENGE_DIED = 5;
  static PLAYER_DASH = 6;
  static PLAYER_JUMP = 7;
  static PLAYER_HIT = 8;
  static PLAYER_LAND = 9;
  static FALSE_ATTACK = 10;
  static FALSE_JUMP = 11;
  static FALSE_LAND = 12;
  static FALSE_STRIKE = 13;
  static VICTORY = 14;
  static PLAYER_BLAST = 15;
  static BENCH_REST = 16;
  static BARREL_DEATH = 17;
  static FALSE_HEAD_HIT = 18;

  constructor() {
    this.audios = [];
    this.setListener();
    this.volume = 0;
    this.addAllAudio();
    this.volumeRange = $("#volumeRange");
    this.setVolume(this.getValueFromRange());
  }

  getElement(id, asset) {
    return `<audio id="${id}" src="${asset}"></audio>`;
  }

  addElement(el) {
    $("#root-audio").append(el);
  }

  addAllAudio() {
    this.addAudio(
      MyAudio.FALSE_HEAD_HIT,
      "assets/game/audio/false_knight_head_hit.wav"
    );
    this.addAudio(MyAudio.BARREL_DEATH, "assets/game/audio/barrel_death.wav");
    this.addAudio(MyAudio.HOME, "assets/game/audio/home.mp3");
    this.addAudio(MyAudio.BOSS, "assets/game/audio/boss.mp3");
    this.addAudio(MyAudio.PLAYER_ATTACK, "assets/game/audio/sword.wav");
    this.addAudio(MyAudio.HIT, "assets/game/audio/hit.wav");
    this.addAudio(MyAudio.CRAWLID_DIED, "assets/game/audio/crawlid_death.wav");
    this.addAudio(MyAudio.VENGE_DIED, "assets/game/audio/venge_death.wav");
    this.addAudio(MyAudio.PLAYER_DASH, "assets/game/audio/hero_dash.wav");
    this.addAudio(MyAudio.PLAYER_JUMP, "assets/game/audio/hero_jump.mp3");
    this.addAudio(MyAudio.PLAYER_HIT, "assets/game/audio/hero_hit.wav");
    this.addAudio(MyAudio.PLAYER_LAND, "assets/game/audio/hero_land_hard.wav");
    this.addAudio(MyAudio.BENCH_REST, "assets/game/audio/bench_rest.wav");
    this.addAudio(
      MyAudio.FALSE_ATTACK,
      "assets/game/audio/false_knight_attack.wav"
    );
    this.addAudio(
      MyAudio.FALSE_JUMP,
      "assets/game/audio/false_knight_jump.wav"
    );
    this.addAudio(
      MyAudio.FALSE_LAND,
      "assets/game/audio/false_knight_land.wav"
    );
    this.addAudio(
      MyAudio.FALSE_STRIKE,
      "assets/game/audio/false_knight_strike.wav"
    );
    this.addAudio(MyAudio.VICTORY, "assets/game/audio/victory.mp3");
    this.addAudio(MyAudio.PLAYER_BLAST, "assets/game/audio/hero_blast.wav");
  }

  addAudio(index, asset) {
    const element = `audio-${index}`;
    this.addElement(this.getElement(element, asset));
    this.audios[index] = document.getElementById(element);
  }

  setListener() {
    $("#volumeRange").on("input", (e) => {
      const vol = e.target.value;
      this.setVolume(vol / 100);
    });
  }

  getValueFromRange() {
    const val = $("#volumeRange").val() / 100;

    return val;
  }

  setVolumeFromRange() {
    this.setVolume(this.getValueFromRange());
  }

  stopAllAudio() {
    this.audios.forEach((audio) => {
      audio.pause();
    });
    (this.sfxPools || new Map()).forEach((pool) => pool.forEach((audio) => audio.pause()));
  }

  fadeVideo() {
    const time = 1500;
    TweenMax.to(this.audios, time / 1000, { volume: 0 });
    setTimeout(() => {
      this.stopAllAudio();
    }, time);
  }

  setVolume(vol) {
    this.volume = vol;
    this.audios.forEach((audio) => {
      audio.volume = vol;
    });
  }

  static getInstance = () => {
    if (this.instance == null) {
      this.instance = new MyAudio();
    }
    return this.instance;
  };

  // One-shot sound from a file (hero sounds). A few copies per file so several
  // players attacking at once overlap instead of restarting one another.
  // volume scales the master volume (teammates' attacks play quieter).
  playSfx(src, volume = 1) {
    const pool = this.sfxPool(src);
    const audio = pool[pool.next];
    pool.next = (pool.next + 1) % pool.length;
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, this.getValueFromRange() * volume));
    audio.play().catch(() => {});
  }

  // Creates (and starts loading) the copies of a sound file; call early to avoid a late first play
  sfxPool(src) {
    if (!this.sfxPools) this.sfxPools = new Map();
    let pool = this.sfxPools.get(src);
    if (!pool) {
      pool = Array.from({ length: SFX_COPIES }, () => {
        const audio = new Audio(src);
        audio.preload = "auto";
        return audio;
      });
      pool.next = 0;
      this.sfxPools.set(src, pool);
    }
    return pool;
  }

  // Loads a hero's sounds ahead of their first use
  preloadHero(sfx) {
    if (sfx) Object.values(sfx).forEach((src) => this.sfxPool(src));
  }

  // A hero's own sound, falling back to the knight's built-in one
  playHero(src, fallback, volume = 1) {
    if (src) this.playSfx(src, volume);
    else if (volume >= 1) this.play(fallback, false);
    else this.playSfx(this.audios[fallback].getAttribute("src"), volume);
  }

  play(state, loop = true) {
    this.audios[state].currentTime = 0;
    // play() rejects if the sound is stopped right away (e.g. changing area) or the
    // browser blocks audio before the first click - neither is worth an error
    this.audios[state].play().catch(() => {});
    this.audios[state].volume = this.getValueFromRange();
    this.audios[state].loop = loop;
  }
}
