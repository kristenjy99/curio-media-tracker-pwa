@echo off
setlocal
chcp 65001 >nul
title Ke sach - ban dien thoai (thu)

rem Chay thu ban dien thoai (PWA) ngay tren may: dung lai neu can roi phuc vu qua HTTP.
rem Khac mo-app.bat: o day KHONG co server API, toan bo database nam trong trinh duyet.
cd /d "%~dp0"

if not exist "package.json" (
  echo [LOI] Khong tim thay package.json. Dat file nay trong thu muc media-tracker.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js. Tai ban v24 LTS tai https://nodejs.org/en/download roi chay lai.
  goto :fail
)

if not exist "node_modules" (
  echo Chua cai thu vien. Dang chay npm install, lan dau se lau vai phut...
  call npm install
  if errorlevel 1 goto :fail
)

rem Them --build de luon dung lai ban moi nhat truoc khi phuc vu.
node server\scripts\servePwa.js --build %*
if errorlevel 1 goto :fail
goto :end

:fail
echo.
echo Chup man hinh doan bao loi o tren gui lai de duoc ho tro.

:end
echo.
pause
endlocal
