@echo off
setlocal
chcp 65001 >nul
rem Tao (hoac sua) loi tat tren Desktop tro toi mo-app.bat trong thu muc nay.
rem Ten loi tat = ten app trong Cai dat > Giao dien; bieu tuong = bieu tuong app da chon.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js.
  goto :end
)
node server\scripts\createShortcut.js
if errorlevel 1 (
  echo [LOI] Khong tao duoc loi tat. Chup man hinh doan bao loi gui lai.
) else (
  echo Tu gio double-click loi tat tren Desktop de mo app.
  echo Neu chuyen thu muc du an di cho khac, chay lai file nay.
)
:end
echo.
pause
endlocal
