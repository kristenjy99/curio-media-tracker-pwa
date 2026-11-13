@echo off
setlocal
chcp 65001 >nul
title Ke sach - dang chay

rem Mo app: chuan bi (chi cai/dung lai khi co thay doi), khoi dong server va tu mo trinh duyet.
cd /d "%~dp0"

if not exist "package.json" (
  echo [LOI] Khong tim thay package.json. Dat file mo-app.bat trong thu muc reading-tracker.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js. Tai ban v24 LTS tai https://nodejs.org/en/download roi chay lai.
  goto :fail
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo [LOI] Can Node.js 22 tro len. Hay cai ban v24 LTS.
  goto :fail
)

node server\scripts\prepare.js
if errorlevel 1 goto :fail

echo.
echo App dang chay tai http://127.0.0.1:4317 - trinh duyet se tu mo.
echo GIU CUA SO NAY MO trong luc dung app. Dong cua so de tat app.
echo.
set OPEN_BROWSER=1
node server\index.js
if errorlevel 1 (
  echo.
  echo [LOI] App dung bat thuong. Neu bao "EADDRINUSE" thi app dang chay o cua so khac:
  echo       mo http://127.0.0.1:4317 tren trinh duyet, hoac dong cua so cu roi chay lai.
  goto :fail
)
goto :end

:fail
echo.
echo Chup man hinh doan bao loi o tren gui lai de duoc ho tro.

:end
echo.
pause
endlocal
