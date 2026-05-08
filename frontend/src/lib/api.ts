const API_BASE = "";

export interface MemoryBrief {
  id: string;
  created_at: string;
  original_photo?: string;
  final_note?: string;
  emotion_primary?: string;
  emotion_secondary?: string[];
  tags?: string[];
  status: string;
  audio_raw?: string;
}

export interface MemoryDetail extends MemoryBrief {
  location?: string;
  user_free_text?: string;
  ai_dialog_log?: { role: string; content: string }[];
  emotion_intensity?: number;
  emotion_ai_analysis?: string;
  themes?: string[];
  entities?: string[];
  is_private: boolean;
}

export interface PhotoUploadResult {
  photo_url: string;
  thumbnail_url?: string;
  description?: string;
  memory_id: string;
}

export interface ChatResponse {
  reply: string;
  emotion_hint?: string;
}

export interface SummarizeResult {
  final_note: string;
  themes: string[];
  entities: string[];
  tags: string[];
}

export interface InitResult {
  overall: string;
  steps: { name: string; status: string; detail: string }[];
}

export interface SystemStatus {
  overall: "ok" | "warn" | "error";
  checks: { name: string; status: string; detail: string }[];
}

// ==================== 系统 ====================

// 检测系统状态（只读）
export async function checkSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/system/status`);
  if (!res.ok) throw new Error(`检测失败: ${res.statusText}`);
  return res.json();
}

// 一键初始化
export async function systemInit(): Promise<InitResult> {
  const res = await fetch(`${API_BASE}/api/system/init`, { method: "POST" });
  if (!res.ok) throw new Error(`初始化失败: ${res.statusText}`);
  return res.json();
}

// 一键导出（ZIP 压缩包，含图片）
export function exportMemoriesZip() {
  window.open(`${API_BASE}/api/system/export`, "_blank");
}

// 删除记忆
export async function deleteMemory(memoryId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memories/${memoryId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`删除失败: ${res.statusText}`);
}

// ==================== 记忆 ====================

// 照片上传
export async function uploadPhoto(
  file: File,
  location?: string
): Promise<PhotoUploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (location) form.append("location", location);

  const res = await fetch(`${API_BASE}/api/memories/photo`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`上传失败: ${res.statusText}`);
  return res.json();
}

// 语音记忆上传（与照片同级的一等记忆载体）
export async function uploadVoice(
  file: Blob,
  location?: string,
  userText?: string
): Promise<{ memory_id: string; audio_url: string; transcript: string; duration: number }> {
  const form = new FormData();
  form.append("file", file, "recording.wav");
  if (location) form.append("location", location);
  if (userText) form.append("user_text", userText);

  const res = await fetch(`${API_BASE}/api/memories/voice`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`语音上传失败: ${res.statusText}`);
  return res.json();
}

// Vosk 模型状态
export async function getVoskStatus(): Promise<{ ready: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/voice/model/status`);
  if (!res.ok) throw new Error("检查失败");
  return res.json();
}

// 下载 Vosk 模型
export async function downloadVoskModel(): Promise<{ ready: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/voice/model/download`, { method: "POST" });
  if (!res.ok) throw new Error("下载失败");
  return res.json();
}

// 复合记忆上传（照片+语音+文字，任意组合）
export async function uploadCombo(data: {
  photo?: File | null;
  audio?: Blob | null;
  text?: string;
  location?: string;
}): Promise<{
  memory_id: string;
  photo_url?: string;
  audio_url?: string;
  transcript?: string;
  transcribe_error?: string;
  ai_description?: string;
}> {
  const form = new FormData();
  if (data.photo) form.append("photo", data.photo);
  if (data.audio) form.append("audio", data.audio, "recording.wav");
  if (data.text) form.append("text", data.text);
  if (data.location) form.append("location", data.location);

  const res = await fetch(`${API_BASE}/api/memories/combo`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`保存失败: ${res.statusText}`);
  return res.json() as Promise<{
    memory_id: string;
    photo_url?: string;
    audio_url?: string;
    transcript?: string;
    transcribe_error?: string;
    ai_description?: string;
  }>;
}

// 纯文字创建记忆（带 AI 分析）
export async function createTextMemory(data: {
  user_text?: string;
  location?: string;
  tags?: string[];
}): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/api/memories/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`创建失败: ${res.statusText}`);
  return res.json();
}

// 快速记录（无 AI 介入）
export async function quickSave(data: {
  user_text?: string;
  location?: string;
  tags?: string[];
}): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/api/memories/quick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`保存失败: ${res.statusText}`);
  return res.json();
}

// 获取记忆列表
export async function listMemories(
  page = 1,
  pageSize = 20
): Promise<MemoryBrief[]> {
  const res = await fetch(
    `${API_BASE}/api/memories/?page=${page}&page_size=${pageSize}`
  );
  if (!res.ok) throw new Error(`获取列表失败: ${res.statusText}`);
  return res.json();
}

// 获取记忆详情
export async function getMemory(id: string): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/api/memories/${id}`);
  if (!res.ok) throw new Error(`获取详情失败: ${res.statusText}`);
  return res.json();
}

// 更新记忆
export async function updateMemory(
  memoryId: string,
  data: {
    final_note?: string;
    user_free_text?: string;
    tags?: string[];
    status?: string;
  }
): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/api/memories/${memoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`更新失败: ${res.statusText}`);
  return res.json();
}

// AI 总结已有记录
export async function aiSummarizeMemory(
  memoryId: string
): Promise<MemoryDetail> {
  const res = await fetch(
    `${API_BASE}/api/memories/${memoryId}/ai-summarize`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`AI 总结失败: ${res.statusText}`);
  return res.json();
}

// 上传音频原声到已有记忆
export async function uploadAudioToMemory(
  memoryId: string,
  audioBlob: Blob
): Promise<{ ok: boolean; audio_url: string }> {
  const form = new FormData();
  form.append("file", audioBlob, "recording.webm");
  const res = await fetch(`${API_BASE}/api/memories/${memoryId}/audio`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`音频上传失败: ${res.statusText}`);
  return res.json();
}

// 上传照片到已有记忆
export async function uploadPhotoToMemory(
  memoryId: string,
  file: File
): Promise<{ ok: boolean; photo_url: string; thumbnail_url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/memories/${memoryId}/photo`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`照片上传失败: ${res.statusText}`);
  return res.json();
}

// ==================== 对话 ====================

// 开始 AI 对话
export async function startChat(memoryId: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat/start/${memoryId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`开始对话失败: ${res.statusText}`);
  return res.json();
}

// 发送消息
export async function sendMessage(
  memoryId: string,
  message: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memory_id: memoryId, message }),
  });
  if (!res.ok) throw new Error(`发送消息失败: ${res.statusText}`);
  return res.json();
}

// 总结对话
export async function summarizeChat(
  memoryId: string
): Promise<SummarizeResult> {
  const res = await fetch(`${API_BASE}/api/chat/summarize/${memoryId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`总结失败: ${res.statusText}`);
  return res.json();
}

// ==================== 语音 ====================

// 语音转文字
export async function transcribeAudio(file: Blob): Promise<{ text: string; error?: string }> {
  const form = new FormData();
  form.append("file", file, "recording.wav");

  const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`语音转写失败: ${res.statusText}`);
  return res.json();
}
