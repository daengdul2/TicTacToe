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
  createRoom,
  joinRoom,
  leaveRoom,
  makeMove,
  resetRoom,
  sendMessage
}) {
  return (
    <main>
      <h1>TicTacToe — Online</h1>
      <div>User: {user ? user.uid.substring(0, 8) : '... signing in'}</div>

      {/* Menu Awal */}
      <div>
        <button onClick={createRoom}>Create Room (X)</button>
        <button
          onClick={() => {
            const avail = roomsList.find(r => r.playersCount < 2);
            if (avail) joinRoom(avail.id);
            else alert('Tidak ada room kosong');
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
              {' '}({r.status}) — players: {r.playersCount}
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
        <button onClick={leaveRoom}>Leave</button>
      </div>

      {/* Game Board */}
      {roomId && (
        <>
          <div>
            Player: {playerSymbol || '-'} | Turn: {turn} | Status: {status}
          </div>
          <div className="board">
            {board.map((cell, i) => {
              const canPlay = playerSymbol === turn && !cell && status === 'playing';
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
          <button onClick={resetRoom}>Reset</button>
        </>
      )}

      {/* Chat Box */}
      <div className={`chat-box ${!chatOpen ? "hidden" : ""}`}>
        <div className="chat-header" onClick={() => setChatOpen(!chatOpen)}>
          {chatOpen ? "Tutup Chat" : "Buka Chat"}
        </div>
        {chatOpen && (
          <>
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
          </>
        )}
      </div>

      {/* Room Info */}
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
    </main>
  );
}
