const { MongoClient } = require("mongodb");

// MongoDB 연결 URI
const uri =
  "mongodb://testUser:testPassword@192.168.37.124:27017,192.168.37.124:27018,192.168.37.124:27019/?replicaSet=tasty-saving";

// 랜덤 데이터 생성 함수
function generateRandomData(index) {
  return {
    name: `RandomData_${index}`,
    value: Math.floor(Math.random() * 1000), // 0~999 사이의 랜덤 숫자
    timestamp: new Date(),
  };
}

async function testMongoDB() {
  const client = new MongoClient(uri);

  try {
    // MongoDB 클라이언트 연결
    await client.connect();
    console.log("Connected successfully to the Replica Set!");

    // 테스트할 데이터베이스와 컬렉션 선택
    const db = client.db("testDB");
    const collection = db.collection("testCollection");

    // 기존 데이터 삭제
    await collection.deleteMany({});
    console.log("Collection cleared successfully!");

    // 랜덤 데이터 100개 생성
    const randomData = Array.from({ length: 10000 }, (_, i) =>
      generateRandomData(i)
    );

    // 데이터 삽입
    const insertResult = await collection.insertMany(randomData);
    console.log(
      `Inserted ${insertResult.insertedCount} documents successfully!`
    );
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    // 클라이언트 종료
    await client.close();
  }
}

testMongoDB();
