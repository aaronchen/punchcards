@echo off
cd /d "%~dp0"
set "NODE_ENV=production"
node punch.js out telegram > punch-out-tg.txt 2>&1