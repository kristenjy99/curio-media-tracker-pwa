@echo off
setlocal
chcp 65001 >nul
title Reading Tracker - Kiem tra tu dong

rem Luon chay tai thu muc chua file nay, du double-click tu dau.
cd /d "%~dp0"

echo ============================================================
echo  READING TRACKER - KIEM TRA TU DONG (Phase 1 + Phase 2)
echo ============================================================
echo.

if not exist "package.json" (
  echo [LOI] Khong tim thay package.json.
  echo       Hay dat file kiem-tra.bat trong thu muc reading-tracker roi chay lai.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js, hoac vua cai nhung chua mo cua so moi.
  echo       Tai ban v24 LTS tai https://nodejs.org/en/download roi chay lai file nay.
  goto :fail
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
echo [1/3] Node.js phien ban:
node -v
if %NODE_MAJOR% LSS 22 (
  echo [LOI] Can Node.js 22 tro len. Hay cai ban v24 LTS.
  goto :fail
)
echo.

echo [2/3] Cai thu vien (lan dau mat khoang 1 phut)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [LOI] npm install that bai. Chup man hinh doan loi o tren gui lai.
  goto :fail
)
echo.

echo [3/3] Chay kiem tra (khong dung vao du lieu that va vault Obsidian that)...
call npm run verify
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo  KET QUA: DAT. Co the go "approved" de sang phase tiep theo.
echo ============================================================
goto :end

:fail
echo.
echo ============================================================
echo  KET QUA: CHUA DAT. Chup man hinh hoac copy phan bao loi gui lai.
echo ============================================================

:end
echo.
pause
endlocal
