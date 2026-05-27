# ============================================================
# hrmanage — Node.js + SQLite 컨테이너
# ============================================================

# Alpine Linux 기반 Node.js 20 (가볍고 빠름)
FROM node:20-alpine

# 작업 디렉토리
WORKDIR /app

# 시스템 의존성 (better-sqlite3 빌드용)
RUN apk add --no-cache python3 make g++ gcc openssl3 openssl3-dev

# package.json + package-lock.json 먼저 복사 (Docker 캐시 최적화)
COPY package*.json ./

# 의존성 설치
RUN npm install

# Prisma schema 복사 (generate에 필요)
COPY prisma ./prisma

# Prisma Client 생성
RUN npx prisma generate

# 나머지 소스 코드 복사
COPY server ./server
COPY public ./public
COPY *.bat ./

# data 디렉토리 생성 (volume mount 포인트)
RUN mkdir -p /app/data

# 시간대 설정 (한국 시간)
ENV TZ=Asia/Seoul

# 포트 노출
EXPOSE 3000

# 실행 명령
CMD ["npm", "run", "dev"]
