"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listMemories,
  getMemory,
  deleteMemory,
  updateMemory,
  aiSummarizeMemory,
  exportMemoriesZip,
  uploadAudioToMemory,
  uploadPhotoToMemory,
  MemoryBrief,
  MemoryDetail,
} from "@/lib/api";
import { WavRecorder } from "@/lib/audioRecorder";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Calendar, ChevronDown, ChevronUp, Loader2,
  Download, Brain, Sparkles, Trash2, X,
  Pencil, Plus, Mic, MicOff, Save, Camera,
} from "lucide-react";

import SystemStatus from "@/components/SystemStatus";

const emotionEmojis: Record<string, string> = {
  "治愈": "🌿", "孤独": "🌙", "兴奋": "✨", "平静": "☁️",
  "惊喜": "🎉", "感动": "💧", "忧郁": "🌧️", "温暖": "☀️",
  "怀旧": "📷", "未知": "💫",
};

export default function TimelinePage() {
  const [memories, setMemories] = useState<MemoryBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<MemoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<MemoryBrief | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 导出中
  const [exporting, setExporting] = useState(false);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // 追加模式
  const [appendingId, setAppendingId] = useState<string | null>(null);
  const [appendText, setAppendText] = useState("");
  const [appendSaving, setAppendSaving] = useState(false);
  const [appendPhoto, setAppendPhoto] = useState<File | null>(null);
  const [appendPhotoPreview, setAppendPhotoPreview] = useState<string | null>(null);
  const [appendAudioBlob, setAppendAudioBlob] = useState<Blob | null>(null);
  const [appendAudioDuration, setAppendAudioDuration] = useState(0);
  const [appendDuration, setAppendDuration] = useState(0);
  const appendFileRef = useRef<HTMLInputElement>(null);
  const appendWavRef = useRef<WavRecorder | null>(null);
  const appendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appendStartRef = useRef(0);

  // 语音 (Web Speech API) — 用 ref 绕过闭包
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceTargetRef = useRef<"edit" | "append">("edit");
  const setEditTextRef = useRef(setEditText);
  const setAppendTextRef = useRef(setAppendText);
  setEditTextRef.current = setEditText;
  setAppendTextRef.current = setAppendText;

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text) {
        if (voiceTargetRef.current === "edit") {
          setEditTextRef.current((prev: string) => prev ? prev + " " + text : text);
        } else {
          setAppendTextRef.current((prev: string) => prev ? prev + " " + text : text);
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === "not-allowed") alert("请允许浏览器使用麦克风");
      setRecording(false);
    };

    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    return rec;
  }, []);

  const toggleVoice = useCallback((target: "edit" | "append") => {
    const rec = getRecognition();
    if (!rec) { alert("浏览器不支持语音识别，请使用 Chrome 或 Edge"); return; }
    if (recording) {
      rec.stop();
      setRecording(false);
    } else {
      voiceTargetRef.current = target;
      try { rec.start(); setRecording(true); }
      catch { rec.stop(); setRecording(false); }
    }
  }, [recording, getRecognition]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      if (appendWavRef.current) { appendWavRef.current.cancel(); appendWavRef.current = null; }
      if (appendTimerRef.current) { clearInterval(appendTimerRef.current); }
    };
  }, []);

  useEffect(() => {
    loadMemories();
  }, [page]);

  // 从记录页返回时自动刷新
  useEffect(() => {
    const handleFocus = () => loadMemories();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [page]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const data = await listMemories(page);
      setMemories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMemory = async (id: string) => {
    if (selectedMemory?.id === id) {
      setSelectedMemory(null);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await getMemory(id);
      setSelectedMemory(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // ==================== 编辑 ====================

  const startEdit = (memory: MemoryDetail) => {
    setEditingId(memory.id);
    setEditText(memory.final_note || memory.user_free_text || "");
    setAppendingId(null);
  };

  const cancelEdit = () => {
    if (recording) {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      setRecording(false);
    }
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setEditSaving(true);
    try {
      await updateMemory(editingId, { final_note: editText.trim() });
      setMemories((prev) =>
        prev.map((m) => (m.id === editingId ? { ...m, final_note: editText.trim() } : m))
      );
      if (selectedMemory?.id === editingId) {
        setSelectedMemory((prev) => (prev ? { ...prev, final_note: editText.trim() } : null));
      }
      setEditingId(null);
      setEditText("");
    } catch (err) {
      alert("保存失败");
    } finally {
      setEditSaving(false);
    }
  };

  // ==================== 追加 ====================

  const startAppend = (memoryId: string) => {
    // 停止可能正在进行的录音
    if (recording) {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      setRecording(false);
    }
    setAppendingId(memoryId);
    setAppendText("");
    setAppendPhoto(null);
    setAppendPhotoPreview(null);
    setAppendAudioBlob(null);
    setAppendAudioDuration(0);
    setEditingId(null);
  };

  const cancelAppend = () => {
    if (appendPhotoPreview) URL.revokeObjectURL(appendPhotoPreview);
    if (appendWavRef.current) { appendWavRef.current.cancel(); appendWavRef.current = null; }
    if (appendTimerRef.current) { clearInterval(appendTimerRef.current); appendTimerRef.current = null; }
    if (recording) { setRecording(false); }
    setAppendingId(null);
    setAppendText("");
    setAppendPhoto(null);
    setAppendPhotoPreview(null);
    setAppendAudioBlob(null);
    setAppendAudioDuration(0);
  };

  const handleAppendPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (appendPhotoPreview) URL.revokeObjectURL(appendPhotoPreview);
    setAppendPhoto(file);
    setAppendPhotoPreview(URL.createObjectURL(file));
  };

  const removeAppendPhoto = () => {
    if (appendPhotoPreview) URL.revokeObjectURL(appendPhotoPreview);
    setAppendPhoto(null);
    setAppendPhotoPreview(null);
  };

  const toggleAppendVoice = async () => {
    if (recording) {
      // 停止录音
      if (appendTimerRef.current) { clearInterval(appendTimerRef.current); appendTimerRef.current = null; }
      const recorder = appendWavRef.current;
      const finalDuration = Math.round((Date.now() - appendStartRef.current) / 1000);
      if (recorder && recorder.recording) {
        const blob = recorder.stop();
        appendWavRef.current = null;
        if (blob.size > 200) {
          setAppendAudioBlob(blob);
          setAppendAudioDuration(finalDuration);
        }
      }
      setRecording(false);
    } else {
      // 开始录音
      try {
        const recorder = new WavRecorder();
        await recorder.start();
        appendWavRef.current = recorder;
        setRecording(true);
        appendStartRef.current = Date.now();
        setAppendDuration(0);
        appendTimerRef.current = setInterval(
          () => setAppendDuration(Math.round((Date.now() - appendStartRef.current) / 1000)),
          500
        );
      } catch {
        alert("无法访问麦克风");
      }
    }
  };

  const hasAppendContent = appendText.trim() || appendPhoto || appendAudioBlob;

  const saveAppend = async () => {
    if (!appendingId || !hasAppendContent) return;
    setAppendSaving(true);
    try {
      // 1. 上传照片（如果有）
      if (appendPhoto) {
        await uploadPhotoToMemory(appendingId, appendPhoto);
      }

      // 2. 上传音频（如果有）
      if (appendAudioBlob) {
        await uploadAudioToMemory(appendingId, appendAudioBlob);
      }

      // 3. 更新文字（如果有）
      if (appendText.trim()) {
        const current = memories.find((m) => m.id === appendingId);
        const oldText = current?.final_note || "";
        const newNote = oldText ? oldText + "\n" + appendText.trim() : appendText.trim();
        await updateMemory(appendingId, { final_note: newNote });
      }

      // 4. 刷新该记忆的详情
      const updated = await getMemory(appendingId);
      setMemories((prev) =>
        prev.map((m) => (m.id === appendingId ? { ...m, final_note: updated.final_note, original_photo: updated.original_photo, audio_raw: updated.audio_raw } : m))
      );
      if (selectedMemory?.id === appendingId) {
        setSelectedMemory(updated);
      }

      // 5. 清理状态
      if (appendPhotoPreview) URL.revokeObjectURL(appendPhotoPreview);
      setAppendingId(null);
      setAppendText("");
      setAppendPhoto(null);
      setAppendPhotoPreview(null);
      setAppendAudioBlob(null);
      setAppendAudioDuration(0);
    } catch (err) {
      alert("保存失败");
    } finally {
      setAppendSaving(false);
    }
  };

  // ==================== 删除 ====================

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMemory(deleteTarget.id);
      setMemories((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (selectedMemory?.id === deleteTarget.id) setSelectedMemory(null);
      setDeleteTarget(null);
    } catch (err) {
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // ==================== AI 总结 ====================

  const handleAiSummarize = async (memoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAiLoading(memoryId);
    try {
      const updated = await aiSummarizeMemory(memoryId);
      setMemories((prev) =>
        prev.map((m) =>
          m.id === memoryId
            ? { ...m, final_note: updated.final_note, emotion_primary: updated.emotion_primary, tags: updated.tags }
            : m
        )
      );
      if (selectedMemory?.id === memoryId) setSelectedMemory(updated);
    } catch (err) {
      alert("AI 总结失败");
    } finally {
      setAiLoading(null);
    }
  };

  // ==================== 导出 ====================

  const handleExport = () => {
    setExporting(true);
    exportMemoriesZip();
    setTimeout(() => setExporting(false), 2000);
  };

  // ==================== 工具函数 ====================

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), "M月d日 HH:mm", { locale: zhCN }); }
    catch { return dateStr; }
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const getPhotoUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    const parts = path.split("storage/");
    return parts.length > 1 ? `/storage/${parts[1]}` : path;
  };

  const getAudioUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    const parts = path.split("storage/");
    return parts.length > 1 ? `/storage/${parts[1]}` : path;
  };

  // ==================== 渲染 ====================

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* 系统状态 — 右上角指示器 */}
      <SystemStatus />

      {/* 标题 + 操作栏 */}
      <div className="text-center mb-10 animate-fade-up">
        <h1 className="text-2xl font-serif text-film-200 mb-2">时间线</h1>
        <p className="text-dark-400 text-sm mb-4">回望那些被珍藏的瞬间</p>
        <div className="flex items-center justify-center gap-3">
          <a href="/"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg
                       text-xs transition-colors"
            style={{
              background: "rgba(0,255,204,0.08)",
              border: "1px solid rgba(0,255,204,0.2)",
              color: "#00FFCC",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            记录新瞬间
          </a>
          {memories.length > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-800 text-dark-300
                         hover:bg-dark-700 text-xs transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? "正在打包..." : "一键导出（ZIP 含图片）"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-film-400 animate-spin" />
        </div>
      )}

      {!loading && memories.length === 0 && (
        <div className="text-center py-20 animate-fade-up">
          <p className="text-dark-500 text-sm mb-4">还没有任何记忆</p>
          <a href="/" className="text-film-400 hover:text-film-300 text-sm underline underline-offset-4">
            去记录第一个瞬间
          </a>
        </div>
      )}

      <div className="relative">
        {memories.length > 0 && <div className="absolute left-6 top-0 bottom-0 w-px bg-dark-800" />}

        <div className="space-y-6">
          {memories.map((memory, index) => (
            <div key={memory.id} className="relative pl-16 animate-fade-up" style={{ animationDelay: `${index * 0.1}s` }}>
              {/* 时间线节点 */}
              <div className="absolute left-4 top-4 w-5 h-5 rounded-full bg-dark-900 border-2 border-dark-600
                              flex items-center justify-center z-10">
                <div className="w-2 h-2 rounded-full bg-film-500" />
              </div>

              {/* 卡片 */}
              <div className="glass rounded-xl p-4 hover:bg-dark-800/50 transition-all duration-300 group">
                {/* 时间 + 情感 + 操作按钮 */}
                <div className="flex items-center gap-2 mb-3 text-xs text-dark-500">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(memory.created_at)}</span>
                  {memory.emotion_primary && (
                    <span className="flex items-center gap-1">
                      {emotionEmojis[memory.emotion_primary] || "💫"}
                      <span className="text-dark-400">{memory.emotion_primary}</span>
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 编辑按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectMemory(memory.id).then(() => {
                          // 需要先展开详情才能编辑
                        });
                      }}
                      className="p-1 rounded text-dark-600 hover:text-film-400 hover:bg-film-900/20 transition-all"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(memory); }}
                      className="p-1 rounded text-dark-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 内容 */}
                <div onClick={() => handleSelectMemory(memory.id)} className="cursor-pointer">
                  <div className="flex gap-3">
                    {getPhotoUrl(memory.original_photo) && (
                      <img src={getPhotoUrl(memory.original_photo)!} alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-dark-200 text-sm leading-relaxed line-clamp-3">
                        {memory.final_note || "未完成的记录..."}
                      </p>
                      {memory.audio_raw && (
                        <span className="inline-flex items-center gap-1 text-xs text-dark-500 mt-1">
                          <Mic className="w-3 h-3" /> 含语音
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {memory.tags?.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-dark-800 text-dark-500 text-xs">#{tag}</span>
                      ))}
                    </div>
                    {(!memory.final_note || !memory.emotion_primary) && (
                      <button
                        onClick={(e) => handleAiSummarize(memory.id, e)}
                        disabled={aiLoading === memory.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-film-900/50 text-film-400
                                   hover:bg-film-900 text-xs transition-colors disabled:opacity-50"
                      >
                        {aiLoading === memory.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                        AI 总结
                      </button>
                    )}
                  </div>

                  <div className="flex justify-center mt-2">
                    {selectedMemory?.id === memory.id
                      ? <ChevronUp className="w-4 h-4 text-dark-500" />
                      : <ChevronDown className="w-4 h-4 text-dark-600 group-hover:text-dark-500" />}
                  </div>
                </div>
              </div>

              {/* 详情展开 */}
              {selectedMemory?.id === memory.id && (
                <div className="mt-2 ml-2 animate-fade-up">
                  {detailLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 text-film-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="glass rounded-xl p-5 space-y-4">
                      {/* 照片 */}
                      {getPhotoUrl(selectedMemory.original_photo) && (
                        <img src={getPhotoUrl(selectedMemory.original_photo)!} alt=""
                          className="w-full max-h-64 object-cover rounded-lg" />
                      )}

                      {/* 语音原声播放器 */}
                      {selectedMemory.audio_raw && getAudioUrl(selectedMemory.audio_raw) && (
                        <div className="bg-dark-900/60 rounded-lg p-3">
                          <p className="text-xs text-dark-500 mb-2">语音原声</p>
                          <audio controls src={getAudioUrl(selectedMemory.audio_raw)!}
                            className="w-full h-8" />
                        </div>
                      )}

                      {/* 用户原始记录 */}
                      {selectedMemory.user_free_text && (
                        <div>
                          <p className="text-xs text-dark-500 mb-1">原始记录</p>
                          <p className="text-dark-200 text-sm">{selectedMemory.user_free_text}</p>
                        </div>
                      )}

                      {/* final_note — 编辑模式 */}
                      {editingId === selectedMemory.id ? (
                        <div className="space-y-2">
                          <p className="text-xs text-dark-500">编辑记录</p>
                          <div className="relative">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={4}
                              autoFocus
                              className="w-full bg-dark-900 border border-film-700 rounded-xl p-3 pr-10 text-dark-200
                                         resize-none focus:outline-none text-sm"
                            />
                            <button
                              onClick={() => toggleVoice("edit")}
                              className={`absolute bottom-3 right-3 p-1 rounded transition-all ${
                                recording ? "text-red-400 animate-pulse" : "text-dark-600 hover:text-dark-400"
                              }`}
                              title={recording ? "停止" : "语音输入"}
                            >
                              {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {recording && <p className="text-red-400 text-xs animate-pulse">正在聆听...</p>}
                          <div className="flex gap-2">
                            <button onClick={saveEdit} disabled={editSaving}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-film-700 text-film-100 hover:bg-film-600 text-sm disabled:opacity-50">
                              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              保存
                            </button>
                            <button onClick={cancelEdit}
                              className="px-4 py-2 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 text-sm">
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        selectedMemory.final_note && (
                          <div className="border-l-2 border-film-700 pl-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-dark-500">
                                <Sparkles className="w-3 h-3 inline mr-1" />
                                {selectedMemory.emotion_primary ? "AI 总结" : "记录内容"}
                              </p>
                              <button onClick={() => startEdit(selectedMemory)}
                                className="text-xs text-dark-500 hover:text-film-400 transition-colors flex items-center gap-1">
                                <Pencil className="w-3 h-3" /> 编辑
                              </button>
                            </div>
                            <p className="text-dark-200 text-sm font-serif whitespace-pre-wrap">
                              {selectedMemory.final_note}
                            </p>
                          </div>
                        )
                      )}

                      {/* 情感洞察 */}
                      {selectedMemory.emotion_ai_analysis && (
                        <div className="border-l-2 border-dark-700 pl-3">
                          <p className="text-xs text-dark-500 mb-1">情感洞察</p>
                          <p className="text-dark-400 text-sm italic">{selectedMemory.emotion_ai_analysis}</p>
                        </div>
                      )}

                      {/* 对话记录 */}
                      {selectedMemory.ai_dialog_log && selectedMemory.ai_dialog_log.length > 0 && (
                        <div>
                          <p className="text-xs text-dark-500 mb-2">对话记录</p>
                          <div className="space-y-2">
                            {selectedMemory.ai_dialog_log.map((msg: any, i: number) => (
                              <div key={i} className={`text-sm ${msg.role === "user" ? "text-dark-200" : "text-dark-400 italic"}`}>
                                <span className="text-dark-600 text-xs mr-1">{msg.role === "user" ? "你" : "AI"}:</span>
                                {msg.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 主题/实体 */}
                      {(selectedMemory.themes?.length || selectedMemory.entities?.length) && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-800">
                          {selectedMemory.themes?.map((t, i) => (
                            <span key={`t-${i}`} className="px-2 py-0.5 rounded-full bg-film-900/50 text-film-300 text-xs">{t}</span>
                          ))}
                          {selectedMemory.entities?.map((e, i) => (
                            <span key={`e-${i}`} className="px-2 py-0.5 rounded-full bg-dark-800 text-dark-400 text-xs">{e}</span>
                          ))}
                        </div>
                      )}

                      {/* ===== 追加记录（多模态） ===== */}
                      {appendingId === selectedMemory.id ? (
                        <div className="space-y-3 pt-2 border-t border-dark-800">
                          <p className="text-xs text-dark-500">追加新内容</p>

                          {/* 文字输入 */}
                          <div className="relative">
                            <textarea
                              value={appendText}
                              onChange={(e) => setAppendText(e.target.value)}
                              rows={3}
                              autoFocus
                              placeholder="继续写下你的想法..."
                              className="w-full bg-dark-900 border border-film-700 rounded-xl p-3 pr-10 text-dark-200
                                         placeholder:text-dark-600 resize-none focus:outline-none text-sm"
                            />
                          </div>

                          {/* 多模态工具栏 */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => appendFileRef.current?.click()}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                                appendPhoto ? "bg-film-900/50 text-film-300" : "bg-dark-800 text-dark-400 hover:text-dark-200"
                              }`}>
                              <Camera className="w-3.5 h-3.5" />
                              {appendPhoto ? "已选照片" : "照片"}
                            </button>
                            <button onClick={toggleAppendVoice}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                                recording ? "bg-red-900/30 text-red-400 animate-pulse" :
                                appendAudioBlob ? "bg-film-900/50 text-film-300" :
                                "bg-dark-800 text-dark-400 hover:text-dark-200"
                              }`}>
                              {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                              {recording ? "停止" : appendAudioBlob ? `已录 ${fmtTime(appendAudioDuration)}` : "语音"}
                            </button>
                            <input ref={appendFileRef} type="file" accept="image/*" onChange={handleAppendPhoto} className="hidden" />
                          </div>

                          {/* 录音中提示 */}
                          {recording && (
                            <p className="text-red-400 text-xs animate-pulse flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                              正在聆听...
                            </p>
                          )}

                          {/* 照片预览 */}
                          {appendPhotoPreview && (
                            <div className="relative inline-block">
                              <img src={appendPhotoPreview} alt=""
                                className="w-24 h-24 rounded-lg object-cover opacity-80" />
                              <button onClick={removeAppendPhoto}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center
                                           bg-dark-800 text-dark-400 hover:text-red-400 transition-colors border border-dark-600">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* 操作按钮 */}
                          <div className="flex gap-2">
                            <button onClick={saveAppend} disabled={appendSaving || !hasAppendContent}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-film-700 text-film-100 hover:bg-film-600 text-sm disabled:opacity-50">
                              {appendSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              追加保存
                            </button>
                            <button onClick={cancelAppend}
                              className="px-4 py-2 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 text-sm">
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 底部操作栏 */
                        <div className="flex gap-2 pt-2 border-t border-dark-800">
                          <button
                            onClick={() => startAppend(selectedMemory.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg
                                       bg-dark-700 text-dark-300 hover:bg-dark-600 text-sm transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            追加记录
                          </button>
                          {!selectedMemory.emotion_primary && (
                            <button
                              onClick={(e) => handleAiSummarize(selectedMemory.id, e)}
                              disabled={aiLoading === selectedMemory.id}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg
                                         bg-film-900/30 text-film-400 hover:bg-film-900/50 text-sm transition-colors"
                            >
                              {aiLoading === selectedMemory.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                              AI 分析
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(memory)}
                            className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg
                                       bg-red-900/20 text-red-400 hover:bg-red-900/40 text-sm transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {memories.length >= 20 && (
        <div className="flex justify-center mt-8">
          <button onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg bg-dark-800 text-dark-300 hover:bg-dark-700 text-sm">
            加载更多
          </button>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm w-full mx-4 animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-serif text-film-200">确认删除</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-dark-500 hover:text-dark-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-dark-300">确定要删除这条记忆吗？此操作不可撤销。</p>
              <div className="bg-dark-900/50 rounded-lg p-3">
                <p className="text-xs text-dark-500 mb-1">
                  {formatDate(deleteTarget.created_at)}
                  {deleteTarget.emotion_primary && ` · ${deleteTarget.emotion_primary}`}
                </p>
                <p className="text-sm text-dark-300 line-clamp-2">
                  {deleteTarget.final_note || "未完成的记录..."}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-dark-700 text-dark-300 hover:bg-dark-600 text-sm transition-colors">
                取消
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-700 text-red-100 hover:bg-red-600
                           text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
