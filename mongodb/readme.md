<!-- 현재 위치에 keyfile 생성 -->

openssl rand -base64 756 > ./mongodb-keyfile
chmod 600 ./mongodb-keyfile

<!-- docker compose up 이후에 mongo1에 접속 -->

docker exec -it mongo1 mongosh

<!-- mongo1에서 레플리카셋 초기화 -->

rs.initiate({
\_id: "tasty-saving",
members: [
{ _id: 0, host: "192.168.37.124:27017" },
{ _id: 1, host: "192.168.37.124:27018" },
{ _id: 2, host: "192.168.37.124:27019" }
]
});

<!-- mongo1에서 설정 확인 -->

rs.status();

<!-- 컨테이너 재시작하여 설정 적용 -->

docker compose down
docker compose up -d
