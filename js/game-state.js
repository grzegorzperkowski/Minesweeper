(() => {
  const DIFFICULTIES = Object.freeze({
    beginner: Object.freeze({ label: "Beginner", columns: 9, rows: 9, mines: 10 }),
    intermediate: Object.freeze({ label: "Intermediate", columns: 16, rows: 16, mines: 40 }),
    expert: Object.freeze({ label: "Expert", columns: 30, rows: 16, mines: 99 }),
  });

  function createGame(difficultyKey) {
    const difficulty = DIFFICULTIES[difficultyKey];
    if (!difficulty) throw new Error(`Unknown difficulty: ${difficultyKey}`);

    const cells = Array.from({ length: difficulty.rows }, (_, row) =>
      Array.from({ length: difficulty.columns }, (_, column) => ({
        row,
        column,
        mine: false,
        adjacentMines: 0,
        revealed: false,
        flagged: false,
        exploded: false,
        wrongFlag: false,
      })),
    );

    return {
      difficultyKey,
      difficulty,
      cells,
      state: "ready",
      minesGenerated: false,
      flagsPlaced: 0,
      safeCellsRemaining: difficulty.rows * difficulty.columns - difficulty.mines,
      timer: 0,
      errorUndoUsed: false,
    };
  }

  function getCell(game, row, column) {
    return game.cells[row]?.[column] ?? null;
  }

  function forEachCell(game, callback) {
    game.cells.forEach((row) => row.forEach(callback));
  }

  window.MinesweeperState = Object.freeze({ DIFFICULTIES, createGame, getCell, forEachCell });
})();
