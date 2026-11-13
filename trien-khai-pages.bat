@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Dua ban dien thoai (PWA) len GitHub Pages. Huong dan: docs\TRIEN-KHAI-GITHUB-PAGES.md
rem Them tuy chon neu can, vi du: trien-khai-pages.bat --skip-tests
node server\scripts\deployPages.js %*
echo.
pause
