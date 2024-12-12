// // chat.js
// const Message = require('./models/Message');
// const Room = require('./models/Room');
// const User = require('./models/User');
// const File = require('./models/File');
// const jwt = require('jsonwebtoken');
// const { jwtSecret } = require('./config/keys');
// const redisClient = require('./utils/redisClient');
// const SessionService = require('./services/sessionService');
// const aiService = require('./services/aiService');
//
// module.exports = function(io) {
//   const connectedUsers = new Map();                       // 사용자 ID를 소켓 ID로 매핑
//   const streamingSessions = new Map();                    // 활성 스트리밍 세션 관리
//   const userRooms = new Map();                            // 사용자 ID를 방 ID로 매핑
//   const messageQueues = new Map();                        // 메시지 로드 큐 관리
//   const messageLoadRetries = new Map();                   // 메시지 로드 재시도 횟수 관리
//
//   const BATCH_SIZE = 30;  // 한 번에 로드할 메시지 수
//   const LOAD_DELAY = 300; // 메시지 로드 딜레이 (ms)
//   const MAX_RETRIES = 3;  // 최대 재시도 횟수
//   const MESSAGE_LOAD_TIMEOUT = 10000; // 메시지 로드 타임아웃 (10초)
//   const RETRY_DELAY = 2000; // 재시도 간격 (2초)
//   const DUPLICATE_LOGIN_TIMEOUT = 10000; // 중복 로그인 타임아웃 (10초)
//
//   // 로깅 유틸리티 함수
//   const logDebug = (action, data) => {
//     console.debug(`[Socket.IO] ${action}:`, {
//       ...data,
//       timestamp: new Date().toISOString()
//     });
//   };
//
//   // 메시지 일괄 로드 함수 개선
//   const loadMessages = async (socket, roomId, before, limit = BATCH_SIZE) => {
//     const timeoutPromise = new Promise((_, reject) => {
//       setTimeout(() => {
//         reject(new Error('Message loading timed out'));
//       }, MESSAGE_LOAD_TIMEOUT);
//     });
//
//     try {
//       // 쿼리 구성
//       const query = { room: roomId };
//       if (before) {
//         query.timestamp = { $lt: new Date(before) };
//       }
//
//       // 메시지 로드 with profileImage
//       const messages = await Promise.race([
//         Message.find(query)
//             .populate('sender', 'name email profileImage')
//             .populate({
//               path: 'file',
//               select: 'filename originalname mimetype size'
//             })
//             .sort({ timestamp: -1 })
//             .limit(limit + 1)
//             .lean(),
//         timeoutPromise
//       ]);
//
//       // 결과 처리
//       const hasMore = messages.length > limit;
//       const resultMessages = messages.slice(0, limit);
//       const sortedMessages = resultMessages.sort((a, b) =>
//           new Date(a.timestamp) - new Date(b.timestamp)
//       );
//
//       // 읽음 상태 비동기 업데이트
//       if (sortedMessages.length > 0 && socket.user) {
//         const messageIds = sortedMessages.map(msg => msg._id);
//         Message.updateMany(
//             {
//               _id: { $in: messageIds },
//               'readers.userId': { $ne: socket.user.id }
//             },
//             {
//               $push: {
//                 readers: {
//                   userId: socket.user.id,
//                   readAt: new Date()
//                 }
//               }
//             }
//         ).exec().catch(error => {
//           console.error('Read status update error:', error);
//         });
//       }
//
//       return {
//         messages: sortedMessages,
//         hasMore,
//         oldestTimestamp: sortedMessages[0]?.timestamp || null
//       };
//     } catch (error) {
//       if (error.message === 'Message loading timed out') {
//         logDebug('message load timeout', {
//           roomId,
//           before,
//           limit
//         });
//       } else {
//         console.error('Load messages error:', {
//           error: error.message,
//           stack: error.stack,
//           roomId,
//           before,
//           limit
//         });
//       }
//       throw error;
//     }
//   };
//
//   // 재시도 로직을 포함한 메시지 로드 함수
//   const loadMessagesWithRetry = async (socket, roomId, before, retryCount = 0) => {
//     const retryKey = `${roomId}:${socket.user.id}`;
//
//     try {
//       if (messageLoadRetries.get(retryKey) >= MAX_RETRIES) {
//         throw new Error('최대 재시도 횟수를 초과했습니다.');
//       }
//
//       const result = await loadMessages(socket, roomId, before);
//       messageLoadRetries.delete(retryKey);
//       return result;
//
//     } catch (error) {
//       const currentRetries = messageLoadRetries.get(retryKey) || 0;
//
//       if (currentRetries < MAX_RETRIES) {
//         messageLoadRetries.set(retryKey, currentRetries + 1);
//         const delay = Math.min(RETRY_DELAY * Math.pow(2, currentRetries), 10000);
//
//         logDebug('retrying message load', {
//           roomId,
//           retryCount: currentRetries + 1,
//           delay
//         });
//
//         await new Promise(resolve => setTimeout(resolve, delay));
//         return loadMessagesWithRetry(socket, roomId, before, currentRetries + 1);
//       }
//
//       messageLoadRetries.delete(retryKey);
//       throw error;
//     }
//   };
//
//   // 중복 로그인 처리 함수
//   const handleDuplicateLogin = async (existingSocket, newSocket) => {
//     try {
//       // 기존 연결에 중복 로그인 알림
//       existingSocket.emit('duplicate_login', {
//         type: 'new_login_attempt',
//         deviceInfo: newSocket.handshake.headers['user-agent'],
//         ipAddress: newSocket.handshake.address,
//         timestamp: Date.now()
//       });
//
//       // 타임아웃 설정
//       return new Promise((resolve) => {
//         setTimeout(async () => {
//           try {
//             // 기존 세션 종료
//             existingSocket.emit('session_ended', {
//               reason: 'duplicate_login',
//               message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.'
//             });
//
//             // 기존 연결 종료
//             existingSocket.disconnect(true);
//             resolve();
//           } catch (error) {
//             console.error('Error during session termination:', error);
//             resolve();
//           }
//         }, DUPLICATE_LOGIN_TIMEOUT);
//       });
//     } catch (error) {
//       console.error('Duplicate login handling error:', error);
//       throw error;
//     }
//   };
//
//   // 미들웨어: 소켓 연결 시 인증 처리
//   io.use(async (socket, next) => {
//     try {
//       const token = socket.handshake.auth.token;
//       const sessionId = socket.handshake.auth.sessionId;
//
//       // 로그
//       console.log(token);
//       console.log(sessionId);
//
//       if (!token || !sessionId) {
//         return next(new Error('Authentication error'));
//       }
//
//       const decoded = jwt.verify(token, jwtSecret);
//       if (!decoded?.user?.id) {
//         return next(new Error('Invalid token'));
//       }
//
//       // 이미 연결된 사용자인지 확인
//       const existingSocketId = connectedUsers.get(decoded.user.id);
//       if (existingSocketId) {
//         const existingSocket = io.sockets.sockets.get(existingSocketId);
//         if (existingSocket) {
//           // 중복 로그인 처리
//           await handleDuplicateLogin(existingSocket, socket);
//         }
//       }
//
//       const validationResult = await SessionService.validateSession(decoded.user.id, sessionId);
//       if (!validationResult.isValid) {
//         console.error('Session validation failed:', validationResult);
//         return next(new Error(validationResult.message || 'Invalid session'));
//       }
//
//       const user = await User.findById(decoded.user.id);
//       if (!user) {
//         return next(new Error('User not found'));
//       }
//
//       socket.user = {
//         id: user._id.toString(),
//         name: user.name,
//         email: user.email,
//         sessionId: sessionId,
//         profileImage: user.profileImage
//       };
//
//       await SessionService.updateLastActivity(decoded.user.id);
//       next();
//
//     } catch (error) {
//       console.error('Socket authentication error:', error);
//
//       if (error.name === 'TokenExpiredError') {
//         return next(new Error('Token expired'));
//       }
//
//       if (error.name === 'JsonWebTokenError') {
//         return next(new Error('Invalid token'));
//       }
//
//       next(new Error('Authentication failed'));
//     }
//   });
//
//   io.on('connection', (socket) => {
//     logDebug('socket connected', {
//       socketId: socket.id,
//       userId: socket.user?.id,
//       userName: socket.user?.name
//     });
//
//     if (socket.user) {
//       // 이전 연결이 있는지 확인
//       const previousSocketId = connectedUsers.get(socket.user.id);
//       if (previousSocketId && previousSocketId !== socket.id) {
//         const previousSocket = io.sockets.sockets.get(previousSocketId);
//         if (previousSocket) {
//           // 이전 연결에 중복 로그인 알림
//           previousSocket.emit('duplicate_login', {
//             type: 'new_login_attempt',
//             deviceInfo: socket.handshake.headers['user-agent'],
//             ipAddress: socket.handshake.address,
//             timestamp: Date.now()
//           });
//
//           // 이전 연결 종료 처리
//           setTimeout(() => {
//             previousSocket.emit('session_ended', {
//               reason: 'duplicate_login',
//               message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.'
//             });
//             previousSocket.disconnect(true);
//           }, DUPLICATE_LOGIN_TIMEOUT);
//         }
//       }
//
//       // 새로운 연결 정보 저장
//       connectedUsers.set(socket.user.id, socket.id);
//     }
//
//     // 이전 메시지 로딩 처리 개선
//     socket.on('fetchPreviousMessages', async ({ roomId, before }) => {
//       const queueKey = `${roomId}:${socket.user.id}`;
//
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         // 권한 체크
//         const room = await Room.findOne({
//           _id: roomId,
//           participants: socket.user.id
//         });
//
//         if (!room) {
//           throw new Error('채팅방 접근 권한이 없습니다.');
//         }
//
//         if (messageQueues.get(queueKey)) {
//           logDebug('message load skipped - already loading', {
//             roomId,
//             userId: socket.user.id
//           });
//           return;
//         }
//
//         messageQueues.set(queueKey, true);
//         socket.emit('messageLoadStart');
//
//         const result = await loadMessagesWithRetry(socket, roomId, before);
//
//         logDebug('previous messages loaded', {
//           roomId,
//           messageCount: result.messages.length,
//           hasMore: result.hasMore,
//           oldestTimestamp: result.oldestTimestamp
//         });
//
//         socket.emit('previousMessagesLoaded', result);
//
//       } catch (error) {
//         console.error('Fetch previous messages error:', error);
//         socket.emit('error', {
//           type: 'LOAD_ERROR',
//           message: error.message || '이전 메시지를 불러오는 중 오류가 발생했습니다.'
//         });
//       } finally {
//         setTimeout(() => {
//           messageQueues.delete(queueKey);
//         }, LOAD_DELAY);
//       }
//     });
//
//     // 채팅방 입장 처리 개선
//     socket.on('joinRoom', async (roomId) => {
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         // 이미 해당 방에 참여 중인지 확인
//         const currentRoom = userRooms.get(socket.user.id);
//         if (currentRoom === roomId) {
//           logDebug('already in room', {
//             userId: socket.user.id,
//             roomId
//           });
//           socket.emit('joinRoomSuccess', { roomId });
//           return;
//         }
//
//         // 기존 방에서 나가기
//         if (currentRoom) {
//           logDebug('leaving current room', {
//             userId: socket.user.id,
//             roomId: currentRoom
//           });
//           socket.leave(currentRoom);
//           userRooms.delete(socket.user.id);
//
//           socket.to(currentRoom).emit('userLeft', {
//             userId: socket.user.id,
//             name: socket.user.name
//           });
//         }
//
//         // 채팅방 참가 with profileImage
//         const room = await Room.findByIdAndUpdate(
//             roomId,
//             { $addToSet: { participants: socket.user.id } },
//             {
//               new: true,
//               runValidators: true
//             }
//         ).populate('participants', 'name email profileImage');
//
//         if (!room) {
//           throw new Error('채팅방을 찾을 수 없습니다.');
//         }
//
//         socket.join(roomId);
//         userRooms.set(socket.user.id, roomId);
//
//         // 입장 메시지 생성
//         const joinMessage = new Message({
//           room: roomId,
//           content: `${socket.user.name}님이 입장하였습니다.`,
//           type: 'system',
//           timestamp: new Date()
//         });
//
//         await joinMessage.save();
//
//         // 초기 메시지 로드
//         const messageLoadResult = await loadMessages(socket, roomId);
//         const { messages, hasMore, oldestTimestamp } = messageLoadResult;
//
//         // 활성 스트리밍 메시지 조회
//         const activeStreams = Array.from(streamingSessions.values())
//             .filter(session => session.room === roomId)
//             .map(session => ({
//               _id: session.messageId,
//               type: 'ai',
//               aiType: session.aiType,
//               content: session.content,
//               timestamp: session.timestamp,
//               isStreaming: true
//             }));
//
//         // 이벤트 발송
//         socket.emit('joinRoomSuccess', {
//           roomId,
//           participants: room.participants,
//           messages,
//           hasMore,
//           oldestTimestamp,
//           activeStreams
//         });
//
//         io.to(roomId).emit('message', joinMessage);
//         io.to(roomId).emit('participantsUpdate', room.participants);
//
//         logDebug('user joined room', {
//           userId: socket.user.id,
//           roomId,
//           messageCount: messages.length,
//           hasMore
//         });
//
//       } catch (error) {
//         console.error('Join room error:', error);
//         socket.emit('joinRoomError', {
//           message: error.message || '채팅방 입장에 실패했습니다.'
//         });
//       }
//     });
//
//     // 메시지 전송 처리
//     socket.on('chatMessage', async (messageData) => {
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         if (!messageData) {
//           throw new Error('메시지 데이터가 없습니다.');
//         }
//
//         const { room, type, content, fileData } = messageData;
//
//         if (!room) {
//           throw new Error('채팅방 정보가 없습니다.');
//         }
//
//         // 채팅방 권한 확인
//         const chatRoom = await Room.findOne({
//           _id: room,
//           participants: socket.user.id
//         });
//
//         if (!chatRoom) {
//           throw new Error('채팅방 접근 권한이 없습니다.');
//         }
//
//         // 세션 유효성 재확인
//         const sessionValidation = await SessionService.validateSession(
//             socket.user.id,
//             socket.user.sessionId
//         );
//
//         if (!sessionValidation.isValid) {
//           throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
//         }
//
//         // AI 멘션 확인
//         const aiMentions = extractAIMentions(content);
//         let message;
//
//         logDebug('message received', {
//           type,
//           room,
//           userId: socket.user.id,
//           hasFileData: !!fileData,
//           hasAIMentions: aiMentions.length
//         });
//
//         // 메시지 타입별 처리
//         switch (type) {
//           case 'file':
//             if (!fileData || !fileData._id) {
//               throw new Error('파일 데이터가 올바르지 않습니다.');
//             }
//
//             const file = await File.findOne({
//               _id: fileData._id,
//               user: socket.user.id
//             });
//
//             if (!file) {
//               throw new Error('파일을 찾을 수 없거나 접근 권한이 없습니다.');
//             }
//
//             message = new Message({
//               room,
//               sender: socket.user.id,
//               type: 'file',
//               file: file._id,
//               content: content || '',
//               timestamp: new Date(),
//               reactions: {},
//               metadata: {
//                 fileType: file.mimetype,
//                 fileSize: file.size,
//                 originalName: file.originalname
//               }
//             });
//             break;
//
//           case 'text':
//             const messageContent = content?.trim() || messageData.msg?.trim();
//             if (!messageContent) {
//               return;
//             }
//
//             message = new Message({
//               room,
//               sender: socket.user.id,
//               content: messageContent,
//               type: 'text',
//               timestamp: new Date(),
//               reactions: {}
//             });
//             break;
//
//           default:
//             throw new Error('지원하지 않는 메시지 타입입니다.');
//         }
//
//         await message.save();
//         await message.populate([
//           { path: 'sender', select: 'name email profileImage' },
//           { path: 'file', select: 'filename originalname mimetype size' }
//         ]);
//
//         io.to(room).emit('message', message);
//
//         // AI 멘션이 있는 경우 AI 응답 생성
//         if (aiMentions.length > 0) {
//           for (const ai of aiMentions) {
//             const query = content.replace(new RegExp(`@${ai}\\b`, 'g'), '').trim();
//             await handleAIResponse(io, room, ai, query);
//           }
//         }
//
//         await SessionService.updateLastActivity(socket.user.id);
//
//         logDebug('message processed', {
//           messageId: message._id,
//           type: message.type,
//           room
//         });
//
//       } catch (error) {
//         console.error('Message handling error:', error);
//         socket.emit('error', {
//           code: error.code || 'MESSAGE_ERROR',
//           message: error.message || '메시지 전송 중 오류가 발생했습니다.'
//         });
//       }
//     });
//
//     // 채팅방 퇴장 처리
//     socket.on('leaveRoom', async (roomId) => {
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         // 실제로 해당 방에 참여 중인지 먼저 확인
//         const currentRoom = userRooms?.get(socket.user.id);
//         if (!currentRoom || currentRoom !== roomId) {
//           console.log(`User ${socket.user.id} is not in room ${roomId}`);
//           return;
//         }
//
//         // 권한 확인
//         const room = await Room.findOne({
//           _id: roomId,
//           participants: socket.user.id
//         }).select('participants').lean();
//
//         if (!room) {
//           console.log(`Room ${roomId} not found or user has no access`);
//           return;
//         }
//
//         socket.leave(roomId);
//         userRooms.delete(socket.user.id);
//
//
//         // 퇴장 메시지 생성 및 저장
//         const leaveMessage = await Message.create({
//           room: roomId,
//           content: `${socket.user.name}님이 퇴장하였습니다.`,
//           type: 'system',
//           timestamp: new Date()
//         });
//
//         // 참가자 목록 업데이트 - profileImage 포함
//         const updatedRoom = await Room.findByIdAndUpdate(
//             roomId,
//             { $pull: { participants: socket.user.id } },
//             {
//               new: true,
//               runValidators: true
//             }
//         ).populate('participants', 'name email profileImage');
//
//         if (!updatedRoom) {
//           console.log(`Room ${roomId} not found during update`);
//           return;
//         }
//
//         // 스트리밍 세션 정리
//         for (const [messageId, session] of streamingSessions.entries()) {
//           if (session.room === roomId && session.userId === socket.user.id) {
//             streamingSessions.delete(messageId);
//           }
//         }
//
//         // 메시지 큐 정리
//         const queueKey = `${roomId}:${socket.user.id}`;
//         messageQueues.delete(queueKey);
//         messageLoadRetries.delete(queueKey);
//
//         // 이벤트 발송
//         io.to(roomId).emit('message', leaveMessage);
//         io.to(roomId).emit('participantsUpdate', updatedRoom.participants);
//
//         console.log(`User ${socket.user.id} left room ${roomId} successfully`);
//
//       } catch (error) {
//         console.error('Leave room error:', error);
//         socket.emit('error', {
//           message: error.message || '채팅방 퇴장 중 오류가 발생했습니다.'
//         });
//       }
//     });
//
//     // 연결 해제 처리
//     socket.on('disconnect', async (reason) => {
//       if (!socket.user) return;
//
//       try {
//         // 해당 사용자의 현재 활성 연결인 경우에만 정리
//         if (connectedUsers.get(socket.user.id) === socket.id) {
//           connectedUsers.delete(socket.user.id);
//         }
//
//         const roomId = userRooms.get(socket.user.id);
//         userRooms.delete(socket.user.id);
//
//         // 메시지 큐 정리
//         const userQueues = Array.from(messageQueues.keys())
//             .filter(key => key.endsWith(`:${socket.user.id}`));
//         userQueues.forEach(key => {
//           messageQueues.delete(key);
//           messageLoadRetries.delete(key);
//         });
//
//         // 스트리밍 세션 정리
//         for (const [messageId, session] of streamingSessions.entries()) {
//           if (session.userId === socket.user.id) {
//             streamingSessions.delete(messageId);
//           }
//         }
//
//         // 현재 방에서 자동 퇴장 처리
//         if (roomId) {
//           // 다른 디바이스로 인한 연결 종료가 아닌 경우에만 처리
//           if (reason !== 'client namespace disconnect' && reason !== 'duplicate_login') {
//             const leaveMessage = await Message.create({
//               room: roomId,
//               content: `${socket.user.name}님이 연결이 끊어졌습니다.`,
//               type: 'system',
//               timestamp: new Date()
//             });
//
//             const updatedRoom = await Room.findByIdAndUpdate(
//                 roomId,
//                 { $pull: { participants: socket.user.id } },
//                 {
//                   new: true,
//                   runValidators: true
//                 }
//             ).populate('participants', 'name email profileImage');
//
//             if (updatedRoom) {
//               io.to(roomId).emit('message', leaveMessage);
//               io.to(roomId).emit('participantsUpdate', updatedRoom.participants);
//             }
//           }
//         }
//
//         logDebug('user disconnected', {
//           reason,
//           userId: socket.user.id,
//           socketId: socket.id,
//           lastRoom: roomId
//         });
//
//       } catch (error) {
//         console.error('Disconnect handling error:', error);
//       }
//     });
//
//     // 세션 종료 또는 로그아웃 처리
//     socket.on('force_login', async ({ token }) => {
//       try {
//         if (!socket.user) return;
//
//         // 강제 로그아웃을 요청한 클라이언트의 세션 정보 확인
//         const decoded = jwt.verify(token, jwtSecret);
//         if (!decoded?.user?.id || decoded.user.id !== socket.user.id) {
//           throw new Error('Invalid token');
//         }
//
//         // 세션 종료 처리
//         socket.emit('session_ended', {
//           reason: 'force_logout',
//           message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.'
//         });
//
//         // 연결 종료
//         socket.disconnect(true);
//
//       } catch (error) {
//         console.error('Force login error:', error);
//         socket.emit('error', {
//           message: '세션 종료 중 오류가 발생했습니다.'
//         });
//       }
//     });
//
//     // 메시지 읽음 상태 처리
//     socket.on('markMessagesAsRead', async ({ roomId, messageIds }) => {
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         if (!Array.isArray(messageIds) || messageIds.length === 0) {
//           return;
//         }
//
//         // 읽음 상태 업데이트
//         await Message.updateMany(
//             {
//               _id: { $in: messageIds },
//               room: roomId,
//               'readers.userId': { $ne: socket.user.id }
//             },
//             {
//               $push: {
//                 readers: {
//                   userId: socket.user.id,
//                   readAt: new Date()
//                 }
//               }
//             }
//         );
//
//         socket.to(roomId).emit('messagesRead', {
//           userId: socket.user.id,
//           messageIds
//         });
//
//       } catch (error) {
//         console.error('Mark messages as read error:', error);
//         socket.emit('error', {
//           message: '읽음 상태 업데이트 중 오류가 발생했습니다.'
//         });
//       }
//     });
//
//     // 리액션 처리
//     socket.on('messageReaction', async ({ messageId, reaction, type }) => {
//       try {
//         if (!socket.user) {
//           throw new Error('Unauthorized');
//         }
//
//         const message = await Message.findById(messageId);
//         if (!message) {
//           throw new Error('메시지를 찾을 수 없습니다.');
//         }
//
//         // 리액션 추가/제거
//         if (type === 'add') {
//           await message.addReaction(reaction, socket.user.id);
//         } else if (type === 'remove') {
//           await message.removeReaction(reaction, socket.user.id);
//         }
//
//         // 업데이트된 리액션 정보 브로드캐스트
//         io.to(message.room).emit('messageReactionUpdate', {
//           messageId,
//           reactions: message.reactions
//         });
//
//       } catch (error) {
//         console.error('Message reaction error:', error);
//         socket.emit('error', {
//           message: error.message || '리액션 처리 중 오류가 발생했습니다.'
//         });
//       }
//     });
//   });
//
//   // AI 멘션 추출 함수
//   function extractAIMentions(content) {
//     if (!content) return [];
//
//     const aiTypes = ['wayneAI', 'consultingAI'];
//     const mentions = new Set();
//     const mentionRegex = /@(wayneAI|consultingAI)\b/g;
//     let match;
//
//     while ((match = mentionRegex.exec(content)) !== null) {
//       if (aiTypes.includes(match[1])) {
//         mentions.add(match[1]);
//       }
//     }
//
//     return Array.from(mentions);
//   }
//
//   // AI 응답 처리 함수 개선
//   async function handleAIResponse(io, room, aiName, query) {
//     const messageId = `${aiName}-${Date.now()}`;
//     let accumulatedContent = '';
//     const timestamp = new Date();
//
//     // 스트리밍 세션 초기화
//     streamingSessions.set(messageId, {
//       room,
//       aiType: aiName,
//       content: '',
//       messageId,
//       timestamp,
//       lastUpdate: Date.now(),
//       reactions: {}
//     });
//
//     logDebug('AI response started', {
//       messageId,
//       aiType: aiName,
//       room,
//       query
//     });
//
//     // 초기 상태 전송
//     io.to(room).emit('aiMessageStart', {
//       messageId,
//       aiType: aiName,
//       timestamp
//     });
//
//     try {
//       // AI 응답 생성 및 스트리밍
//       await aiService.generateResponse(query, aiName, {
//         onStart: () => {
//           logDebug('AI generation started', {
//             messageId,
//             aiType: aiName
//           });
//         },
//         onChunk: async (chunk) => {
//           accumulatedContent += chunk.currentChunk || '';
//
//           const session = streamingSessions.get(messageId);
//           if (session) {
//             session.content = accumulatedContent;
//             session.lastUpdate = Date.now();
//           }
//
//           io.to(room).emit('aiMessageChunk', {
//             messageId,
//             currentChunk: chunk.currentChunk,
//             fullContent: accumulatedContent,
//             isCodeBlock: chunk.isCodeBlock,
//             timestamp: new Date(),
//             aiType: aiName,
//             isComplete: false
//           });
//         },
//         onComplete: async (finalContent) => {
//           // 스트리밍 세션 정리
//           streamingSessions.delete(messageId);
//
//           // AI 메시지 저장
//           const aiMessage = await Message.create({
//             room,
//             content: finalContent.content,
//             type: 'ai',
//             aiType: aiName,
//             timestamp: new Date(),
//             reactions: {},
//             metadata: {
//               query,
//               generationTime: Date.now() - timestamp,
//               completionTokens: finalContent.completionTokens,
//               totalTokens: finalContent.totalTokens
//             }
//           });
//
//           // 완료 메시지 전송
//           io.to(room).emit('aiMessageComplete', {
//             messageId,
//             _id: aiMessage._id,
//             content: finalContent.content,
//             aiType: aiName,
//             timestamp: new Date(),
//             isComplete: true,
//             query,
//             reactions: {}
//           });
//
//           logDebug('AI response completed', {
//             messageId,
//             aiType: aiName,
//             contentLength: finalContent.content.length,
//             generationTime: Date.now() - timestamp
//           });
//         },
//         onError: (error) => {
//           streamingSessions.delete(messageId);
//           console.error('AI response error:', error);
//
//           io.to(room).emit('aiMessageError', {
//             messageId,
//             error: error.message || 'AI 응답 생성 중 오류가 발생했습니다.',
//             aiType: aiName
//           });
//
//           logDebug('AI response error', {
//             messageId,
//             aiType: aiName,
//             error: error.message
//           });
//         }
//       });
//     } catch (error) {
//       streamingSessions.delete(messageId);
//       console.error('AI services error:', error);
//
//       io.to(room).emit('aiMessageError', {
//         messageId,
//         error: error.message || 'AI 서비스 오류가 발생했습니다.',
//         aiType: aiName
//       });
//
//       logDebug('AI services error', {
//         messageId,
//         aiType: aiName,
//         error: error.message
//       });
//     }
//   }
//
//   return io;
// };

// chat.js
const Message = require('./models/Message');
const Room = require('./models/Room');
const User = require('./models/User');
const File = require('./models/File');
const jwt = require('jsonwebtoken');
const {jwtSecret} = require('./config/keys');
const redisClient = require('./utils/redisClient');
const SessionService = require('./services/sessionService');
const aiService = require('./services/aiService');
const logger = require('./utils/logger');

const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 초기 재시도 지연 (ms)
const DUPLICATE_LOGIN_TIMEOUT = 3000; // 중복 로그인 타임아웃 (ms)
const LOAD_DELAY = 500; // 메시지 로드 딜레이 (ms)
const MESSAGE_LOAD_TIMEOUT = 5000; // 메시지 로드 타임아웃 (ms)
const BATCH_SIZE = 20;

// 레디스 키 프리픽스 설정
const CONNECTED_USERS_PREFIX = 'connected_users:';
const USER_ROOMS_PREFIX = 'user_rooms:';
const MESSAGE_QUEUES_PREFIX = 'message_queues:';
const MESSAGE_RETRIES_PREFIX = 'message_retries:';
const STREAMING_SESSIONS_PREFIX = 'streaming_sessions:';
const MESSAGES_CACHE_PREFIX = 'messages:';
const USERS_PREFIX = 'users:';
const ROOMS_PREFIX = 'rooms:';

// 레디스 함수 정의
const setConnectedUser = async (userId, socketId) => {
    await redisClient.set(CONNECTED_USERS_PREFIX + userId, socketId);
};

const removeConnectedUser = async (userId) => {
    await redisClient.del(CONNECTED_USERS_PREFIX + userId);
};

const getConnectedUserSocketId = async (userId) => {
    return await redisClient.get(CONNECTED_USERS_PREFIX + userId);
};

const setUserRoom = async (userId, roomId) => {
    await redisClient.set(USER_ROOMS_PREFIX + userId, roomId);
};

const getUserRoom = async (userId) => {
    return await redisClient.get(USER_ROOMS_PREFIX + userId);
};

const removeUserRoom = async (userId) => {
    await redisClient.del(USER_ROOMS_PREFIX + userId);
};

const setMessageQueue = async (roomId, userId) => {
    const ttlSeconds = Math.ceil(LOAD_DELAY / 1000); // 최소 1초
    await redisClient.set(`${MESSAGE_QUEUES_PREFIX}${roomId}:${userId}`, 'loading', {ttl: ttlSeconds});
};

const isMessageLoading = async (roomId, userId) => {
    return await redisClient.get(`${MESSAGE_QUEUES_PREFIX}${roomId}:${userId}`) !== null;
};

const removeMessageQueue = async (roomId, userId) => {
    await redisClient.del(`${MESSAGE_QUEUES_PREFIX}${roomId}:${userId}`);
};

const getMessageRetries = async (roomId, userId) => {
    const retries = await redisClient.get(`${MESSAGE_RETRIES_PREFIX}${roomId}:${userId}`);
    return retries ? parseInt(retries, 10) : 0;
};

const incrementMessageRetries = async (roomId, userId) => {
    const retries = await redisClient.set(`${MESSAGE_RETRIES_PREFIX}${roomId}:${userId}`, '1', {
        EX: MESSAGE_LOAD_TIMEOUT / 1000,
        NX: true
    });
    if (!retries) {
        // 이미 존재하는 경우 증가
        return await redisClient.incr(`${MESSAGE_RETRIES_PREFIX}${roomId}:${userId}`);
    }
    return 1;
};

const removeMessageRetries = async (roomId, userId) => {
    await redisClient.del(`${MESSAGE_RETRIES_PREFIX}${roomId}:${userId}`);
};

const setStreamingSession = async (messageId, sessionData) => {
    await redisClient.setEx(`${STREAMING_SESSIONS_PREFIX}${messageId}`, 3600, JSON.stringify(sessionData)); // TTL 1시간
};

const getStreamingSession = async (messageId) => {
    const data = await redisClient.get(`${STREAMING_SESSIONS_PREFIX}${messageId}`);
    return data ? JSON.parse(data) : null;
};

const removeStreamingSession = async (messageId) => {
    await redisClient.del(`${STREAMING_SESSIONS_PREFIX}${messageId}`);
};

const setMessagesCache = async (roomId, before, data) => {
    const cacheKey = `${MESSAGES_CACHE_PREFIX}${roomId}:${before || 'latest'}`;
    await redisClient.setEx(cacheKey, 60, JSON.stringify(data)); // TTL 60초
};

const getMessagesCache = async (roomId, before) => {
    const cacheKey = `${MESSAGES_CACHE_PREFIX}${roomId}:${before || 'latest'}`;
    const cached = await redisClient.get(cacheKey);
    return cached ? cached : null;
};

const getUserData = async (userId) => {
    const cacheKey = `${USERS_PREFIX}${userId}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    const user = await User.findById(userId).select('name email profileImage').lean();
    if (user) {
        await redisClient.setEx(cacheKey, 60, JSON.stringify(user)); // TTL 60초
    }
    return user;
};

const getRoomData = async (roomId) => {
    const cacheKey = `${ROOMS_PREFIX}${roomId}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    const room = await Room.findById(roomId).select('participants').populate('participants', 'name email profileImage').lean();
    if (room) {
        await redisClient.setEx(cacheKey, 60, JSON.stringify(room)); // TTL 60초
    }
    return room;
};

const invalidateRoomCache = async (roomId) => {
    await redisClient.del(`${ROOMS_PREFIX}${roomId}`);
};


// 메시지 로드 함수
const loadMessages = async (socket, roomId, before, limit = BATCH_SIZE) => {
    // 캐시에서 메시지 로드
    const cachedData = await getMessagesCache(roomId, before);
    if (cachedData) {
        logger.debug('messages loaded from cache', {roomId, before});
        return cachedData;
    }

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Message loading timed out'));
        }, MESSAGE_LOAD_TIMEOUT);
    });

    try {
        const query = {room: roomId};
        if (before) {
            query.timestamp = {$lt: new Date(before)};
        }

        const messages = await Promise.race([
            Message.find(query)
                .select('sender content type timestamp file')
                .populate('sender', 'name email profileImage')
                .populate({
                    path: 'file',
                    select: 'filename originalname mimetype size'
                })
                .sort({timestamp: -1})
                .limit(limit + 1)
                .lean(),
            timeoutPromise
        ]);

        const hasMore = messages.length > limit;
        const resultMessages = messages.slice(0, limit);
        const sortedMessages = resultMessages.sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        if (sortedMessages.length > 0 && socket.user) {
            const messageIds = sortedMessages.map(msg => msg._id);
            await Message.updateMany(
                {
                    _id: {$in: messageIds},
                    'readers.userId': {$ne: socket.user.id}
                },
                {
                    $push: {
                        readers: {
                            userId: socket.user.id,
                            readAt: new Date()
                        }
                    }
                }
            ).exec().catch(error => {
                logger.error('Read status update error:', error);
            });
        }

        const result = {
            messages: sortedMessages,
            hasMore,
            oldestTimestamp: sortedMessages[0]?.timestamp || null
        };

        // 메시지 캐시에 저장
        await setMessagesCache(roomId, before, result);

        return result;
    } catch (error) {
        if (error.message === 'Message loading timed out') {
            logger.debug('message load timeout', {
                roomId,
                before,
                limit
            });
        } else {
            logger.error('Load messages error:', {
                error: error.message,
                stack: error.stack,
                roomId,
                before,
                limit
            });
        }
        throw error;
    }
};

