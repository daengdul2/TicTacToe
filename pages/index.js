// pages/index.js
import { useEffect, useState, useRef } from 'react';
import { db, auth, signInAnonymously, onAuthStateChanged } from '../lib/firebase';
import { ref, onValue, set, update, push, get, remove } from 'firebase/database';

// ========== Utility ==========
function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(cell => cell !== '') ? 'draw' : null;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ========== Main Component ==========
export default function Home() {
  // Auth & user
  const [user, setUser] = useState(null);
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error('Sign in error:', err));
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Core states (kept similar to base)
  const [roomId, setRoomId] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(''));
  const [turn, setTurn] = useState('X');
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | waiting | playing | draw | X-won | O-won | finished
  const [roomsList, setRoomsList] = useState([]);
  const roomRefLive = useRef(null);

  // UI / feature states
  const [menuOpen, setMenuOpen] = useState(true); // show initial menu
  const [mode, setMode] = useState('lobby'); // lobby | room | bot
  const [creatorChoice, setCreatorChoice] = useState('X'); // when creating room choose X/O
  const [chatOpen, setChatOpen] = useState(true);
  const [chats, setChats] = useState([]); // local copy of chats for current room
  const [chatInput, setChatInput] = useState('');
  const lastChatTsRef = useRef(0); // rate-limit (30s)
  const [notifiedWinKey, setNotifiedWinKey] = useState(null);
  const [botDifficulty] = useState('random'); // placeholder, only random now
  const botThinkingRef = useRef(false);

  // keep track of whether current client is the room creator (playerX)
  const isCreator = !!(roomInfo && user && roomInfo.playerX === user.uid);

  // ========== Rooms List & Cleanup ==========
  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsub = onValue(roomsRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const roomIds = Object.keys(data);

      // Auto-delete empty rooms (no playerX and no playerO)
      for (const id of roomIds) {
        const r = data[id] || {};
        if (!r.playerX && !r.playerO) {
          try {
            await remove(ref(db, `rooms/${id}`));
            console.log(`Auto-deleted empty room: ${id}`);
          } catch (err) {
            console.error(`Failed to delete empty room ${id}`, err);
          }
        }
      }

      // Rebuild list after cleanup (onValue will re-trigger as needed)
      const arr = Object.keys(data)
        .filter(id => data[id])
        .map(id => {
          const r = data[id] || {};
          return { id, playersCount: (r.playerX ? 1 : 0) + (r.playerO ? 1 : 0), status: r.status || 'waiting' };
        });
      setRoomsList(arr);
    });
    return () => unsub();
  }, []);

  // ========== Room live listener (board/chats/status) ==========
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
      if (!data) {
        // room deleted
        setRoomInfo(null);
        setBoard(Array(9).fill(''));
        setTurn('X');
        setStatus('idle');
        setChats([]);
        setRoomId('');
        setMode('lobby');
        setMenuOpen(true);
        return;
      }

      // Ensure board is array of length 9
      let boardFromDb = data.board || Array(9).fill('');
      if (!Array.isArray(boardFromDb)) {
        boardFromDb = Object.keys(boardFromDb)
          .sort((a,b) => Number(a) - Number(b))
          .map(k => boardFromDb[k]);
        while (boardFromDb.length < 9) boardFromDb.push('');
      }

      setBoard(boardFromDb);
      setTurn(data.turn || 'X');
      setStatus(data.status || 'waiting');
      setRoomInfo(data);

      // chats -> array sorted by ts
      let chatsFromDb = [];
      if (data.chats) {
        if (Array.isArray(data.chats)) chatsFromDb = data.chats;
        else chatsFromDb = Object.entries(data.chats).map(([key, val]) => ({ key, ...val })).sort((a,b) => (a.ts||0)-(b.ts||0));
      }
      setChats(chatsFromDb);

      // set playerSymbol for current user if they are a player
      if (user) {
        if (data.playerX === user.uid) setPlayerSymbol('X');
        else if (data.playerO === user.uid) setPlayerSymbol('O');
        else setPlayerSymbol(null);
      }

      // notify winners once
      if (data.status && typeof data.status === 'string' && data.status.endsWith('-won')) {
        const winSym = data.status.split('-')[0];
        const winKey = `${roomId}:${data.status}:${data.lastMove?.at || 'nolast'}`;
        if (user && playerSymbol && winSym === playerSymbol && notifiedWinKey !== winKey) {
          alert('Kamu memenangkan permainan! 🎉');
          setNotifiedWinKey(winKey);
        }
      }
    });

    roomRefLive.current = unsub;
    return () => {
      if (roomRefLive.current) roomRefLive.current();
      roomRefLive.current = null;
    };
  }, [roomId, user, playerSymbol, notifiedWinKey]);

  // ========== Helpers: active-room check ==========
  async function hasActiveRoom(userUid) {
    if (!userUid) return false;
    try {
      const roomsRef = ref(db, 'rooms');
      const snapshot = await get(roomsRef);
      const data = snapshot.val() || {};
      for (const roomData of Object.values(data)) {
        if (roomData.playerX === userUid || roomData.playerO === userUid) return true;
      }
      return false;
    } catch (err) {
      console.error('Error checking active rooms', err);
      return false;
    }
  }

  // ========== Create / Join / Leave / Reset (Firebase modes) ==========
  async function createRoom() {
    if (!user) return alert('Signing in... coba lagi sebentar.');
    const hasRoom = await hasActiveRoom(user.uid);
    if (hasRoom) return alert('Anda sudah berada di room aktif. Leave terlebih dahulu.');

    try {
      const rref = push(ref(db, 'rooms'));
      const id = rref.key;
      const initial = {
        board: Array(9).fill(''),
        turn: 'X',
        status: 'waiting',
        playerX: user.uid,
        createdAt: Date.now(),
        // store creator's chosen symbol: if they chose 'O', we swap players on create
        creatorChoice: creatorChoice // 'X' or 'O' (for info)
      };

      // If creator chose 'O', we want them to be O and leave X slot open (or assign accordingly).
      if (creatorChoice === 'X') {
        // standard
        await set(rref, initial);
        setPlayerSymbol('X');
      } else {
        // creator wants to be O; assign playerO to creator and keep playerX empty
        initial.playerO = user.uid;
        initial.playerX = null;
        initial.status = 'waiting';
        await set(rref, initial);
        setPlayerSymbol('O');
      }

      setRoomId(id);
      setMode('room');
      setMenuOpen(false);
    } catch (err) {
      console.error('Create room error', err);
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
        setMode('room');
        setMenuOpen(false);
        return;
      }

      // join logic: prefer to fill O if X exists, else take X if empty
      if (!data.playerX && !data.playerO) {
        // empty room -> become X unless creator wanted O (handled on create)
        await update(r, { playerX: user.uid, status: 'waiting' });
        setPlayerSymbol('X');
      } else if (!data.playerO && data.playerX) {
        await update(r, { playerO: user.uid, status: 'playing' });
        setPlayerSymbol('O');
      } else if (!data.playerX && data.playerO) {
        await update(r, { playerX: user.uid, status: 'playing' });
        setPlayerSymbol('X');
      } else {
        return alert('Room penuh atau tidak valid untuk join.');
      }

      setRoomId(id);
      setMode('room');
      setMenuOpen(false);
    } catch (err) {
      console.error('Join room error', err);
      alert('Gagal join room: ' + err.message);
    }
  }

  async function leaveRoom() {
    if (!roomId || !user) return;
    const proceed = confirm('Kamu yakin ingin keluar dari room? Jika keluar, lawan akan menang secara otomatis.');
    if (!proceed) return;

    const currentRoomId = roomId;
    // immediate UI reset
    setRoomId('');
    setPlayerSymbol(null);
    setMode('lobby');
    setMenuOpen(true);

    try {
      const r = ref(db, `rooms/${currentRoomId}`);
      const snap = await get(r);
      if (!snap.exists()) return;

      const data = snap.val();
      const updates = {};
      const isX = data.playerX === user.uid;
      const isO = data.playerO === user.uid;

      if (isX) updates.playerX = null;
      if (isO) updates.playerO = null;

      const remainingPlayers = (data.playerX && !isX ? 1 : 0) + (data.playerO && !isO ? 1 : 0);

      if (remainingPlayers === 1) {
        const remainingUid = (!isX && data.playerX) ? data.playerX : (!isO && data.playerO) ? data.playerO : null;
        const remainingSymbol = (data.playerX && !isX) ? 'X' : (data.playerO && !isO) ? 'O' : null;
        updates.status = `${remainingSymbol}-won`;
        updates.winnerUid = remainingUid || null;

        // system chat
        const sysRef = push(ref(db, `rooms/${currentRoomId}/chats`));
        await set(sysRef, { uid: 'system', text: `Player telah keluar. Pemain ${remainingSymbol} memenangkan permainan.`, ts: Date.now(), system: true });

        await update(r, updates);
      } else if (remainingPlayers === 0) {
        await remove(r); // remove whole room incl chats
      } else {
        await update(r, updates);
      }
    } catch (err) {
      console.error('Leave room error', err);
      alert('Gagal leave room: ' + err.message);
    }
  }

  async function resetRoom() {
    if (!roomId || !roomInfo || !user) return;
    if (roomInfo.playerX !== user.uid && roomInfo.playerO !== user.uid) return alert('Hanya pemain dapat mereset.');
    try {
      const r = ref(db, `rooms/${roomId}`);
      await update(r, { board: Array(9).fill(''), turn: 'X', status: 'playing' });
      const sysRef = push(ref(db, `rooms/${roomId}/chats`));
      await set(sysRef, { uid: 'system', text: 'Game di-reset', ts: Date.now(), system: true });
    } catch (err) {
      console.error('Reset room error', err);
      alert('Gagal reset game: ' + err.message);
    }
  }

  // ========== Make Move (shared for room and bot) ==========
  async function makeMove(idx) {
    // guard
    if (!user || (!roomId && mode !== 'bot') || (mode === 'room' && status !== 'playing') || !playerSymbol) return;
    if (board[idx] !== '') return;
    if (turn !== playerSymbol) return;

    // optimistic update for UX
    const newBoard = [...board];
    newBoard[idx] = playerSymbol;
    setBoard(newBoard);

    const winner = checkWinner(newBoard);
    setTurn(playerSymbol === 'X' ? 'O' : 'X');
    if (winner) setStatus(winner === 'draw' ? 'draw' : `${winner}-won`);

    if (mode === 'bot') {
      // local-only: handle bot response
      if (winner) {
        // end, no DB
        // prompt winner to choose symbol for next round
        setTimeout(() => promptWinnerChoice(winner === 'draw' ? null : winner), 200);
      } else {
        // schedule bot move
        scheduleBotMove(newBoard, playerSymbol === 'X' ? 'O' : 'X');
      }
      return;
    }

    // mode === 'room' -> update Firebase
    try {
      const roomRef = ref(db, `rooms/${roomId}`);
      const updateObj = {
        board: newBoard,
        turn: playerSymbol === 'X' ? 'O' : 'X',
        lastMove: { by: user.uid, idx, at: Date.now() }
      };
      if (winner) updateObj.status = winner === 'draw' ? 'draw' : `${winner}-won`;
      await update(roomRef, updateObj);
    } catch (err) {
      console.error('Make move error:', err);
      alert('Gagal update move: ' + err.message);
      // revert local if needed by reloading room
      try {
        const snap = await get(ref(db, `rooms/${roomId}`));
        const data = snap.val();
        if (data) {
          let boardFromDb = data.board || Array(9).fill('');
          if (!Array.isArray(boardFromDb)) {
            boardFromDb = Object.keys(boardFromDb).sort((a,b)=>a-b).map(k=>boardFromDb[k]);
            while (boardFromDb.length < 9) boardFromDb.push('');
          }
          setBoard(boardFromDb);
          setTurn(data.turn || 'X');
          setStatus(data.status || 'waiting');
        }
      } catch (e) {
        console.error('Failed reload after makeMove fail', e);
      }
    }
  }

  // ========== Bot logic (simple random) ==========
  function scheduleBotMove(currentBoard, botSymbol) {
    if (botThinkingRef.current) return;
    botThinkingRef.current = true;
    setTimeout(() => {
      try {
        const avail = currentBoard.map((c,i) => c === '' ? i : -1).filter(i => i !== -1);
        if (avail.length === 0) return;
        // choose random (could be improved to minimax)
        const choice = avail[Math.floor(Math.random() * avail.length)];
        // apply bot move
        const newBoard = [...currentBoard];
        newBoard[choice] = botSymbol;
        setBoard(newBoard);
        const winner = checkWinner(newBoard);
        setTurn(botSymbol === 'X' ? 'O' : 'X');
        if (winner) {
          setStatus(winner === 'draw' ? 'draw' : `${winner}-won`);
          setTimeout(() => {
            if (winner !== 'draw') promptWinnerChoice(winner);
          }, 200);
        }
      } finally {
        botThinkingRef.current = false;
      }
    }, 700 + Math.random() * 800); // 700-1500ms delay for natural feel
  }

  // ========== Chat (send/receive) ==========
  async function sendChat() {
    if (!user || !roomId) return alert('Join room dulu untuk chat.');
    const now = Date.now();
    const last = lastChatTsRef.current || 0;
    if (now - last < 30000) {
      const remain = Math.ceil((30000 - (now - last)) / 1000);
      return alert(`Tunggu ${remain} detik lagi sebelum mengirim chat (30s).`);
    }
    const text = (chatInput || '').trim();
    if (!text) return;
    try {
      const chatRef = push(ref(db, `rooms/${roomId}/chats`));
      await set(chatRef, { uid: user.uid, text, ts: now });
      lastChatTsRef.current = now;
      setChatInput('');
    } catch (err) {
      console.error('Send chat error', err);
      alert('Gagal mengirim chat: ' + err.message);
    }
  }

  // ========== Bot & menu flows ==========
  function startPlayWithBot() {
    // reset local board and states for bot match
    setMode('bot');
    setMenuOpen(false);
    setRoomId('');
    setRoomInfo(null);
    setBoard(Array(9).fill(''));
    setTurn('X');
    setStatus('playing');
    // assign playerSymbol = choose (prompt)
    const choice = prompt('Pilih simbol untuk kamu (X/O). Default: X', 'X');
    const sym = (choice && choice.toUpperCase() === 'O') ? 'O' : 'X';
    setPlayerSymbol(sym);
    // if bot goes first, schedule bot move
    if (sym !== 'X') {
      // player is O, so bot is X and starts
      scheduleBotMove(Array(9).fill(''), 'X');
    }
  }

  // Prompt winner to choose symbol for next round
  function promptWinnerChoice(winnerSymbol) {
    if (!winnerSymbol || winnerSymbol === 'draw') {
      // no prompt on draw
      return;
    }
    // If current user is the winner, ask choice
    if (!user) return;
    const youWon = playerSymbol === winnerSymbol;
    if (!youWon) return;
    const want = confirm('Kamu menang! Mau main lagi sebagai X? (OK = X, Cancel = O)');
    const chosen = want ? 'X' : 'O';

    // If in bot mode: reset board and set playerSymbol accordingly
    if (mode === 'bot') {
      setBoard(Array(9).fill(''));
      setTurn('X');
      setStatus('playing');
      setPlayerSymbol(chosen);
      // if bot should start, schedule bot
      if (chosen !== 'X') scheduleBotMove(Array(9).fill(''), 'X');
      return;
    }

    // If in room mode and you are the creator or player, update DB to set symbols / reset
    if (mode === 'room' && roomId) {
      (async () => {
        try {
          const r = ref(db, `rooms/${roomId}`);
          // Decide: if winner chooses to be X, we set winner as playerX and other as playerO
          const snap = await get(r);
          if (!snap.exists()) return;
          const data = snap.val();
          // Find opponent uid
          const oppUid = (data.playerX === user.uid) ? data.playerO : (data.playerO === user.uid ? data.playerX : null);

          const updates = { board: Array(9).fill(''), turn: 'X', status: 'playing' };
          // assign winner to chosen symbol
          if (chosen === 'X') {
            updates.playerX = user.uid;
            updates.playerO = oppUid || null;
          } else {
            updates.playerO = user.uid;
            updates.playerX = oppUid || null;
          }
          await update(r, updates);
        } catch (err) {
          console.error('Failed to apply winner choice', err);
        }
      })();
    }
  }

  // ========== Quick Join ==========
  async function quickJoin() {
    // pick first waiting room with playersCount < 2
    const avail = roomsList.find(r => r.playersCount < 2 && r.status === 'waiting');
    if (avail) return joinRoom(avail.id);
    alert('Tidak ada room kosong saat ini');
  }

  // ========== UI JSX ==========
  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%, #0b1020 50%, #071028 100%)', color: '#e6eef8', padding: 20 }}>
      {/* Simple container */}
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>TicTacToe — Online</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#9fb0d6' }}>User: <strong style={{ color: '#fff' }}>{user ? user.uid.substring(0,8) : '...'}</strong></div>
            <button onClick={() => { setChatOpen(s => !s); }} style={{ background: '#234', border: '1px solid #3a5270', padding: '6px 10px', color:'#dbeafe', borderRadius:6 }}>{chatOpen ? 'Tutup Chat' : 'Buka Chat'}</button>
            <button onClick={() => { setMenuOpen(s => !s); setMode('lobby'); }} style={{ background:'#412d6b', border:'1px solid #6e4fb1', padding:'6px 10px', color:'#fff', borderRadius:6 }}>Menu</button>
          </div>
        </header>

        {/* Body area: left = game, right = chat (toggle) */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 2, background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, boxShadow: '0 
