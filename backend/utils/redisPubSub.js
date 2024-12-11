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




module.exports = { connectRedis, publish, subscribe};
