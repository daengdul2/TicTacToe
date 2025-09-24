// pages/index.js
import { useEffect, useState, useRef } from 'react';
import { db, auth, signInAnonymously, onAuthStateChanged } from '../lib/firebase';
import { ref, onValue, set, update, push, get, remove } from 'firebase/database'; // Tambah 'remove' untuk hapus room

// Utility: check winner
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(cell => cell !== '') ? 'draw' : null;
}

export default function Home() {
  const [user, setUser ] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(''));
  const [turn, setTurn] = useState('X');
  const [status, setStatus] = useState('idle');
  const [roomsList, setRoomsList] = useState([]);
  const roomRefLive = useRef(null);
  const [roomInfo, setRoomInfo] = useState(null);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error('Sign in error:', err));
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser (u || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsub = onValue(roomsRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const roomIds = Object.keys(data);

      // Perbaikan baru: Otomatis hapus rooms yang kosong (tidak ada playerX dan playerO)
      // Ini dijalankan di setiap update rooms untuk cleanup
      for (const id of roomIds) {
        const r = data[id] || {};
        if (!r.playerX && !r.playerO) {
          try {
            const emptyRoomRef = ref(db, `rooms/${id}`);
            await remove(emptyRoomRef); // Hapus room kosong
            console.log(`Auto-deleted empty room: ${id}`);
          } catch (err) {
            console.error(`Failed to delete empty room ${id}:`, err);
          }
        }
      }

      // Rebuild list setelah cleanup (snapshot mungkin outdated, tapi onValue akan trigger ulang)
      const arr = roomIds
        .filter(id => data[id]) // Filter yang masih ada setelah potensi hapus
        .map(id => {
          const r = data[id] || {};
          return {
            id,
            playersCount: (r.playerX ? 1 : 0) + (r.playerO ? 1 : 0),
            status: r.status || 'waiting'
          };
        });
      setRoomsList(arr);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (roomRefLive.current) roomRefLive.current();
    if (!roomId) {
      setRoomInfo(null);
      setBoard(Array(9).fill(''));
      setTurn('X');
      setStatus('idle');
      return;
    }

    const rref = ref(db, `rooms/${roomId}`);
    const unsub = onValue(rref, snap => {
      const data = snap.val();
      if (data) {
        setBoard(data.board || Array(9).fill(''));
        setTurn(data.turn || 'X');
        setStatus(data.status || 'waiting');
        setRoomInfo(data);
      } else {
        setRoomInfo(null); // Perbaikan: Set null untuk hindari lag
        setRoomId('');
        alert('Room tidak lagi tersedia.');
      }
    });

    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId]);

  // Fungsi helper baru: Check apakah user sudah punya room aktif
  async function hasActiveRoom(userUid) {
    if (!userUid) return false;
    try {
      const roomsRef = ref(db, 'rooms');
      const snapshot = await get(roomsRef);
      const data = snapshot.val() || {};
      for (const roomData of Object.values(data)) {
        if (roomData.playerX === userUid || roomData.playerO === userUid) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error checking active rooms:', err);
      return false; // Asumsi tidak ada jika error
    }
  }

  async function createRoom() {
    if (!user) return alert('Signing in... coba lagi sebentar.');
    
    // Perbaikan baru: Check apakah user sudah punya room aktif
    const hasRoom = await hasActiveRoom(user.uid);
    if (hasRoom) {
      alert('Anda sudah berada di room aktif. Leave room terlebih dahulu sebelum membuat yang baru.');
      return;
    }

    try {
      const rref = push(ref(db, 'rooms'));
      const id = rref.key;
      const initial = {
        board: Array(9).fill(''),
        turn: 'X',
        status: 'waiting',
        playerX: user.uid,
        createdAt: Date.now()
      };
      await set(rref, initial);
      setRoomId(id);
      setPlayerSymbol('X');
    } catch (err) {
      console.error('Create room error:', err);
      alert('Gagal membuat room: ' + err.message);
    }
  }

  async function joinRoom(id) {
    if (!user) return alert('Signing in... coba lagi sebentar.');
    if (!id || !id.trim()) return alert('Masukkan Room ID yang valid.'); // Perbaikan: Validasi input

    try {
      const r = ref(db, `rooms/${id}`);
      const snap = await get(r);
      if (!snap.exists()) return alert('Room not found');
      const data = snap.val();

      if (data.playerX === user.uid || data.playerO === user.uid) {
        setRoomId(id);
        setPlayerSymbol(data.playerX === user.uid ? 'X' : 'O');
        return;
      }

      // Perbaikan: Logika join lebih ketat - prioritas O jika X ada, atau ambil X jika kosong total
      if (!data.playerX && !data.playerO) {
        // Ambil alih sebagai X jika room benar-benar kosong
        await update(r, { playerX: user.uid, status: 'waiting' });
        setPlayerSymbol('X');
      } else if (!data.playerO && data.playerX) {
        await update(r, { playerO: user.uid, status: 'playing' });
        setPlayerSymbol('O');
      } else {
        alert('Room penuh atau tidak valid untuk join.');
        return;
      }
      setRoomId(id);
    } catch (err) {
      console.error('Join room error:', err);
      alert('Gagal join room: ' + err.message);
    }
  }

  async function makeMove(idx) {
    if (!user || !roomId || status !== 'playing' || !playerSymbol || playerSymbol !== turn || board[idx] !== '') return;

    // Optimistic update untuk UX lebih baik
    const newBoard = [...board];
    newBoard[idx] = playerSymbol;
    setBoard(newBoard);
    const winner = checkWinner(newBoard);
    setTurn(playerSymbol === 'X' ? 'O' : 'X');
    if (winner) {
      setStatus(winner === 'draw' ? 'draw' : `${winner}-won`);
    }

    const roomRef = ref(db, `rooms/${roomId}`);
    const updateObj = {
      board: newBoard,
      turn: playerSymbol === 'X' ? 'O' : 'X',
      lastMove: { by: user.uid, idx, at: Date.now() }
    };

    if (winner) {
      updateObj.status = winner === 'draw' ? 'draw' : `${winner}-won`;
    }

    try {
      await update(roomRef, updateObj);
    } catch (err) {
      console.error('Make move error:', err);
      alert('Gagal update move: ' + err.message);
      // Revert local state jika gagal
      setBoard([...board]);
      setTurn(playerSymbol); // Kembalikan turn
      if (winner) setStatus('playing'); // Atau load ulang dari DB jika perlu
    }
  }

  // Fungsi dengan logika baru (sudah ada, tapi tambah error handling)
  async function resetRoom() {
    if (!roomId || !roomInfo || !user) return;
    // Hanya user yang merupakan playerX (pembuat room) yang bisa mereset.
    if (roomInfo.playerX !== user.uid) {
      return alert('Hanya pembuat room (Pemain X) yang dapat mereset permainan.');
    }
    try {
      const roomRef = ref(db, `rooms/${roomId}`);
      await update(roomRef, { board: Array(9).fill(''), turn: 'X', status: 'playing' });
    } catch (err) {
      console.error('Reset room error:', err);
      alert('Gagal reset game: ' + err.message);
    }
  }

  async function leaveRoom() {
    if (!roomId || !user) return;
    const currentRoomId = roomId; // Simpan roomId sebelum di-reset
    setRoomId('');
    setPlayerSymbol(null);

    try {
      const r = ref(db, `rooms/${currentRoomId}`);
      const snap = await get(r);
      if (!snap.exists()) return;

      const data = snap.val();
      const updates = {};
      let isPlayerX = data.playerX === user.uid;
      let isPlayerO = data.playerO === user.uid;

      if (isPlayerX) updates.playerX = null;
      if (isPlayerO) updates.playerO = null;

      const remainingPlayers = (data.playerX && !isPlayerX ? 1 : 0) + (data.playerO && !isPlayerO ? 1 : 0);
      
      // Perbaikan: Set status ke 'waiting' jika satu player tersisa
      if (remainingPlayers === 1) {
        updates.status = 'waiting';
        await update(r, updates);
      } else if (remainingPlayers === 0) {
        await remove(r); // Gunakan remove untuk hapus room (lebih eksplisit daripada set(null))
      } else {
        // Jika kedua masih ada (tidak mungkin di sini), update saja
        await update(r, updates);
      }
    } catch (err) {
      console.error('Leave room error:', err);
      alert('Gagal leave room: ' + err.message);
    }
  }

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <h1>TicTacToe — Online (Vercel + Firebase)</h1>

      <div style={{ marginBottom: 12 }}>
        <div>User: {user ? user.uid.substring(0, 8) : '... signing in'}</div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={createRoom}>Create Room (become X)</button>
        <button style={{ marginLeft: 8 }} onClick={() => {
          // Perbaikan: Filter quick join untuk status 'waiting' dan playersCount < 2
          const avail = roomsList.find(r => r.playersCount < 2 && r.status === 'waiting');
          if (avail) joinRoom(avail.id);
          else alert('Tidak ada room kosong saat ini');
        }}>Quick Join</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Available Rooms</strong>
        <ul>
          {roomsList.length === 0 && <li>(no rooms)</li>}
          {roomsList.map(r => (
            <li key={r.id}>
              <button onClick={() => joinRoom(r.id)}>{r.id.substring(r.id.length - 6)}</button>
              {' '}({r.status}) — players: {r.playersCount}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Room ID: <input value={roomId} onChange={e => setRoomId(e.target.value)} /></label>
        <button onClick={() => joinRoom(roomId)}>Join</button>
        <button style={{ marginLeft: 8 }} onClick={leaveRoom}>Leave Room</button>
      </div>

      {roomId && (
        <div style={{ marginTop: 20 }}>
          <div>Player: <strong>{playerSymbol || '-'}</strong> | Turn: <strong>{turn}</strong> | Status: <strong>{status}</strong></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gap: 8, marginTop: 12 }}>
            {board.map((cell, i) => {
              const canPlay = playerSymbol === turn && cell === '' && status === 'playing';
              return (
                <button
                  key={i}
                  onClick={() => makeMove(i)}
                  style={{ height: 80, fontSize: 32, cursor: canPlay ? 'pointer' : 'not-allowed' }}
                  disabled={!canPlay}
                  title={canPlay ? 'Klik untuk bergerak' : 'Tidak bisa klik sekarang'}
                >
                  {cell}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12 }}>
            {/* Tombol reset hanya terlihat jika user adalah pembuat room */}
            {user && roomInfo && user.uid === roomInfo.playerX && (
              <button onClick={resetRoom}>Reset Game</button>
            )}
          </div>
        </div>
      )}

      <section style={{ marginTop: 24 }}>
        <h3>Room Info (debug)</h3>
        <pre style={{ background: '#f5f5f5', padding: 8 }}>
          {roomInfo ? JSON.stringify({
            id: roomId,
            playerX: roomInfo.playerX ? roomInfo.playerX.substring(0, 8) : null,
            playerO: roomInfo.playerO ? roomInfo.playerO.substring(0, 8) : null,
            status: roomInfo.status,
            turn: roomInfo.turn
          }, null, 2) : '(no room selected)'}
        </pre>
        <p>Note: Buka dua jendela/incognito/browser/device — buat room di satu, lalu join di yang lain.</p>
      </section>
    </main>
  );
    }
