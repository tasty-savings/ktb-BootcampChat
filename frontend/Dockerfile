# 베이스 이미지
FROM node:18

# 작업 디렉토리 설정
WORKDIR /app

# .npmrc 파일 복사
# 이 파일은 프로젝트 루트 또는 Dockerfile과 동일한 디렉토리에 위치해야 합니다.
COPY ./.npmrc /app/.npmrc

# 종속성 설치
COPY ./package*.json ./
RUN npm install

# 애플리케이션 복사
COPY ./ ./

# 포트 노출
EXPOSE 3000

# 기본 실행 명령어
CMD ["npm", "run", "dev"]