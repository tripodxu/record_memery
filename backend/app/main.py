from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.database import init_db
from app.api import memories, chat
from app.api.init_setup import router as system_router
from app.api.voice import router as voice_router
from app.api.ws_transcribe import router as ws_router
from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    await init_db()
    # 确保存储目录存在
    Path(settings.storage_dir, "photos").mkdir(parents=True, exist_ok=True)
    Path(settings.storage_dir, "thumbs").mkdir(parents=True, exist_ok=True)
    Path(settings.storage_dir, "audio").mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Memory Shards - 个人记忆情感阅历库",
    description="捕捉人生瞬间，构建个人专属精神外脑",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件 - 照片/缩略图/音频
storage_path = Path(settings.storage_dir)
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")

# 注册路由
app.include_router(memories.router)
app.include_router(chat.router)
app.include_router(system_router)
app.include_router(voice_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {"message": "Memory Shards API v0.1.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
