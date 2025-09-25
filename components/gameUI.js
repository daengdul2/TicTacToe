export default function GameUI({
  user,
  roomId,
  roomsList,
  playerSymbol,
  turn,
  status,
  board,
  roomInfo,
  chatOpen,
  messages,
  setRoomId,
  setChatOpen,
  joinRoom,
  leaveRoom,
  makeMove,
  resetRoom,
  sendMessage,
  
  customRoomId={customRoomId},
  setCustomRoomId={setCustomRoomId},
  preferredSymbol={preferredSymbol},
  setPreferredSymbol={setPreferredSymbol},
  createRoom={createRoom}



  
}) {
  const inGame = Boolean(roomId); // ✅ Cek apakah sedang main atau tidak

  return (
    <main>
      <h1>TicTacToe — Online</h1>
      <div>User: {user ? user.uid.substring(0, 8) : "... signing in"}</div>

      {/* ===== MENU (hanya tampil jika belum join game) ===== */}
      {!inGame && (
        <>
          {/* Menu Awal */}
          <div>
        {/*  <button onClick={createRoom}>Create Room (X)</button>*/}
<div>
  <input
    type="text"
    placeholder="Custom Room ID"
    value={customRoomId}
    onChange={(e) => setCustomRoomId(e.target.value)}
  />
  
  <select value={preferredSymbol} onChange={(e) => setPreferredSymbol(e.target.value)}>
    <option value="X">Play as X</option>
    <option value="O">Play as O</option>
  </select>

  <button onClick={() => createRoom(customRoomId, preferredSymbol)}>
    Create Room
  </button>
</div>


        
            <button
              onClick={() => {
                const avail = roomsList.find(r => r.playersCount < 2);
                if (avail) joinRoom(avail.id);
                else alert("Tidak ada room kosong");
              }}
            >
              Quick Join
            </button>
          </div>

          {/* Daftar Room */}
          <div>
            <strong>Available Rooms</strong>
            <ul className="room-list">
              {roomsList.length === 0 && <li>(no rooms)</li>}
              {roomsList.map(r => (
                <li key={r.id}>
                  <button onClick={() => joinRoom(r.id)}>
                    {r.id.substring(r.id.length - 6)}
                  </button>
                  {" "}({r.status}) — players: {r.playersCount}
                </li>
              ))}
            </ul>
          </div>

          {/* Input Room ID */}
          <div>
            <label>
              Room ID:
              <input
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
              />
            </label>
            <button onClick={() => joinRoom(roomId)}>Join</button>
          </div>
        </>
      )}

      {/* ===== GAME (hanya tampil jika sudah join game) ===== */}
      {inGame && (
        <>
          <div>
            Player: {playerSymbol || "-"} | Turn: {turn} | Status: {status}
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
                  disabled={!canPlay}
                >
                  {cell}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: "10px" }}>
            <button onClick={leaveRoom}>Leave</button>
            <button onClick={resetRoom}>Reset</button>
          </div>
        </>
      )}

      {/* Floating Chat */}
      {inGame && (
        <>
          <button
            className="chat-float-btn"
            onClick={() => setChatOpen(!chatOpen)}
          >
            💬
          </button>
          {chatOpen && (
            <div className="chat-box">
              <div className="chat-messages">
                {messages.map((m, i) => (
                  <div key={i}>
                    <strong>{m.by}:</strong> {m.text}
                  </div>
                ))}
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input name="msg" placeholder="Ketik pesan..." />
                <button type="submit">Kirim</button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Room Info Debug */}
      {inGame && (
        <section>
          <h3>Room Info</h3>
          <pre>
            {roomInfo
              ? JSON.stringify(
                  {
                    id: roomId,
                    playerX: roomInfo.playerX
                      ? roomInfo.playerX.substring(0, 8)
                      : null,
                    playerO: roomInfo.playerO
                      ? roomInfo.playerO.substring(0, 8)
                      : null,
                    status: roomInfo.status,
                    turn: roomInfo.turn
                  },
                  null,
                  2
                )
              : "(no room selected)"}
          </pre>
        </section>
      )}
    </main>
  );
}
