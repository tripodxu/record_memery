import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, JSON
from app.database import Base


class Memory(Base):
    __tablename__ = "memories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    location = Column(String(255), nullable=True)
    status = Column(String(20), default="complete")  # incubating, complete, archived

    # 媒体
    original_photo = Column(String(500), nullable=True)
    thumbnail = Column(String(500), nullable=True)
    audio_raw = Column(String(500), nullable=True)
    has_handwriting = Column(Boolean, default=False)

    # 叙事
    user_free_text = Column(Text, nullable=True)
    ai_dialog_log = Column(JSON, nullable=True)  # [{"role": ..., "content": ...}]
    final_note = Column(Text, nullable=True)

    # 情感
    emotion_primary = Column(String(50), nullable=True)
    emotion_secondary = Column(JSON, nullable=True)  # ["平静", "惊喜"]
    emotion_intensity = Column(Float, nullable=True)
    emotion_ai_analysis = Column(Text, nullable=True)

    # 知识
    themes = Column(JSON, nullable=True)  # ["城市美学", "生活感悟"]
    entities = Column(JSON, nullable=True)  # ["上海", "雨夜"]

    # 标签与隐私
    tags = Column(JSON, nullable=True)  # ["治愈", "城市"]
    is_private = Column(Boolean, default=True)
