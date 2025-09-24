import { useEffect, useState, useRef } from "react";
import { db, auth, signInAnonymously, onAuthStateChanged } from "../lib/firebase";
import { ref, onValue, set, update, push, get, remove } from "firebase/database";
import { checkWinner } from "../lib/gameLogic";
import GameUI from "../components/gameUI";

export default function Home() {
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(""));
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("idle");
  const [roomsList, setRoomsList] = useState([]);
  const [roomInfo, setRoomInfo] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  const roomRefLive = useRef(null);
  const chatRefLive = useRef(null); // ✅ listener untuk chat

  // 🔹 Firebase Auth
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Sign in error:", err));
    const unsub = onAuthStateChanged(auth, u => setUser(u || null));
    return () => unsub();
  }, []);

  // 🔹 Listen daftar room
  useEffect(() => {
    const roomsRef = ref(db, "rooms");
    const unsub = onValue(roomsRef, snapshot => {
      const data = snapshot.val() || {};
      const arr = Object.keys(data).map(id => {
        const r = data[id] || {};
        return {
          id,
          playersCount: (r.playerX ? 1 : 0) + (r.playerO ? 1 : 0),
          status: r.status || "waiting"
        };
      });
      setRoomsList(arr);
    });
    return () => unsub();
  }, []);

  // 🔹 Listen room aktif + chat
  useEffect(() => {
    if (roomRefLive.current) roomRefLive.current();
    if (chatRefLive.current) chatRefLive.current();

    if (!roomId) {
      setRoomInfo(null);
      setMessages([]);
      setBoard(Array(9).fill(""));
      setTurn("X");
      setStatus("idle");
      return;
    }

    // room listener
    const rref = ref(db, `rooms/${roomId}`);
    const unsubRoom = onValue(rref, snap => {
      const data = snap.val();
      if (data) {
        let boardFromDb = data.board || Array(9).fill("");
        if (!Array.isArray(boardFromDb)) {
          boardFromDb = Object.keys(boardFromDb)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => boardFromDb[k]);
          while (boardFromDb.length < 9) boardFromDb.push("");
        }

        setBoard(boardFromDb);
        setTurn(data.turn || "X");
        setStatus(data.status || "waiting");
        setRoomInfo(data);

        if (user) {
          if (data.playerX === user.uid) setPlayerSymbol("X");
          else if (data.playerO === user.uid) setPlayerSymbol("O");
          else setPlayerSymbol(null);
        }
      } else {
        setRoomInfo(null);
        setRoomId("");
        setMessages([]);
        alert("Room tidak lagi tersedia.");
      }
    });

    roomRefLive.current = unsubRoom;

    // chat listener
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const unsubChat = onValue(chatRef, snap => {
      const data = snap.val();
      if (!data) {
        setMessages([]);
        return;
      }

      const arr = Array.isArray(data)
        ? data.filter(Boolean)
        : Object.entries(data).map(([key, val]) => ({ key, ...val }));

      arr.sort((a, b) => (a.at || 0) - (b.at || 0));
      setMessages(arr);
    });

    chatRefLive.current = unsubChat;

    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
      if (chatRefLive.current) chatRefLive.current();
      chatRefLive.current = null;
    };
  }, [roomId, user]);

  // 🔹 Kirim chat
  // Tambahkan state baru
const [lastMessageTime, setLastMessageTime] = useState(0);

// 🔹 Kirim chat dengan anti-spam
async function sendMessage(e) {
  e.preventDefault();
  if (!user || !roomId) return;
  const input = e.target.elements.msg.value.trim();
  if (!input) return;

  const now = Date.now();
  if (now - lastMessageTime < 10000) { // 10 detik
    alert("Tunggu 10 detik sebelum mengirim pesan lagi!");
    return;
  }

  const chatRef = push(ref(db, `rooms/${roomId}/chat`));
  await set(chatRef, {
    by: user.uid.substring(0, 8),
    text: input,
    at: now
  });

  setLastMessageTime(now); // update waktu terakhir kirim pesan
  e.target.reset();
}

  // 🔹 Buat room
  async function createRoom() {
    if (!user) return alert("Signing in... coba lagi.");
    const rref = push(ref(db, "rooms"));
    const id = rref.key;
    const initial = {
      board: Array(9).fill(""),
      turn: "X",
      status: "waiting",
      playerX: user.uid,
      createdAt: Date.now()
    };
    await set(rref, initial);
    setRoomId(id);
    setPlayerSymbol("X");
  }

  // 🔹 Join room
  async function joinRoom(id) {
    if (!user) return alert("Signing in...");
    const r = ref(db, `rooms/${id}`);
    const snap = await get(r);
    if (!snap.exists()) return alert("Room not found");
    const data = snap.val();

    if (data.playerX === user.uid || data.playerO === user.uid) {
      setRoomId(id);
      setPlayerSymbol(data.playerX === user.uid ? "X" : "O");
      return;
    }

    if (!data.playerO) {
      await update(r, { playerO: user.uid, status: "playing" });
      setPlayerSymbol("O");
    } else if (!data.playerX) {
      await update(r, { playerX: user.uid, status: "playing" });
      setPlayerSymbol("X");
    } else {
      alert("Room penuh");
      return;
    }
    setRoomId(id);
  }

  // 🔹 Gerakan
  async function makeMove(idx) {
    if (!user || !roomId || status !== "playing" || !playerSymbol || playerSymbol !== turn || board[idx] !== "")
      return;

    const newBoard = [...board];
    newBoard[idx] = playerSymbol;
    const winner = checkWinner(newBoard);

    const roomRef = ref(db, `rooms/${roomId}`);
    const updateObj = {
      board: newBoard,
      turn: playerSymbol === "X" ? "O" : "X",
      lastMove: { by: user.uid, idx, at: Date.now() }
    };

    if (winner) updateObj.status = winner === "draw" ? "draw" : `${winner}-won`;
    await update(roomRef, updateObj);
  }

  // 🔹 Reset game
  async function resetRoom() {
    if (!roomId || !roomInfo || !user) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    await update(roomRef, { board: Array(9).fill(""), turn: "X", status: "playing" });
  }

  // 🔹 Keluar room
  async function leaveRoom() {
    if (!roomId || !user) return;
    const currentRoomId = roomId;
    setRoomId("");
    setPlayerSymbol(null);

    const r = ref(db, `rooms/${currentRoomId}`);
    const snap = await get(r);
    if (!snap.exists()) return;

    const data = snap.val();
    const updates = {};
    if (data.playerX === user.uid) updates.playerX = null;
    if (data.playerO === user.uid) updates.playerO = null;

    if ((!data.playerX || data.playerX === user.uid) && (!data.playerO || data.playerO === user.uid)) {
      await remove(r);
    } else {
      await update(r, updates);
    }
  }

  return (
    <GameUI
      user={user}
      roomId={roomId}
      roomsList={roomsList}
      playerSymbol={playerSymbol}
      turn={turn}
      status={status}
      board={board}
      roomInfo={roomInfo}
      chatOpen={chatOpen}
      messages={messages}
      setRoomId={setRoomId}
      setChatOpen={setChatOpen}
      createRoom={createRoom}
      joinRoom={joinRoom}
      leaveRoom={leaveRoom}
      makeMove={makeMove}
      resetRoom={resetRoom}
      sendMessage={sendMessage}
    />
  );
                   }
