@echo off
cd /d "%~dp0"
node punch.js in telegram > punch-in-tg.txt 2>&1
