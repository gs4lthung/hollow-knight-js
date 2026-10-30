import { heroOf } from "./heroes.js";
import { PLAYER_COLORS } from "./model/remoteplayer.js";
import { getPlayerName } from "./playername.js";

const MAX_PLAYERS = 4;

// Waiting room for "Play with Friends": everyone picks a hero and readies up,
// then the host starts the game for all at once.
export class Lobby {
  constructor(net, heroSelect) {
    this.net = net;
    this.heroSelect = heroSelect;
    this.ready = false;
    this.visible = false;

    $("#lobby-ready").on("click", () => this.toggleReady());
    $("#lobby-start").on("click", () => this.start());
    heroSelect.onChange = () => this.sync();
    net.onLobby = (players) => this.render(players);
  }

  show() {
    this.visible = true;
    $(".start-options").hide();
    $("#lobby").show();
    this.sync();
    this.render(this.net.lobby);
  }

  hide() {
    this.visible = false;
    $("#lobby").hide();
  }

  sync() {
    if (this.visible) this.net.sendLobby(this.heroSelect.selected, this.ready, getPlayerName());
  }

  toggleReady() {
    this.ready = !this.ready;
    this.heroSelect.setLocked(this.ready);
    $("#player-name").prop("disabled", this.ready);
    this.sync();
  }

  allReady(players) {
    return players.length > 0 && players.every((p) => p.ready);
  }

  start() {
    if (this.net.isHost && this.allReady(this.net.lobby)) this.net.requestStart();
  }

  render(players) {
    if (!this.visible) return;

    const slots = [];
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const p = players.find((player) => player.slot === slot);
      const el = $("<div>", { class: "lobby-slot" });
      if (p) {
        const you = p.id === this.net.id ? " (you)" : "";
        el.addClass("filled")
          .css("--slot-color", PLAYER_COLORS[slot])
          .append(
            $("<div>").append(
              $("<b>", { text: `${p.name || `P${slot + 1}`}${you}` }).css("color", PLAYER_COLORS[slot]),
              document.createTextNode(p.host ? " · Host" : "")
            ),
            $("<div>", { text: heroOf(p.hero).name }),
            $("<div>", { class: p.ready ? "ready" : "", text: p.ready ? "Ready" : "Choosing..." })
          );
      } else {
        el.append($("<div>", { text: `P${slot + 1}` }), $("<div>", { text: "Waiting for a friend" }));
      }
      slots.push(el);
    }
    $("#lobby .lobby-slots").empty().append(slots);

    const link = this.net.joinUrls[0];
    $("#lobby .lobby-link").text(link ? `Friends join at ${link}` : "");

    $("#lobby-ready").text(this.ready ? "Not ready" : "Ready");

    const everyoneReady = this.allReady(players);
    const isHost = this.net.isHost;
    $("#lobby-start").toggle(isHost).toggleClass("disabled", !everyoneReady);

    let hint;
    if (!this.ready) hint = "Pick your knight, then press Ready";
    else if (!everyoneReady) hint = "Waiting for everyone to be ready";
    else hint = isHost ? "Everyone is ready - press Start" : "Waiting for the host to start";
    $("#lobby .lobby-hint").text(hint);
  }
}
