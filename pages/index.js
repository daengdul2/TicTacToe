// pages/index.js
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../lib/firebase";
import {
  ref,
  set,
  update,
  onValue,
  get,
} from "firebase/database";
import { signInAnonymously } from "firebase/auth";

export default function Home() {
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [roomInfo, setRoomInfo] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("idle");

  const roomRefLive = useRef(null);

  // Auto login anonymous
  useEffect(() => {
    signInAnonymously(auth).then((res) => {
      setUser(res.user);
    });
  }, []);

  // Listener room realtime
  useEffect(() => {
    if (roomRefLive.current) roomRefLive.current(); // unsubscribe
    if (!roomId) {
      setRoomInfo(null);
      setBoard(Array(9).fill(null));
      setTurn("X");
      setStatus("idle");
      return;
    }

    const rref = ref(db, `rooms/${roomId}`);
    const unsub = onValue(rref, (snap) => {
      const data = snap.val();
      if (!data) {
        setRoomInfo(null);
        return;
      }

      setRoomInfo(data);

      // Pastikan board selalu array
      let boardFromDb = data.board || Array(9).fill(null);
      if (!Array.isArray(boardFromDb)) {
        boardFromDb = Object.values(boardFromDb);
      }
      setBoard(boardFromDb);

      setTurn(data.turn || "X");
      setStatus(data.status || "waiting");

      if (user) {
        if (data.playerX === user.uid) setPlayerSymbol("X");
        else if (data.playerO === user.uid) setPlayerSymbol("O");
        else setPlayerSymbol(null);
      }
    });

    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId, user]);

  // Buat room
  const createRoom = async () => {
    if (!user) return;
    const newRoomId = Math.random().toString(36).substring(2, 8);
    await set(ref(db, `rooms/${newRoomId}`), {
      playerX: user.uid,
      turn: "X",
      status: "waiting",
      board: Array(9).fill(null),
    });
    setRoomId(newRoomId);
  };

  // Join room
  const joinRoom = async (rid) => {
    if (!user || !rid) return;
    const rref = ref(db, `rooms/${rid}`);
    const snap = await get(rref);
    if (snap.exists()) {
      const data = snap.val();
      if (!data.playerO && data.playerX !== user.uid) {
        await update(rref, { playerO: user.uid, status: "playing" });
      }
      setRoomId(rid);
    } else {
      alert("Room tidak ditemukan");
    }
  };

  // Klik papan
  const makeMove = (index) => {
    if (!roomId || !user || status !== "playing") return;
    if (board[index]) return; // sudah terisi
    if (turn !== playerSymbol) return; // bukan giliranmu

    const newBoard = [...board];
    newBoard[index] = playerSymbol;

    const newStatus = checkWinner(newBoard);

    update(ref(db, `rooms/${roomId}`), {
      board: newBoard, // simpan seluruh array!
      turn: playerSymbol === "X" ? "O" : "X",
      status: newStatus,
    });
  };

  // Cek pemenang
  const checkWinner = (b) => {
    const lines = [
      [0,1,2],[3,4,5],[6,7,8], // baris
      [0,3,6],[1,4,7],[2,5,8], // kolom
      [0,4,8],[2,4,6],         // diagonal
    ];
    for (let [a,bIdx,c] of lines) {
      if (b[a] && b[a] === b[bIdx] && b[a] === b[c]) {
        return `${b[a]} menang`;
      }
    }
    if (b.every(Boolean)) return "seri";
    return "playing";
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Tic Tac Toe Online</h1>
      {!roomId && (
        <div>
          <button
            onClick={createRoom}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Buat Room
          </button>
          <div className="mt-2">
            <input
              type="text"
              placeholder="Masukkan Room ID"
              id="joinInput"
              className="border px-2 py-1"
            />
            <button
              onClick={() =>
                joinRoom(document.getElementById("joinInput").value)
              }
              className="ml-2 px-3 py-1 bg-green-500 text-white rounded"
            >
              Join
            </button>
          </div>
        </div>
      )}

      {roomId && (
        <div>
          <p>Room ID: {roomId}</p>
          <p>Giliran: {turn}</p>
          <p>Status: {status}</p>
          <p>Kamu: {playerSymbol || "penonton"}</p>

          <div className="grid grid-cols-3 gap-2 mt-4">
            {board.map((cell, i) => (
              <button
                key={i}
                onClick={() => makeMove(i)}
                disabled={!!cell || turn !== playerSymbol || status !== "playing"}
                className="w-16 h-16 border flex items-center justify-center text-xl"
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
