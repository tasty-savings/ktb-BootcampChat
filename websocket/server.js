// require('dotenv').config();
// const http = require('http');
// const socketIO = require('socket.io');
// const { initializeSocket } = require('./route/api/rooms'); // 필요하다면 경로 조정
// const chatHandler = require('./chat');
// const mongoose = require("mongoose"); // 기존 소켓 로직
// const { connectRedis, setIO } = require('./utils/redisPubSub'); // 경로 조정 필요
//
//
// const SOCKET_PORT = process.env.SOCKET_PORT || 3001;
// const server = http.createServer();
// const io = socketIO(server, {
//     cors: {
//         origin: [
//             'https://bootcampchat-fe.run.goorm.site',
//             'http://localhost:3000',
//             'https://localhost:3000',
//             'http://0.0.0.0:3000',
//             'https://0.0.0.0:3000'
//         ],
//         credentials: true
//     }
// });
//
// chatHandler(io);
// initializeSocket(io);
//
// setIO(io);
//
// mongoose.connect(process.env.MONGO_URI)
//     .then(() => {
//         console.log('MongoDB Connected');
//         // app.listen(PORT, '0.0.0.0', () => {
//         //     console.log(`API Server running on port ${PORT}`);
//         //     console.log('Environment:', process.env.NODE_ENV);
//         //     console.log('API Base URL:', `http://0.0.0.0:${PORT}/api`);
//         // });
//     })
//     .catch(err => {
//         console.error('Server startup error:', err);
//         process.exit(1);
//     });
// await connectRedis();
//
// server.listen(SOCKET_PORT, '0.0.0.0', () => {
//     console.log(`Socket Server running on port ${SOCKET_PORT}`);
// });

// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const { connectRedis, setIO } = require('./utils/redisPubSub');
// const { initializeSocket } = require('./route/api/rooms');
const chatHandler = require('./chat');

const app = express();

// Express 미들웨어 및 라우터 설정
// app.use(express.json());
// app.use('/api/rooms', require('./route/api/rooms').router); // API 라우터 설정

const SOCKET_PORT = process.env.SOCKET_PORT || 3001;
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
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

// Socket 핸들러 초기화
chatHandler(io);
// initializeSocket(io);

// Redis Pub/Sub에 Socket.IO 인스턴스 설정
setIO(io);

// 비동기 IIFE를 사용하여 서버 초기화
(async () => {
    try {
        // MongoDB 연결
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connected');

        // Redis 연결
        await connectRedis();
        console.log('Redis Connected');

        // 소켓 서버 시작
        server.listen(SOCKET_PORT, '0.0.0.0', () => {
            console.log(`Socket Server running on port ${SOCKET_PORT}`);
        });

        // API 서버 시작
        // app.listen(PORT, '0.0.0.0', () => {
        //     console.log(`API Server running on port ${PORT}`);
        //     console.log('Environment:', process.env.NODE_ENV);
        //     console.log('API Base URL:', `http://0.0.0.0:${PORT}/api`);
        // });
    } catch (err) {
        console.error('Server startup error:', err);
        process.exit(1);
    }
})();
