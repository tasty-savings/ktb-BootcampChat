#!/bin/bash

# 실행할 서비스 목록
#services=("MongoDB" "Redis" "Backend" "Frontend")
services=("MongoDB" "Redis" "Backend" "Frontend", "Socket")

# 백엔드 및 프론트엔드 경로 설정
BACKEND_DIR="./backend"
FRONTEND_DIR="./frontend"
SOCKET_DIR="./websocket"

# 로그 파일 경로
LOG_DIR="./logs"

# 데이터 디렉토리 경로
DATA_DIR="$HOME/data/db"

# PM2 프로세스 이름 설정
PM2_MONGODB_NAME="mongo-server"
PM2_REDIS_NAME="redis-server"
PM2_BACKEND_NAME="backend-server"
PM2_FRONTEND_NAME="frontend-server"

# 소켓 추가
PM2_SOCKET_NAME="socket-server"

# 명령어 인자 확인
if [ $# -eq 0 ] || [ $# -gt 2 ]; then
  echo "사용법: ./run.sh {start|stop|restart|status} [mode]"
  echo "mode 옵션: dev (기본값) | prod"
  echo "예시:"
  echo "  ./run.sh start         # 개발 모드로 시작"
  echo "  ./run.sh start prod    # 프로덕션 모드로 시작"
  exit 1
fi

# 실행 모드 설정 (두 번째 인자가 없으면 dev로 설정)
MODE=${2:-dev}

# 시스템 상태 체크 함수
check_system_status() {
  echo "시스템 상태를 확인합니다..."
  
  # MongoDB 포트 (27017) 확인
  if lsof -i:27017 >/dev/null 2>&1; then
    echo "경고: MongoDB 포트(27017)가 이미 사용 중입니다."
  fi
  
  # Redis 포트 (6379) 확인
  if lsof -i:6379 >/dev/null 2>&1; then
    echo "경고: Redis 포트(6379)가 이미 사용 중입니다."
  fi
  
  # 디스크 공간 확인
  DISK_SPACE=$(df -h "$DATA_DIR" | awk 'NR==2 {print $4}')
  echo "사용 가능한 디스크 공간: $DISK_SPACE"
}

# 함수 정의
start_services() {
  echo "서비스를 시작합니다... (모드: $MODE)"
  
  check_system_status

  # 데이터 디렉토리 확인 및 생성
  if [ ! -d "$DATA_DIR" ]; then
    echo "데이터 디렉토리가 존재하지 않습니다. 생성합니다: $DATA_DIR"
    mkdir -p "$DATA_DIR"
    # 권한 설정
    chmod 755 "$DATA_DIR"
  else
    echo "데이터 디렉토리가 이미 존재합니다: $DATA_DIR"
  fi

  # 로그 디렉토리 생성
  mkdir -p $LOG_DIR

  # MongoDB 시작
  # 컨테이너 실행 여부 확인
  if ! docker ps --format '{{.Names}}' | grep -q "$DOCKER_MONGODB_CONTAINER_NAME"; then
    echo "MongoDB를 Docker 컨테이너로 시작합니다..."
    docker run -d --name "$DOCKER_MONGODB_CONTAINER_NAME" \
      -v "$DATA_DIR:/data/db" \
      -v "$LOG_DIR:/var/log/mongodb" \
      -p 27017:27017 \
      mongo:latest \
      --logpath /var/log/mongodb/mongodb.log \
      --logappend
  else
    echo "MongoDB 컨테이너가 이미 실행 중입니다."
  fi
#
#  로컬 버전
#  if ! pm2 list | grep -q "$PM2_MONGODB_NAME"; then
#    echo "MongoDB를 시작합니다..."
#    pm2 start mongod --name "$PM2_MONGODB_NAME" -- \
#      --dbpath "$DATA_DIR" \
#      --bind_ip 0.0.0.0 \
#      --logpath "$LOG_DIR/mongodb.log" \
#      --logappend
#  else
#    echo "MongoDB가 이미 실행 중입니다."
#  fi

  # Redis 시작
  # Docker 컨테이너 실행 여부 확인
  if ! docker ps --format '{{.Names}}' | grep -q "$DOCKER_REDIS_CONTAINER_NAME"; then
      echo "Redis를 Docker 컨테이너로 시작합니다..."
      docker run -d --name "$DOCKER_REDIS_CONTAINER_NAME" \
        -p 6379:6379 \
        -v "$LOG_DIR:/var/log/redis" \
        redis:latest \
        redis-server --bind 0.0.0.0 --loglevel notice --logfile /var/log/redis/redis.log
  else
      echo "Redis 컨테이너가 이미 실행 중입니다."
  fi

#   로컬 redis
#  if ! pm2 list | grep -q "$PM2_REDIS_NAME"; then
#    echo "Redis를 시작합니다..."
#    pm2 start redis-server --name "$PM2_REDIS_NAME" -- \
#      --bind 0.0.0.0 \
#      --loglevel notice \
#      --dir "$LOG_DIR" \
#      --daemonize no
#  else
#    echo "Redis가 이미 실행 중입니다."
#  fi

  # 백엔드 시작
  if ! pm2 list | grep -q "$PM2_BACKEND_NAME"; then
    echo "백엔드 서버를 시작합니다... (모드: $MODE)"
    cd "$BACKEND_DIR"
    NODE_ENV=$MODE pm2 start server.js --name "$PM2_BACKEND_NAME" \
      --log "$LOG_DIR/backend.log" \
      --error "$LOG_DIR/backend-error.log"
    cd ..
  else
    echo "백엔드 서버가 이미 실행 중입니다."
  fi

    # 소켓 서버 시작 추가
      if ! pm2 list | grep -q "$PM2_SOCKET_NAME"; then
        echo "소켓 서버를 시작합니다... (모드: $MODE)"
        cd "$SOCKET_DIR"
        NODE_ENV=$MODE pm2 start server.js --name "$PM2_SOCKET_NAME" \
          --log "$LOG_DIR/socket.log" \
          --error "$LOG_DIR/socket-error.log"\
          -i 3
        cd ..
      else
        echo "소켓 서버가 이미 실행 중입니다."
      fi

  # 프론트엔드 시작
  if ! pm2 list | grep -q "$PM2_FRONTEND_NAME"; then
    echo "프론트엔드 서버를 시작합니다... (모드: $MODE)"
    cd "$FRONTEND_DIR"

    if [ "$MODE" = "prod" ]; then
      echo "프론트엔드 프로덕션 빌드를 시작합니다..."
      npm run build
      pm2 start npm --name "$PM2_FRONTEND_NAME" \
        --log "$LOG_DIR/frontend.log" \
        --error "$LOG_DIR/frontend-error.log" \
        -- start
    else
      pm2 start npm --name "$PM2_FRONTEND_NAME" \
        --log "$LOG_DIR/frontend.log" \
        --error "$LOG_DIR/frontend-error.log" \
        -- run dev -- -p 3000
    fi


    cd ..
  else
    echo "프론트엔드 서버가 이미 실행 중입니다."
  fi

  echo "모든 서비스가 시작되었습니다."
  pm2 list
}

stop_services() {
  echo "서비스를 중지합니다..."

  # "$PM2_SOCKET_NAME" 추가
#  for services in "$PM2_FRONTEND_NAME" "$PM2_BACKEND_NAME" "$PM2_REDIS_NAME" "$PM2_MONGODB_NAME" ; do
  for service in "$PM2_FRONTEND_NAME" "$PM2_BACKEND_NAME" "$PM2_REDIS_NAME" "$PM2_MONGODB_NAME" "$PM2_SOCKET_NAME"; do
    if pm2 list | grep -q "$service"; then
      echo "$service 중지 중..."
      pm2 stop "$service"
      pm2 delete "$service"
    fi
  done

  echo "모든 서비스가 중지되었습니다."
  pm2 list
}

restart_services() {
  echo "서비스를 재시작합니다... (모드: $MODE)"

  pm2 restart "$PM2_MONGODB_NAME"
  pm2 restart "$PM2_REDIS_NAME"
  
  cd "$BACKEND_DIR"
  NODE_ENV=$MODE pm2 restart "$PM2_BACKEND_NAME"
#   NODE_ENV=$MODE pm2 restart "$PM2_SOCKET_NAME" 추가
  NODE_ENV=$MODE pm2 restart "$PM2_SOCKET_NAME"
  cd ..
  
  cd "$FRONTEND_DIR"
  if [ "$MODE" = "prod" ]; then
    echo "프론트엔드 프로덕션 빌드를 다시 시작합니다..."
    npm run build
    pm2 restart "$PM2_FRONTEND_NAME"
  else
    pm2 restart "$PM2_FRONTEND_NAME"
  fi
  cd ..

  echo "모든 서비스가 재시작되었습니다."
  pm2 list
}

status_services() {
  echo "서비스 상태를 확인합니다..."
  pm2 list
  
  echo "\n포트 사용 현황:"
  echo "MongoDB (27017):" $(lsof -i:27017 | grep LISTEN || echo "미사용")
  echo "Redis (6379):" $(lsof -i:6379 | grep LISTEN || echo "미사용")
  echo "Backend (5000):" $(lsof -i:5000 | grep LISTEN || echo "미사용")
  echo "Frontend (3000):" $(lsof -i:3000 | grep LISTEN || echo "미사용")
 # 소켓 서버 포트 확인 (예: 3001번 포트 사용 시)
  echo "Socket (3001):" $(lsof -i:3001 | grep LISTEN || echo "미사용")
}

# 명령어 처리
case "$1" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    restart_services
    ;;
  status)
    status_services
    ;;
  *)
    echo "사용법: ./run.sh {start|stop|restart|status} [mode]"
    echo "mode 옵션: dev (기본값) | prod"
    exit 1
    ;;
esac