// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const chatHandler = require('./chat'); // Socket 이벤트 핸들러 파일 경로
const logger = require('./utils/logger'); // Winston 로깅 설정 파일 경로 (옵션)
const { connectRedis, setIO } = require('./utils/redisPubSub'); // Redis Pub/Sub 모듈

const app = express();

const SOCKET_PORT = process.env.SOCKET_PORT || 3001;

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

// server.js (server 초기화 코드 상단 또는 하단에 추가)

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // 필요한 경우 프로세스를 종료하거나, 재시작 로직을 추가
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception thrown:', err);
    // 필요한 경우 프로세스를 종료하거나, 재시작 로직을 추가
});


// Redis 클라이언트 생성
const pubClient = createClient({ url: process.env.REDIS_URI });
const subClient = pubClient.duplicate();

// Redis 클라이언트 에러 핸들링
pubClient.on('error', (err) => logger.error('Redis Pub Client Error', err));
subClient.on('error', (err) => logger.error('Redis Sub Client Error', err));

// 비동기 IIFE를 사용하여 서버 초기화
(async () => {
    try {
        // Redis 클라이언트 연결
        await pubClient.connect();
        await subClient.connect();
        logger.info('Redis Clients Connected');

        // Socket.IO Redis 어댑터 설정
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured.');

        // Socket 핸들러 초기화
        chatHandler(io);

        // Redis Pub/Sub 모듈에 Socket.IO 인스턴스 전달
        setIO(io);
        await connectRedis(); // 별도의 Redis 클라이언트를 사용하므로 pubClient와 subClient를 전달하지 않음

        // MongoDB 연결
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        logger.info('MongoDB Connected');

        // 소켓 서버 시작
        server.listen(SOCKET_PORT, '0.0.0.0', () => {
            logger.info(`Socket Server running on port ${SOCKET_PORT}`);
        });

    } catch (err) {
        logger.error('Server startup error:', err);
        process.exit(1);
    }
})();
