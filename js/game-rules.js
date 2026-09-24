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

// Intermediate and expert can take back one losing click per game. Beginner cannot.
function canUndoTriggeredMine(game) {
  return !!game
    && game.state === "lost"
    && game.errorUndoUsed !== true
    && (game.difficultyKey === "intermediate" || game.difficultyKey === "expert");
}

function undoTriggeredMine(game) {
  if (!canUndoTriggeredMine(game)) return false;

  forEachCell(game, (cell) => {
    if (cell.mine) cell.revealed = false;
    cell.exploded = false;
    cell.wrongFlag = false;
  });
  game.state = "playing";
  game.errorUndoUsed = true;
  return true;
}

function applyMineLayout(game, isMine) {
  forEachCell(game, (cell) => {
    cell.mine = isMine(cell);
  });
  forEachCell(game, (cell) => {
    if (cell.mine) {
      cell.adjacentMines = 0;
      return;
    }
    let adjacentMines = 0;
    const neighbors = getNeighbors(game, cell.row, cell.column);
    for (let index = 0; index < neighbors.length; index += 1) {
      if (neighbors[index].mine) adjacentMines += 1;
    }
    cell.adjacentMines = adjacentMines;
  });
}

const MAX_RESCUE_NODES = 200000;

// Revealed numbers sometimes leave a covered mine with more than one legal square.
// Moving it keeps an undetermined click safe without changing any number already shown.
function rescueAmbiguousMine(game, clickedCell) {
  const { rows, columns } = game.difficulty;
  const cellCount = rows * columns;
  const indexOf = (row, column) => row * columns + column;
  const clickedId = indexOf(clickedCell.row, clickedCell.column);
  const revealed = new Uint8Array(cellCount);
  const currentMine = new Uint8Array(cellCount);
  const neighborIds = new Array(cellCount);
  let mineTotal = 0;

  forEachCell(game, (cell) => {
    const id = indexOf(cell.row, cell.column);
    revealed[id] = cell.revealed ? 1 : 0;
    currentMine[id] = cell.mine ? 1 : 0;
    mineTotal += currentMine[id];
    neighborIds[id] = getNeighbors(game, cell.row, cell.column)
      .map((neighbor) => indexOf(neighbor.row, neighbor.column));
  });

  const borderIds = [];
  const interiorIds = [];
  for (let id = 0; id < cellCount; id += 1) {
    if (revealed[id] || id === clickedId) continue;
    const neighbors = neighborIds[id];
    let touchesRevealed = false;
    for (let index = 0; index < neighbors.length; index += 1) {
      if (revealed[neighbors[index]]) {
        touchesRevealed = true;
        break;
      }
    }
    if (touchesRevealed) borderIds.push(id);
    else interiorIds.push(id);
  }

  const clickedNeighbors = neighborIds[clickedId];
  let clickedTouchesRevealed = false;
  for (let index = 0; index < clickedNeighbors.length; index += 1) {
    if (revealed[clickedNeighbors[index]]) {
      clickedTouchesRevealed = true;
      break;
    }
  }
  if (clickedTouchesRevealed) borderIds.push(clickedId);

  const constraints = [];
  const cellConstraints = Array.from({ length: cellCount }, () => []);
  for (let id = 0; id < cellCount; id += 1) {
    if (!revealed[id]) continue;
    const hiddenNeighbors = [];
    const neighbors = neighborIds[id];
    for (let index = 0; index < neighbors.length; index += 1) {
      if (!revealed[neighbors[index]]) hiddenNeighbors.push(neighbors[index]);
    }
    if (hiddenNeighbors.length === 0) continue;
    const constraint = {
      cells: hiddenNeighbors,
      need: game.cells[Math.floor(id / columns)][id % columns].adjacentMines,
    };
    constraints.push(constraint);
    for (let index = 0; index < hiddenNeighbors.length; index += 1) {
      cellConstraints[hiddenNeighbors[index]].push(constraint);
    }
  }

  const interiorCapacity = interiorIds.length;
  const assignment = new Int8Array(cellCount);
  assignment.fill(-1);
  for (let id = 0; id < cellCount; id += 1) {
    if (revealed[id]) assignment[id] = 0;
  }
  assignment[clickedId] = 0;

  let nodes = 0;
  let solution = null;

  function undo(log) {
    for (let index = 0; index < log.length; index += 1) assignment[log[index]] = -1;
  }

  function propagate(log) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < constraints.length; index += 1) {
        const { cells, need } = constraints[index];
        let mines = 0;
        let unknowns = 0;
        for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
          const value = assignment[cells[cellIndex]];
          if (value === 1) mines += 1;
          else if (value < 0) unknowns += 1;
        }
        const stillNeed = need - mines;
        if (stillNeed < 0 || stillNeed > unknowns) return false;
        if (unknowns === 0 || (stillNeed !== 0 && stillNeed !== unknowns)) continue;
        const fill = stillNeed === 0 ? 0 : 1;
        for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
          const cellId = cells[cellIndex];
          if (assignment[cellId] < 0) {
            assignment[cellId] = fill;
            log.push(cellId);
            changed = true;
          }
        }
      }
    }
    return true;
  }

  function assignmentViolates(cellId) {
    const related = cellConstraints[cellId];
    for (let index = 0; index < related.length; index += 1) {
      const { cells, need } = related[index];
      let mines = 0;
      let unknowns = 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const value = assignment[cells[cellIndex]];
        if (value === 1) mines += 1;
        else if (value < 0) unknowns += 1;
      }
      if (mines > need || mines + unknowns < need) return true;
    }
    return false;
  }

  function mineCountPossible() {
    let minMines = 0;
    let maxMines = 0;
    for (let index = 0; index < borderIds.length; index += 1) {
      const value = assignment[borderIds[index]];
      if (value === 1) {
        minMines += 1;
        maxMines += 1;
      } else if (value < 0) {
        maxMines += 1;
      }
    }
    return mineTotal >= minMines && mineTotal <= maxMines + interiorCapacity;
  }

  function finishSolution() {
    const freeIds = [];
    let borderMines = 0;
    for (let index = 0; index < borderIds.length; index += 1) {
      const id = borderIds[index];
      const value = assignment[id];
      if (value === 1) borderMines += 1;
      else if (value < 0) freeIds.push(id);
    }
    for (let index = 0; index < interiorIds.length; index += 1) freeIds.push(interiorIds[index]);

    const need = mineTotal - borderMines;
    if (need < 0 || need > freeIds.length) return false;

    const next = assignment.slice();
    for (let index = 0; index < freeIds.length; index += 1) next[freeIds[index]] = 0;
    let placed = 0;
    for (let index = 0; index < freeIds.length; index += 1) {
      const id = freeIds[index];
      if (placed < need && currentMine[id] === 1) {
        next[id] = 1;
        placed += 1;
      }
    }
    for (let index = 0; index < freeIds.length; index += 1) {
      if (placed >= need) break;
      const id = freeIds[index];
      if (next[id] === 0) {
        next[id] = 1;
        placed += 1;
      }
    }
    if (placed !== need || next[clickedId] === 1) return false;

    let seenMines = 0;
    for (let id = 0; id < cellCount; id += 1) {
      if (next[id] === 1) seenMines += 1;
      else if (next[id] !== 0) return false;
      if (revealed[id] && next[id] === 1) return false;
    }
    if (seenMines !== mineTotal) return false;

    for (let index = 0; index < constraints.length; index += 1) {
      const { cells, need: required } = constraints[index];
      let mines = 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        if (next[cells[cellIndex]] === 1) mines += 1;
      }
      if (mines !== required) return false;
    }

    solution = next;
    return true;
  }

  function placeValue(ids, index, stillNeed, value, visit) {
    const nextNeed = stillNeed - value;
    const slotsAfter = ids.length - index - 1;
    if (nextNeed < 0 || nextNeed > slotsAfter) return false;
    const id = ids[index];
    assignment[id] = value;
    if (assignmentViolates(id)) {
      assignment[id] = -1;
      return false;
    }
    const found = enumerate(ids, index + 1, nextNeed, visit);
    assignment[id] = -1;
    return found;
  }

  function enumerate(ids, index, stillNeed, visit) {
    if (stillNeed < 0 || stillNeed > ids.length - index) return false;
    if (index === ids.length) return visit();
    const preferred = currentMine[ids[index]] === 1 ? 1 : 0;
    if (placeValue(ids, index, stillNeed, preferred, visit)) return true;
    return placeValue(ids, index, stillNeed, preferred ^ 1, visit);
  }

  function search() {
    nodes += 1;
    if (solution) return true;
    if (nodes > MAX_RESCUE_NODES) return false;

    const log = [];
    if (!propagate(log) || !mineCountPossible()) {
      undo(log);
      return false;
    }

    let bestIndex = -1;
    let bestUnknowns = 9;
    for (let index = 0; index < constraints.length; index += 1) {
      const cells = constraints[index].cells;
      let unknowns = 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        if (assignment[cells[cellIndex]] < 0) unknowns += 1;
      }
      if (unknowns > 0 && unknowns < bestUnknowns) {
        bestUnknowns = unknowns;
        bestIndex = index;
        if (unknowns === 1) break;
      }
    }

    if (bestIndex < 0) {
      const found = finishSolution();
      undo(log);
      return found;
    }

    const cells = constraints[bestIndex].cells;
    const unknowns = [];
    let mines = 0;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const value = assignment[cells[cellIndex]];
      if (value < 0) unknowns.push(cells[cellIndex]);
      else if (value === 1) mines += 1;
    }
    const found = enumerate(unknowns, 0, constraints[bestIndex].need - mines, search);
    undo(log);
    return found;
  }

  if (!propagate([])) return false;
  if (!search() || !solution) return false;

  const previous = [];
  forEachCell(game, (cell) => {
    previous.push({ cell, mine: cell.mine, adjacentMines: cell.adjacentMines });
  });
  applyMineLayout(game, (cell) => solution[indexOf(cell.row, cell.column)] === 1);

  const layoutHolds = !clickedCell.mine && previous.every((item) => {
    if (!item.cell.revealed) return true;
    return !item.cell.mine && item.cell.adjacentMines === item.adjacentMines;
  });
  if (layoutHolds) return true;

  previous.forEach((item) => {
    item.cell.mine = item.mine;
    item.cell.adjacentMines = item.adjacentMines;
  });
  return false;
}

