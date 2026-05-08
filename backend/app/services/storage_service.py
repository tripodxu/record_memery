import os
import uuid
import shutil
from pathlib import Path
from PIL import Image
from app.config import get_settings

settings = get_settings()
STORAGE_DIR = Path(settings.storage_dir)


def ensure_dirs():
    """确保存储目录存在"""
    (STORAGE_DIR / "photos").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "thumbs").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "audio").mkdir(parents=True, exist_ok=True)


def save_photo(file_bytes: bytes, filename: str) -> tuple[str, str]:
    """保存照片并生成缩略图，返回 (photo_path, thumbnail_path)"""
    ensure_dirs()

    ext = Path(filename).suffix.lower() or ".jpg"
    uid = uuid.uuid4().hex
    photo_name = f"{uid}{ext}"
    thumb_name = f"{uid}_thumb{ext}"

    photo_path = STORAGE_DIR / "photos" / photo_name
    thumb_path = STORAGE_DIR / "thumbs" / thumb_name

    # 保存原图
    with open(photo_path, "wb") as f:
        f.write(file_bytes)

    # 生成缩略图
    try:
        img = Image.open(photo_path)
        img.thumbnail((400, 400))
        img.save(thumb_path)
    except Exception:
        # 如果缩略图生成失败，复制原图
        shutil.copy(photo_path, thumb_path)

    return str(photo_path), str(thumb_path)


def save_audio(file_bytes: bytes, filename: str) -> str:
    """保存音频文件"""
    ensure_dirs()

    ext = Path(filename).suffix.lower() or ".m4a"
    uid = uuid.uuid4().hex
    audio_name = f"{uid}{ext}"
    audio_path = STORAGE_DIR / "audio" / audio_name

    with open(audio_path, "wb") as f:
        f.write(file_bytes)

    return str(audio_path)


def get_file_url(relative_path: str) -> str:
    """将文件路径转换为可访问的 URL"""
    if not relative_path:
        return ""
    # 返回相对于 storage 目录的 URL 路径
    return f"/storage/{relative_path.split('storage/')[-1] if 'storage/' in relative_path else relative_path}"
