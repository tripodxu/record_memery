import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.memory import Memory
from app.schemas.memory import (
    MemoryCreate, MemoryUpdate, MemoryResponse, MemoryBrief, PhotoUploadResponse,
)
from app.services.storage_service import save_photo, save_audio
from app.services.ai_service import describe_image, generate_opening_remark, analyze_emotion, summarize_text
from app.services.vosk_service import transcribe_file, is_model_ready

router = APIRouter(prefix="/api/memories", tags=["memories"])


@router.post("/photo", response_model=PhotoUploadResponse)
async def upload_photo(
    file: UploadFile = File(...),
    location: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """上传照片，AI 自动分析并创建记忆条目"""
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 20MB")

    # 保存照片
    photo_path, thumb_path = save_photo(file_bytes, file.filename or "photo.jpg")

    # AI 描述图片
    description = await describe_image(photo_path)

    # 创建记忆条目
    memory = Memory(
        original_photo=photo_path,
        thumbnail=thumb_path,
        user_free_text=None,
        ai_dialog_log=[],
        location=location,
        status="complete",
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)

    return PhotoUploadResponse(
        photo_url=f"/storage/photos/{photo_path.split('/photos/')[-1]}",
        thumbnail_url=f"/storage/thumbs/{thumb_path.split('/thumbs/')[-1]}",
        description=description,
        memory_id=memory.id,
    )


@router.post("/voice")
async def upload_voice(
    file: UploadFile = File(...),
    location: Optional[str] = Form(None),
    user_text: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """上传语音，创建语音记忆（与照片同级的一等记忆载体）

    保存录音原声 + 自动转写为文字
    """
    file_bytes = await file.read()
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="音频不能超过 25MB")
    if len(file_bytes) < 500:
        raise HTTPException(status_code=400, detail="录音太短")

    # 保存音频文件
    audio_path = save_audio(file_bytes, file.filename or "recording.webm")

    # 转写
    transcript = ""
    duration = 0
    if is_model_ready():
        result = transcribe_file(audio_path)
        transcript = result.get("text", "")
        duration = result.get("duration", 0)

    # 构建最终文本：用户补充文字 + 转录文本
    parts = []
    if user_text and user_text.strip():
        parts.append(user_text.strip())
    if transcript:
        parts.append(transcript)
    final_text = "\n".join(parts) if parts else None

    # 创建记忆
    memory = Memory(
        audio_raw=audio_path,
        user_free_text=user_text.strip() if user_text else None,
        final_note=final_text,
        location=location,
        ai_dialog_log=[],
        status="complete",
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)

    return {
        "memory_id": memory.id,
        "audio_url": f"/storage/audio/{os.path.basename(audio_path)}",
        "transcript": transcript,
        "duration": duration,
    }


@router.post("/combo")
async def create_combo_memory(
    photo: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """复合记忆创建：照片 + 语音 + 文字，任意组合

    至少需要提供一种内容。
    """
    if not photo and not audio and not (text and text.strip()):
        raise HTTPException(status_code=400, detail="至少需要提供照片、语音或文字中的一种")

    photo_path = None
    thumb_path = None
    audio_path = None
    transcript = ""

    # 保存照片
    if photo:
        file_bytes = await photo.read()
        if len(file_bytes) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="图片不能超过 20MB")
        photo_path, thumb_path = save_photo(file_bytes, photo.filename or "photo.jpg")

    # 保存语音 + 转写
    transcribe_error = None
    if audio:
        audio_bytes = await audio.read()
        if len(audio_bytes) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="音频不能超过 25MB")
        if len(audio_bytes) < 500:
            raise HTTPException(status_code=400, detail="录音太短")
        audio_path = save_audio(audio_bytes, audio.filename or "recording.webm")
        if is_model_ready():
            result = transcribe_file(audio_path)
            transcript = result.get("text", "")
            transcribe_error = result.get("error")
        else:
            transcribe_error = "语音模型未下载"

    # 构建 final_note
    parts = []
    if text and text.strip():
        parts.append(text.strip())
    if transcript:
        parts.append(transcript)
    final_note = "\n".join(parts) if parts else None

    # AI 描述照片（如果有照片且有文字或转录文本）
    ai_description = None
    if photo_path:
        try:
            ai_description = await describe_image(photo_path)
        except Exception:
            pass

    # 情感分析（如果有文字内容）
    emotion = {}
    if final_note:
        try:
            emotion = await analyze_emotion(final_note)
        except Exception:
            pass

    memory = Memory(
        original_photo=photo_path,
        thumbnail=thumb_path,
        audio_raw=audio_path,
        user_free_text=text.strip() if text else None,
        final_note=final_note,
        location=location,
        emotion_primary=emotion.get("primary"),
        emotion_secondary=emotion.get("secondary", []),
        emotion_intensity=emotion.get("intensity"),
        emotion_ai_analysis=emotion.get("analysis"),
        ai_dialog_log=[],
        status="complete",
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)

    return {
        "memory_id": memory.id,
        "photo_url": f"/storage/photos/{os.path.basename(photo_path)}" if photo_path else None,
        "audio_url": f"/storage/audio/{os.path.basename(audio_path)}" if audio_path else None,
        "transcript": transcript,
        "transcribe_error": transcribe_error,
        "ai_description": ai_description,
    }


