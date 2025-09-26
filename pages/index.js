// pages/index.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { db, auth, signInAnonymously, onAuthStateChanged } from "../lib/firebase";
import { ref, onValue, set, push, get } from "firebase/database";

// --- KONSTANTA DAN FUNGSI GLOBAL ---
const INITIAL_BOARD = Array(9).fill(null);
const INITIAL_STATUS = "waiting";

// Fungsi untuk mendapatkan giliran awal secara acak (X atau O)
const getRandomTurn = () => (Math.random() < 0.5 ? "X" : "O");

export default function Home() {
  const [user, setUser] = useState(null);
  const [roomsList, setRoomsList] = useState([]);
  const [customRoomId, setCustomRoomId] = useState("");
  const [preferredSymbol, setPreferredSymbol] = useState("X");

  const router = useRouter();

  // ulogin anon
  useEffect(() => {
    // Memastikan setUser dipanggil hanya setelah auth selesai
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else signInAnonymously(auth);
    });
    return () => unsub();
  }, []);

  // load list room realtime
  useEffect(() => {
    const roomsRef = ref(db, "rooms");
    const unsub = onValue(roomsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setRoomsList(
          Object.entries(data).map(([id, room]) => ({
            id,
            status: room.status,
            // Menghitung jumlah pemain secara efisien
            playersCount: [room.playerX, room.playerO].filter(Boolean).length,
          }))
        );
      } else {
        setRoomsList([]);
      }
    });
    return () => unsub();
  }, []);

  // buat room
  async function createRoom(roomId, symbol) {
    if (!user) return;
    
    // Deklarasi ref secara lokal
    const id = roomId || push(ref(db, "rooms")).key;
    const roomRef = ref(db, `rooms/${id}`);
    
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      
      // Tentukan giliran awal secara acak
      const randomTurn = getRandomTurn();

      await set(roomRef, {
        playerX: symbol === "X" ? user.uid : null,
        playerO: symbol === "O" ? user.uid : null,
        board: INITIAL_BOARD, // Menggunakan konstanta global
        turn: randomTurn,     // Giliran acak
        status: INITIAL_STATUS, // Status awal "waiting"
      });
    }

    router.push(`/game?roomId=${id}`);
  }

  // join room
  function joinRoom(id) {
    if (!id) return alert("Masukkan Room ID");
    router.push(`/game?roomId=${id}`);
  }

  return (
    <main>
      <h1>TicTacToe — Online</h1>
      <div>User: {user ? user.uid.substring(0, 8) : "... signing in"}</div>

      {/* Create room custom */}
      <div>
        <input
          type="text"
          placeholder="Custom Room ID"
          value={customRoomId}
          onChange={(e) => setCustomRoomId(e.target.value)}
        />
        <select
          value={preferredSymbol}
          onChange={(e) => setPreferredSymbol(e.target.value)}
        >
          <option value="X">Play as X</option>
          <option value="O">Play as O</option>
        </select>
        <button onClick={() => createRoom(customRoomId, preferredSymbol)}>
          Create Room
        </button>
      </div>

      {/* Quick Join */}
      <div>
        <button
          onClick={() => {
            // Temukan room yang memiliki kurang dari 2 pemain
            const avail = roomsList.find((r) => r.playersCount < 2);
            if (avail) joinRoom(avail.id);
            else alert("Tidak ada room kosong");
          }}
        >
          Quick Join
        </button>
      </div>

      {/* Daftar room */}
      <div>
        <strong>Available Rooms</strong>
        <ul className="room-list">
          {roomsList.length === 0 && <li>(no rooms)</li>}
          {roomsList.map((r) => (
            <li key={r.id}>
              <button onClick={() => joinRoom(r.id)}>
                {r.id.substring(r.id.length - 6)}
              </button>{" "}
              ({r.status}) — players: {r.playersCount}
            </li>
          ))}
        </ul>
      </div>

      {/* Input manual */}
      <div>
        <label>
          Room ID:
          <input
            value={customRoomId}
            onChange={(e) => setCustomRoomId(e.target.value)}
          />
        </label>
        <button onClick={() => joinRoom(customRoomId)}>Join</button>
      </div>
    </main>
  );
}
