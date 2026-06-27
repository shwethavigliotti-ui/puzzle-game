const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const games = new Map();
const SECRET = "NEONFROST";
const FAKE_TEXT = "Не читерить! Собери пазл сначала!";

exports.handler = async (event, context) => {
    const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
    const method = event.httpMethod;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // POST /new-game
    if (path === '/new-game' && method === 'POST') {
        const gameId = uuidv4();
        const board = Array.from({length: 16}, (_, i) => i);
        let emptyPos = 15;
        let prevPos = -1;
        
        for (let i = 0; i < 200; i++) {
            const neighbors = getNeighbors(emptyPos);
            const valid = neighbors.filter(n => n !== prevPos);
            const nextPos = valid[Math.floor(Math.random() * valid.length)];
            [board[emptyPos], board[nextPos]] = [board[nextPos], board[emptyPos]];
            prevPos = emptyPos;
            emptyPos = nextPos;
        }
        
        const rotations = board.map(() => Math.floor(Math.random() * 4));
        
        games.set(gameId, {
            board,
            rotations,
            moves: 0,
            solved: false,
            createdAt: Date.now(),
            qrVersion: 0 // Версия QR для инвалидации кеша
        });
        
        return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, board, rotations })
        };
    }

    // POST /move
    if (path === '/move' && method === 'POST') {
        const body = JSON.parse(event.body);
        const { gameId, index1, index2, isRotate } = body;
        const game = games.get(gameId);
        
        if (!game) {
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Game not found", won: false, solved: false })
            };
        }
        
        if (isRotate) {
            game.rotations[index1] = (game.rotations[index1] + 1) % 4;
        } else {
            [game.board[index1], game.board[index2]] = [game.board[index2], game.board[index1]];
        }
        game.moves++;
        
        const won = game.board.every((val, i) => val === i) && 
                    game.rotations.every(r => r === 0);
        
        if (won && !game.solved) {
            game.solved = true;
            game.qrVersion++; // Инкрементируем версию при победе — QR изменился
        }
        
        return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true, 
                won, 
                solved: game.solved, 
                moves: game.moves,
                qrVersion: game.qrVersion // Отдаём версию клиенту
            })
        };
    }

    // GET /qr/:gameId
    if (path.startsWith('/qr/') && method === 'GET') {
        const gameId = path.split('/')[2];
        const game = games.get(gameId);
        
        // БЕЗОПАСНОСТЬ: проверка только на сервере
        const text = (game && game.solved) ? SECRET : FAKE_TEXT;
        
        const qrBuffer = await QRCode.toBuffer(text, { 
            width: 320, 
            margin: 2,
            color: { dark: '#000', light: '#fff' }
        });
        
        return {
            statusCode: 200,
            headers: { 
                ...headers, 
                'Content-Type': 'image/png',
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: qrBuffer.toString('base64'),
            isBase64Encoded: true
        };
    }

    return { statusCode: 404, headers, body: 'Not found' };
};

function getNeighbors(index) {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const neighbors = [];
    if (row > 0) neighbors.push(index - 4);
    if (row < 3) neighbors.push(index + 4);
    if (col > 0) neighbors.push(index - 1);
    if (col < 3) neighbors.push(index + 1);
    return neighbors;
}