// 재시도 로직
const loadMessagesWithRetry = async (socket, roomId, before, retryCount = 0) => {
    const userId = socket.user.id;

    try {
        const currentRetries = await getMessageRetries(roomId, userId);
        if (currentRetries >= MAX_RETRIES) {
            throw new Error('최대 재시도 횟수를 초과했습니다.');
        }

        const result = await loadMessages(socket, roomId, before);
        await removeMessageRetries(roomId, userId);
        return result;

    } catch (error) {
        const currentRetries = await incrementMessageRetries(roomId, userId);

        if (currentRetries < MAX_RETRIES) {
            const delay = Math.min(RETRY_DELAY * Math.pow(2, currentRetries - 1), 10000);

            logger.debug('retrying message load', {
                roomId,
                retryCount: currentRetries,
                delay
            });

            await new Promise(resolve => setTimeout(resolve, delay));
            return loadMessagesWithRetry(socket, roomId, before, currentRetries);
        }

        await removeMessageRetries(roomId, userId);
        throw error;
    }
};

// 중복 로그인 처리 함수
const handleDuplicateLogin = async (existingSocket, newSocket) => {
    try {
        existingSocket.emit('duplicate_login', {
            type: 'new_login_attempt',
            deviceInfo: newSocket.handshake.headers['user-agent'],
            ipAddress: newSocket.handshake.address,
            timestamp: Date.now()
        });

        // 타임아웃 설정
        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    existingSocket.emit('session_ended', {
                        reason: 'duplicate_login',
                        message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.'
                    });

                    existingSocket.disconnect(true);
                    resolve();
                } catch (error) {
                    logger.error('Error during session termination:', error);
                    resolve();
                }
            }, DUPLICATE_LOGIN_TIMEOUT);
        });
    } catch (error) {
        logger.error('Duplicate login handling error:', error);
        throw error;
    }
};

