import httpx
import json
import base64
from typing import Optional
from app.config import get_settings

settings = get_settings()

DEEPSEEK_CHAT_URL = f"{settings.deepseek_base_url}/v1/chat/completions"


async def _chat(messages: list[dict], model: str = "deepseek-chat", max_tokens: int = 1024) -> str:
    """调用 DeepSeek Chat API"""
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.8,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(DEEPSEEK_CHAT_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def transcribe_audio(audio_path: str) -> str:
    """将音频转写为文字。

    优先尝试 DeepSeek 的 audio transcription API（兼容 OpenAI Whisper 格式）。
    如果 DeepSeek 不支持该端点，抛出明确异常让调用方处理。
    """
    url = f"{settings.deepseek_base_url}/v1/audio/transcriptions"

    # 确定文件名和 MIME
    ext = audio_path.rsplit(".", 1)[-1].lower() if "." in audio_path else "webm"
    mime_map = {
        "wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4",
        "webm": "audio/webm", "ogg": "audio/ogg", "flac": "audio/flac",
    }
    mime = mime_map.get(ext, "audio/webm")
    filename = f"recording.{ext}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(audio_path, "rb") as f:
            files = {"file": (filename, f, mime)}
            data = {"model": "whisper-1", "language": "zh"}
            headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}

            resp = await client.post(url, headers=headers, files=files, data=data)

            if resp.status_code == 200:
                result = resp.json()
                return result.get("text", "")

            # 如果 DeepSeek 不支持 audio transcription，抛出明确错误
            raise RuntimeError(
                f"语音转写服务不可用 (HTTP {resp.status_code})。"
                f"DeepSeek 可能不支持音频转写接口，请改用文字输入。"
            )


async def describe_image(image_path: str) -> str:
    """用 DeepSeek-VL 描述图片内容。

    DeepSeek-VL2 的 API 格式兼容 OpenAI vision，通过传入 image_url 实现。
    如果 VL 不可用，回退到让用户提供文字描述。
    """
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    # 判断图片格式
    ext = image_path.lower().rsplit(".", 1)[-1]
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{img_b64}"},
                },
                {
                    "type": "text",
                    "text": "请用中文简洁地描述这张图片的内容、氛围和细节，2-3句话即可。像一个敏锐的观察者在记录画面。",
                },
            ],
        }
    ]

    try:
        # 尝试使用 deepseek-chat（支持视觉的版本会自动处理）
        return await _chat(messages, model="deepseek-chat", max_tokens=256)
    except Exception:
        return "[图片已保存，AI 暂时无法描述此图片，请用文字告诉我这里发生了什么]"


async def generate_opening_remark(image_description: Optional[str] = None, user_text: Optional[str] = None) -> str:
    """基于图片描述或用户文字，生成 AI 的第一句引导语"""
    context = ""
    if image_description:
        context = f"用户上传了一张照片，AI 已识别内容如下：\n{image_description}"
    if user_text:
        context += f"\n用户写的文字：{user_text}"

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个温暖、敏锐的记忆记录伙伴。你的任务是帮助用户记录人生中的瞬间和感受。\n"
                "规则：\n"
                "1. 用温柔而真诚的语气，像一个懂你的朋友\n"
                "2. 基于看到的内容，提出一个开放式的好奇问题，引导用户分享更多\n"
                "3. 不要长篇大论，1-3句话即可\n"
                "4. 可以适当表达共情，但不要过度\n"
                "5. 使用中文"
            ),
        },
        {"role": "user", "content": context},
    ]
    return await _chat(messages, max_tokens=256)


