#!/bin/bash
# Memory Shards - 启动脚本

echo "================================"
echo "  Memory Shards - 记忆碎片"
echo "  个人记忆·情感·阅历库系统"
echo "================================"
echo ""

# 检查 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "[提示] 未找到 backend/.env 文件"
    echo "请复制 backend/.env.example 为 backend/.env 并填入 DeepSeek API Key"
    echo ""
    echo "  cp backend/.env.example backend/.env"
    echo ""
    exit 1
fi

# 安装后端依赖（含 vosk）
echo "[1/3] 安装后端依赖..."
cd backend
pip install -r requirements.txt -q

# 检查并下载语音模型
echo "[2/3] 检查语音模型..."
python setup_voice.py

# 启动后端
echo ""
echo "[3/3] 启动服务..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# 启动前端
cd frontend
npm install -q
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "================================"
echo "  启动完成！"
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo "================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
