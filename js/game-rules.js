(() => {
const { forEachCell, getCell } = window.MinesweeperState;

function getNeighbors(game, row, column) {
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const neighbor = getCell(game, row + rowOffset, column + columnOffset);
      if (neighbor) neighbors.push(neighbor);
    }
  }
  return neighbors;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

// Mines wait until the first reveal, so its square and (when possible) its neighborhood are safe.
function generateMines(game, firstRow, firstColumn) {
  if (game.minesGenerated) return;

  const firstCell = getCell(game, firstRow, firstColumn);
  const protectedCells = [firstCell, ...getNeighbors(game, firstRow, firstColumn)];
  const protectedIds = new Set(protectedCells.map(({ row, column }) => `${row}:${column}`));
  const totalCells = game.difficulty.rows * game.difficulty.columns;
  const protectNeighborhood = totalCells - protectedIds.size >= game.difficulty.mines;
  const excludedIds = protectNeighborhood
    ? protectedIds
    : new Set([`${firstRow}:${firstColumn}`]);

  const candidates = [];
  forEachCell(game, (cell) => {
    if (!excludedIds.has(`${cell.row}:${cell.column}`)) candidates.push(cell);
  });

  shuffle(candidates)
    .slice(0, game.difficulty.mines)
    .forEach((cell) => { cell.mine = true; });

  forEachCell(game, (cell) => {
    if (!cell.mine) {
      cell.adjacentMines = getNeighbors(game, cell.row, cell.column)
        .filter((neighbor) => neighbor.mine).length;
    }
  });
  game.minesGenerated = true;
}

function revealSafeArea(game, startingCell) {
  const pending = [startingCell];
  let revealedCount = 0;

  // Breadth-first expansion exposes empty squares plus the numbered boundary around them.
  while (pending.length) {
    const cell = pending.shift();
    if (!cell || cell.revealed || cell.flagged || cell.mine) continue;

    cell.revealed = true;
    game.safeCellsRemaining -= 1;
    revealedCount += 1;

    if (cell.adjacentMines === 0) {
      getNeighbors(game, cell.row, cell.column).forEach((neighbor) => {
        if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) pending.push(neighbor);
      });
    }
  }
  return revealedCount;
}

function revealMinesAndMarkMistakes(game) {
  forEachCell(game, (cell) => {
    if (cell.mine) cell.revealed = true;
    if (cell.flagged && !cell.mine) cell.wrongFlag = true;
  });
}

function revealCell(game, row, column) {
  if (game.state === "won" || game.state === "lost") return { kind: "ignored" };
  const cell = getCell(game, row, column);
  if (!cell || cell.revealed || cell.flagged) return { kind: "ignored" };

  const started = game.state === "ready";
  if (!game.minesGenerated) generateMines(game, row, column);
  game.state = "playing";

  if (cell.mine) {
    cell.exploded = true;
    revealMinesAndMarkMistakes(game);
    game.state = "lost";
    return { kind: "lost", started, revealedCount: 1 };
  }

  const revealedCount = revealSafeArea(game, cell);
  if (game.safeCellsRemaining === 0) {
    game.state = "won";
    return { kind: "won", started, revealedCount };
  }
  return { kind: "revealed", started, revealedCount };
}

function toggleFlag(game, row, column) {
  if (game.state === "won" || game.state === "lost") return { kind: "ignored" };
  const cell = getCell(game, row, column);
  if (!cell || cell.revealed) return { kind: "ignored" };

  cell.flagged = !cell.flagged;
  game.flagsPlaced += cell.flagged ? 1 : -1;
  return { kind: cell.flagged ? "flagged" : "unflagged" };
}

window.MinesweeperRules = Object.freeze({ getNeighbors, generateMines, revealCell, toggleFlag });
})();
