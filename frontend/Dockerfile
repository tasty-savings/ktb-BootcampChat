# Stage 1: Build stage
FROM node:18 AS builder

# 작업 디렉토리 설정
WORKDIR /app

# .npmrc 파일 복사
COPY ./.npmrc /app/.npmrc

# 종속성 설치
COPY ./package*.json ./
RUN npm install --production

# 애플리케이션 복사
COPY ./ ./

# Stage 2: Runtime stage
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 파일만 복사
COPY --from=builder /app /app

# 포트 노출
EXPOSE 3000

# 기본 실행 명령어
CMD ["npm", "run", "dev"]