async def continue_dialog(
    dialog_history: list[dict],
    user_message: str,
    image_description: Optional[str] = None,
) -> str:
    """继续对话，AI 共情追问"""
    system_prompt = (
        "你是一个温暖、敏锐的记忆记录伙伴。你正在和用户聊天，帮助他们挖掘一个瞬间背后的故事和情感。\n"
        "规则：\n"
        "1. 共情回应用户说的话，然后自然地追问更深层的感受或细节\n"
        "2. 语气温暖真诚，像朋友之间的对话\n"
        "3. 每次回复 1-3 句话，不要冗长\n"
        "4. 如果用户已经分享了足够内容（3-5轮对话后），可以自然地做一个小总结，表示'我帮你记下了'\n"
        "5. 使用中文"
    )

    if image_description:
        system_prompt += f"\n\n[背景] 这个场景的照片内容：{image_description}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(dialog_history)
    messages.append({"role": "user", "content": user_message})

    return await _chat(messages, max_tokens=256)


async def analyze_emotion(text: str) -> dict:
    """分析文本的情感"""
    messages = [
        {
            "role": "system",
            "content": (
                "你是一个情感分析专家。请分析以下文本的情感，并返回 JSON 格式：\n"
                '{"primary": "主要情感词(如:治愈/孤独/兴奋/平静)", '
                '"secondary": ["次要情感1", "次要情感2"], '
                '"intensity": 0-10的强度数值, '
                '"analysis": "一句话情感洞察"}\n'
                "只返回 JSON，不要其他内容。"
            ),
        },
        {"role": "user", "content": text},
    ]

    result = await _chat(messages, max_tokens=256)
    try:
        # 尝试解析 JSON
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, IndexError):
        return {
            "primary": "未知",
            "secondary": [],
            "intensity": 5.0,
            "analysis": result[:200],
        }


async def summarize_dialog(dialog_history: list[dict], image_description: Optional[str] = None) -> dict:
    """对话结束后，生成结构化总结"""
    dialog_text = "\n".join(
        f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}" for m in dialog_history
    )

    context = f"对话记录：\n{dialog_text}"
    if image_description:
        context = f"场景描述：{image_description}\n\n{context}"

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个记忆整理专家。请将以下对话整理为结构化 JSON：\n"
                '{\n'
                '  "final_note": "一段精炼的记忆总结（2-4句话，有温度感）",\n'
                '  "themes": ["主题1", "主题2"],\n'
                '  "entities": ["出现的地名、人名、物名等实体"],\n'
                '  "tags": ["标签1", "标签2", "标签3"]\n'
                '}\n'
                "只返回 JSON，不要其他内容。"
            ),
        },
        {"role": "user", "content": context},
    ]

    result = await _chat(messages, max_tokens=512)
    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, IndexError):
        return {
            "final_note": dialog_history[-1]["content"] if dialog_history else "",
            "themes": [],
            "entities": [],
            "tags": [],
        }


async def summarize_text(text: str, image_description: Optional[str] = None) -> dict:
    """对一段自由文本进行 AI 总结（无需对话，用于 'AI 总结' 功能）"""
    context = text
    if image_description:
        context = f"场景描述：{image_description}\n\n用户记录：{text}"

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个记忆整理专家。请将以下用户记录整理为结构化 JSON：\n"
                '{\n'
                '  "final_note": "一段精炼的记忆总结（2-4句话，保留原文温度）",\n'
                '  "emotion_primary": "主要情感词",\n'
                '  "emotion_secondary": ["次要情感"],\n'
                '  "emotion_intensity": 0-10数值,\n'
                '  "emotion_analysis": "一句话情感洞察",\n'
                '  "themes": ["主题1", "主题2"],\n'
                '  "entities": ["出现的地名、人名、物名等"],\n'
                '  "tags": ["标签1", "标签2"]\n'
                '}\n'
                "只返回 JSON，不要其他内容。"
            ),
        },
        {"role": "user", "content": context},
    ]

    result = await _chat(messages, max_tokens=512)
    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, IndexError):
        return {
            "final_note": text[:200],
            "emotion_primary": "未知",
            "emotion_secondary": [],
            "emotion_intensity": 5.0,
            "emotion_analysis": "",
            "themes": [],
            "entities": [],
            "tags": [],
        }
