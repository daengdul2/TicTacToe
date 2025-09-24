import { useState } from "react";

export default function ChatUI({ open, onToggle }) {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([]);

  const sendMsg = () => {
    if (!msg.trim()) return;
    setMessages([...messages, { user: "Me", text: msg }]);
    setMsg("");
  };

  return (
    <>
      <button className="chat-toggle" onClick={onToggle}>
        💬
      </button>
      {open && (
        <div className="chat-box">
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i}>
                <b>{m.user}:</b> {m.text}
              </div>
            ))}
          </div>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Ketik pesan..."
          />
          <button onClick={sendMsg}>Kirim</button>
        </div>
      )}
    </>
  );
                                    }
