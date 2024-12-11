from pymongo import MongoClient

# MongoDB 클라이언트 연결
client = MongoClient("mongodb://localhost:27017/")  # 연결 URL 수정 필요
db = client["bootcampchat"]  # 데이터베이스 이름
users_collection = db["users"]

# 컬렉션의 모든 문서 삭제
result = users_collection.delete_many({})
print(f"{result.deleted_count} documents deleted.")
