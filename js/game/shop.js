import { GAME } from "./game.js";
import { MyAudio } from "./facade/audio.js";
import { UI } from "./model/ui.js";

// Upgrades bought at the bench. Prices go up with each level.
// apply(player) runs once per purchase (and again on rejoin to restore them).
export const SHOP_ITEMS = [
  {
    id: "heart",
    name: "Mask Shard",
    description: "+1 heart",
    costs: [8, 12, 16],
    apply(player) {
      player.maxHealthValue += 1;
      player.health += 1;
      UI.getInstance().setMaxHealth(player.maxHealthValue);
      UI.getInstance().changeHealth(player.health);
    },
  },
  {
    id: "nail",
    name: "Sharpened Nail",
    description: "+1 nail damage",
    costs: [10, 15, 20],
    apply(player) {
      player.damage += 1;
    },
  },
  {
    id: "soul",
    name: "Soul Catcher",
    description: "Skill charges in fewer hits",
    costs: [10, 15],
    apply(player) {
      player.hitsPerCharge = Math.max(1, player.hitsPerCharge - 1);
    },
  },
  {
    id: "quick",
    name: "Quick Slash",
    description: "Attack 20% faster",
    costs: [8, 12],
    apply(player) {
      player.attackSpeed /= 1.2;
    },
  },
  {
    id: "long",
    name: "Long Nail",
    description: "20% more reach",
    costs: [8, 12],
    apply(player) {
      player.splashWidth *= 1.2;
      player.splashHeight *= 1.2;
    },
  },
];

// The bench shop. Opened with interact at the bench; while it's open the
// shop owns the keyboard / controller (see main.js).
export class Shop {
  static instance;

  static getInstance() {
    if (this.instance == null) this.instance = new Shop();
    return this.instance;
  }

  constructor() {
    this.isOpen = false;
    this.selected = 0;
    this.onKeyDown = this.onKeyDown.bind(this);
    $("#shop .shop-close").on("click", () => this.close());
  }

  game() {
    return GAME.getInstance();
  }

  // Everyone earns a coin for every kill the team makes; each player spends their own
  coins() {
    const game = this.game();
    return Math.max(0, game.ui.money - game.player.coinsSpent);
  }

  level(item) {
    return this.game().player.upgrades[item.id] || 0;
  }

  price(item) {
    return item.costs[this.level(item)];
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    const game = this.game();
    if (this.isOpen || game.player.dead) return;
    this.isOpen = true;
    game.keys = [];
    game.player.shopping = true;
    // Alone, the world waits for you; with friends it keeps going (you're safe at the bench)
    if (!game.hasPeers()) game.pause = true;
    window.addEventListener("keydown", this.onKeyDown);
    this.render();
    $("#shop").fadeIn(150);
  }

  close() {
    if (!this.isOpen) return;
    const game = this.game();
    this.isOpen = false;
    game.player.shopping = false;
    if (!game.hasPeers()) game.pause = false;
    window.removeEventListener("keydown", this.onKeyDown);
    $("#shop").fadeOut(150);
  }

  buy(index) {
    const item = SHOP_ITEMS[index];
    const price = this.price(item);
    const player = this.game().player;
    if (price === undefined || this.coins() < price) {
      $("#shop .shop-coins").stop(true, true).fadeOut(80).fadeIn(80);
      return;
    }
    player.coinsSpent += price;
    player.upgrades[item.id] = this.level(item) + 1;
    item.apply(player);
    player.saveRunStats();
    this.game().audio.play(MyAudio.BENCH_REST, false);
    this.game().ui.changeMoney(this.game().ui.money);
    this.render();
  }

  // ArrowUp/Down choose, Z / Enter (controller A) buy, S / Escape (controller B / Start) close.
  // E and Space are handled by the bench itself, which toggles the shop.
  onKeyDown(e) {
    if (e.repeat) return;
    switch (e.key) {
      case "ArrowUp":
        this.selected = (this.selected + SHOP_ITEMS.length - 1) % SHOP_ITEMS.length;
        this.render();
        break;
      case "ArrowDown":
        this.selected = (this.selected + 1) % SHOP_ITEMS.length;
        this.render();
        break;
      case "z":
      case "Enter":
        this.buy(this.selected);
        break;
      case "s":
      case "Escape":
        this.close();
        break;
    }
  }

  render() {
    $("#shop .shop-coins").text(`${this.coins()} coins`);
    const rows = SHOP_ITEMS.map((item, i) => {
      const price = this.price(item);
      const maxed = price === undefined;
      const row = $("<div>", { class: "shop-item" })
        .toggleClass("selected", i === this.selected)
        .toggleClass("maxed", maxed)
        .toggleClass("too-expensive", !maxed && this.coins() < price)
        .append(
          $("<div>", { class: "shop-item-name", text: item.name }),
          $("<div>", { class: "shop-item-desc", text: item.description }),
          $("<div>", { class: "shop-item-level", text: `${this.level(item)}/${item.costs.length}` }),
          $("<div>", { class: "shop-item-price", text: maxed ? "MAX" : `${price}` })
        );
      row.on("click", () => {
        this.selected = i;
        this.buy(i);
      });
      return row;
    });
    $("#shop .shop-items").empty().append(rows);
  }
}
