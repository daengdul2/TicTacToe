import {useState, useEffect} from "react";
import {checkWinner} from "../lib/gameLogic";
import {useRouter} from "next/router";

// Komponen Kotak Papan (tidak berubah)
function Square({value, onSquareClick}) {
    return (
        <button className="cell" onClick={onSquareClick}>
            {value}
        </button>
    );
}

export default function GameCom() {
    const router = useRouter();
    const PLAYER = "X";
    const BOT = "O";

    const [resetTimer, setResetTimer] = useState(0);
    const [difficulty, setDifficulty] = useState(null);
    const [board, setBoard] = useState(Array(9).fill(null));
    const [isPlayerNext, setIsPlayerNext] = useState(true);
    const [status, setStatus] = useState("Pilih tingkat kesulitan");

    const winner = checkWinner(board);

    // useEffect untuk giliran bot (tidak berubah)
    useEffect(() => {
        if (!difficulty || winner) return;
        if (!isPlayerNext) {
            setStatus("Bot sedang berpikir...");
            const timer = setTimeout(() => {
                makeBotMove();
            }, 700);
            return () => clearTimeout(timer);
        } else {
            setStatus(`Giliran: Kamu (X)`);
        }
    }, [isPlayerNext, board, winner, difficulty]);

    // Fungsi klik dari pemain (tidak berubah)
    function handlePlayerClick(index) {
        if (
            board[index] ||
            winner ||
            !isPlayerNext ||
            !difficulty ||
            resetTimer > 0
        ) {
            return;
        }
        const newBoard = board.slice();
        newBoard[index] = PLAYER;
        setBoard(newBoard);
        setIsPlayerNext(false);
    }

    // --- Fungsi Bot (tidak berubah) ---
    function makeBotMove() {
        if (difficulty === "easy") makeEasyBotMove();
        else if (difficulty === "hard") makeHardBotMove();
    }
    function makeEasyBotMove() {
        const emptySquares = board
            .map((sq, i) => (sq === null ? i : null))
            .filter((i) => i !== null);
        if (emptySquares.length > 0) {
            const move =
                emptySquares[Math.floor(Math.random() * emptySquares.length)];
            const newBoard = board.slice();
            newBoard[move] = BOT;
            setBoard(newBoard);
            setIsPlayerNext(true);
        }
    }
    function makeHardBotMove() {
        const performMove = (index) => {
            const newBoard = board.slice();
            newBoard[index] = BOT;
            setBoard(newBoard);
            setIsPlayerNext(true);
        };
        const findBestMove = (p) => {
            const lines = [
                [0, 1, 2],
                [3, 4, 5],
                [6, 7, 8],
                [0, 3, 6],
                [1, 4, 7],
                [2, 5, 8],
                [0, 4, 8],
                [2, 4, 6]
            ];
            for (let l of lines) {
                const [a, b, c] = l;
                if (board[a] === p && board[b] === p && board[c] === null)
                    return c;
                if (board[a] === p && board[c] === p && board[b] === null)
                    return b;
                if (board[b] === p && board[c] === p && board[a] === null)
                    return a;
            }
            return null;
        };
        let m = findBestMove(BOT);
        if (m !== null) {
            performMove(m);
            return;
        }
        m = findBestMove(PLAYER);
        if (m !== null) {
            performMove(m);
            return;
        }
        if (board[4] === null) {
            performMove(4);
            return;
        }
        const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
        if (corners.length > 0) {
            performMove(corners[Math.floor(Math.random() * corners.length)]);
            return;
        }
        const sides = [1, 3, 5, 7].filter((i) => board[i] === null);
        if (sides.length > 0) {
            performMove(sides[Math.floor(Math.random() * sides.length)]);
            return;
        }
    }

    // Fungsi kontrol game (tidak berubah)
    function resetGame() {
        setBoard(Array(9).fill(null));
        setIsPlayerNext(true);
        setResetTimer(0);
        if (difficulty) {
            setStatus(`Giliran: Kamu (X)`);
        }
    }
    function changeMode() {
        if (!confirm("Ganti Mode?")) return;
        setDifficulty(null);
        resetGame();
        setStatus("Pilih tingkat kesulitan");
    }
    function selectDifficulty(level) {
        setDifficulty(level);
        setStatus(`Giliran: Kamu (X)`);
    }
    function leaveRoom(withConfirm) {
        if (withConfirm === true) {
            if (!confirm("Kembali ke menu utama?")) return;
        }
        router.push("/");
    }

    // --- useEffect UNTUK AKHIR PERMAINAN (DIPERBARUI) ---
    useEffect(() => {
        if (winner) {
            let endMessage = "";
            if (winner === "draw") endMessage = "Hasilnya Seri!";
            else if (winner === PLAYER) endMessage = "🎉 Kamu Menang!";
            else endMessage = "😢 Kamu Kalah!";

            // --- PERUBAHAN DI SINI: Mengganti setStatus dengan alert ---
            alert(endMessage);

            // Mulai hitung mundur setelah alert ditutup
            let countdown = 3;
            setResetTimer(countdown);

            const interval = setInterval(() => {
                countdown -= 1;
                setResetTimer(countdown);
                if (countdown <= 0) {
                    clearInterval(interval);
                    resetGame();
                }
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [winner]);

    // Render konten (tidak berubah)
    return (
        <main>
            <h1>Tic-Tac-Toe vs Bot</h1>
            <div className="status">
                {resetTimer > 0
                    ? `Reset otomatis dalam ${resetTimer} detik...`
                    : status}
            </div>

            {!difficulty && (
                <div className="difficulty-selector">
                    <button onClick={() => selectDifficulty("easy")}>
                        Easy
                    </button>
                    <button onClick={() => selectDifficulty("hard")}>
                        Hard
                    </button>
                    <button onClick={() => leaveRoom(false)}>Cancel</button>
                </div>
            )}

            {difficulty && (
                <>
                    <div className="board">
                        {board.map((value, index) => (
                            <Square
                                key={index}
                                value={value}
                                onSquareClick={() => handlePlayerClick(index)}
                            />
                        ))}
                    </div>
                    <div className="game-controls">
                        <button className="control-button" onClick={changeMode}>
                            Ganti Mode
                        </button>
                        <button
                            className="control-button leave-button"
                            onClick={() => leaveRoom(true)}>
                            Keluar
                        </button>
                    </div>
                </>
            )}
        </main>
    );
}
