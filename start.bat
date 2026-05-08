@echo off
chcp 65001 >nul
echo ========================================
echo   Memory Shards - 记忆碎片
echo   个人记忆·情感·阅历库系统
echo ========================================
echo.

REM 检查 .env
if not exist "backend\.env" (
    echo [提示] 未找到 backend\.env
    echo 请复制 backend\.env.example 为 backend\.env 并填入 DeepSeek API Key
    echo.
    pause
    exit /b 1
)

REM 安装后端依赖
echo [1/3] 安装后端依赖...
cd backend
pip install -r requirements.txt -q

REM 检查语音模型
echo [2/3] 检查语音模型...
python setup_voice.py
echo.

REM 启动后端
echo [3/3] 启动服务...
start "Memory Shards Backend" cmd /c "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
cd ..

REM 启动前端
cd frontend
call npm install -q
start "Memory Shards Frontend" cmd /c "npm run dev"
cd ..

echo.
echo ========================================
echo   启动完成！
echo   前端: http://localhost:3000
echo   后端: http://localhost:8000
echo   API 文档: http://localhost:8000/docs
echo ========================================
echo.
echo 关闭此窗口不会停止服务
echo 请手动关闭 "Memory Shards Backend" 和 "Memory Shards Frontend" 窗口
pause
