@echo off
setlocal
rem Tao loi tat "Ke sach" tren Desktop, tro toi mo-app.bat trong thu muc nay.
cd /d "%~dp0"
set "RT_TARGET=%~dp0mo-app.bat"
set "RT_WORKDIR=%~dp0"
set "RT_ICON=%~dp0assets\ke-sach.ico"
rem Neu da doi bieu tuong trong Cai dat > Giao dien thi dung bieu tuong do.
if exist "%~dp0assets\custom-icon.ico" set "RT_ICON=%~dp0assets\custom-icon.ico"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop = [Environment]::GetFolderPath('Desktop'); $link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Ke sach.lnk')); $link.TargetPath = $env:RT_TARGET; $link.WorkingDirectory = $env:RT_WORKDIR; $link.IconLocation = $env:RT_ICON; $link.Description = 'Mo app Ke sach'; $link.Save(); Write-Host ('Da tao loi tat: ' + (Join-Path $desktop 'Ke sach.lnk'))"
if errorlevel 1 (
  echo [LOI] Khong tao duoc loi tat. Chup man hinh doan bao loi gui lai.
) else (
  echo Xong. Tu gio double-click "Ke sach" tren Desktop de mo app.
  echo Neu ban chuyen thu muc reading-tracker di cho khac, chay lai file nay.
)
echo.
pause
endlocal
