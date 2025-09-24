export function initBotGame(setPlayerSymbol, setBotDifficulty) {
  const symbol = window.confirm("Main sebagai X? (Cancel untuk O)") ? "X" : "O";
  const diff = window.confirm("Mau mode sulit?") ? "hard" : "easy";
  setPlayerSymbol(symbol);
  setBotDifficulty(diff);
}

function checkWinner(b) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let [a, bIdx, c] of lines) {
    if (b[a] && b[a] === b[bIdx] && b[a] === b[c]) return b[a];
  }
  if (b.every((x) => x)) return "draw";
  return null;
}

export function handleBotMove(board, setBoard, setTurn, playerSymbol, diff) {
  const botSymbol = playerSymbol === "X" ? "O" : "X";

  let move;
  if (diff === "easy") {
    const empty = board.map((v, i) => (v ? null : i)).filter((x) => x !== null);
    move = empty[Math.floor(Math.random() * empty.length)];
  } else {
    move = minimax(board, botSymbol).index;
  }

  if (move !== undefined) {
    const next = [...board];
    next[move] = botSymbol;
    setBoard(next);
    setTurn(playerSymbol);
  }
}

// minimax sederhana untuk bot sulit
function minimax(newBoard, player) {
  const availSpots = newBoard
    .map((val, idx) => (val ? null : idx))
    .filter((x) => x !== null);

  const winner = checkWinner(newBoard);
  if (winner === "X") return { score: -10 };
  if (winner === "O") return { score: 10 };
  if (winner === "draw") return { score: 0 };

  const moves = [];
  for (let i of availSpots) {
    const move = { index: i };
    newBoard[i] = player;

    const result = minimax(
      newBoard,
      player === "O" ? "X" : "O"
    );
    move.score = result.score;

    newBoard[i] = null;
    moves.push(move);
  }

  if (player === "O") {
    return moves.reduce((best, m) => (m.score > best.score ? m : best), {
      score: -Infinity,
    });
  } else {
    return moves.reduce((best, m) => (m.score < best.score ? m : best), {
      score: Infinity,
    });
  }
}
