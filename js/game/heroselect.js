import { DEFAULT_HERO, HEROES, HERO_IDS, heroPreview } from "./heroes.js";

const STORAGE_KEY = "wcl-knights-hero";

function loadChoice() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return HEROES[saved] ? saved : DEFAULT_HERO;
  } catch {
    return DEFAULT_HERO;
  }
}

function saveChoice(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage blocked (private window etc.) - the choice just isn't remembered
  }
}

function multiplier(n) {
  return n === 1 ? "normal" : `${n}x`;
}

// Character cards on the start menu. Arrow keys or clicks change the choice.
export class HeroSelect {
  constructor(root) {
    this.root = $(root);
    this.selected = loadChoice();
    this.locked = false;
    this.onChange = () => {};
    this.build();
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
  }

  build() {
    const cards = HERO_IDS.map((id) => {
      const hero = HEROES[id];
      const s = hero.stats;
      const card = $("<div>", { class: "hero-card", "data-hero": id })
        .css("--hero-color", hero.color)
        .append(
          $("<img>", { src: heroPreview(id), alt: hero.name }),
          $("<div>", { class: "hero-name", text: hero.name }).css("color", hero.color),
          $("<div>", { class: "hero-stats" }).append(
            $("<div>", { text: `Hearts ${s.maxHealth}` }),
            $("<div>", { text: `Speed ${multiplier(s.speed)}` }),
            $("<div>", { text: `Reach ${multiplier(s.range)}` })
          ),
          $("<div>", { class: "hero-skill", text: hero.skill.name }),
          $("<div>", { class: "hero-skill-desc", text: hero.skill.description })
        );
      card.on("click", (e) => {
        e.stopPropagation();
        this.select(id);
      });
      return card;
    });
    this.root.empty().append(cards);
    this.select(this.selected);
  }

  select(id) {
    if (this.locked || !HEROES[id]) return;
    this.selected = id;
    saveChoice(id);
    this.root.find(".hero-card").removeClass("selected");
    this.root.find(`[data-hero="${id}"]`).addClass("selected");
    this.onChange(id);
  }

  // Lobby: lock while "Ready", unlock to change your mind
  setLocked(locked) {
    this.locked = locked;
    this.root.toggleClass("locked", locked);
  }

  onKeyDown(e) {
    if (this.locked || e.target instanceof HTMLInputElement) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const i = HERO_IDS.indexOf(this.selected);
    this.select(HERO_IDS[(i + step + HERO_IDS.length) % HERO_IDS.length]);
  }

  // Called when the game starts: the choice can't change mid-game
  lock() {
    this.locked = true;
    window.removeEventListener("keydown", this.onKeyDown);
    return this.selected;
  }
}
