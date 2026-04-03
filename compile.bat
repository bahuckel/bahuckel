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
echo === Bahuckel: npm run build:client-exe ===
echo Builds shared, server, Vite client, Server GUI, then Bahuckel portable exe.
echo.
call npm run build:client-exe
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b 1
)

echo.
echo Build finished successfully.
exit /b 0
