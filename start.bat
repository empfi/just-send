@echo off
title Just-Send - Local File Server
cd /d "%~dp0"
if not exist "dist\server\server.js" (
  echo Building TypeScript server and React client...
  call npm run build
)
echo Starting Just-Send Server...
call npm start
pause
