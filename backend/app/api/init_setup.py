"""一键初始化与一键导出（ZIP 压缩包，含图片）"""
import json
import csv
import io
import os
import zipfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db, init_db
from app.models.memory import Memory
from app.config import get_settings

router = APIRouter(prefix="/api/system", tags=["system"])
settings = get_settings()


@router.post("/init")
async def system_init(db: AsyncSession = Depends(get_db)):
    """一键初始化：建表 + 创建目录 + 检查 API 连通性"""
    results = {"steps": []}

    # 1. 初始化数据库表
    try:
        await init_db()
        results["steps"].append({"name": "数据库", "status": "ok", "detail": "表结构已创建/确认"})
    except Exception as e:
        results["steps"].append({"name": "数据库", "status": "error", "detail": str(e)})

    # 2. 创建存储目录
    dirs_created = []
    for sub in ["photos", "thumbs", "audio"]:
        p = Path(settings.storage_dir) / sub
        p.mkdir(parents=True, exist_ok=True)
        dirs_created.append(str(p))
    results["steps"].append({"name": "存储目录", "status": "ok", "detail": f"已确认: {', '.join(dirs_created)}"})

    # 3. 检查 DeepSeek API 连通性
    if settings.deepseek_api_key and settings.deepseek_api_key != "your_deepseek_api_key_here":
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{settings.deepseek_base_url}/v1/models",
                    headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
                )
                if resp.status_code == 200:
                    results["steps"].append({"name": "DeepSeek API", "status": "ok", "detail": "连通正常"})
                else:
                    results["steps"].append({"name": "DeepSeek API", "status": "warn", "detail": f"响应码: {resp.status_code}"})
        except Exception as e:
            results["steps"].append({"name": "DeepSeek API", "status": "warn", "detail": f"连接失败: {e}"})
    else:
        results["steps"].append({"name": "DeepSeek API", "status": "warn", "detail": "未配置 API Key，AI 功能不可用"})

    # 4. 检查 Vosk 语音模型
    from app.services.vosk_service import is_model_ready
    if is_model_ready():
        results["steps"].append({"name": "语音模型", "status": "ok", "detail": "Vosk 中文模型已就绪"})
    else:
        results["steps"].append({"name": "语音模型", "status": "warn", "detail": "未下载，语音录音仍可保存但不自动转写"})

    # 5. 统计现有数据
    count_result = await db.execute(select(func.count(Memory.id)))
    total = count_result.scalar() or 0
    results["steps"].append({"name": "数据统计", "status": "ok", "detail": f"已有 {total} 条记忆"})

    results["overall"] = "ok" if all(s["status"] != "error" for s in results["steps"]) else "error"
    return JSONResponse(content=results)


@router.get("/export")
async def export_memories(db: AsyncSession = Depends(get_db)):
    """一键导出所有记忆为 ZIP 压缩包（含图片 + JSON + Markdown）

    ZIP 结构:
    ├── README.md          # 导出说明
    ├── memories.json      # 完整结构化数据
    ├── memories.md        # 可读的 Markdown 版本
    ├── photos/            # 原图
    │   ├── xxx.jpg
    │   └── ...
    └── thumbs/            # 缩略图
        ├── xxx_thumb.jpg
        └── ...
    """
    result = await db.execute(select(Memory).order_by(desc(Memory.created_at)))
    memories = result.scalars().all()

    # 构建 JSON 数据
    json_data = []
    for m in memories:
        json_data.append({
            "id": m.id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "location": m.location,
            "status": m.status,
            "user_text": m.user_free_text,
            "final_note": m.final_note,
            "ai_dialog_log": m.ai_dialog_log,
            "emotion": {
                "primary": m.emotion_primary,
                "secondary": m.emotion_secondary,
                "intensity": m.emotion_intensity,
                "analysis": m.emotion_ai_analysis,
            },
            "themes": m.themes,
            "entities": m.entities,
            "tags": m.tags,
            "is_private": m.is_private,
            "photo_file": os.path.basename(m.original_photo) if m.original_photo else None,
            "thumb_file": os.path.basename(m.thumbnail) if m.thumbnail else None,
        })

    # 构建 Markdown
    md_lines = _build_markdown(memories)

    # 打包 ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # README
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        readme = (
            f"# Memory Shards 导出\n\n"
            f"导出时间: {timestamp}\n"
            f"记忆总数: {len(memories)}\n\n"
            f"## 文件说明\n\n"
            f"- `memories.json` — 完整结构化数据（含对话记录、情感分析）\n"
            f"- `memories.md` — 可读的 Markdown 版本\n"
            f"- `photos/` — 原始照片\n"
            f"- `thumbs/` — 缩略图\n"
        )
        zf.writestr("README.md", readme)

        # JSON
        zf.writestr("memories.json", json.dumps(json_data, ensure_ascii=False, indent=2))

        # Markdown
        zf.writestr("memories.md", "\n".join(md_lines))

        # 照片文件
        photos_added = set()
        for m in memories:
            if m.original_photo and os.path.isfile(m.original_photo):
                fname = os.path.basename(m.original_photo)
                if fname not in photos_added:
                    zf.write(m.original_photo, f"photos/{fname}")
                    photos_added.add(fname)

            if m.thumbnail and os.path.isfile(m.thumbnail):
                fname = os.path.basename(m.thumbnail)
                if fname not in photos_added:
                    zf.write(m.thumbnail, f"thumbs/{fname}")
                    photos_added.add(fname)

            # 音频文件
            if m.audio_raw and os.path.isfile(m.audio_raw):
                fname = os.path.basename(m.audio_raw)
                zf.write(m.audio_raw, f"audio/{fname}")

    zip_buffer.seek(0)
    dl_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="memory_shards_{dl_timestamp}.zip"'},
    )


def _build_markdown(memories: list) -> list[str]:
    lines = ["# Memory Shards - 记忆碎片导出\n"]
    lines.append(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append(f"共 {len(memories)} 条记忆\n")
    lines.append("---\n")

    for m in memories:
        date_str = m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "未知时间"
        emotion_str = f" {m.emotion_primary}" if m.emotion_primary else ""
        lines.append(f"## {date_str}{emotion_str}\n")

        if m.location:
            lines.append(f"📍 {m.location}\n")

        if m.original_photo:
            fname = os.path.basename(m.original_photo)
            lines.append(f"![照片](photos/{fname})\n")

        if m.user_free_text:
            lines.append(f"**记录：** {m.user_free_text}\n")

        if m.final_note:
            lines.append(f"**总结：** {m.final_note}\n")

        if m.emotion_ai_analysis:
            lines.append(f"> {m.emotion_ai_analysis}\n")

        if m.themes:
            lines.append(f"主题: {', '.join(m.themes)}\n")

        if m.tags:
            lines.append(f"标签: {', '.join(f'#{t}' for t in m.tags)}\n")

        if m.ai_dialog_log:
            lines.append("\n<details><summary>对话记录</summary>\n")
            for msg in m.ai_dialog_log:
                role = "你" if msg.get("role") == "user" else "AI"
                lines.append(f"- **{role}:** {msg.get('content', '')}")
            lines.append("\n</details>\n")

        lines.append("---\n")

    return lines
