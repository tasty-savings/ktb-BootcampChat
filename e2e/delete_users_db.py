from pymongo import MongoClient

# MongoDB 클라이언트 연결
client = MongoClient("mongodb://localhost:27017/")  # 연결 URL 수정 필요
db = client["bootcampchat"]  # 데이터베이스 이름

# 컬렉션의 모든 문서 삭제
result = db["users"].delete_many({})
print(f"users collections : {result.deleted_count} documents deleted.")
result = db["files"].delete_many({})
print(f"files collections : {result.deleted_count} documents deleted.")
result = db["messages"].delete_many({})
print(f"messages collections : {result.deleted_count} documents deleted.")
result = db["rooms"].delete_many({})
print(f"rooms collections : {result.deleted_count} documents deleted.")




