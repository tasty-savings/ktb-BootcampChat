require('dotenv').config();
const http = require('http');
const socketIO = require('socket.io');
const { initializeSocket } = require('./route/api/rooms'); // 필요하다면 경로 조정
const chatHandler = require('./chat');
const mongoose = require("mongoose"); // 기존 소켓 로직

const SOCKET_PORT = process.env.SOCKET_PORT || 3001;
const server = http.createServer();
const io = socketIO(server, {
    cors: {
        origin: [
            'https://bootcampchat-fe.run.goorm.site',
            'http://localhost:3000',
            'https://localhost:3000',
            'http://0.0.0.0:3000',
            'https://0.0.0.0:3000'
        ],
        credentials: true
    }
});

chatHandler(io);
initializeSocket(io);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected');
        // app.listen(PORT, '0.0.0.0', () => {
        //     console.log(`API Server running on port ${PORT}`);
        //     console.log('Environment:', process.env.NODE_ENV);
        //     console.log('API Base URL:', `http://0.0.0.0:${PORT}/api`);
        // });
    })
    .catch(err => {
        console.error('Server startup error:', err);
        process.exit(1);
    });

server.listen(SOCKET_PORT, '0.0.0.0', () => {
    console.log(`Socket Server running on port ${SOCKET_PORT}`);
});
