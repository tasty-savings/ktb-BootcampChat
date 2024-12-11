// backend/middleware/upload.js
const multer = require('multer');

// --- s3 연동 시 필요 (여기부터)
const multerS3 = require('multer-s3');
const { S3Client, CopyObjectCommand } = require("@aws-sdk/client-s3");
// --- s3 연동 시 필요 (여기까지)

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// uploads 디렉토리 절대 경로 설정
const uploadDir = path.join(__dirname, '../uploads');
// const uploadS3Dir = path.join("s3://", process.env.AWS_S3_BUCKET_NAME, "uploads");

const s3 = new S3Client({
  region: "ap-northeast-2", // 서울 리전
  endpoint: "https://s3.ap-northeast-2.amazonaws.com",  // 서울 리전의 S3 엔드포인트
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// uploads 디렉토리 생성 및 권한 설정
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.chmodSync(uploadDir, '0755');
}

// MIME 타입과 확장자 매핑
const ALLOWED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
};

// 파일 타입별 크기 제한 설정
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,  // 10MB for images
  video: 50 * 1024 * 1024,  // 50MB for videos
  audio: 20 * 1024 * 1024,  // 20MB for audio
  document: 20 * 1024 * 1024 // 20MB for documents
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    try {
      // 원본 파일명을 버퍼로 변환하여 UTF-8로 디코딩
      const originalname = Buffer.from(file.originalname, 'binary').toString('utf8');
      
      // 원본 파일명을 req 객체에 저장
      // req.originalFileName = originalname;

      // 파일 확장자 추출
      const ext = path.extname(originalname).toLowerCase();
      
      // 안전한 파일명 생성 (타임스탬프 + 랜덤 문자열 + 확장자)
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const safeFilename = `${timestamp}_${randomString}${ext}`;

      // 파일 확장자 검증
      const allowedExtensions = Object.values(ALLOWED_TYPES).flat();
      if (!allowedExtensions.includes(ext)) {
        return cb(new Error('지원하지 않는 파일 확장자입니다.'));
      }

      cb(null, safeFilename);
    } catch (error) {
      console.error('Filename processing error:', error);
      cb(new Error('파일명 처리 중 오류가 발생했습니다.'));
    }
  }
});

// S3 스토리지 설정
const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME, // 환경변수로 S3 버킷 이름 설정
  // acl: 'public-read', // 파일 접근 권한 설정 (예: public-read, private)
  contentType: multerS3.AUTO_CONTENT_TYPE,
  // contentDisposition: 'attachment',
  metadata: function (req, file, cb) {
    const encodedName = encodeURIComponent(file.originalname);
    cb(null, encodedName);
  },
  key: function (req, file, cb) {
    try {
      // 원본 파일명 디코딩
      const originalname = Buffer.from(file.originalname, 'binary').toString('utf8');

      // 파일 확장자 추출
      const ext = path.extname(originalname).toLowerCase();

      // 허용된 확장자 검증
      const allowedExtensions = Object.values(ALLOWED_TYPES).flat();
      if (!allowedExtensions.includes(ext)) {
        return cb(new Error('지원하지 않는 파일 확장자입니다.'));
      }

      // 안전한 파일명 생성
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const safeFilename = `${timestamp}_${randomString}${ext}`;

      // 요청 객체에 파일명 저장
      req.originalFileName = safeFilename;
      file.path = safeFilename;


      cb(null, safeFilename);
    } catch (error) {
      console.error('Filename processing error:', error);
      cb(new Error('파일명 처리 중 오류가 발생했습니다.'));
    }
  },
});

const getFileType = (mimetype) => {
  const typeMap = {
    'image': '이미지',
    'video': '동영상',
    'audio': '오디오',
    'application': '문서'
  };
  const type = mimetype.split('/')[0];
  return typeMap[type] || '파일';
};

const validateFileSize = (file) => {
  const type = file.mimetype.split('/')[0];
  const limit = FILE_SIZE_LIMITS[type] || FILE_SIZE_LIMITS.document;
  
  if (file.size > limit) {
    const limitInMB = Math.floor(limit / 1024 / 1024);
    throw new Error(`${getFileType(file.mimetype)} 파일은 ${limitInMB}MB를 초과할 수 없습니다.`);
  }
  return true;
};