@router.post("/text", response_model=MemoryResponse)
async def create_text_memory(
    data: MemoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """纯文字创建记忆"""
    emotion = await analyze_emotion(data.user_text or "") if data.user_text else {}

    memory = Memory(
        user_free_text=data.user_text,
        final_note=data.user_text,
        location=data.location,
        tags=data.tags or [],
        is_private=data.is_private,
        emotion_primary=emotion.get("primary"),
        emotion_secondary=emotion.get("secondary", []),
        emotion_intensity=emotion.get("intensity"),
        emotion_ai_analysis=emotion.get("analysis"),
        ai_dialog_log=[],
        status="complete",
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)

    return memory


@router.get("/", response_model=list[MemoryBrief])
async def list_memories(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """获取记忆列表（时间线）"""
    query = select(Memory).order_by(desc(Memory.created_at))
    if status:
        query = query.where(Memory.status == status)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    memories = result.scalars().all()
    return memories


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """获取单条记忆详情"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")
    return memory


@router.patch("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    data: MemoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新记忆"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(memory, key, value)
    memory.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(memory)
    return memory


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """删除记忆"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    await db.delete(memory)
    await db.commit()
    return {"ok": True}


@router.post("/{memory_id}/audio")
async def upload_audio(
    memory_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """为已有记忆上传语音原声"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    file_bytes = await file.read()
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="音频不能超过 25MB")

    audio_path = save_audio(file_bytes, file.filename or "recording.webm")
    memory.audio_raw = audio_path
    memory.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(memory)

    return {"ok": True, "audio_url": f"/storage/audio/{audio_path.split('/audio/')[-1]}"}


@router.post("/{memory_id}/photo")
async def upload_photo_to_memory(
    memory_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """为已有记忆上传照片"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片不能超过 20MB")

    photo_path, thumb_path = save_photo(file_bytes, file.filename or "photo.jpg")
    memory.original_photo = photo_path
    memory.thumbnail = thumb_path
    memory.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(memory)

    return {
        "ok": True,
        "photo_url": f"/storage/photos/{photo_path.split('/photos/')[-1]}",
        "thumbnail_url": f"/storage/thumbs/{thumb_path.split('/thumbs/')[-1]}",
    }


@router.post("/quick", response_model=MemoryResponse)
async def quick_save(
    data: MemoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """快速记录 - 无 AI 介入，直接保存用户输入"""
    memory = Memory(
        user_free_text=data.user_text,
        final_note=data.user_text,
        location=data.location,
        tags=data.tags or [],
        is_private=data.is_private,
        ai_dialog_log=[],
        status="complete",
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory


@router.post("/{memory_id}/ai-summarize", response_model=MemoryResponse)
async def ai_summarize_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """对已有记录进行 AI 总结（不需要对话，直接分析文本）"""
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="记忆不存在")

    # 取可用文本
    text = memory.user_free_text or memory.final_note or ""
    if not text and memory.ai_dialog_log:
        text = "\n".join(m.get("content", "") for m in memory.ai_dialog_log if m.get("role") == "user")

    if not text.strip():
        raise HTTPException(status_code=400, detail="没有可用的文本内容进行总结")

    summary = await summarize_text(text, image_description=None)

    memory.final_note = summary.get("final_note", memory.final_note)
    memory.emotion_primary = summary.get("emotion_primary")
    memory.emotion_secondary = summary.get("emotion_secondary", [])
    memory.emotion_intensity = summary.get("emotion_intensity")
    memory.emotion_ai_analysis = summary.get("emotion_analysis")
    memory.themes = summary.get("themes", [])
    memory.entities = summary.get("entities", [])
    memory.tags = summary.get("tags", memory.tags or [])
    flag_modified(memory, "emotion_secondary")
    flag_modified(memory, "themes")
    flag_modified(memory, "entities")
    flag_modified(memory, "tags")

    await db.commit()
    await db.refresh(memory)
    return memory
