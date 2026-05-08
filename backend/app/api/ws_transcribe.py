"""WebSocket 流式语音转录

客户端通过 WebSocket 发送 16kHz 16bit mono PCM 音频块，
服务端用 Vosk 实时识别，逐段返回结果。
"""
import json
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.vosk_service import is_model_ready, _get_model

router = APIRouter(tags=["voice"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket):
    """
    WebSocket 流式语音转录协议：

    客户端 → 服务端:
      二进制消息: 16kHz 16bit mono PCM 音频块
      文本消息 "end": 表示录音结束，请求最终结果

    服务端 → 客户端:
      JSON {"type": "partial", "text": "..."}: 中间识别结果（实时更新）
      JSON {"type": "final",   "text": "..."}: 一句话的最终确认结果
      JSON {"type": "done",    "text": "..."}: 全部识别完成（收到 end 后发送）
      JSON {"type": "error",   "msg":  "..."}: 错误
    """
    await ws.accept()

    if not is_model_ready():
        await ws.send_json({"type": "error", "msg": "语音模型未下载"})
        await ws.close()
        return

    try:
        from vosk import KaldiRecognizer
        model = _get_model()
        rec = KaldiRecognizer(model, 16000)
        rec.SetWords(True)

        all_final_texts = []

        while True:
            msg = await ws.receive()

            # 客户端发送 "end" 表示录音结束
            if msg.get("text") == "end":
                # 获取最后一段
                final_result = json.loads(rec.FinalResult())
                if final_result.get("text"):
                    all_final_texts.append(final_result["text"])
                    await ws.send_json({"type": "final", "text": final_result["text"]})

                # 发送全部结果
                full_text = " ".join(all_final_texts).strip()
                await ws.send_json({"type": "done", "text": full_text})
                break

            # 二进制音频数据
            data = msg.get("bytes")
            if data and len(data) > 0:
                if rec.AcceptWaveform(data):
                    # 一句话识别完成
                    result = json.loads(rec.Result())
                    text = result.get("text", "")
                    if text:
                        all_final_texts.append(text)
                        await ws.send_json({"type": "final", "text": text})
                else:
                    # 中间结果
                    partial = json.loads(rec.PartialResult())
                    text = partial.get("partial", "")
                    if text:
                        await ws.send_json({"type": "partial", "text": text})

    except WebSocketDisconnect:
        logger.info("WebSocket 客户端断开")
    except Exception as e:
        logger.error(f"WebSocket 转录错误: {e}")
        try:
            await ws.send_json({"type": "error", "msg": str(e)})
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
