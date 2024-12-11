// backend/routes/api/files.js
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const fileController = require('../../controllers/fileController');
const { upload, errorHandler, copyFileWithDisposition } = require('../../middleware/upload');

// 파일 업로드
router.post('/upload',
  auth,
  upload.single('file'),
    async (req, res, next) => {
        try {
            // 1. 원본 파일을 S3에 업로드 (미리보기용 + 다운로드용)
            const originalFile = req.file;
            const originalFileKey = originalFile.key;  // S3에 저장된 파일의 키

            // // 2. 미리보기용 파일 (inline) 복사
            // await copyFileWithDisposition(process.env.AWS_S3_BUCKET_NAME, viewOnlyFileKey, 'inline');

            // 3. 다운로드용 파일 (attachment) 복사
            await copyFileWithDisposition(process.env.AWS_S3_BUCKET_NAME, originalFileKey, 'attachment');

            next();
        } catch (error) {
            next(error);
        }
    },
  errorHandler,
  fileController.uploadFile
);

// 파일 다운로드
router.get('/download/:filename',
  auth,
  fileController.downloadFile
);

// 파일 보기 (미리보기용)
router.get('/view/:filename',
  auth,
  fileController.viewFile
);

// 파일 삭제
router.delete('/:id',
  auth,
  fileController.deleteFile
);

module.exports = router;