import { useState, useEffect } from "react";
import { createRoom, joinRoom, listenRoom, makeMove, leaveRoom } from "../js/firebaseLogic";
import { handleBotMove } from "../js/logic";

export default function GameUI({ user, gameMode }) {
  const [roomId, setRoomId] = useState("");
  const [symbol, setSymbol] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(""));
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (gameMode === "bot") {
      setStatus("playing");
    }
  }, [gameMode]);

  useEffect(() => {
    if (roomId && gameMode !== "bot") {
      const unsub = listenRoom(roomId, (data) => {
        if (!data) {
          setRoomId("");
          setStatus("idle");
          return;
        }
        setBoard(data.board || Array(9).fill(""));
        setTurn(data.turn || "X");
        setStatus(data.status || "waiting");
      });
      return () => unsub();
    }
  }, [roomId, gameMode]);

  async function handleMove(idx) {
    if (gameMode === "bot") {
      if (board[idx] || status !== "playing" || symbol !== turn) return;
      const newBoard = [...board];
      newBoard[idx] = symbol;
      setBoard(newBoard);
      setTurn(symbol === "X" ? "O" : "X");

      setTimeout(() => {
        const botBoard = handleBotMove(newBoard, turn === "X" ? "O" : "X", "easy");
        setBoard(botBoard);
        setTurn(symbol);
      }, 800);
    } else {
      await makeMove(user, roomId, idx, board, symbol, turn);
    }
  }

  return (
    <div>
      <h2>Mode: {gameMode}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 80px)", gap: "6px" }}>
        {board.map((cell, i) => (
          <button key={i} onClick={() => handleMove(i)} style={{ width: 80, height: 80, fontSize: 24 }}>
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
}
