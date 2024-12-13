// rabbitPublisher.js
const amqp = require('amqplib');
const { rabbitMQUrl, rabbitMQQueue } = require('../config/keys');
const logger = require('./logger');

let channel, connection;

const connectRabbitMQ = async () => {
    try {
        console.log('Connecting to rabbitMQ...', rabbitMQUrl);
        connection = await amqp.connect(rabbitMQUrl);
        channel = await connection.createChannel();
        await channel.assertQueue(rabbitMQQueue, { durable: true });
        logger.info('Connected to RabbitMQ');
    } catch (error) {
        logger.error('RabbitMQ connection error:', error);
        setTimeout(connectRabbitMQ, 5000); // Retry after 5 seconds
    }
};


// Function to publish messages
const publishToQueue = async (message) => {
    if (!channel) {
        logger.error('RabbitMQ channel is not established');
        return;
    }
    const msgBuffer = Buffer.from(JSON.stringify(message));
    channel.sendToQueue(rabbitMQQueue, msgBuffer, { persistent: true });
    logger.debug('Message published to queue', { message });
};

module.exports = {
    publishToQueue,
    connectRabbitMQ
};
