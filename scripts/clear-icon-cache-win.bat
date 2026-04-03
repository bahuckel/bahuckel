@echo off
REM Clear Windows icon cache so updated EXE icons display correctly.
REM Windows caches icons by path; when Bahuckel.exe is updated (e.g. rcedit),
REM Explorer may show the old icon until the cache is rebuilt.
REM Run as Administrator: right-click this file -> Run as administrator.

echo Stopping Explorer...
taskkill /IM explorer.exe /F 2>nul
timeout /t 2 /nobreak >nul

echo Deleting icon cache (Win10/11)...
set "explorer_cache=%localappdata%\Microsoft\Windows\Explorer"
if exist "%explorer_cache%" (
  del /A /Q "%explorer_cache%\iconcache*.db" 2>nul
  del /A /Q "%explorer_cache%\thumbcache*.db" 2>nul
)
del /A /Q "%localappdata%\IconCache.db" 2>nul

echo Restarting Explorer...
start explorer.exe

echo Done. Reopen the win-unpacked folder to see the updated icon.
pause
