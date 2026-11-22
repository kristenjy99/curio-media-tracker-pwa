@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Kiem tra va tu sua ban dien thoai (GitHub Pages): repo, origin, ma nguon, Pages, Client ID, lan dung app, dia chi app.
rem Tuy chon: --repo <ten>  (vi du: kiem-tra-pages.bat --repo curio-media-tracker-pwa)
rem           --chi-kiem    chi kiem tra, khong sua
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js.
  goto :end
)
node server\scripts\checkPages.js %*
:end
echo.
pause
