# Stage 1: Build stage
FROM node:18 AS builder

# 작업 디렉토리 설정
WORKDIR /app

# 종속성 설치
COPY ./package*.json ./
RUN npm install --production

# 애플리케이션 복사
COPY ./ ./

# Production build (필요한 경우)
# RUN npm run build  # React 앱 같은 경우, build 명령어를 추가합니다.

# Stage 2: Runtime stage
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 파일만 복사
COPY --from=builder /app /app

# 포트 노출
EXPOSE 5000

# 기본 실행 명령어
CMD ["npm", "start"]