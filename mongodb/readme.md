<!-- 모든 mongodb는 동일한 key를 공유해야함 -->
<!-- /etc/mongo-keyfile 에 readOnly로 권한설정해서 저장, mongo.conf를 통해 경로 지정 가능 -->
openssl rand -base64 756 > ./mongodb-keyfile
chmod 600 ./mongodb-keyfile

<!-- 모든 mongodb가 공통적으로 적용된 설정파일 -->
<!-- /etc/mongod.conf에 저장, 마찬가지로 readOnly -->


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

1. 각 몽고db 인스턴스에 keyfile 저장(파일권한을 readOnly로 저장)
경로: /etc/mongo-keyfile
내용: ------아래 복사-------
Y42VguPtjzqHFJYODbxcMgAbspAYGgGeO8DABMR5um/UxV1oCRrpHh/HCZcvqMoC
nApsGkZH6S3CM9eIZtBXPmMNF6Okyir5wPNGmY5QwWXIsdLFQzc+CeXeaKtJPcPg
KE0ULUNUpa+l0VGh9FqVEIJwy0l3DevD3pRFiL91VseadPyuMEXfWoPGqlvb7Ecu
+Z6Sfqb0Ng3fBIxcxr2LT4Dj7JXzJ3v6pNax9AlxUN04MDIQ/fnwj0ZdkELlMnoR
tZ3Bwy51YvtitQRlHwbciEQM0k2arCDLc5CfxTpMv47Ol7AfghpeOzqaSnkuJM7T
juSTT4daBLHidL4jLNVaXaW7n8sreLnn8V+T3oFUM6zOVvuXTSico6+O8G4zNjZc
wHQX5PnpsOeo0K2qIvPRwHviEV3HU2eJCFqB80jLC4UDbvQoUZySg7XSWvjl7mWw
OiRz3eer1kBWond+Qd4pkqVs0TvupwM9RC/NxdxBUovWnpOnMdOM3kL14RkHWHHl
9iXsPrJhL+qla03U4JF5TyuMtSsdHlso/ZDTeHXhtaym49tnhf58ilZIXJTkKvCV
FLTE7jF6NM01vWhpykJ/j3a43a9dWT2CHgz0Ri9m2o7fUtopiHmLi/YwxQKBvSTN
zN1Lp/PNhZ85AIINYckuIFSkULCn5sXKqVgPnPO0ENzwLWFOpy7sSTMnSqhzWz9p
xl2Df+Fc4kSrlWU6VTB+1gGOM3ZB1bAQRzUyb60By8q90b+XFhoxHOKXel+uAxAd
JBZHveavTdlsnzy4l5ah33+AOKSxn3xE2ZEbtyh79NQH2eGXLowD0D4VhzKRsg8/
lgG4ZcYx8FZ1DfJ595S6fi/h179nETS7V5UrxNlRcMbiqZ+tbD18Rtztf0+OOQf7
eJiTn7LCVZDJLxYilVaeorEMHA9nofrjrjDyHjysAxEIf2Jw7AG8cLRt7QPp/ap7
CEGq2qXMi6esW/gdFofjPUI+Wl3bFygPpogZaWfVpMnEa6ly
-----------------------------------
권한설정: chmod 600 /etc/mongodb-keyfile

2. 각 몽고db 인스턴스에 config 설정
경로: /etc/mongod.conf
내용: --------아래 복사----------
replication:
replSetName: "tasty-saving"

security:
authorization: disabled
keyFile: /etc/mongo-keyfile
----------------------------
권한설정: chmod 600 /etc/mongod.conf

3. primary로 사용할 mongodb 인스턴스 접속해서 mongosh 실행 후 replicaSet 설정, host는 각 인스턴스
rs.initiate({
\_id: "tasty-saving",
members: [
{ _id: 0, host: "192.168.37.124:27017" },
{ _id: 1, host: "192.168.37.124:27018" },
{ _id: 2, host: "192.168.37.124:27019" }
]
});
4. rs.status()로 설정 확인