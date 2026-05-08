#!/bin/bash
cd "$(dirname "$0")"

echo "================================"
echo "  Memory Shards - Git Init"
echo "================================"
echo ""

echo "[1/5] git init..."
git init

echo "[2/5] Cleaning caches..."
find backend -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find backend -name "*.pyc" -delete 2>/dev/null
rm -f backend/memory_shards.db
rm -rf frontend/node_modules frontend/.next
rm -rf backend/storage backend/models

echo "[3/5] git add..."
git add .

echo "[4/5] git commit..."
git commit -m "feat: Memory Shards - personal memory system"

echo ""
echo "[5/5] Done! Run these commands to push:"
echo ""
echo "  git remote add origin https://github.com/YOUR_USERNAME/memory-shards.git"
echo "  git branch -M main"
echo "  git push -u origin main"
echo ""