const fileFilter = (req, file, cb) => {
  try {
    // 파일명을 UTF-8로 디코딩
    const originalname = Buffer.from(file.originalname, 'binary').toString('utf8');
    
    // MIME 타입 검증
    if (!ALLOWED_TYPES[file.mimetype]) {
      const fileType = getFileType(file.mimetype);
      return cb(new Error(`지원하지 않는 ${fileType} 형식입니다.`), false);
    }

    // Content-Length 헤더 검증
    const declaredSize = parseInt(req.headers['content-length']);
    if (declaredSize > 50 * 1024 * 1024) {
      return cb(new Error('파일 크기는 50MB를 초과할 수 없습니다.'), false);
    }

    // 파일명 길이 검증 (UTF-8 바이트 길이 기준)
    const filenameBytes = Buffer.from(originalname, 'utf8').length;
    if (filenameBytes > 255) {
      return cb(new Error('파일명이 너무 깁니다.'), false);
    }

    // 파일 확장자와 MIME 타입 일치 여부 확인
    const ext = path.extname(originalname).toLowerCase();
    if (!ALLOWED_TYPES[file.mimetype].includes(ext)) {
      const fileType = getFileType(file.mimetype);
      return cb(new Error(`${fileType} 확장자가 올바르지 않습니다.`), false);
    }

    // 원본 파일명을 multer의 file 객체에 저장
    file.originalname = originalname;

    cb(null, true);
  } catch (error) {
    console.error('File filter error:', error);
    cb(error);
  }
};

// multer 인스턴스 생성
const uploadMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1 // 한 번에 하나의 파일만 업로드 가능
  },
  fileFilter: fileFilter
});

// S3 multer 인스턴스 생성
const uploadS3Middleware = multer({
  storage: s3Storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1 // 한 번에 하나의 파일만 업로드 가능
  },
  fileFilter: fileFilter
});

// 에러 핸들러 미들웨어
const errorHandler = (error, req, res, next) => {
  console.error('File upload error:', {
    error: error.message,
    stack: error.stack,
    file: req.file
  });

  // 업로드된 파일이 있다면 삭제
  if (req.file) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkError) {
      console.error('Failed to delete uploaded file:', unlinkError);
    }
  }

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          success: false,
          message: '파일 크기는 50MB를 초과할 수 없습니다.'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: '한 번에 하나의 파일만 업로드할 수 있습니다.'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: '잘못된 형식의 파일입니다.'
        });
      default:
        return res.status(400).json({
          success: false,
          message: `파일 업로드 오류: ${error.message}`
        });
    }
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || '파일 업로드 중 오류가 발생했습니다.'
    });
  }
  
  next();
};

// 파일 경로 검증 함수
const isPathSafe = (filepath) => {
  try {
    const resolvedPath = path.resolve(filepath);
    const resolvedUploadDir = path.resolve(uploadDir);
    return resolvedPath.startsWith(resolvedUploadDir);
  } catch (error) {
    console.error('Path validation error:', error);
    return false;
  }
};

// 파일의 Content-Disposition 설정 및 복사
async function copyFileWithDisposition(bucket, key, disposition) {
  const params = {
    Bucket: bucket,
    Key: "download/" + key,
    CopySource: `${bucket}/${key}`,
    MetadataDirective: 'REPLACE',  // 기존 메타데이터를 대체
    Metadata: {
      'Content-Disposition': disposition,  // Content-Disposition 설정
    },
  };

  try {
    // CopyObjectCommand를 사용하여 파일 복사
    const command = new CopyObjectCommand(params);
    await s3.send(command);  // 명령 실행
    console.log(`Successfully set Content-Disposition for ${key} to ${disposition}`);
  } catch (error) {
    console.error(`Error setting Content-Disposition for ${key}:`, error);
  }
}

module.exports = {
  // upload: uploadMiddleware,
  upload: uploadS3Middleware,
  errorHandler,
  uploadDir,
  isPathSafe,
  validateFileSize,
  ALLOWED_TYPES,
  getFileType,
  copyFileWithDisposition
};