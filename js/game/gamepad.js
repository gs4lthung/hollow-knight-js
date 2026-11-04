// Controller support: turns the first connected gamepad into the keyboard keys
// the game already listens for, so every action works the same with either.
// Button numbers follow the browser's "standard" mapping (Xbox / PlayStation layout).
const BUTTON_KEYS = {
  0: "z", // A / Cross: jump
  1: "s", // B / Circle: dash
  2: "x", // X / Square: attack
  3: "a", // Y / Triangle: skill
  4: "e", // LB / L1: interact (hold to revive)
  5: "e", // RB / R1: interact
  9: "Escape", // Start / Options: pause
  12: "ArrowUp", // D-pad up: jump (and shop: choose)
  13: "ArrowDown", // D-pad down: shop: choose
  14: "ArrowLeft",
  15: "ArrowRight",
};
const STICK_DEADZONE = 0.5;

export const PAD_BUTTON = { A: 0, START: 9 };

export class GamepadInput {
  constructor() {
    this.held = new Set(); // keys we've sent keydown for
    this.pressed = new Set(); // raw buttons down last frame
    this.inGame = false;
    // Menu presses (before the game starts): (button) => void
    this.onMenuButton = () => {};
    this.poll = this.poll.bind(this);

    window.addEventListener("gamepadconnected", (e) => {
      $("#pad-hint").text(`Controller connected: ${e.gamepad.id.split("(")[0].trim()}`).show();
    });
    window.addEventListener("gamepaddisconnected", () => {
      $("#pad-hint").hide();
      this.releaseAll();
    });
    requestAnimationFrame(this.poll);
  }

  pad() {
    if (!navigator.getGamepads) return null;
    return [...navigator.getGamepads()].find((p) => p && p.connected) || null;
  }

  send(type, key) {
    window.dispatchEvent(new KeyboardEvent(type, { key }));
  }

  releaseAll() {
    this.held.forEach((key) => this.send("keyup", key));
    this.held.clear();
  }

  poll() {
    requestAnimationFrame(this.poll);
    const pad = this.pad();
    if (!pad) return;

    const down = new Set();
    pad.buttons.forEach((button, i) => {
      if (button.pressed) down.add(i);
    });

    if (!this.inGame) {
      // Menus: newly pressed buttons only
      down.forEach((i) => {
        if (this.pressed.has(i)) return;
        if (i === 14 || i === 15) this.send("keydown", BUTTON_KEYS[i]); // choose knight
        else this.onMenuButton(i);
      });
      this.pressed = down;
      return;
    }

    // In game: work out which keys should be held right now
    const want = new Set();
    down.forEach((i) => {
      if (BUTTON_KEYS[i]) want.add(BUTTON_KEYS[i]);
    });
    const x = pad.axes[0] || 0;
    if (x < -STICK_DEADZONE) want.add("ArrowLeft");
    if (x > STICK_DEADZONE) want.add("ArrowRight");

    want.forEach((key) => {
      if (this.held.has(key)) return;
      this.held.add(key);
      this.send("keydown", key);
    });
    [...this.held].forEach((key) => {
      if (want.has(key)) return;
      this.held.delete(key);
      this.send("keyup", key);
    });
    this.pressed = down;
  }
}
