(() => {
const { DIFFICULTIES, createGame } = window.MinesweeperState;
const { revealCell, toggleFlag } = window.MinesweeperRules;
const { renderBoard, renderGameInfo, renderMode, renderStatus, showResult } = window.MinesweeperRenderer;

const elements = {
  board: document.querySelector("#board"),
  difficultySelect: document.querySelector("#difficulty-select"),
  themeToggle: document.querySelector("#theme-toggle"),
  newGameButton: document.querySelector("#new-game-button"),
  revealModeButton: document.querySelector("#reveal-mode-button"),
  flagModeButton: document.querySelector("#flag-mode-button"),
  statusLine: document.querySelector("#status-line"),
  mineCounter: document.querySelector("#mine-counter"),
  timerCounter: document.querySelector("#timer-counter"),
  resultDialog: document.querySelector("#result-dialog"),
  resultKicker: document.querySelector("#result-kicker"),
  resultTitle: document.querySelector("#result-title"),
  resultMessage: document.querySelector("#result-message"),
  resultDetails: document.querySelector("#result-details"),
  playAgainButton: document.querySelector("#play-again-button"),
  closeResultButton: document.querySelector("#close-result-button"),
};

const THEME_STORAGE_KEY = "minesweeper-theme";
const GAME_STORAGE_KEY = "minesweeper-game-state";
const LAST_DIFFICULTY_STORAGE_KEY = "minesweeper-last-difficulty";
const RESULT_STORAGE_KEY = "playground.result.minesweeper.v1";
const GAME_STORAGE_VERSION = 1;
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function isDifficultyKey(value) {
  return typeof value === "string" && Object.hasOwn(DIFFICULTIES, value);
}

function savedTheme() {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return ["system", "light", "dark"].includes(theme) ? theme : "system";
  } catch {
    return "system";
  }
}

function activeTheme(theme) {
  return theme === "system" ? (systemThemeQuery.matches ? "dark" : "light") : theme;
}

function setTheme(theme, persist = true) {
  const selectedTheme = ["system", "light", "dark"].includes(theme) ? theme : "system";
  const resolvedTheme = activeTheme(selectedTheme);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = selectedTheme;
  elements.themeToggle.setAttribute("aria-checked", String(resolvedTheme === "dark"));
  elements.themeToggle.title = `Switch to ${nextTheme} theme`;
  document.querySelector("#theme-color").content = resolvedTheme === "dark" ? "#0b1119" : "#111a26";

  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
  } catch {
    // The app remains usable when storage is unavailable.
  }
}

let game;
let inputMode = "reveal";
let timerId = null;
let timerStartedAt = 0;

function savedDifficulty() {
  try {
    const difficultyKey = window.localStorage.getItem(LAST_DIFFICULTY_STORAGE_KEY);
    return isDifficultyKey(difficultyKey) ? difficultyKey : "beginner";
  } catch {
    return "beginner";
  }
}

function hydrateGame(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !isDifficultyKey(snapshot.difficultyKey)) return null;
  if (!Array.isArray(snapshot.cells)) return null;

  const restoredGame = createGame(snapshot.difficultyKey);
  const { rows, columns, mines } = restoredGame.difficulty;
  if (snapshot.cells.length !== rows || !["ready", "playing", "won", "lost"].includes(snapshot.state)) return null;
  if (typeof snapshot.minesGenerated !== "boolean" || !Number.isInteger(snapshot.timer)) return null;

  let mineCount = 0;
  let flaggedCount = 0;
  let safeCellsRemaining = 0;

  for (let row = 0; row < rows; row += 1) {
    const savedRow = snapshot.cells[row];
    if (!Array.isArray(savedRow) || savedRow.length !== columns) return null;

    for (let column = 0; column < columns; column += 1) {
      const savedCell = savedRow[column];
      if (!savedCell || typeof savedCell !== "object") return null;
      if (!["mine", "revealed", "flagged", "exploded", "wrongFlag"].every((field) => typeof savedCell[field] === "boolean")) {
        return null;
      }

      const cell = restoredGame.cells[row][column];
      cell.mine = savedCell.mine;
      cell.revealed = savedCell.revealed;
      cell.flagged = savedCell.flagged;
      cell.exploded = savedCell.exploded;
      cell.wrongFlag = savedCell.wrongFlag;
      mineCount += Number(cell.mine);
      flaggedCount += Number(cell.flagged);
      if (!cell.mine && !cell.revealed) safeCellsRemaining += 1;
    }
  }

  if ((!snapshot.minesGenerated && mineCount > 0) || (snapshot.minesGenerated && mineCount !== mines)) return null;
  if ((snapshot.state === "ready" && snapshot.minesGenerated) || (snapshot.state !== "ready" && !snapshot.minesGenerated)) return null;
  if (snapshot.state === "won" && safeCellsRemaining !== 0) return null;
  if (snapshot.state === "lost" && !restoredGame.cells.flat().some((cell) => cell.exploded && cell.mine)) return null;

  restoredGame.cells.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    if (cell.mine) return;
    let adjacentMines = 0;
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        if (restoredGame.cells[rowIndex + rowOffset]?.[columnIndex + columnOffset]?.mine) {
          adjacentMines += 1;
        }
      }
    }
    cell.adjacentMines = adjacentMines;
  }));

  restoredGame.state = snapshot.state;
  restoredGame.minesGenerated = snapshot.minesGenerated;
  restoredGame.flagsPlaced = flaggedCount;
  restoredGame.safeCellsRemaining = safeCellsRemaining;
  restoredGame.timer = Math.min(999, Math.max(0, snapshot.timer));
  return restoredGame;
}

