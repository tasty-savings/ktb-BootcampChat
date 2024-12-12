// mongoWorker.js
const amqp = require('amqplib');
const mongoose = require('mongoose');
const { rabbitMQUrl, rabbitMQQueue } = require('./config/keys');
const logger = require('./utils/logger');
const Message = require('./models/Message');

const connectMongoDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        logger.info('MongoDB에 연결되었습니다.');
    } catch (error) {
        logger.error('MongoDB 연결 오류:', error);
        process.exit(1);
    }
};

const processMessage = async (msg, channel) => {
    if (msg === null) {
        return;
    }
    console.log(msg.toString());
    try {
        const messageContent = msg.content.toString();
        const message = JSON.parse(messageContent);
        console.log(message.action)

        switch (message.action) {
            case 'chatMessage':
                await saveChatMessage(message.data);
                break;
            case 'markMessagesAsRead':
                await handleMarkMessagesAsRead(message.data);
                break;
            case 'messageReaction':
                await handleMessageReaction(message.data);
                break;
            default:
                logger.warn('알 수 없는 액션:', message.action);
        }

        // 메시지 처리 완료 후 ACK 전송
        channel.ack(msg);
    } catch (error) {
        logger.error('메시지 처리 오류:', error);
        // 재시도 또는 데드 레터 큐로 이동할 수 있음
        channel.nack(msg, false, false); // 메시지 거부 및 폐기
    }
};

const saveChatMessage = async (data) => {
    const { room, type, content, fileData, sender, timestamp, _id } = data;
    console.log("sender: " , sender);
    const message = new Message({
        _id,
        room,
        sender: sender,
        type,
        content,
        timestamp,
        reactions: {},
        ...(fileData && { file: fileData._id })
    });

    await message.save();
    logger.info('메시지가 MongoDB에 저장되었습니다:', {
        messageId: message._id,
        room,
        sender: sender
    });
}

const handleMarkMessagesAsRead = async (data) => {
    const { roomId, userId, messageIds, timestamp } = data;

    if (!roomId || !userId || !Array.isArray(messageIds)) {
        throw new Error('유효하지 않은 데이터');
    }

    // 읽음 상태 업데이트
    const result = await Message.updateMany(
        {
            _id: { $in: messageIds },
            room: roomId,
            'readers.userId': { $ne: userId }
        },
        {
            $push: {
                readers: {
                    userId,
                    readAt: timestamp
                }
            }
        }
    );

    logger.info('메시지 읽음 상태 업데이트됨:', {
        userId,
        roomId,
        updatedCount: result.nModified
    });
};

const handleMessageReaction = async (data) => {
    const { messageId, reaction, type, userId, timestamp } = data;

    if (!messageId || !reaction || !type || !userId) {
        throw new Error('유효하지 않은 데이터');
    }

    const message = await Message.findById(messageId);
    if (!message) {
        throw new Error('메시지를 찾을 수 없습니다.');
    }

    if (type === 'add') {
        await message.addReaction(reaction, userId);
    } else if (type === 'remove') {
        await message.removeReaction(reaction, userId);
    } else {
        throw new Error('알 수 없는 리액션 타입');
    }

    await message.save();

    logger.info('메시지 리액션 업데이트됨:', {
        messageId,
        reaction,
        type,
        userId
    });

};


const startWorker = async () => {
    await connectMongoDB();

    try {
        const connection = await amqp.connect(rabbitMQUrl);
        const channel = await connection.createChannel();
        await channel.assertQueue(rabbitMQQueue, { durable: true });
        channel.prefetch(1);
        logger.info('Worker가 대기 중입니다:', rabbitMQQueue);

        channel.consume(rabbitMQQueue, (msg) => processMessage(msg, channel), { noAck: false });
    } catch (error) {
        logger.error('Worker 연결 오류:', error);
        process.exit(1);
    }
};

startWorker();
