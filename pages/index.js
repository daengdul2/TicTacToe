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

  // Chat states
  const [chats, setChats] = useState([]); // array of {key?, uid, text, ts, system?}
  const [chatInput, setChatInput] = useState('');
  const lastChatTsRef = useRef(0); // for rate-limiting per user (local)
  const [notifiedWinKey, setNotifiedWinKey] = useState(null); // avoid repeated win alerts

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
            await remove(emptyRoomRef); // Hapus room kosong (termasuk chats karena node dihapus)
            console.log(`Auto-deleted empty room: ${id}`);
          } catch (err) {
            console.error(`Failed to delete empty room ${id}:`, err);
          }
        }
      }

      // Rebuild list setelah cleanup
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
      setChats([]);
      setPlayerSymbol(null);
      return;
    }

    const rref = ref(db, `rooms/${roomId}`);
    const unsub = onValue(rref, snap => {
      const data = snap.val();
      if (data) {
        // Pastikan board selalu array meskipun Firebase mengkonversinya ke object
        let boardFromDb = data.board || Array(9).fill('');
        if (!Array.isArray(boardFromDb)) {
          // convert object to array in index order
          boardFromDb = Object.keys(boardFromDb)
            .sort((a,b) => Number(a) - Number(b))
            .map(k => boardFromDb[k]);
          // If length < 9, pad
          while (boardFromDb.length < 9) boardFromDb.push('');
        }
        setBoard(boardFromDb);

        setTurn(data.turn || 'X');
        setStatus(data.status || 'waiting');
        setRoomInfo(data);

        // set player symbol for current user if present
        if (user) {
          if (data.playerX === user.uid) setPlayerSymbol('X');
          else if (data.playerO === user.uid) setPlayerSymbol('O');
          else setPlayerSymbol(null);
        }

        // Chats: convert to array sorted by ts (if stored as object)
        let chatsFromDb = [];
        if (data.chats) {
          if (Array.isArray(data.chats)) {
            chatsFromDb = data.chats;
          } else {
            // object -> array
            chatsFromDb = Object.entries(data.chats)
              .map(([key, val]) => ({ key, ...val }))
              .sort((a,b) => (a.ts || 0) - (b.ts || 0));
          }
        }
        setChats(chatsFromDb);

        // Notifikasi kemenangan (tampilkan alert ke pemenang sekali)
        if (data.status && typeof data.status === 'string' && data.status.endsWith('-won')) {
          // derive winning symbol
          const winSym = data.status.split('-')[0]; // e.g. 'X' or 'O'
          // create a unique key for this win event to avoid repeating alerts
          const winKey = `${roomId}:${data.status}:${data.lastMove?.at || 'nolast'}`;
          if (user && playerSymbol && winSym === playerSymbol) {
            if (notifiedWinKey !== winKey) {
              // show alert once
              alert('Kemenangan! Lawan keluar atau kalah — kamu menang 🎉');
              setNotifiedWinKey(winKey);
            }
          }
        }
      } else {
        // room removed => clear local state and clear chats
        setRoomInfo(null);
        setBoard(Array(9).fill(''));
        setTurn('X');
        setStatus('idle');
        setChats([]);
        setRoomId('');
        // optionally inform user
        // alert('Room telah dihapus.');
      }
    });

    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId, user, playerSymbol, notifiedWinKey]);

  // Helper: check apakah user sudah punya room aktif
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
      return false;
    }
  }

  async function createRoom() {
    if (!user) return alert('Signing in... coba lagi sebentar.');
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
    if (!id || !id.trim()) return alert('Masukkan Room ID yang valid.');

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

      if (!data.playerX && !data.playerO) {
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
    // guard conditions (sama seperti kode dasar)
    if (!user || !roomId || status !== 'playing' || !playerSymbol || playerSymbol !== turn || board[idx] !== '') return;

    // Optimistic update for UX
    const newBoard = [...board];
    newBoard[idx] = playerSymbol;
    setBoard(newBoard);
    const winner = checkWinner(newBoard);
    setTurn(playerSymbol === 'X' ? 'O' : 'X');
    if (winner) setStatus(winner === 'draw' ? 'draw' : `${winner}-won`);

    const roomRef = ref(db, `rooms/${roomId}`);
    const updateObj = {
      board: newBoard,
      turn: playerSymbol === 'X' ? 'O' : 'X',
      lastMove: { by: user.uid, idx, at: Date.now() }
    };
    if (winner) updateObj.status = winner === 'draw' ? 'draw' : `${winner}-won`;

    try {
      await update(roomRef, updateObj);
    } catch (err) {
      console.error('Make move error:', err);
      alert('Gagal update move: ' + err.message);
      // revert local state fallback (load from DB would also update)
      // attempt to refresh by re-getting room
      try {
        const snap = await get(roomRef);
        const data = snap.val();
        if (data) {
          let boardFromDb = data.board || Array(9).fill('');
          if (!Array.isArray(boardFromDb)) {
            boardFromDb = Object.keys(boardFromDb).sort((a,b) => a-b).map(k => boardFromDb[k]);
            while (boardFromDb.length < 9) boardFromDb.push('');
          }
          setBoard(boardFromDb);
          setTurn(data.turn || 'X');
          setStatus(data.status || 'waiting');
        }
      } catch (e) {
        console.error('Failed to reload room after failed move:', e);
      }
    }
  }

  async function sendChat() {
    if (!user || !roomId) return alert('Join room dulu untuk chat.');
    const now = Date.now();
    const lastTs = lastChatTsRef.current || 0;
    if (now - lastTs < 30000) { // 30 seconds
      const remain = Math.ceil((30000 - (now - lastTs)) / 1000);
      return alert(`Tunggu ${remain} detik sebelum mengirim chat lagi (30s rate limit).`);
    }
    const text = (chatInput || '').trim();
    if (!text) return;
    const chatRef = push(ref(db, `rooms/${roomId}/chats`));
    const msg = {
      uid: user.uid,
      text,
      ts: now,
    };
    try {
      await set(chatRef, msg);
      lastChatTsRef.current = now;
      setChatInput('');
    } catch (err) {
      console.error('Send chat error:', err);
      alert('Gagal mengirim chat: ' + err.message);
    }
  }

  // Reset game (only playerX can reset per base code)
  async function resetRoom() {
    if (!roomId || !roomInfo || !user) return;
    if (roomInfo.playerX !== user.uid) {
      return alert('Hanya pembuat room (Pemain X) yang dapat mereset permainan.');
    }
    try {
      const roomRef = ref(db, `rooms/${roomId}`);
      await update(roomRef, { board: Array(9).fill(''), turn: 'X', status: 'playing' });
      // push a system chat about reset
      const sysRef = push(ref(db, `rooms/${roomId}/chats`));
      await set(sysRef, { uid: 'system', text: 'Game di-reset oleh host', ts: Date.now(), system: true });
    } catch (err) {
      console.error('Reset room error:', err);
      alert('Gagal reset game: ' + err.message);
    }
  }

  async function leaveRoom() {
    if (!roomId || !user) return;
    // confirm before leaving
    const proceed = confirm('Kamu yakin ingin keluar dari room? Jika keluar, lawan akan menang secara otomatis.');
    if (!proceed) return;

    const currentRoomId = roomId; // Simpan sebelum reset UI
    setRoomId('');
    setPlayerSymbol(null);

    try {
      const r = ref(db, `rooms/${currentRoomId}`);
      const snap = await get(r);
      if (!snap.exists()) return;

      const data = snap.val();
      const updates = {};
      const isPlayerX = data.playerX === user.uid;
      const isPlayerO = data.playerO === user.uid;

      if (isPlayerX) updates.playerX = null;
      if (isPlayerO) updates.playerO = null;

      const remainingPlayers = (data.playerX && !isPlayerX ? 1 : 0) + (data.playerO && !isPlayerO ? 1 : 0);

      if (remainingPlayers === 1) {
        // Determine remaining player's symbol and uid
        const remainingUid = (!isPlayerX && data.playerX) ? data.playerX : (!isPlayerO && data.playerO) ? data.playerO : null;
        const remainingSymbol = (data.playerX && !isPlayerX) ? 'X' : (data.playerO && !isPlayerO) ? 'O' : null;

        // Set status so opponent is declared winner
        updates.status = `${remainingSymbol}-won`;
        updates.winnerUid = remainingUid || null;

        // Add a system chat to notify victory due to leave
        const sysRef = push(ref(db, `rooms/${currentRoomId}/chats`));
        await set(sysRef, {
          uid: 'system',
          text: `Player telah keluar. Pemain ${remainingSymbol} (lawan) memenangkan permainan.`,
          ts: Date.now(),
          system: true
        });

        await update(r, updates);
      } else if (remainingPlayers === 0) {
        // no players left -> remove whole room (removes chats too)
        await remove(r);
      } else {
        // fallback: update remaining fields (shouldn't happen often)
        await update(r, updates);
      }
    } catch (err) {
      console.error('Leave room error:', err);
      alert('Gagal leave room: ' + err.message);
    }
  }

  // Helper to display time nicely (HH:MM)
  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div>
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
              {user && roomInfo && user.uid === roomInfo.playerX && (
                <button onClick={resetRoom}>Reset Game</button>
              )}
            </div>
          </div>

          {/* Chat panel */}
          <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6, height: 420, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Chat (30s rate limit)</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 4, background: '#fafafa' }}>
              {chats.length === 0 && <div style={{ color: '#666' }}>(Belum ada chat)</div>}
              {chats.map((c, idx) => (
                <div key={c.key || idx} style={{ marginBottom: 6, fontSize: 14 }}>
                  <div style={{ color: c.system ? '#888' : '#111' }}>
                    <span style={{ fontWeight: '600' }}>{c.system ? '[system]' : (c.uid === (user && user.uid) ? 'Kamu' : (c.uid ? c.uid.substring(0,8) : 'anon'))}</span>
                    <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>{formatTime(c.ts)}</span>
                  </div>
                  <div style={{ marginLeft: 4 }}>{c.text}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ketik pesan..."
                style={{ flex: 1, padding: '6px 8px' }}
                onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
              />
              <button onClick={sendChat}>Kirim</button>
            </div>
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
