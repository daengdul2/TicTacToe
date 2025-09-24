import { useState } from "react";
import GameUI from "../components/GameUI";
import MenuUI from "../components/MenuUI";
import SettingsUI from "../components/SettingsUI";
import ChatUI from "../components/ChatUI";
import "../public/css/style.css";

export default function Home() {
  const [page, setPage] = useState("menu"); // menu | game | settings
  const [gameMode, setGameMode] = useState(null); // room / quick / bot
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="app">
      {page === "menu" && (
        <MenuUI
          onPlay={(mode) => {
            setGameMode(mode);
            setPage("game");
          }}
          onSettings={() => setPage("settings")}
        />
      )}

      {page === "settings" && <SettingsUI onBack={() => setPage("menu")} />}

      {page === "game" && (
        <>
          <GameUI gameMode={gameMode} onBack={() => setPage("menu")} />
          <ChatUI open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
        </>
      )}
    </div>
  );
}
