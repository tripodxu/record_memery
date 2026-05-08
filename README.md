# Memory Shards - 记忆碎片

个人记忆 · 情感 · 阅历库系统

有灵魂的 AI 日记本与个人精神外脑。捕捉人生瞬间，通过多模态 AI 辅助沉淀，构建个人专属世界观与知识情感图谱。

## 功能特性

- **多模态输入** — 文字、语音、照片，任意组合记录
- **一键保存** — 无需经过 AI 对话，直接保存到时间线
- **AI 对话** — 可选的深度对话，挖掘瞬间背后的故事与情感
- **情感分析** — 自动识别记录中的情感倾向与强度
- **时间线浏览** — 按时间轴回望所有记忆，支持编辑、追加、删除
- **语音转写** — 基于 Vosk 的离线语音识别，无需联网
- **图片理解** — AI 自动描述照片内容，生成引导对话
- **一键导出** — ZIP 打包导出所有记忆（含图片、音频、JSON、Markdown）

## 技术栈

| 模块 | 技术 |
|------|------|
| 后端框架 | FastAPI + SQLAlchemy + aiosqlite |
| AI 接口 | DeepSeek API (Chat / Vision) |
| 语音识别 | Vosk (离线中文模型) |
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS |
| 3D 视觉 | Three.js + React Three Fiber |
| 数据库 | SQLite (Phase 1) |

## 快速开始

### 1. 环境要求

- Python 3.10+
- Node.js 18+
- ffmpeg（语音转写需要，用于音频格式转换）

安装 ffmpeg：

```bash
# Windows
winget install ffmpeg

# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### 2. 克隆项目

```bash
git clone https://github.com/your-username/memory-shards.git
cd memory-shards
```

### 3. 配置后端

```bash
cd backend

# 复制环境配置
cp .env.example .env

# 编辑 .env，填入你的 DeepSeek API Key
# DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

获取 DeepSeek API Key：访问 [platform.deepseek.com](https://platform.deepseek.com) 注册并创建 API Key。

### 4. 安装依赖并启动

**方式一：一键启动（推荐）**

```bash
# 在项目根目录
chmod +x start.sh
./start.sh
```

**方式二：分别启动**

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

### 5. 访问

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| 后端 API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |

### 6. 语音模型（可选）

首次使用语音功能时，可通过页面右上角设置按钮下载 Vosk 中文语音模型（约 50MB），或手动下载：

```bash
cd backend
python -c "from app.services.vosk_service import download_model; download_model()"
```

## 项目结构

```
memory-shards/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── api/                # API 路由
│   │   │   ├── memories.py     # 记忆 CRUD + 多模态上传
│   │   │   ├── chat.py         # AI 对话
│   │   │   ├── voice.py        # 语音转写
│   │   │   ├── ws_transcribe.py # WebSocket 流式转录
│   │   │   └── init_setup.py   # 系统初始化 + 导出
│   │   ├── models/             # 数据库模型
│   │   │   └── memory.py       # Memory ORM
│   │   ├── schemas/            # Pydantic 数据模式
│   │   │   └── memory.py
│   │   ├── services/           # 业务逻辑
│   │   │   ├── ai_service.py   # DeepSeek API 调用
│   │   │   ├── storage_service.py # 文件存储
│   │   │   └── vosk_service.py # Vosk 语音转写
│   │   ├── config.py           # 配置管理
│   │   ├── database.py         # 数据库连接
│   │   └── main.py             # 应用入口
│   ├── requirements.txt
│   ├── .env.example
│   └── setup_voice.py          # 语音模型下载脚本
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # 首页（多模态输入）
│   │   │   ├── timeline/       # 时间线页面
│   │   │   │   └── page.tsx
│   │   │   ├── layout.tsx      # 全局布局
│   │   │   └── globals.css     # 全局样式
│   │   ├── components/
│   │   │   ├── NebulaScene.tsx # 3D 粒子场景
│   │   │   └── Nav.tsx         # 导航栏
│   │   └── lib/
│   │       ├── api.ts          # API 客户端
│   │       ├── audioRecorder.ts # WAV 录音器
│   │       ├── useAudioAnalyzer.ts # 音频分析 Hook
│   │       └── useStreamTranscribe.ts # 流式转录 Hook
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── .gitignore
├── start.sh                    # 一键启动脚本
└── README.md
```

## API 端点

### 记忆管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/memories/photo` | 上传照片创建记忆 |
| POST | `/api/memories/voice` | 上传语音创建记忆 |
| POST | `/api/memories/combo` | 复合记忆（照片+语音+文字） |
| POST | `/api/memories/text` | 纯文字创建记忆（含 AI 分析） |
| POST | `/api/memories/quick` | 快速记录（无 AI 介入） |
| GET | `/api/memories/` | 获取记忆列表（时间线） |
| GET | `/api/memories/{id}` | 获取记忆详情 |
| PATCH | `/api/memories/{id}` | 更新记忆 |
| DELETE | `/api/memories/{id}` | 删除记忆 |
| POST | `/api/memories/{id}/photo` | 为已有记忆追加照片 |
| POST | `/api/memories/{id}/audio` | 为已有记忆追加语音 |
| POST | `/api/memories/{id}/ai-summarize` | AI 总结已有记录 |

### AI 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/start/{id}` | 开始 AI 引导对话 |
| POST | `/api/chat/message` | 发送对话消息 |
| POST | `/api/chat/summarize/{id}` | 总结对话并保存 |

### 语音服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/voice/model/status` | 检查语音模型状态 |
| POST | `/api/voice/model/download` | 下载语音模型 |
| POST | `/api/voice/transcribe` | 语音文件转文字 |
| WS | `/ws/transcribe` | WebSocket 流式语音转录 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/system/init` | 一键初始化 |
| GET | `/api/system/export` | 一键导出 ZIP |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | （必填） |
| `DEEPSEEK_API_URL` | API 基础地址 | `https://api.deepseek.com` |
| `DATABASE_URL` | 数据库连接串 | `sqlite+aiosqlite:///./memory_shards.db` |
| `STORAGE_DIR` | 文件存储路径 | `./storage` |
| `APP_HOST` | 监听地址 | `0.0.0.0` |
| `APP_PORT` | 监听端口 | `8000` |

## 用户旅程

### 记录瞬间

1. 打开首页，看到文字输入框和工具栏
2. 输入文字 / 点击麦克风录音 / 点击相机拍照（可组合）
3. 点击 **保存到时间线** — 直接保存
4. 保存后可选择 **查看时间线** 或 **和 AI 聊聊**

### 浏览时间线

1. 点击导航栏 **时间线** 或首页顶部入口
2. 按时间轴浏览所有记忆
3. 展开卡片查看详情、编辑内容、追加记录（支持多模态）
4. 一键导出所有记忆为 ZIP

## 开发路线图

- [x] Phase 1：核心体验与数据闭环
- [x] Phase 2：多模态输入（语音、照片、文字组合）
- [ ] Phase 3：ChromaDB 向量检索 + 情感图谱可视化
- [ ] Phase 4：个性化推荐引擎（文章/音乐/电影）
- [ ] Phase 5：移动端 APK + 桌面端 EXE

## License

MIT
