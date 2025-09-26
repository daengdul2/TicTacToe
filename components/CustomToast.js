// components/CustomToast.js

import React, { useState, useEffect } from 'react';

// Anda perlu mendefinisikan style untuk notifikasi toast di global.css Anda.
// Perhatian: Style inline ini akan menimpa style dari global.css jika ada konflik,
// tetapi berguna untuk tampilan cepat.

export default function CustomToast({ message, onClose }) {
    // State untuk mengontrol visibilitas.
    // Dibuat menjadi true secara default agar muncul saat 'message' diisi.
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Reset visibilitas menjadi true setiap kali 'message' berubah (pesan baru masuk)
        if (message) {
            setIsVisible(true); 
            
            // Atur timer untuk menghilangkan toast setelah 3000ms (3 detik)
            const timer = setTimeout(() => {
                setIsVisible(false);
                // Kita panggil onClose untuk mereset state di parent (GamePage) 
                // setelah animasi atau penutupan selesai.
                onClose(); 
            }, 3000);
            
            // Cleanup: Hapus timer jika komponen di-unmount atau message berubah
            return () => clearTimeout(timer);
        }
    }, [message]); // onClose tidak perlu di dependency array karena itu adalah fungsi callback yang stabil.

    // Tampilkan null jika tidak terlihat atau tidak ada pesan
    if (!isVisible || !message) return null;

    // Fungsi penanganan klik: menutup toast dan memanggil callback
    const handleClick = () => {
        setIsVisible(false);
        // Panggil onClose yang di GamePage (yang akan membuka chat dan mereset toastMessage)
        onClose(); 
    };

    return (
        <div 
            style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                padding: '12px 20px',
                backgroundColor: '#333',
                color: 'white',
                borderRadius: '8px',
                zIndex: 1000,
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                cursor: 'pointer' // Menandakan bahwa toast bisa di-klik
            }}
            onClick={handleClick}
        >
            💬 Pesan Baru: <strong>{message}</strong>
        </div>
    );
}
