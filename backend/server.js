// ---------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const routes = require('./routes');
const { connectRedis } = require('./utils/redisPubSub'); // 경로 조정 필요
const {fork} = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;
const mongoWorker = fork('./mongoWorker.js');

mongoWorker.on('message', (message) => {
  console.log('Worker message:', message);
});

mongoWorker.on('exit', (code) => {
  console.error(`Worker exited with code: ${code}`);
});

// trust proxy 설정
app.set('trust proxy', 1);

// CORS 설정
const corsOptions = {
  origin: [
    'https://bootcampchat-fe.run.goorm.site',
    'http://localhost:3000',
    'https://localhost:3000',
    'http://0.0.0.0:3000',
    'https://0.0.0.0:3000',
    'https://goorm-ktb-020.goorm.team',
    'https://api.goorm-ktb-020.goorm.team'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-auth-token',
    'x-session-id',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['x-auth-token', 'x-session-id']
};

// 미들웨어
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 개발 환경에서 요청 로깅
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// 상태체크
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// API 라우트
app.use('/api', routes);

// 404 에러 핸들러
app.use((req, res) => {
  console.log('404 Error:', req.originalUrl);
  res.status(404).json({
    success: false,
    message: '요청하신 리소스를 찾을 수 없습니다.',
    path: req.originalUrl
  });
});

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '서버 에러가 발생했습니다.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 서버 및 데이터베이스 초기화 함수
async function startServer() {
  try {
    await connectRedis(); // Redis 연결
    console.log('Redis Connected');

    await mongoose.connect(process.env.MONGO_URI); // MongoDB 연결
    console.log('MongoDB Connected');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API Server running on port ${PORT}`);
      console.log('Environment:', process.env.NODE_ENV);
      console.log('API Base URL:', `http://0.0.0.0:${PORT}/api`);
    });
  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
}

// 서버 시작
startServer();
module.exports = { app };
