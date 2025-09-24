export default function MenuUI({ onPlay, onSettings }) {
  const [submenu, setSubmenu] = useState(null);

  return (
    <div className="menu">
      {!submenu && (
        <>
          <button onClick={() => setSubmenu("play")}>Main</button>
          <button onClick={onSettings}>Pengaturan</button>
        </>
      )}

      {submenu === "play" && (
        <div className="submenu">
          <button onClick={() => onPlay("create")}>Buat Room</button>
          <button onClick={() => onPlay("join")}>Gabung Room</button>
          <button onClick={() => onPlay("quick")}>Gabung Cepat</button>
          <button onClick={() => onPlay("bot")}>Main dengan Bot</button>
          <button onClick={() => setSubmenu(null)}>⬅️ Kembali</button>
        </div>
      )}
    </div>
  );
}
