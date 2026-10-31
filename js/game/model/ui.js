import { GAME } from "../game.js";
import { GET_UI_HEALTH, GET_UI_LEFT, GET_UI_MONEY } from "../facade/file.js";
import { Setting } from "../setting.js";
import { heroOf } from "../heroes.js";
import { PLAYER_COLORS } from "./remoteplayer.js";

export class UI {
  static instance;
  static getInstance = () => {
    if (this.instance == null) {
      this.instance = new UI();
    }
    return this.instance;
  };

  constructor() {
    this.money = 0;
    this.totalHealth = 5;
    $("#ui").show();
    this.skillText = $("#skill-text");
    this.skillContainer = $("#skill-container");
    this.addPauseListener();
  }

  setSkillText(n) {
    this.skillText.html(n);
    if (n == 0) {
      this.skillContainer.hide();
    } else {
      this.skillContainer.show();
    }
  }

  addPauseListener() {
    $("#start-game").click(() => {
      const game = GAME.getInstance();
      game.resumeGame();
    });

    $("#option-fps").click(() => {
      $("#fps").toggle();
    });

    $("#exit-game").click(() => {
      const game = GAME.getInstance();
      game.backToMenu();
    });
  }

  fps(n) {
    $("#fps").html(n);
  }

  // onRespawn: when given (multiplayer), respawn instead of going back to the menu
  deadScreen(onRespawn = null) {
    const game = GAME.getInstance();
    $("#wck-screen").fadeIn(Setting.DEATH_SCREEN_TIME);
    $("#death-menu").fadeIn(Setting.DEATH_SCREEN_TIME);
    setTimeout(() => {
      if (onRespawn) {
        $("#death-menu").stop(true).fadeOut(500);
        onRespawn();
      } else {
        game.backToMenu();
      }
    }, 5000);
  }

  whiteScreen(n, opacity = 1) {
    jQuery("#white-screen").css("opacity", opacity);

    $("#white-screen").fadeIn(n);
    setTimeout(() => {
      $("#white-screen").fadeOut(n);
    }, n);
  }

  hideUi() {
    $("#ui").fadeOut(1000);
  }

  reset() {
    $(".health").show();
    $("#money-text").text(0);
  }

  showRest() {
    $("#rest").fadeIn(100);
  }
  hideRest() {
    $("#rest").fadeOut(100);
  }

  // Heroes have different numbers of hearts
  setMaxHealth(n) {
    this.totalHealth = n;
    const hearts = Array.from({ length: n }, () =>
      $("<img>", { class: "health", src: "assets/game/ui/health.png", alt: "" })
    );
    $(".health-container").empty().append(hearts);
  }

  changeHealth(n) {
    $(".health").show();
    const nToHide = this.totalHealth - n;
    for (let i = nToHide - 1; i >= 0; i--) {
      $(".health").eq(i).hide();
    }
  }

  showDowned(show) {
    $("#downed-banner").stop(true, true)[show ? "fadeIn" : "fadeOut"](300);
  }

  partyFallen(show) {
    $("#party-fallen").stop(true, true)[show ? "fadeIn" : "fadeOut"](500);
  }

  // rows: [{ slot, hero, kills, bossDamage, deaths, revives }]
  showScoreboard(rows) {
    const titles = assignTitles(rows);
    const body = $("#scoreboard tbody").empty();
    rows.forEach((row, i) => {
      const hero = heroOf(row.hero);
      $("<tr>")
        .append(
          $("<td>", { class: "player", text: `${row.name || `P${row.slot + 1}`} (${hero.name})` }).css(
            "color",
            rows.length > 1 ? PLAYER_COLORS[row.slot] : hero.color
          ),
          $("<td>", { text: row.kills }),
          $("<td>", { text: row.bossDamage }),
          $("<td>", { text: row.deaths }),
          $("<td>", { text: row.revives }),
          $("<td>", { class: "title", text: titles[i] })
        )
        .appendTo(body);
    });
    $("#scoreboard").fadeIn(800);
  }

  hideScoreboard() {
    $("#scoreboard").fadeOut(800);
  }

  showPause() {
    $("#pause-game").show();
  }

  hidePause() {
    $("#pause-game").hide();
  }

  incrementMoney(n = 1) {
    this.money += n;
    this.changeMoney(this.money);
  }

  // n is the team's kill count: it drives the boss door, and every kill is a coin
  // for each player, so the counter shows team kills minus what we've spent
  changeMoney(n) {
    const game = GAME.getInstance();
    const spent = game.player ? game.player.coinsSpent : 0;
    $("#money-text").text(Math.max(0, n - spent));
    const needed = game.killsForBossDoor ? game.killsForBossDoor() : Setting.TOTAL_CRAWLID;
    const doorOpen = game.bossDoor && game.bossDoor.open;
    const kills = n - (game.areaStartKills || 0); // each area's gate counts its own kills
    $("#door-progress").text(doorOpen || game.bossFight ? "" : `Door ${Math.min(kills, needed)}/${needed}`);
  }

  hideTitle() {
    $("#title").fadeOut(1000);
  }

  changeTitle(str) {
    $("#title").html(str);
  }
  showTitle(n, str = "") {
    if (str != "") {
      this.changeTitle(str);
    }
    $("#title").fadeIn(1000);
    setTimeout(() => {
      $("#title").fadeOut(1000);
    }, n);
  }
}

// One title per player: each award goes to the best player who doesn't have one yet
function assignTitles(rows) {
  const awards = [
    ["Boss Breaker", (r) => r.bossDamage, (v) => v > 0],
    ["Slayer", (r) => r.kills, (v) => v > 0],
    ["Medic", (r) => r.revives, (v) => v > 0],
    ["Survivor", (r) => -r.deaths, () => true],
  ];
  const titles = rows.map(() => "");
  awards.forEach(([name, score, earned]) => {
    let best = -1;
    rows.forEach((row, i) => {
      if (titles[i] || !earned(score(row))) return;
      if (best === -1 || score(row) > score(rows[best])) best = i;
    });
    if (best !== -1) titles[best] = name;
  });
  return titles.map((t) => t || "Brave Knight");
}
