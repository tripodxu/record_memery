"""Vosk 离线语音转写服务

使用 Vosk 进行本地语音识别，无需联网。
模型自动下载到 backend/models/ 目录。
"""
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Optional

# 模型目录
MODELS_DIR = Path(__file__).parent.parent.parent / "models"
MODEL_NAME = "vosk-model-small-cn-0.22"
MODEL_PATH = MODELS_DIR / MODEL_NAME
MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"

# 全局模型实例（懒加载）
_model = None


def is_model_ready() -> bool:
    """检查模型是否已下载"""
    return MODEL_PATH.exists() and (MODEL_PATH / "conf").exists()


def download_model() -> str:
    """下载中文语音模型（约 50MB）

    Returns:
        下载结果描述
    """
    import urllib.request
    import zipfile

    if is_model_ready():
        return "模型已存在"

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = MODELS_DIR / f"{MODEL_NAME}.zip"

    print(f"[Vosk] 正在下载中文模型 {MODEL_NAME} ...")
    print(f"[Vosk] 下载地址: {MODEL_URL}")

    try:
        urllib.request.urlretrieve(MODEL_URL, str(zip_path))
    except Exception as e:
        return f"下载失败: {e}"

    print("[Vosk] 正在解压模型...")
    try:
        with zipfile.ZipFile(str(zip_path), "r") as zf:
            zf.extractall(str(MODELS_DIR))
        zip_path.unlink()  # 删除 zip
        return "模型下载完成"
    except Exception as e:
        return f"解压失败: {e}"


def _get_model():
    """懒加载模型"""
    global _model
    if _model is not None:
        return _model

    if not is_model_ready():
        raise RuntimeError(
            f"Vosk 模型未找到。请运行: python -c \"from app.services.vosk_service import download_model; download_model()\""
        )

    from vosk import Model
    _model = Model(str(MODEL_PATH))
    return _model


def _convert_to_pcm(input_path: str) -> str:
    """用 ffmpeg 将任意音频转为 Vosk 需要的 PCM WAV (16kHz, 16bit, mono)

    Returns:
        输出 wav 文件路径
    """
    output_path = input_path + ".vosk.wav"

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ar", "16000",    # 采样率 16kHz
        "-ac", "1",        # 单声道
        "-sample_fmt", "s16",  # 16bit
        "-f", "wav",
        output_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 转换失败: {result.stderr[:200]}")
        return output_path
    except FileNotFoundError:
        raise RuntimeError(
            "未找到 ffmpeg，请安装: winget install ffmpeg  (Windows) 或 apt install ffmpeg (Linux)"
        )


def transcribe_file(audio_path: str) -> dict:
    """转写音频文件为文字

    Args:
        audio_path: 音频文件路径（支持 webm, mp3, wav, m4a, ogg 等）

    Returns:
        {"text": "转写结果", "duration": 秒数, "error": None}
    """
    try:
        from vosk import KaldiRecognizer
    except ImportError:
        return {"text": "", "duration": 0, "error": "vosk 未安装，请运行 pip install vosk"}

    if not os.path.isfile(audio_path):
        return {"text": "", "duration": 0, "error": f"文件不存在: {audio_path}"}

    # 如果不是 wav，先用 ffmpeg 转换
    wav_path = audio_path
    need_cleanup = False

    if not audio_path.lower().endswith(".wav"):
        try:
            wav_path = _convert_to_pcm(audio_path)
            need_cleanup = True
        except RuntimeError as e:
            return {"text": "", "duration": 0, "error": str(e)}

    try:
        model = _get_model()
        wf = wave.open(wav_path, "rb")

        # 验证格式
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != 16000:
            wf.close()
            # 强制重新转换
            if not need_cleanup:
                wav_path = _convert_to_pcm(audio_path)
                need_cleanup = True
            wf = wave.open(wav_path, "rb")

        duration = wf.getnframes() / wf.getframerate()
        rec = KaldiRecognizer(model, wf.getframerate())
        rec.SetWords(True)

        results = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                part = json.loads(rec.Result())
                if part.get("text"):
                    results.append(part["text"])

        # 最后一段
        final = json.loads(rec.FinalResult())
        if final.get("text"):
            results.append(final["text"])

        wf.close()

        full_text = " ".join(results).strip()
        return {"text": full_text, "duration": round(duration, 1), "error": None}

    except Exception as e:
        return {"text": "", "duration": 0, "error": f"转写失败: {str(e)}"}
    finally:
        # 清理临时 wav
        if need_cleanup and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except OSError:
                pass
