from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.memory import Memory
from app.schemas.memory import ChatRequest, ChatResponse
from app.services.ai_service import (
    generate_opening_remark,
    continue_dialog,
    analyze_emotion,
    summarize_dialog,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/start/{memory_id}", response_model=ChatResponse)
async def start_chat(memory_id: str, db: AsyncSession = Depends(get_db)):
    """开始 AI 引导对话（照片已上传后调用）"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    image_desc = None
    if memory.original_photo:
        image_desc = memory.user_free_text or "用户上传了一张照片"

    opening = await generate_opening_remark(
        image_description=image_desc,
        user_text=memory.user_free_text,
    )

    # 用新列表替换，确保 SQLAlchemy 检测到变化
    dialog = list(memory.ai_dialog_log or [])
    dialog.append({"role": "assistant", "content": opening})
    memory.ai_dialog_log = dialog
    flag_modified(memory, "ai_dialog_log")
    await db.commit()

    return ChatResponse(reply=opening)


@router.post("/message", response_model=ChatResponse)
async def send_message(data: ChatRequest, db: AsyncSession = Depends(get_db)):
    """用户发送消息，AI 回复"""
    result = await db.execute(select(Memory).where(Memory.id == data.memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    dialog = list(memory.ai_dialog_log or [])

    dialog.append({"role": "user", "content": data.message})

    reply = await continue_dialog(
        dialog_history=dialog,
        user_message=data.message,
        image_description=memory.user_free_text,
    )

    dialog.append({"role": "assistant", "content": reply})
    memory.ai_dialog_log = dialog
    flag_modified(memory, "ai_dialog_log")

    # 静默分析情感
    emotion = await analyze_emotion(data.message)
    memory.emotion_primary = emotion.get("primary")
    memory.emotion_secondary = emotion.get("secondary", [])
    memory.emotion_intensity = emotion.get("intensity")
    memory.emotion_ai_analysis = emotion.get("analysis")

    await db.commit()

    return ChatResponse(reply=reply, emotion_hint=emotion.get("primary"))


@router.post("/summarize/{memory_id}")
async def summarize(memory_id: str, db: AsyncSession = Depends(get_db)):
    """对话结束后生成结构化总结"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    dialog = memory.ai_dialog_log or []
    if not dialog:
        raise HTTPException(status_code=400, detail="对话为空，无法总结")

    summary = await summarize_dialog(dialog, image_description=memory.user_free_text)

    memory.final_note = summary.get("final_note", "")
    memory.themes = summary.get("themes", [])
    memory.entities = summary.get("entities", [])
    memory.tags = summary.get("tags", [])
    memory.status = "complete"

    await db.commit()
    await db.refresh(memory)

    return {
        "final_note": memory.final_note,
        "themes": memory.themes,
        "entities": memory.entities,
        "tags": memory.tags,
    }