function savedGame() {
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(GAME_STORAGE_KEY));
    if (!snapshot || snapshot.version !== GAME_STORAGE_VERSION) return null;

    const restoredGame = hydrateGame(snapshot.game);
    if (!restoredGame) return null;

    if (restoredGame.state === "playing" && Number.isFinite(snapshot.savedAt)) {
      const elapsedSinceSave = Math.max(0, Math.floor((Date.now() - snapshot.savedAt) / 1000));
      restoredGame.timer = Math.min(999, restoredGame.timer + elapsedSinceSave);
    }

    return {
      game: restoredGame,
      inputMode: snapshot.inputMode === "flag" ? "flag" : "reveal",
    };
  } catch {
    return null;
  }
}

function saveGame() {
  if (!game) return;

  if (timerStartedAt) {
    game.timer = Math.min(999, Math.floor((Date.now() - timerStartedAt) / 1000));
  }

  try {
    window.localStorage.setItem(LAST_DIFFICULTY_STORAGE_KEY, game.difficultyKey);
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({
      version: GAME_STORAGE_VERSION,
      savedAt: Date.now(),
      inputMode,
      game: {
        difficultyKey: game.difficultyKey,
        cells: game.cells,
        state: game.state,
        minesGenerated: game.minesGenerated,
        timer: game.timer,
      },
    }));
  } catch {
    // The game remains usable when storage is unavailable or full.
  }
}

function isActiveGame() {
  return game && (game.state === "playing" || game.flagsPlaced > 0);
}

function stopTimer() {
  if (timerId !== null) window.clearInterval(timerId);
  timerId = null;
  timerStartedAt = 0;
}

function updateTimer() {
  if (!game || !timerStartedAt) return;
  game.timer = Math.min(999, Math.floor((Date.now() - timerStartedAt) / 1000));
  renderGameInfo(elements, game);
  if (game.timer >= 999) stopTimer();
}

function startTimer() {
  if (timerId !== null || timerStartedAt) return;
  if (game.timer >= 999) return;
  timerStartedAt = Date.now() - game.timer * 1000;
  updateTimer();
  timerId = window.setInterval(updateTimer, 250);
}

function render(action) {
  renderBoard(elements.board, game);
  renderGameInfo(elements, game);
  renderMode(elements, inputMode);
  renderStatus(elements.statusLine, game, action);
}

function startNewGame(difficultyKey, action = "ready") {
  stopTimer();
  game = createGame(difficultyKey);
  elements.difficultySelect.value = difficultyKey;
  if (elements.resultDialog.open) elements.resultDialog.close();
  render(action);
  saveGame();
  elements.newGameButton.focus();
}

function confirmRestart() {
  return !isActiveGame() || window.confirm("Restart this game? Your current progress will be lost.");
}

