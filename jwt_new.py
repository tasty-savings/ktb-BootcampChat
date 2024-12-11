import secrets

# Secret key 생성
jwt_secret = secrets.token_hex(32)
print(jwt_secret)
