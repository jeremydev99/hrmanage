@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo  서버 시작 중...
echo  로컬 접속:  http://localhost:3000
echo  종료:       Ctrl+C
echo ========================================
npx nodemon server/index.js