@echo off
chcp 65001 > nul
title ㈜사이냅소프트 인사평가 시스템

cd /d C:\claudeprojects\hrmanage

if exist "node_modules\" (
  echo [OK] 패키지 확인됨
) else (
  echo [설치 중] npm install 실행...
  call npm install
)

:: nodemon 없으면 설치
where nodemon >nul 2>&1
if %errorlevel% neq 0 (
  echo [설치 중] nodemon 설치...
  call npm install -g nodemon
)

echo.
echo 서버 시작 중... (파일 변경 시 자동 재시작)
echo 브라우저: http://localhost:3000
echo 종료하려면 Ctrl+C
echo.

timeout /t 2 /nobreak > nul
start "" http://localhost:3000

nodemon server\index.js
pause