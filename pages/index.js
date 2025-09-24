import { useEffect, useState, useRef } from 'react';
import { db, auth, signInAnonymously, onAuthStateChanged } from '../lib/firebase';
import { ref, onValue, set, update, push, get, remove } from 'firebase/database';
import { checkWinner } from '../lib/gameLogic';
import '../styles/global.css';

export default function Home() {
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(''));
  const [turn, setTurn] = useState('X');
  const [status, setStatus] = useState('idle');
  const [roomsList, setRoomsList] = useState([]);
  const roomRefLive = useRef(null);
  const [roomInfo, setRoomInfo] = useState(null);

  // Firebase auth
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error('Sign in error:', err));
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Listen daftar room
  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsub = onValue(roomsRef, async (snapshot) => {
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

  // Listen room aktif
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
        if (user) {
          if (data.playerX === user.uid) setPlayerSymbol('X');
          else if (data.playerO === user.uid) setPlayerSymbol('O');
          else setPlayerSymbol(null);
        }
      } else {
        setRoomInfo(null);
        setRoomId('');
        alert('Room tidak lagi tersedia.');
      }
    });

    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId, user]);

  // Buat room
  async function createRoom() {
    if (!user) return alert('Signing in... coba lagi.');
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
  }

  // Join room
  async function joinRoom(id) {
    if (!user) return alert('Signing in...');
    const r = ref(db, `rooms/${id}`);
    const snap = await get(r);
    if (!snap.exists()) return alert('Room not found');
    const data = snap.val();

    if (data.playerX === user.uid || data.playerO === user.uid) {
      setRoomId(id);
      setPlayerSymbol(data.playerX === user.uid ? 'X' : 'O');
      return;
    }

    if (!data.playerO) {
      await update(r, { playerO: user.uid, status: 'playing' });
      setPlayerSymbol('O');
    } else if (!data.playerX) {
      await update(r, { playerX: user.uid, status: 'playing' });
      setPlayerSymbol('X');
    } else {
      alert('Room penuh');
      return;
    }
    setRoomId(id);
  }

  // Gerakan
  async function makeMove(idx) {
    if (!user || !roomId || status !== 'playing' || !playerSymbol || playerSymbol !== turn || board[idx] !== '') return;
    const newBoard = [...board];
    newBoard[idx] = playerSymbol;
    const winner = checkWinner(newBoard);

    const roomRef = ref(db, `rooms/${roomId}`);
    const updateObj = {
      board: newBoard,
      turn: playerSymbol === 'X' ? 'O' : 'X',
      lastMove: { by: user.uid, idx, at: Date.now() }
    };

    if (winner) updateObj.status = winner === 'draw' ? 'draw' : `${winner}-won`;
    await update(roomRef, updateObj);
  }

  // Reset game
  async function resetRoom() {
    if (!roomId || !roomInfo || !user) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    await update(roomRef, { board: Array(9).fill(''), turn: 'X', status: 'playing' });
  }

  // Keluar room
  async function leaveRoom() {
    if (!roomId || !user) return;
    const currentRoomId = roomId;
    setRoomId('');
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
    <main>
      <h1>TicTacToe — Online</h1>
      <div>User: {user ? user.uid.substring(0,8) : '... signing in'}</div>

      <div>
        <button onClick={createRoom}>Create Room (X)</button>
        <button onClick={() => {
          const avail = roomsList.find(r => r.playersCount < 2);
          if (avail) joinRoom(avail.id);
          else alert('Tidak ada room kosong');
        }}>Quick Join</button>
      </div>

      <div>
        <strong>Available Rooms</strong>
        <ul className="room-list">
          {roomsList.length === 0 && <li>(no rooms)</li>}
          {roomsList.map(r => (
            <li key={r.id}>
              <button onClick={() => joinRoom(r.id)}>{r.id.substring(r.id.length - 6)}</button>
              {' '}({r.status}) — players: {r.playersCount}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label>Room ID: <input value={roomId} onChange={e => setRoomId(e.target.value)} /></label>
        <button onClick={() => joinRoom(roomId)}>Join</button>
        <button onClick={leaveRoom}>Leave</button>
      </div>

      {roomId && (
        <>
          <div>Player: {playerSymbol || '-'} | Turn: {turn} | Status: {status}</div>
          <div className="board">
            {board.map((cell, i) => {
              const canPlay = playerSymbol === turn && !cell && status === 'playing';
              return (
                <button key={i} className="cell" onClick={() => makeMove(i)} disabled={!canPlay}>
                  {cell}
                </button>
              );
            })}
          </div>
          <button onClick={resetRoom}>Reset</button>
        </>
      )}

      <section>
        <h3>Room Info</h3>
        <pre>
          {roomInfo ? JSON.stringify({
            id: roomId,
            playerX: roomInfo.playerX ? roomInfo.playerX.substring(0,8) : null,
            playerO: roomInfo.playerO ? roomInfo.playerO.substring(0,8) : null,
            status: roomInfo.status,
            turn: roomInfo.turn
          }, null, 2) : '(no room selected)'}
        </pre>
      </section>
    </main>
  );
    }
