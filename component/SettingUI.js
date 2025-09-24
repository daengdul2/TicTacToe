import { useState } from "react";

export default function SettingsUI({ onBack }) {
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );

  const saveName = () => {
    localStorage.setItem("username", username);
    alert("Username disimpan!");
  };

  return (
    <div className="settings">
      <h2>Pengaturan</h2>
      <input
        type="text"
        placeholder="Masukkan username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button onClick={saveName}>Simpan</button>
      <button onClick={onBack}>⬅️ Kembali</button>
    </div>
  );
}
