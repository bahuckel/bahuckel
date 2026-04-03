@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if /i "%~1"=="quick" goto :build

echo === Bahuckel: npm install ===
echo.
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed.
  exit /b 1
)

:build
echo.
echo === Bahuckel: npm run build ===
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b 1
)

echo.
echo Build finished successfully.
exit /b 0
