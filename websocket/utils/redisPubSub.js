// utils/redisPubSub.js

const { createClient } = require('redis');
const logger = require('./logger');

let ioInstance;

// Socket.IO 인스턴스를 설정하는 함수
const setIO = (io) => {
    ioInstance = io;
    logger.info('IO 인스턴스 설정 완료.');
};

// 추가적인 Redis 구독을 설정하는 함수
const connectRedis = async () => {
    try {
        // 별도의 Redis 클라이언트를 생성하여 구독 용도로 사용
        const customSubscriber = createClient({ url: process.env.REDIS_URI });

        customSubscriber.on('error', (err) => logger.error('Custom Subscriber Error', err));

        await customSubscriber.connect();
        logger.info('Custom Redis Subscriber Connected');

        // Redis 채널 구독 설정
        await customSubscriber.subscribe('room:created', (message) => {
            const roomData = JSON.parse(message);
            if (ioInstance) {
                ioInstance.to('room-list').emit('roomCreated', roomData);
                logger.info('roomCreated 이벤트 전송:', roomData);
            }
        });

        await customSubscriber.subscribe('room:join', (message) => {
            const roomData = JSON.parse(message);
            if (ioInstance) {
                ioInstance.to(roomData.roomId).emit('roomUpdate', roomData);
                logger.info('roomUpdate 이벤트 전송:', roomData);
            }
        });

        logger.info('Custom Redis Subscribers 설정 완료.');

    } catch (error) {
        logger.error('Error in connectRedis:', error);
        throw error;
    }
};

module.exports = { connectRedis, setIO };