function completeGame(action) {
  updateTimer();
  stopTimer();
  render(action);
  saveGame();
  try {
    const previous = JSON.parse(window.localStorage.getItem(RESULT_STORAGE_KEY));
    const stats = previous?.version === 1 && previous.app === "minesweeper" && previous.stats && typeof previous.stats === "object" ? previous.stats : {};
    const wins = (Number.isSafeInteger(stats.wins) ? stats.wins : 0) + Number(action === "won");
    const losses = (Number.isSafeInteger(stats.losses) ? stats.losses : 0) + Number(action === "lost");
    const fastestWins = stats.fastestWins && typeof stats.fastestWins === "object" ? { ...stats.fastestWins } : {};
    if (action === "won") fastestWins[game.difficultyKey] = Math.min(Number(fastestWins[game.difficultyKey]) || Infinity, game.timer);
    const fastest = Object.entries(fastestWins).sort((a, b) => a[1] - b[1])[0];
    const difficultyName = key => key ? key[0].toUpperCase() + key.slice(1) : "";
    window.localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({
      version: 1, app: "minesweeper", updatedAt: Date.now(),
      summary: { primary: `${wins} win${wins === 1 ? "" : "s"}`, secondary: fastest ? `${difficultyName(fastest[0])} best: ${fastest[1]}s` : `${losses} loss${losses === 1 ? "" : "es"}` },
      stats: { wins, losses, fastestWins, last: { result: action, difficulty: game.difficultyKey, seconds: game.timer, completedAt: Date.now() } }
    }));
  } catch { /* Results are optional when storage is unavailable. */ }
  if (action === "lost") {
    elements.board.classList.remove("loss-feedback");
    // Force a new animation even if an earlier loss class has not painted yet.
    void elements.board.offsetWidth;
    elements.board.classList.add("loss-feedback");
    const finishLossFeedback = (event) => {
      if (event.target !== elements.board) return;
      elements.board.classList.remove("loss-feedback");
      elements.board.removeEventListener("animationend", finishLossFeedback);
    };
    elements.board.addEventListener("animationend", finishLossFeedback);
  }
  showResult(elements.resultDialog, elements, game);
}

function actOnCell(row, column, action) {
  const result = action === "flag" ? toggleFlag(game, row, column) : revealCell(game, row, column);
  if (result.kind === "ignored") return;
  if (result.started) startTimer();
  if (result.kind === "won" || result.kind === "lost") {
    completeGame(result.kind);
  } else {
    render(result.kind);
    saveGame();
  }
}

function setMode(mode) {
  inputMode = mode;
  renderMode(elements, inputMode);
  elements.statusLine.textContent = mode === "reveal" ? "Reveal mode selected." : "Flag mode selected.";
  saveGame();
}

elements.board.addEventListener("click", (event) => {
  const cellButton = event.target.closest(".cell");
  if (!cellButton || !elements.board.contains(cellButton)) return;
  actOnCell(Number(cellButton.dataset.row), Number(cellButton.dataset.column), inputMode === "flag" ? "flag" : "reveal");
});

elements.board.addEventListener("contextmenu", (event) => {
  const cellButton = event.target.closest(".cell");
  if (!cellButton || !elements.board.contains(cellButton)) return;
  event.preventDefault();
  actOnCell(Number(cellButton.dataset.row), Number(cellButton.dataset.column), "flag");
});

elements.revealModeButton.addEventListener("click", () => setMode("reveal"));
elements.flagModeButton.addEventListener("click", () => setMode("flag"));

elements.newGameButton.addEventListener("click", () => {
  if (confirmRestart()) startNewGame(game.difficultyKey, "newGame");
});

elements.difficultySelect.addEventListener("change", () => {
  const requestedDifficulty = elements.difficultySelect.value;
  if (requestedDifficulty === game.difficultyKey) return;
  if (confirmRestart()) {
    startNewGame(requestedDifficulty, "newGame");
  } else {
    elements.difficultySelect.value = game.difficultyKey;
  }
});
elements.themeToggle.addEventListener("click", () => {
  const nextTheme = activeTheme(document.documentElement.dataset.theme) === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});
const updateSystemTheme = () => {
  if (document.documentElement.dataset.theme === "system") setTheme("system", false);
};
if (typeof systemThemeQuery.addEventListener === "function") {
  systemThemeQuery.addEventListener("change", updateSystemTheme);
} else {
  systemThemeQuery.addListener(updateSystemTheme);
}

elements.playAgainButton.addEventListener("click", () => startNewGame(game.difficultyKey, "newGame"));
elements.closeResultButton.addEventListener("click", () => elements.resultDialog.close());
elements.resultDialog.addEventListener("close", () => elements.newGameButton.focus());
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});

setTheme(savedTheme(), false);
const restoredGame = savedGame();
if (restoredGame) {
  game = restoredGame.game;
  inputMode = restoredGame.inputMode;
  elements.difficultySelect.value = game.difficultyKey;
  if (game.state === "playing") startTimer();
  render("restored");
} else {
  startNewGame(savedDifficulty());
}
})();
