// pages/index.js
import { useEffect, useState, useRef } from 'react';
import { db, auth, signInAnonymously, onAuthStateChanged } from '../lib/firebase';
import { ref, onValue, set, update, push, get } from 'firebase/database';

// Utility: check winner
function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

export default function Home() {
  const [user, setUser] = useState(null); // firebase user
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState(null); // 'X' or 'O'
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('X');
  const [status, setStatus] = useState('idle');
  const [roomsList, setRoomsList] = useState([]);
  const roomRefLive = useRef(null);
  const [roomInfo, setRoomInfo] = useState(null);

  // auth: sign in anonymously if not signed in
  useEffect(() => {
    // try sign-in
    signInAnonymously(auth).catch(err => {
      // if already signed in or error, ignore; onAuthStateChanged will handle
      // console.log('anon signIn error', err);
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        setUser(null);
      }
    });
    return () => unsub();
  }, []);

  // listen rooms list
  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsub = onValue(roomsRef, snapshot => {
      const data = snapshot.val() || {};
      const arr = Object.keys(data).map(id => {
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

  // live room listener when roomId changes
  useEffect(() => {
    if (roomRefLive.current) roomRefLive.current(); // unsubscribe previous if any
    if (!roomId) {
      setRoomInfo(null);
      return;
    }
    const rref = ref(db, `rooms/${roomId}`);
    const unsub = onValue(rref, snap => {
      const data = snap.val();
      if (!data) {
        setRoomInfo(null);
        setBoard(Array(9).fill(null));
        setTurn('X');
        setStatus('idle');
        return;
      }
      setRoomInfo(data);
      setBoard(data.board || Array(9).fill(null));
      setTurn(data.turn || 'X');
      setStatus(data.status || 'waiting');

      // assign symbol by comparing authenticated uid with room players
      if (user) {
        if (data.playerX === user.uid) setPlayerSymbol('X');
        else if (data.playerO === user.uid) setPlayerSymbol('O');
        else setPlayerSymbol(null);
      }
    });
    // store unsub
    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId, user]);

  // create a room (creator becomes X)
  async function createRoom() {
    if (!user) return alert('Signing in... coba lagi sebentar.');
    const rref = push(ref(db, 'rooms'));
    const id = rref.key;
    const initial = {
      board: Array(9).fill(null),
      turn: 'X',
      status: 'waiting',
      playerX: user.uid,
      createdAt: Date.now()
    };
    await set(rref, initial);
    setRoomId(id);
    setPlayerSymbol('X');
  }

  // join room (takes O if free, else X if free)
  async function joinRoom(id) {
    if (!user) return alert('Signing in... coba lagi sebentar.');
    const r = ref(db, `rooms/${id}`);
    const snap = await get(r);
    if (!snap.exists()) return alert('Room not found');
    const data = snap.val();

    // prevent joining same room twice
    if (data.playerX === user.uid || data.playerO === user.uid) {
      setRoomId(id);
      setPlayerSymbol(data.playerX === user.uid ? 'X' : 'O');
      return;
    }

    if (!data.playerO) {
      await update(r, { playerO: user.uid, status: 'playing' });
      setPlayerSymbol('O');
      setRoomId(id);
    } else if (!data.playerX) {
      await update(r, { playerX: user.uid, status: 'playing' });
      setPlayerSymbol('X');
      setRoomId(id);
    } else {
      alert('Room penuh');
    }
  }

  // make move — only allowed if user is the player whose turn it is
  async function makeMove(idx) {
  if (!user) return alert('Not signed in yet');
  if (!roomId) return alert('Join a room first');
  if (status !== 'playing' && status !== 'waiting') return;
  if (!playerSymbol) return alert('Kamu belum ditetapkan sebagai pemain di room ini');
  if (playerSymbol !== turn) return; // not your turn

  // ❗ Ubah di sini: Cek apakah board[idx] BUKAN string kosong
  if (board[idx] !== '') return; 

  // ❗ Ubah di sini: Gunakan '' sebagai nilai default, bukan null
  const safeBoard = Array.isArray(board) ? board.slice() : Array(9).fill('');
  safeBoard[idx] = playerSymbol;

  // Pastikan fungsi checkWinner juga mengenali '' sebagai kotak kosong
  const winner = checkWinner(safeBoard); 
  const roomRef = ref(db, `rooms/${roomId}`);

  const updateObj = {
    board: safeBoard,   // ✅ Sekarang akan tersimpan dengan benar
    turn: playerSymbol === 'X' ? 'O' : 'X',
    lastMove: { by: user.uid, idx, at: Date.now() }
  };

  if (winner) {
    updateObj.status = winner === 'draw' ? 'draw' : `${winner}-won`;
  }

  await update(roomRef, updateObj);
}


  async function resetRoom() {
    if (!roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    // only allow reset if you're a participant
    if (!roomInfo) return;
    if (roomInfo.playerX !== user.uid && roomInfo.playerO !== user.uid) {
      return alert('Hanya pemain di room yang dapat mereset.');
    }
    await update(roomRef, { board: Array(9).fill(null), turn: 'X', status: 'playing' });
  }

  // leave room (clear player's slot)
  async function leaveRoom() {
    if (!roomId || !user) return;
    const r = ref(db, `rooms/${roomId}`);
    const snap = await get(r);
    if (!snap.exists()) {
      setRoomId('');
      setPlayerSymbol(null);
      return;
    }
    const data = snap.val();
    const updates = {};
    if (data.playerX === user.uid) updates.playerX = null;
    if (data.playerO === user.uid) updates.playerO = null;
    // if no players left, remove room entirely
    if ((!data.playerX || data.playerX === user.uid) && (!data.playerO || data.playerO === user.uid)) {
      await set(r, null);
    } else {
      // set fields to null removes them; use update with explicit null
      await update(r, updates);
    }
    setRoomId('');
    setPlayerSymbol(null);
  }

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <h1>TicTacToe — Online (Vercel + Firebase Auth)</h1>

      <div style={{ marginBottom: 12 }}>
        <div>User: {user ? user.uid.substring(0,8) : '... signing in'}</div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={createRoom}>Create Room (become X)</button>
        <button style={{ marginLeft: 8 }} onClick={() => {
          // quick join: join first available room with vacancy
          const avail = roomsList.find(r => r.playersCount < 2);
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
              <button onClick={() => joinRoom(r.id)}>{r.id}</button>
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

      <div style={{ marginTop: 20 }}>
        <div>Player: {playerSymbol || '-'} | Turn: {turn} | Status: {status}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gap: 8, marginTop: 12 }}>
          {board.map((cell, i) => {
            const disabled = !(playerSymbol && playerSymbol === turn && !cell && (status === 'playing' || status === 'waiting'));
            return (
              <button
                key={i}
                onClick={() => makeMove(i)}
                style={{ height: 80, fontSize: 32 }}
                disabled={disabled}
                title={disabled ? 'Tidak bisa klik sekarang' : 'Klik untuk gerak'}
              >
                {cell}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={resetRoom}>Reset</button>
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>Room Info (debug)</h3>
        <pre style={{ background: '#f5f5f5', padding: 8 }}>
          {roomInfo ? JSON.stringify({
            id: roomId,
            playerX: roomInfo.playerX ? roomInfo.playerX.substring(0,8) : null,
            playerO: roomInfo.playerO ? roomInfo.playerO.substring(0,8) : null,
            status: roomInfo.status,
            turn: roomInfo.turn
          }, null, 2) : '(no room selected)'}
        </pre>
        <p>Note: Buka dua jendela/incognito/browser/device — buat room di satu, lalu join di yang lain.</p>
      </section>
    </main>
  );
          }
