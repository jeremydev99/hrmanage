@echo off
chcp 65001 > nul
title ㈜사이냅소프트 인사평가 시스템
cd /d C:\claudeprojects\hrmanage

:: 기존 3000 포트 프로세스 종료
echo [정리] 기존 서버 프로세스 종료 중...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak > nul

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

:: ngrok 실행 (이미 실행 중이면 건너뜀)
where ngrok >nul 2>&1
if %errorlevel% equ 0 (
  echo [ngrok] 외부 접속 터널 확인 중...
  curl -s http://localhost:4040/api/tunnels >nul 2>&1
  if %errorlevel% equ 0 (
    echo [ngrok] 이미 실행 중 - 기존 터널 사용
  ) else (
    echo [ngrok] 새 터널 시작 중...
    start "ngrok 터널" cmd /k "ngrok http 3000"
    timeout /t 3 /nobreak > nul
  )
) else (
  echo [ngrok] 설치되지 않음 - 로컬 접속만 가능
)

echo.
echo ========================================
echo  서버 시작 중...
echo  로컬 접속:  http://localhost:3000
echo  외부 접속:  https://sculpture-plant-ferocious.ngrok-free.app
echo  종료:       Ctrl+C
echo ========================================
echo.
timeout /t 2 /nobreak > nul
start "" http://localhost:3000
nodemon server\index.js
pause