const STORAGE_KEY = "wcl-knights-name";
export const MAX_NAME_LENGTH = 12;

// Names are only ever drawn with fillText/.text(), never as HTML
export function cleanName(name) {
  return String(name || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function getPlayerName() {
  const typed = cleanName($("#player-name").val());
  if (typed) return typed;
  try {
    return cleanName(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "";
  }
}

// Fills the name box from last time and saves whatever is typed
export function setupNameInput(onChange) {
  const input = $("#player-name");
  input.attr("maxlength", MAX_NAME_LENGTH);
  try {
    input.val(cleanName(localStorage.getItem(STORAGE_KEY)));
  } catch {
    // storage blocked: start empty
  }
  input.on("input", () => {
    const name = cleanName(input.val());
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // not remembered - fine
    }
    onChange(name);
  });
  // Enter in the box starts the game like anywhere else; leave the box first
  input.on("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
}