// AI 멘션 추출 함수
function extractAIMentions(content) {
    if (!content) return [];

    const aiTypes = ['wayneAI', 'consultingAI'];
    const mentions = new Set();
    const mentionRegex = /@(wayneAI|consultingAI)\b/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        if (aiTypes.includes(match[1])) {
            mentions.add(match[1]);
        }
    }

    return Array.from(mentions);
}

// AI 응답 처리 함수
async function handleAIResponse(io, room, aiName, query, socket) {
    const messageId = `${aiName}-${Date.now()}`;
    let accumulatedContent = '';
    const timestamp = new Date();

    const sessionData = {
        room,
        aiType: aiName,
        content: '',
        messageId,
        timestamp,
        lastUpdate: Date.now(),
        reactions: {}
    };

    try {
        await setStreamingSession(messageId, sessionData);
    } catch (error) {
        io.to(room).emit('aiMessageError', {
            messageId,
            error: '스트리밍 세션을 설정할 수 없습니다.',
            aiType: aiName
        });
        logger.debug('AI streaming session setup error', {messageId, aiType: aiName, error: error.message});
        return;
    }

    logger.debug('AI response started', {
        messageId,
        aiType: aiName,
        room,
        query
    });

    io.to(room).emit('aiMessageStart', {
        messageId,
        aiType: aiName,
        timestamp
    });

    try {
        await aiService.generateResponse(query, aiName, {
            onStart: () => {
                logger.debug('AI generation started', {messageId, aiType: aiName});
            },
            onChunk: async (chunk) => {
                accumulatedContent += chunk.currentChunk || '';
                const session = await getStreamingSession(messageId);
                if (session) {
                    session.content = accumulatedContent;
                    session.lastUpdate = Date.now();
                    await setStreamingSession(messageId, session);
                }

                io.to(room).emit('aiMessageChunk', {
                    messageId,
                    currentChunk: chunk.currentChunk,
                    fullContent: accumulatedContent,
                    isCodeBlock: chunk.isCodeBlock,
                    timestamp: new Date(),
                    aiType: aiName,
                    isComplete: false
                });
            },
            onComplete: async (finalContent) => {
                await removeStreamingSession(messageId);

                const aiMessage = await Message.create({
                    room,
                    content: finalContent.content,
                    type: 'ai',
                    aiType: aiName,
                    timestamp: new Date(),
                    reactions: {},
                    metadata: {
                        query,
                        generationTime: Date.now() - timestamp,
                        completionTokens: finalContent.completionTokens,
                        totalTokens: finalContent.totalTokens
                    }
                });

                io.to(room).emit('aiMessageComplete', {
                    messageId,
                    _id: aiMessage._id,
                    content: finalContent.content,
                    aiType: aiName,
                    timestamp: new Date(),
                    isComplete: true,
                    query,
                    reactions: {}
                });

                logger.debug('AI response completed', {
                    messageId,
                    aiType: aiName,
                    contentLength: finalContent.content.length,
                    generationTime: Date.now() - timestamp
                });
            },
            onError: async (error) => {
                await removeStreamingSession(messageId);
                logger.error('AI response error:', error);

                io.to(room).emit('aiMessageError', {
                    messageId,
                    error: error.message || 'AI 응답 생성 중 오류가 발생했습니다.',
                    aiType: aiName
                });

                logger.debug('AI response error', {
                    messageId,
                    aiType: aiName,
                    error: error.message
                });
            }
        });
    } catch (error) {
        await removeStreamingSession(messageId);
        logger.error('AI services error:', error);

        io.to(room).emit('aiMessageError', {
            messageId,
            error: error.message || 'AI 서비스 오류가 발생했습니다.',
            aiType: aiName
        });

        logger.debug('AI services error', {
            messageId,
            aiType: aiName,
            error: error.message
        });
    }
}

