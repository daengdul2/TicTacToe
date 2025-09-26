// pages/game.js
import {useEffect, useState, useRef} from "react";
import {useRouter} from "next/router";
import {db, auth, signInAnonymously, onAuthStateChanged} from "../lib/firebase";
import {ref, onValue, set, update, get, remove, push} from "firebase/database";
import {checkWinner} from "../lib/gameLogic";

// --- KONSTANTA DAN FUNGSI GLOBAL ---
const INITIAL_BOARD = Array(9).fill("");
const INITIAL_TURN = "X"; // Hanya untuk inisialisasi state, nilai update akan random
const INITIAL_STATUS = "waiting";

// Fungsi untuk mendapatkan giliran awal secara acak (X atau O)
const getRandomTurn = () => (Math.random() < 0.5 ? "X" : "O");

export default function GamePage() {
    const router = useRouter();
    const {roomId} = router.query;

    const [user, setUser] = useState(null);
    const [roomInfo, setRoomInfo] = useState(null);
    const [board, setBoard] = useState(INITIAL_BOARD);
    const [turn, setTurn] = useState(INITIAL_TURN);
    const [status, setStatus] = useState(INITIAL_STATUS);
    const [playerSymbol, setPlayerSymbol] = useState(null);
    const [resetTimer, setResetTimer] = useState(0);

    const [chatOpen, setChatOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [lastMessageTime, setLastMessageTime] = useState(0);

    const roomRefLive = useRef(null);
    const chatRefLive = useRef(null);

    const isLeavingRef = useRef(false);
    const hasJoinedRef = useRef(false);

    // --- auth anon ---
    useEffect(() => {
        signInAnonymously(auth).catch(console.error);
        const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
        return () => unsub();
    }, []);

    // --- listen room & chat ---
    useEffect(() => {
        if (!roomId) return;

        if (roomRefLive.current) roomRefLive.current();
        if (chatRefLive.current) chatRefLive.current();

        const rref = ref(db, `rooms/${roomId}`);

        const unsubRoom = onValue(rref, async (snap) => {
            const data = snap.val();
            if (!data) {
                alert("Room sudah dihapus.");
                router.push("/");
                return;
            }

            let boardFromDb = data.board || INITIAL_BOARD;
            if (!Array.isArray(boardFromDb)) {
                boardFromDb = Object.keys(boardFromDb)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((k) => boardFromDb[k]);
            }

            setRoomInfo(data);
            setBoard(boardFromDb);
            setTurn(data.turn || INITIAL_TURN);
            setStatus(data.status || INITIAL_STATUS);

            if (!user) return;

            if (data.playerX === user.uid) {
                setPlayerSymbol("X");
                hasJoinedRef.current = true;
                return;
            } else if (data.playerO === user.uid) {
                setPlayerSymbol("O");
                hasJoinedRef.current = true;
                return;
            } else {
                setPlayerSymbol(null);
                if (hasJoinedRef.current || isLeavingRef.current) return;

                try {
                    const fresh = await get(rref);
                    const d = fresh.val();
                    if (!d) {
                        alert("Room tidak tersedia.");
                        router.push("/");
                        return;
                    }

                    if (!d.playerX) {
                        await update(rref, {
                            playerX: user.uid,
                            status: d.playerO
                                ? "playing"
                                : d.status || INITIAL_STATUS
                        });
                        setPlayerSymbol("X");
                        hasJoinedRef.current = true;
                    } else if (!d.playerO) {
                        await update(rref, {
                            playerO: user.uid,
                            status: d.playerX
                                ? "playing"
                                : d.status || INITIAL_STATUS
                        });
                        setPlayerSymbol("O");
                        hasJoinedRef.current = true;
                    } else {
                        alert("Room penuh!");
                        router.push("/");
                        return;
                    }
                } catch (err) {
                    console.error("Error claiming slot:", err);
                }
            }
        });
        roomRefLive.current = unsubRoom;

        const cref = ref(db, `rooms/${roomId}/chat`);
        const unsubChat = onValue(cref, (snap) => {
            const data = snap.val();
            if (!data) {
                setMessages([]);
                return;
            }
            const arr = Object.entries(data).map(([key, val]) => ({
                key,
                ...val
            }));
            arr.sort((a, b) => (a.at || 0) - (b.at || 0));
            setMessages(arr);
        });
        chatRefLive.current = unsubChat;

        return () => {
            if (roomRefLive.current) roomRefLive.current();
            if (chatRefLive.current) chatRefLive.current();
            roomRefLive.current = null;
            chatRefLive.current = null;
        };
    }, [roomId, user, router]);

    // --- make move ---
    async function makeMove(idx) {
        if (
            !user ||
            !roomId ||
            status !== "playing" ||
            !playerSymbol ||
            playerSymbol !== turn ||
            board[idx] !== ""
        )
            return;

        const newBoard = [...board];
        newBoard[idx] = playerSymbol;
        const winner = checkWinner(newBoard);

        const roomRef = ref(db, `rooms/${roomId}`);
        const updateObj = {
            board: newBoard,
            turn: playerSymbol === "X" ? "O" : "X"
        };

        if (winner)
            updateObj.status = winner === "draw" ? "draw" : `${winner}-won`;
        await update(roomRef, updateObj);
    }

    // --- reset room ---
    async function resetRoom() {
        if (!roomInfo || !user) return;

        const gameOver =
            roomInfo.status === "X-won" ||
            roomInfo.status === "O-won" ||
            roomInfo.status === "draw";
        const onePlayer =
            (roomInfo.playerX && !roomInfo.playerO) ||
            (!roomInfo.playerX && roomInfo.playerO);

        if (!gameOver && !onePlayer) {
            alert(
                "Reset hanya setelah game selesai atau salah satu player keluar."
            );
            return;
        }

        // Deklarasi lokal yang aman
        const r = ref(db, `rooms/${roomId}`);
        const updates = {};
        const randomTurn = getRandomTurn();

        updates.board = INITIAL_BOARD;
        updates.turn = randomTurn;
        updates.status = onePlayer ? "waiting" : "playing";
        await update(r, updates);
    }

    // --- leave room ---
    async function leaveRoom() {
        if (!roomId || !user) return;
        if (!confirm("Yakin keluar? Kamu dianggap kalah.")) return;

        isLeavingRef.current = true;
        setPlayerSymbol(null);
        hasJoinedRef.current = false;

        // Deklarasi lokal yang aman
        const r = ref(db, `rooms/${roomId}`);
        const updates = {};
        const randomTurn = getRandomTurn();

        const snap = await get(r);
        if (!snap.exists()) {
            router.push("/");
            return;
        }

        const data = snap.val();
        const isX = data.playerX === user.uid;
        const isO = data.playerO === user.uid;

        if (isX) updates.playerX = null;
        if (isO) updates.playerO = null;
        updates.board = INITIAL_BOARD;
        updates.turn = randomTurn;

        // Hapus player keluar dari room
        await update(r, updates);

        // Ambil data terbaru
        const newSnap = await get(r);
        if (!newSnap.exists()) {
            router.push("/");
            return;
        }

        const newData = newSnap.val();
        const stillX = newData.playerX || null;
        const stillO = newData.playerO || null;

        // Jika room kosong → hapus
        if (!stillX && !stillO) {
            await remove(r);
            alert("Kamu keluar dari room. Room dihapus karena kosong.");
            isLeavingRef.current = false;
            router.push("/");
            return;
        }

        // Kalau masih ada lawan → set status menang untuk lawan
        if (stillX && !stillO) {
            await update(r, {status: "X-won", owner: stillX});
        } else if (!stillX && stillO) {
            await update(r, {status: "O-won", owner: stillO});
        }

        // Alert kalah hanya untuk pemain yang keluar
        alert("Kamu keluar dari room. Kamu dianggap kalah.");

        isLeavingRef.current = false;
        router.push("/");
    }

    // --- chat ---
    async function sendMessage(e) {
        e.preventDefault();
        if (!user || !roomId) return;
        const text = e.target.elements.msg.value.trim();
        if (!text) return;

        const now = Date.now();
        if (now - lastMessageTime < 10000) {
            alert("Tunggu 10 detik untuk kirim lagi!");
            return;
        }

        const cref = push(ref(db, `rooms/${roomId}/chat`));
        await set(cref, {by: user.uid.substring(0, 6), text, at: now});
        setLastMessageTime(now);
        e.target.reset();
    }

    // --- alert menang/kalah/seri & Auto-Reset dengan Timer ---
    useEffect(() => {
        if (!status || !playerSymbol) return;

        const gameOver =
            status === "X-won" || status === "O-won" || status === "draw";

        if (gameOver) {
            // 1. Tampilkan Alert Hasil Permainan
            if (status === "draw") {
                alert("Seri!");
            } else if (status.startsWith(playerSymbol)) {
                alert("🎉 Kamu Menang! (Lawan keluar atau kalah)");
            } else {
                alert("😢 Kamu Kalah!");
            }

            // 2. Mulai Hitung Mundur (5 detik)
            setResetTimer(5);

            let countdown = 5;
            const interval = setInterval(() => {
                countdown -= 1;
                setResetTimer(countdown);

                if (countdown <= 0) {
                    clearInterval(interval);
                    resetRoom(); // Panggil resetRoom saat hitungan mencapai 0
                }
            }, 1000); // Perbarui setiap 1 detik (1000 ms)

            // Cleanup: Batalkan interval jika status berubah atau komponen dibongkar
            return () => {
                clearInterval(interval);
                setResetTimer(0); // Reset timer state
            };
        }

        // Jika game belum selesai, pastikan timer direset
        setResetTimer(0);
    }, [status, playerSymbol]); // Dependensi: status dan playerSymbol

    if (!roomId) return <p>Room tidak ditemukan.</p>;

    // --- count players ---
    const playerCount =
        (roomInfo?.playerX ? 1 : 0) + (roomInfo?.playerO ? 1 : 0);

    return (
        <main>
            <h1>TicTacToe Game</h1>
            <div>
                Player: {playerSymbol || "-"} | Turn: {turn} | Players:{" "}
                {playerCount}/2 | Status: {status}
            </div>

            <div className="board">
                {board.map((cell, i) => {
                    const canPlay =
                        playerSymbol === turn && !cell && status === "playing";
                    return (
                        <button
                            key={i}
                            className="cell"
                            onClick={() => makeMove(i)}
                            disabled={!canPlay}>
                            {cell}
                        </button>
                    );
                })}
            </div>

            <div>
                <button onClick={leaveRoom}>Leave</button>
                {resetTimer > 0 && (
                    <p style={{marginTop: 5, color: "#ff5c5c"}}>
                        Reset otomatis dalam {resetTimer} detik...
                    </p>
                )}

                {/*{(status === "X-won" ||
                    status === "O-won" ||
                    status === "draw" ||
                    (roomInfo?.playerX && !roomInfo?.playerO) ||
                    (!roomInfo?.playerX && roomInfo?.playerO)) && (
                    <button onClick={resetRoom}>Reset</button>
                )}*/}
            </div>

            {/* Chat */}
            <button
                className="chat-float-btn"
                style={{marginTop: 12}}
                onClick={() => setChatOpen(!chatOpen)}>
                💬
            </button>
            {chatOpen && (
                <div className="chat-box" style={{marginTop: 8}}>
                    <div style={{maxHeight: 200, overflowY: "auto"}}>
                        {messages.map((m) => (
                            <div key={m.key}>
                                <strong>{m.by}:</strong> {m.text}
                            </div>
                        ))}
                    </div>
                    <form onSubmit={sendMessage}>
                        <input name="msg" placeholder="Ketik pesan..." />
                        <button type="submit">Kirim</button>
                    </form>
                </div>
            )}
        </main>
    );
}
