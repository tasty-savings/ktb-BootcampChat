# 베이스 이미지
FROM node:18

# 작업 디렉토리 설정
WORKDIR /app

# 종속성 설치
COPY ./package*.json ./
RUN npm install
# 애플리케이션 복사
COPY ./ ./

# 포트 노출
EXPOSE 5000

# 기본 실행 명령어
CMD ["npm", "start"]