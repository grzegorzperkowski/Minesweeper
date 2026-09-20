(() => {
function formatCounter(value) {
  const bounded = Math.max(-99, Math.min(999, value));
  return bounded < 0
    ? `-${String(Math.abs(bounded)).padStart(2, "0")}`
    : String(bounded).padStart(3, "0");
}

function stateLabel(state) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function cellPresentation(cell) {
  const classes = ["cell"];
  let text = "";
  let label = `Row ${cell.row + 1}, column ${cell.column + 1}, `;

  if (cell.wrongFlag) {
    classes.push("is-wrong-flag");
    text = "⚑×";
    label += "incorrect flag";
  } else if (!cell.revealed) {
    classes.push("is-covered");
    if (cell.flagged) {
      classes.push("is-flagged");
      text = "⚑";
      label += "flagged, covered";
    } else {
      label += "covered";
    }
  } else if (cell.exploded) {
    classes.push("is-mine", "is-exploded");
    text = "✹";
    label += "mine exploded";
  } else if (cell.mine) {
    classes.push("is-mine");
    text = "✹";
    label += "mine";
  } else if (cell.adjacentMines > 0) {
    classes.push(`number-${cell.adjacentMines}`);
    text = String(cell.adjacentMines);
    label += `${cell.adjacentMines} adjacent mines`;
  } else {
    label += "empty";
  }
  return { classes, text, label };
}

function renderBoard(boardElement, game) {
  const fragment = document.createDocumentFragment();
  const gameIsOver = game.state === "won" || game.state === "lost";
  boardElement.style.setProperty("--columns", game.difficulty.columns);
  boardElement.style.setProperty("--rows", game.difficulty.rows);
  boardElement.classList.toggle("is-lost", game.state === "lost");

  game.cells.forEach((row) => row.forEach((cell) => {
    const { classes, text, label } = cellPresentation(cell);
    const button = document.createElement("button");
    button.type = "button";
    button.className = classes.join(" ");
    button.dataset.row = cell.row;
    button.dataset.column = cell.column;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.disabled = gameIsOver;
    fragment.append(button);
  }));

  boardElement.replaceChildren(fragment);
  boardElement.setAttribute("aria-label", `${game.difficulty.label} Minesweeper board, ${game.difficulty.columns} columns by ${game.difficulty.rows} rows`);
}

function renderGameInfo(elements, game) {
  const { difficulty } = game;
  elements.mineCounter.value = formatCounter(difficulty.mines - game.flagsPlaced);
  elements.mineCounter.setAttribute("aria-label", `${difficulty.mines - game.flagsPlaced} mines remaining after flags`);
  elements.timerCounter.value = formatCounter(game.timer);
  elements.timerCounter.setAttribute("aria-label", `${game.timer} seconds elapsed`);
}

function renderMode(elements, mode) {
  const isReveal = mode === "reveal";
  elements.revealModeButton.setAttribute("aria-pressed", String(isReveal));
  elements.flagModeButton.setAttribute("aria-pressed", String(!isReveal));
}

function renderStatus(statusElement, game, action) {
  const messages = {
    ready: "Ready. Reveal a square to begin.",
    newGame: "New game ready. Reveal a square to place the mines and begin.",
    restored: "Saved game restored.",
    revealed: "Square revealed.",
    flagged: "Flag placed.",
    unflagged: "Flag removed.",
    won: "You cleared every safe square. You won!",
    lost: "Mine triggered. Game over.",
  };
  statusElement.textContent = messages[action] ?? `${stateLabel(game.state)}.`;
}

function showResult(dialog, elements, game) {
  const won = game.state === "won";
  dialog.dataset.result = won ? "won" : "lost";
  elements.resultKicker.textContent = won ? "Board cleared" : "Mine triggered";
  elements.resultTitle.textContent = won ? "You won!" : "Game over";
  elements.resultMessage.textContent = won
    ? "Every safe square is revealed. Nicely swept."
    : "A mine ended this round. The board now shows all mine locations.";
  elements.resultDetails.textContent = won
    ? `Final time: ${game.timer} seconds · Flags placed: ${game.flagsPlaced}`
    : `Final time: ${game.timer} seconds`;
  dialog.showModal();
  elements.resultTitle.focus();
}

window.MinesweeperRenderer = Object.freeze({ renderBoard, renderGameInfo, renderMode, renderStatus, showResult });
})();
