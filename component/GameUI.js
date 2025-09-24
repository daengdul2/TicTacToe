import { useState, useEffect } from "react";
import { initBotGame, handleBotMove } from "../public/js/logic";

export default function GameUI({ gameMode, onBack }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("playing");
  const [playerSymbol, setPlayerSymbol] = useState("X");
  const [botDifficulty, setBotDifficulty] = useState("easy");

  useEffect(() => {
    if (gameMode === "bot") {
      initBotGame(setPlayerSymbol, setBotDifficulty);
      setStatus("playing");
    }
  }, [gameMode]);

  const makeMove = (i) => {
    if (board[i] || status !== "playing") return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setTurn(turn === "X" ? "O" : "X");

    if (gameMode === "bot" && next[i] === playerSymbol) {
      setTimeout(() => {
        handleBotMove(next, setBoard, setTurn, playerSymbol, botDifficulty);
      }, 500);
    }
  };

  return (
    <div className="game">
      <h2>Status: {status}</h2>
      <div className="board">
        {board.map((cell, i) => (
          <button key={i} className="cell" onClick={() => makeMove(i)}>
            {cell}
          </button>
        ))}
      </div>
      <button onClick={onBack}>⬅️ Kembali</button>
    </div>
  );
}