function revealCell(game, row, column) {
  if (game.state === "won" || game.state === "lost") return { kind: "ignored" };
  const cell = getCell(game, row, column);
  if (!cell || cell.revealed || cell.flagged) return { kind: "ignored" };

  const started = game.state === "ready";
  if (!game.minesGenerated) generateMines(game, row, column);
  game.state = "playing";

  const rescued = cell.mine;
  if (rescued && !rescueAmbiguousMine(game, cell)) {
    cell.exploded = true;
    revealMinesAndMarkMistakes(game);
    game.state = "lost";
    return { kind: "lost", started, revealedCount: 1 };
  }

  const revealedCount = revealSafeArea(game, cell);
  if (game.safeCellsRemaining === 0) {
    game.state = "won";
    return { kind: "won", started, revealedCount, rescued };
  }
  return { kind: rescued ? "rescued" : "revealed", started, revealedCount };
}

function toggleFlag(game, row, column) {
  if (game.state === "won" || game.state === "lost") return { kind: "ignored" };
  const cell = getCell(game, row, column);
  if (!cell || cell.revealed) return { kind: "ignored" };

  cell.flagged = !cell.flagged;
  game.flagsPlaced += cell.flagged ? 1 : -1;
  return { kind: cell.flagged ? "flagged" : "unflagged" };
}

window.MinesweeperRules = Object.freeze({
  getNeighbors,
  generateMines,
  revealCell,
  toggleFlag,
  canUndoTriggeredMine,
  undoTriggeredMine,
});
})();
