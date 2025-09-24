import { db } from "../lib/firebase";
import { ref, set, update, onValue, get, push, remove } from "firebase/database";
import { checkWinner } from "./logic";

export async function createRoom(user, symbol = "X") {
  const rref = push(ref(db, "rooms"));
  const id = rref.key;
  const initial = {
    board: Array(9).fill(""),
    turn: "X",
    status: "waiting",
    playerX: symbol === "X" ? user.uid : null,
    playerO: symbol === "O" ? user.uid : null,
    createdAt: Date.now(),
  };
  await set(rref, initial);
  return { id, symbol };
}

export async function joinRoom(user, roomId) {
  const r = ref(db, `rooms/${roomId}`);
  const snap = await get(r);
  if (!snap.exists()) throw new Error("Room not found");

  const data = snap.val();
  let symbol = null;

  if (!data.playerX) {
    await update(r, { playerX: user.uid });
    symbol = "X";
  } else if (!data.playerO) {
    await update(r, { playerO: user.uid, status: "playing" });
    symbol = "O";
  } else {
    throw new Error("Room full");
  }

  return { id: roomId, symbol };
}

export function listenRoom(roomId, callback) {
  const rref = ref(db, `rooms/${roomId}`);
  return onValue(rref, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(snap.val());
  });
}

export async function makeMove(user, roomId, idx, board, symbol, turn) {
  if (board[idx] !== "" || symbol !== turn) return;

  const newBoard = [...board];
  newBoard[idx] = symbol;
  const winner = checkWinner(newBoard);

  const updateObj = {
    board: newBoard,
    turn: symbol === "X" ? "O" : "X",
    lastMove: { by: user.uid, idx, at: Date.now() },
  };

  if (winner) {
    updateObj.status = winner === "draw" ? "draw" : `${winner}-won`;
  }

  const rref = ref(db, `rooms/${roomId}`);
  await update(rref, updateObj);
}

export async function leaveRoom(user, roomId) {
  const r = ref(db, `rooms/${roomId}`);
  const snap = await get(r);
  if (!snap.exists()) return;

  const data = snap.val();
  const updates = {};

  if (data.playerX === user.uid) updates.playerX = null;
  if (data.playerO === user.uid) updates.playerO = null;

  if (!updates.playerX && !updates.playerO) {
    await remove(r);
  } else {
    await update(r, updates);
  }
}
