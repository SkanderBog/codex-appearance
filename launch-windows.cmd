@echo off
setlocal
cd /d "%~dp0"
node scripts\start-desktop.cjs %*
