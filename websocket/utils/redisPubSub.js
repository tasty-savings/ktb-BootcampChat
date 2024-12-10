// redisPubSub.js
const { createClient } = require('redis');

const publisher = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });

publisher.on('error', (err) => console.error('Redis Publisher Error', err));
subscriber.on('error', (err) => console.error('Redis Subscriber Error', err));

const connectRedis = async () => {
    await publisher.connect();
    await subscriber.connect();
};

const publish = async (channel, message) => {
    await publisher.publish(channel, message);
};

const subscribe = (channel, callback) => {
    subscriber.subscribe(channel, (message) => {
        callback(message);
    });
};

let ioInstance;


const setIO = (io) => {
    ioInstance = io;

    // 예시: 'room:created' 채널 구독
    subscribe('room:created', (message) => {
        const roomData = JSON.parse(message);
        ioInstance.to('room-list').emit('roomCreated', roomData);
    });

    // 예시: 'room:join' 채널 구독
    subscribe('room:join', (message) => {
        const roomData = JSON.parse(message);
        ioInstance.to(roomData.roomId).emit('roomUpdate', roomData);
    });

    // 필요에 따라 추가 구독 설정
};

module.exports = { connectRedis, publish, subscribe, setIO };
