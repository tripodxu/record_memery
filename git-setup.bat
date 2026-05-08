@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ================================
echo   Memory Shards - Git Init
echo ================================
echo.


echo [1/5] Cleaning caches...
for /f "delims=" %%i in ('dir /s /b /ad __pycache__ 2^>nul') do rd /s /q "%%i"
del /s /q *.pyc 2>nul
del /q backend\memory_shards.db 2>nul
if exist "frontend\node_modules" rd /s /q "frontend\node_modules"
if exist "frontend\.next" rd /s /q "frontend\.next"
if exist "backend\storage" rd /s /q "backend\storage"
if exist "backend\models" rd /s /q "backend\models"

echo [3/5] git add...
git add .

pause
