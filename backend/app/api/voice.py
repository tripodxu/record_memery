"""语音相关接口：转写、模型管理"""
import tempfile
import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.vosk_service import transcribe_file, is_model_ready, download_model

router = APIRouter(prefix="/api/voice", tags=["voice"])
logger = logging.getLogger(__name__)


class TranscribeResponse(BaseModel):
    text: str
    duration: Optional[float] = None
    error: Optional[str] = None


class ModelStatusResponse(BaseModel):
    ready: bool
    message: str


@router.get("/model/status", response_model=ModelStatusResponse)
async def model_status():
    """检查 Vosk 语音模型状态"""
    if is_model_ready():
        return ModelStatusResponse(ready=True, message="语音模型已就绪")
    return ModelStatusResponse(ready=False, message="语音模型未下载")


@router.post("/model/download", response_model=ModelStatusResponse)
async def model_download():
    """下载 Vosk 中文语音模型（约 50MB）"""
    result = download_model()
    return ModelStatusResponse(
        ready=is_model_ready(),
        message=result,
    )


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)):
    """上传音频文件，返回转写文字

    使用 Vosk 本地离线转写，支持格式: wav, mp3, m4a, webm, ogg, flac
    """
    file_bytes = await file.read()
    if len(file_bytes) < 200:
        return TranscribeResponse(text="", error="录音太短")

    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="音频不能超过 25MB")

    ext = "webm"
    if file.filename:
        parts = file.filename.rsplit(".", 1)
        if len(parts) > 1:
            ext = parts[1].lower()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        tmp.write(file_bytes)
        tmp.close()

        if not is_model_ready():
            return TranscribeResponse(
                text="",
                error="语音模型未下载，请先在设置中下载模型",
            )

        result = transcribe_file(tmp.name)
        return TranscribeResponse(
            text=result["text"],
            duration=result.get("duration"),
            error=result.get("error"),
        )
    except Exception as e:
        logger.error(f"语音转写异常: {e}")
        return TranscribeResponse(text="", error=str(e))
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