// Socket.IO 이벤트 핸들러
module.exports = function (io) {
    // 인증 미들웨어 설정
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            const sessionId = socket.handshake.auth.sessionId;

            if (!token || !sessionId) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, jwtSecret);
            if (!decoded?.user?.id) {
                return next(new Error('Invalid token'));
            }

            // 사용자 데이터와 세션 검증을 병렬로 수행
            const [user, validationResult] = await Promise.all([
                getUserData(decoded.user.id),
                SessionService.validateSession(decoded.user.id, sessionId)
            ]);

            if (!user) {
                return next(new Error('User not found'));
            }

            if (!validationResult.isValid) {
                logger.error('Session validation failed:', validationResult);
                return next(new Error(validationResult.message || 'Invalid session'));
            }

            // 중복 로그인 처리
            const existingSocketId = await getConnectedUserSocketId(decoded.user.id);
            if (existingSocketId && existingSocketId !== socket.id) {
                const existingSocket = io.sockets.sockets.get(existingSocketId);
                if (existingSocket) {
                    await handleDuplicateLogin(existingSocket, socket);
                }
            }

            socket.user = {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                sessionId: sessionId,
                profileImage: user.profileImage
            };

            // 연결된 사용자 업데이트
            await setConnectedUser(socket.user.id, socket.id);
            await SessionService.updateLastActivity(decoded.user.id);
            next();

        } catch (error) {
            logger.error('Socket authentication error:', error);

            if (error.name === 'TokenExpiredError') {
                return next(new Error('Token expired'));
            }

            if (error.name === 'JsonWebTokenError') {
                return next(new Error('Invalid token'));
            }

            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        logger.debug('socket connected', {
            socketId: socket.id,
            userId: socket.user?.id,
            userName: socket.user?.name
        });

        if (socket.user) {
            // 이미 연결된 사용자 처리 (미들웨어에서 중복 로그인이 처리됨)
        }

        // 이전 메시지 로딩 처리
        socket.on('fetchPreviousMessages', async ({roomId, before}) => {
            const userId = socket.user.id;

            try {
                if (!socket.user) {
                    throw new Error('Unauthorized');
                }

                // 권한 체크
                const room = await getRoomData(roomId);
                if (!room || !room.participants.some(p => p._id.toString() === userId)) {
                    throw new Error('채팅방 접근 권한이 없습니다.');
                }

                const isLoading = await isMessageLoading(roomId, userId);
                if (isLoading) {
                    logger.debug('message load skipped - already loading', {
                        roomId,
                        userId
                    });
                    return;
                }

                await setMessageQueue(roomId, userId);
                socket.emit('messageLoadStart');

                const result = await loadMessagesWithRetry(socket, roomId, before);

                logger.debug('previous messages loaded', {
                    roomId,
                    messageCount: result.messages.length,
                    hasMore: result.hasMore,
                    oldestTimestamp: result.oldestTimestamp
                });

                socket.emit('previousMessagesLoaded', result);

            } catch (error) {
                logger.error('Fetch previous messages error:', error);
                socket.emit('error', {
                    type: 'LOAD_ERROR',
                    message: error.message || '이전 메시지를 불러오는 중 오류가 발생했습니다.'
                });
            } finally {
                // 메시지 로드 딜레이 후 큐 삭제
                setTimeout(async () => {
                    await removeMessageQueue(roomId, userId);
                }, LOAD_DELAY);
            }
        });

        // 채팅방 입장 처리
        socket.on('joinRoom', async (roomId) => {
            try {
                if (!socket.user) {
                    throw new Error('Unauthorized');
                }

                // 현재 방 가져오기
                const currentRoomId = await getUserRoom(socket.user.id);
                if (currentRoomId === roomId) {
                    logger.debug('already in room', {
                        userId: socket.user.id,
                        roomId
                    });
                    socket.emit('joinRoomSuccess', {roomId});
                    return;
                }

                // 기존 방에서 나가기
                if (currentRoomId) {
                    logger.debug('leaving current room', {
                        userId: socket.user.id,
                        roomId: currentRoomId
                    });
                    socket.leave(currentRoomId);
                    await removeUserRoom(socket.user.id);

                    socket.to(currentRoomId).emit('userLeft', {
                        userId: socket.user.id,
                        name: socket.user.name
                    });
                }

                // 채팅방 참가 with profileImage
                const room = await Room.findByIdAndUpdate(
                    roomId,
                    {$addToSet: {participants: socket.user.id}},
                    {
                        new: true,
                        runValidators: true
                    }
                ).populate('participants', 'name email profileImage').lean();

                if (!room) {
                    throw new Error('채팅방을 찾을 수 없습니다.');
                }

                // 레디스 캐시 무효화 및 설정
                await invalidateRoomCache(roomId);
                await redisClient.setEx(`${ROOMS_PREFIX}${roomId}`, 60, room);

                socket.join(roomId);
                await setUserRoom(socket.user.id, roomId);

                // 입장 메시지 생성
                const joinMessage = new Message({
                    room: roomId,
                    content: `${socket.user.name}님이 입장하였습니다.`,
                    type: 'system',
                    timestamp: new Date()
                });

                await joinMessage.save();

                // 초기 메시지 로드
                const messageLoadResult = await loadMessages(socket, roomId);
                const {messages, hasMore, oldestTimestamp} = messageLoadResult;

                // 활성 스트리밍 메시지 조회
                const activeStreamsKeys = await redisClient.client.keys(`${STREAMING_SESSIONS_PREFIX}*`);
                const activeStreams = await Promise.all(activeStreamsKeys.map(async (key) => {
                    const session = await getStreamingSession(key.replace(STREAMING_SESSIONS_PREFIX, ''));
                    if (session.room === roomId) {
                        return {
                            _id: session.messageId,
                            type: 'ai',
                            aiType: session.aiType,
                            content: session.content,
                            timestamp: session.timestamp,
                            isStreaming: true
                        };
                    }
                    return null;
                }));
                const filteredStreams = activeStreams.filter(stream => stream !== null);

                // 이벤트 발송
                socket.emit('joinRoomSuccess', {
                    roomId,
                    participants: room.participants,
                    messages,
                    hasMore,
                    oldestTimestamp,
                    activeStreams: filteredStreams
                });

                io.to(roomId).emit('message', joinMessage);
                io.to(roomId).emit('participantsUpdate', room.participants);

                logger.debug('user joined room', {
                    userId: socket.user.id,
                    roomId,
                    messageCount: messages.length,
                    hasMore
                });

            } catch (error) {
                logger.error('Join room error:', error);
                socket.emit('joinRoomError', {
                    message: error.message || '채팅방 입장에 실패했습니다.'
                });
            }
        });

        // 메시지 전송 처리
        socket.on('chatMessage', async (messageData) => {
            try {
                if (!socket.user) {
                    throw new Error('Unauthorized');
                }

                if (!messageData) {
                    throw new Error('메시지 데이터가 없습니다.');
                }

                const {room, type, content, fileData} = messageData;

                if (!room) {
                    throw new Error('채팅방 정보가 없습니다.');
                }

                // 채팅방 권한 확인
                const chatRoom = await getRoomData(room);
                if (!chatRoom || !chatRoom.participants.some(p => p._id.toString() === socket.user.id)) {
                    throw new Error('채팅방 접근 권한이 없습니다.');
                }

                // 세션 유효성 재확인
                const sessionValidation = await SessionService.validateSession(
                    socket.user.id,
                    socket.user.sessionId
                );

                if (!sessionValidation.isValid) {
                    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
                }

                // AI 멘션 확인
                const aiMentions = extractAIMentions(content);
                let message;

                logger.debug('message received', {
                    type,
                    room,
                    userId: socket.user.id,
                    hasFileData: !!fileData,
                    hasAIMentions: aiMentions.length
                });

                // 메시지 타입별 처리
                switch (type) {
                    case 'file':
                        if (!fileData || !fileData._id) {
                            throw new Error('파일 데이터가 올바르지 않습니다.');
                        }

                        const file = await File.findOne({
                            _id: fileData._id,
                            user: socket.user.id
                        });

                        if (!file) {
                            throw new Error('파일을 찾을 수 없거나 접근 권한이 없습니다.');
                        }

                        message = new Message({
                            room,
                            sender: socket.user.id,
                            type: 'file',
                            file: file._id,
                            content: content || '',
                            timestamp: new Date(),
                            reactions: {},
                            metadata: {
                                fileType: file.mimetype,
                                fileSize: file.size,
                                originalName: file.originalname
                            }
                        });
                        break;

                    case 'text':
                        const messageContent = content?.trim() || messageData.msg?.trim();
                        if (!messageContent) {
                            return;
                        }

                        message = new Message({
                            room,
                            sender: socket.user.id,
                            content: messageContent,
                            type: 'text',
                            timestamp: new Date(),
                            reactions: {}
                        });
                        break;

                    default:
                        throw new Error('지원하지 않는 메시지 타입입니다.');
                }

                await message.save();
                await message.populate([
                    {path: 'sender', select: 'name email profileImage'},
                    {path: 'file', select: 'filename originalname mimetype size'}
                ]);

                io.to(room).emit('message', message);
                // Prometheus 관련 코드를 제거했습니다

                // AI 멘션이 있는 경우 AI 응답 생성
                if (aiMentions.length > 0) {
                    for (const ai of aiMentions) {
                        const query = content.replace(new RegExp(`@${ai}\\b`, 'g'), '').trim();
                        await handleAIResponse(io, room, ai, query, socket);
                    }
                }

                await SessionService.updateLastActivity(socket.user.id);

                logger.debug('message processed', {
                    messageId: message._id,
                    type: message.type,
                    room
                });

            } catch (error) {
                logger.error('Message handling error:', error);
                socket.emit('error', {
                    code: error.code || 'MESSAGE_ERROR',
                    message: error.message || '메시지 전송 중 오류가 발생했습니다.'
                });
            }
        });


        // 채팅방 퇴장 처리
        // socket.on('leaveRoom', async (roomId) => {
        //     try {
        //         if (!socket.user) {
        //             throw new Error('Unauthorized');
        //         }
        //
        //         const userId = socket.user.id;
        //
        //         // 퇴장 메시지 데이터 구성
        //         const leaveData = {
        //             userId: userId,
        //             roomId: roomId,
        //             timestamp: new Date().toISOString(),
        //             socketId: socket.id,
        //             userName: socket.user.name
        //         };
        //
        //         // Redis 스트림에 `leaveRoom` 메시지 추가
        //         await redisClient.xAdd('leaveRoomStream', '*', {
        //             event: 'leaveRoom',
        //             data: JSON.stringify(leaveData)
        //         });
        //
        //         // 클라이언트에게 퇴장 요청이 접수되었음을 응답
        //         socket.emit('leaveRoomSuccess', {roomId});
        //
        //         logger.debug('leaveRoom event added to Redis Stream', { leaveData });
        //
        //     } catch (error) {
        //         console.error('Leave room error:', error);
        //         socket.emit('error', {
        //             message: error.message || '채팅방 퇴장 중 오류가 발생했습니다.'
        //         });
        //     }
        // });

        // 채팅방 퇴장 처리
        socket.on('leaveRoom', async (roomId) => {
          try {
            if (!socket.user) {
              throw new Error('Unauthorized');
            }

            // 실제로 해당 방에 참여 중인지 먼저 확인
            const currentRoomId = await getUserRoom(socket.user.id);
            if (!currentRoomId || currentRoomId !== roomId) {
              console.log(`User ${socket.user.id} is not in room ${roomId}`);
              return;
            }

            // 권한 확인
            const room = await getRoomData(roomId);
            if (!room || !room.participants.some(p => p._id.toString() === socket.user.id)) {
              console.log(`Room ${roomId} not found or user has no access`);
              return;
            }

            socket.leave(roomId);
            await removeUserRoom(socket.user.id);

            // 퇴장 메시지 생성 및 저장
            const leaveMessage = await Message.create({
              room: roomId,
              content: `${socket.user.name}님이 퇴장하였습니다.`,
              type: 'system',
              timestamp: new Date()
            });

            // 참가자 목록 업데이트 - profileImage 포함
            await invalidateRoomCache(roomId);
            const updatedRoom = await Room.findByIdAndUpdate(
                roomId,
                {$pull: {participants: socket.user.id}},
                {
                  new: true,
                  runValidators: true
                }
            ).populate('participants', 'name email profileImage').lean();

            if (updatedRoom) {
              await redisClient.setEx(`${ROOMS_PREFIX}${roomId}`, 60, updatedRoom);
              io.to(roomId).emit('message', leaveMessage);
              io.to(roomId).emit('participantsUpdate', updatedRoom.participants);
            }

            // 스트리밍 세션 정리
            const streamingKeys = await redisClient.client.keys(`${STREAMING_SESSIONS_PREFIX}*`);
            for (const key of streamingKeys) {
              const session = await getStreamingSession(key.replace(STREAMING_SESSIONS_PREFIX, ''));
              if (session.room === roomId && session.userId === socket.user.id) {
                await removeStreamingSession(key.replace(STREAMING_SESSIONS_PREFIX, ''));
              }
            }

            // 메시지 큐 및 재시도 정리
            await removeMessageQueue(roomId, socket.user.id);
            await removeMessageRetries(roomId, socket.user.id);

            logger.debug('user left room', {
              userId: socket.user.id,
              roomId,
              messageId: leaveMessage._id
            });

          } catch (error) {
            logger.error('Leave room error:', error);
            socket.emit('error', {
              message: error.message || '채팅방 퇴장 중 오류가 발생했습니다.'
            });
          }
        });

        // 연결 해제 처리
        socket.on('disconnect', async (reason) => {
            if (!socket.user) return;

            try {
                const userId = socket.user.id;
                const currentSocketId = await getConnectedUserSocketId(userId);
                if (currentSocketId === socket.id) {
                    await removeConnectedUser(userId);
                }

                const roomId = await getUserRoom(userId);
                await removeUserRoom(userId);

                // 메시지 큐 및 재시도 정리
                await removeMessageQueue(roomId, userId);
                await removeMessageRetries(roomId, userId);

                // 스트리밍 세션 정리
                const streamingKeys = await redisClient.client.keys(`${STREAMING_SESSIONS_PREFIX}*`);
                for (const key of streamingKeys) {
                    const session = await getStreamingSession(key.replace(STREAMING_SESSIONS_PREFIX, ''));
                    if (session.userId === userId) {
                        await removeStreamingSession(key.replace(STREAMING_SESSIONS_PREFIX, ''));
                    }
                }

                // 현재 방에서 자동 퇴장 처리
                if (roomId) {
                    if (reason !== 'client namespace disconnect' && reason !== 'duplicate_login') {
                        const leaveMessage = await Message.create({
                            room: roomId,
                            content: `${socket.user.name}님이 연결이 끊어졌습니다.`,
                            type: 'system',
                            timestamp: new Date()
                        });

                        const updatedRoom = await Room.findByIdAndUpdate(
                            roomId,
                            {$pull: {participants: socket.user.id}},
                            {
                                new: true,
                                runValidators: true
                            }
                        ).populate('participants', 'name email profileImage').lean();

                        if (updatedRoom) {
                            await redisClient.setEx(`${ROOMS_PREFIX}${roomId}`, 60, updatedRoom);
                            io.to(roomId).emit('message', leaveMessage);
                            io.to(roomId).emit('participantsUpdate', updatedRoom.participants);
                        }
                    }
                }

                logger.debug('user disconnected', {
                    reason,
                    userId: socket.user.id,
                    socketId: socket.id,
                    lastRoom: roomId
                });

            } catch (error) {
                logger.error('Disconnect handling error:', error);
            }
        });

        // 세션 종료 또는 로그아웃 처리
        socket.on('force_login', async ({token}) => {
            try {
                if (!socket.user) return;

                // 강제 로그아웃을 요청한 클라이언트의 세션 정보 확인
                const decoded = jwt.verify(token, jwtSecret);
                if (!decoded?.user?.id || decoded.user.id !== socket.user.id) {
                    throw new Error('Invalid token');
                }

                // 세션 종료 처리
                socket.emit('session_ended', {
                    reason: 'force_logout',
                    message: '다른 기기에서 로그인하여 현재 세션이 종료되었습니다.'
                });

                // 연결 종료
                socket.disconnect(true);

            } catch (error) {
                logger.error('Force login error:', error);
                socket.emit('error', {
                    message: '세션 종료 중 오류가 발생했습니다.'
                });
            }
        });

        // 메시지 읽음 상태 처리
        socket.on('markMessagesAsRead', async ({roomId, messageIds}) => {
            try {
                if (!socket.user) {
                    throw new Error('Unauthorized');
                }

                if (!Array.isArray(messageIds) || messageIds.length === 0) {
                    return;
                }

                // 읽음 상태 업데이트
                await Message.updateMany(
                    {
                        _id: {$in: messageIds},
                        room: roomId,
                        'readers.userId': {$ne: socket.user.id}
                    },
                    {
                        $push: {
                            readers: {
                                userId: socket.user.id,
                                readAt: new Date()
                            }
                        }
                    }
                );

                socket.to(roomId).emit('messagesRead', {
                    userId: socket.user.id,
                    messageIds
                });

            } catch (error) {
                logger.error('Mark messages as read error:', error);
                socket.emit('error', {
                    message: '읽음 상태 업데이트 중 오류가 발생했습니다.'
                });
            }
        });

        // 리액션 처리
        socket.on('messageReaction', async ({messageId, reaction, type}) => {
            try {
                if (!socket.user) {
                    throw new Error('Unauthorized');
                }

                const message = await Message.findById(messageId);
                if (!message) {
                    throw new Error('메시지를 찾을 수 없습니다.');
                }

                // 리액션 추가/제거
                if (type === 'add') {
                    await message.addReaction(reaction, socket.user.id);
                } else if (type === 'remove') {
                    await message.removeReaction(reaction, socket.user.id);
                }

                // 업데이트된 리액션 정보 브로드캐스트
                io.to(message.room).emit('messageReactionUpdate', {
                    messageId,
                    reactions: message.reactions
                });

            } catch (error) {
                logger.error('Message reaction error:', error);
                socket.emit('error', {
                    message: error.message || '리액션 처리 중 오류가 발생했습니다.'
                });
            }
        });
    });

};
