from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MemoryCreate(BaseModel):
    """创建记忆 - 用户自由文字输入"""
    user_text: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[list[str]] = None
    is_private: bool = True


class MemoryUpdate(BaseModel):
    """更新记忆"""
    final_note: Optional[str] = None
    user_free_text: Optional[str] = None
    tags: Optional[list[str]] = None
    emotion_primary: Optional[str] = None
    emotion_secondary: Optional[list[str]] = None
    status: Optional[str] = None


class DialogMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """对话请求"""
    memory_id: str
    message: str


class ChatResponse(BaseModel):
    """对话响应"""
    reply: str
    emotion_hint: Optional[str] = None


class MemoryResponse(BaseModel):
    """记忆响应"""
    id: str
    created_at: datetime
    location: Optional[str] = None
    status: str = "complete"

    original_photo: Optional[str] = None
    thumbnail: Optional[str] = None
    audio_raw: Optional[str] = None

    user_free_text: Optional[str] = None
    ai_dialog_log: Optional[list[dict]] = None
    final_note: Optional[str] = None

    emotion_primary: Optional[str] = None
    emotion_secondary: Optional[list[str]] = None
    emotion_intensity: Optional[float] = None

    themes: Optional[list[str]] = None
    entities: Optional[list[str]] = None

    tags: Optional[list[str]] = None
    is_private: bool = True

    class Config:
        from_attributes = True


class MemoryBrief(BaseModel):
    """记忆简要 - 用于时间线列表"""
    id: str
    created_at: datetime
    original_photo: Optional[str] = None
    audio_raw: Optional[str] = None
    final_note: Optional[str] = None
    emotion_primary: Optional[str] = None
    emotion_secondary: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    status: str = "complete"

    class Config:
        from_attributes = True


class PhotoUploadResponse(BaseModel):
    """照片上传响应"""
    photo_url: str
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    memory_id: str
