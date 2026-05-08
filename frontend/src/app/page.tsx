"use client";

import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import {
  uploadCombo,
  startChat,
  sendMessage,
  summarizeChat,
  getVoskStatus,
} from "@/lib/api";
import { WavRecorder } from "@/lib/audioRecorder";
import { useAudioAnalyzer } from "@/lib/useAudioAnalyzer";
import { useStreamTranscribe } from "@/lib/useStreamTranscribe";
import {
  Mic, MicOff, Send, Loader2, X, Camera,
  Save, ArrowRight, Sparkles,
  MessageCircle, Clock, Check,
} from "lucide-react";
import SystemStatus from "@/components/SystemStatus";

const NebulaScene = lazy(() => import("@/components/NebulaScene"));

type Phase = "idle" | "composing" | "saving" | "saved" | "chat";

interface PendingContent {
  text: string;
  photoFile: File | null;
  photoPreview: string | null;
  audioBlob: Blob | null;
  audioDuration: number;
}

export default function HomePage() {
  // 核心状态
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<PendingContent>({
    text: "",
    photoFile: null,
    photoPreview: null,
    audioBlob: null,
    audioDuration: 0,
  });
  const [memoryId, setMemoryId] = useState<string | null>(null);
  const [spread, setSpread] = useState(0);
  const [showChat, setShowChat] = useState(false);

  // 对话
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [aiDescription, setAiDescription] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 语音
  const [recording, setRecording] = useState(false);
  const [voskReady, setVoskReady] = useState<boolean | null>(null);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);

  const audioAnalyzer = useAudioAnalyzer();
  const streamTranscribe = useStreamTranscribe();
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 首页需要全屏无滚动
    document.body.classList.add("overflow-hidden");
    getVoskStatus().then((r) => setVoskReady(r.ready)).catch(() => setVoskReady(false));
    return () => {
      document.body.classList.remove("overflow-hidden");
      if (timerRef.current) clearInterval(timerRef.current);
      if (wavRecorderRef.current) wavRecorderRef.current.cancel();
      streamTranscribe.cancel();
      audioAnalyzer.stop();
    };
  }, []);

  const scrollDown = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const hasContent = pending.text.trim() || pending.photoFile || pending.audioBlob;

  // ==================== 文字输入 ====================

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPending((p) => ({ ...p, text: val }));
    if (val.trim() && phase === "idle") {
      setPhase("composing");
      setSpread(0.3);
    }
  };

  // ==================== 照片上传 ====================

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPending((p) => ({
      ...p,
      photoFile: file,
      photoPreview: url,
    }));
    setPhase("composing");
    setSpread(1);
  };

  const removePhoto = () => {
    if (pending.photoPreview) URL.revokeObjectURL(pending.photoPreview);
    setPending((p) => ({ ...p, photoFile: null, photoPreview: null }));
    if (!pending.text.trim() && !pending.audioBlob) {
      setPhase("idle");
      setSpread(0);
    }
  };

  // ==================== 语音 ====================

  const toggleVoice = async () => {
    if (recording) {
      // 停止录音
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const recorder = wavRecorderRef.current;
      if (recorder && recorder.recording) {
        const blob = recorder.stop();
        wavRecorderRef.current = null;
        if (blob.size > 200) {
          setPending((p) => ({ ...p, audioBlob: blob, audioDuration: duration }));
          setPhase("composing");
          setSpread(Math.max(spread, 0.5));
        }
      }
      const finalText = streamTranscribe.stop();
      audioAnalyzer.stop();
      setRecording(false);
      // 如果有实时转录文本，追加到文字输入
      if (finalText) {
        setPending((p) => ({
          ...p,
          text: p.text ? p.text + " " + finalText : finalText,
        }));
        setPhase("composing");
      }
    } else {
      // 开始录音
      try {
        const recorder = new WavRecorder();
        await recorder.start();
        wavRecorderRef.current = recorder;
        audioAnalyzer.start();
        if (voskReady) streamTranscribe.start().catch(() => {});
        setRecording(true);
        startTimeRef.current = Date.now();
        setDuration(0);
        timerRef.current = setInterval(
          () => setDuration(Math.round((Date.now() - startTimeRef.current) / 1000)),
          500
        );
      } catch {
        alert("无法访问麦克风");
      }
    }
  };

  // ==================== 保存到时间线 ====================

  const handleSave = async () => {
    if (!hasContent) return;
    setPhase("saving");

    try {
      const result = await uploadCombo({
        photo: pending.photoFile,
        audio: pending.audioBlob,
        text: pending.text.trim() || undefined,
      });
      setMemoryId(result.memory_id);
      setAiDescription(result.ai_description || null);
      setPhase("saved");

      // 如果有 AI 描述，准备对话上下文
      if (result.ai_description) {
        setMessages([{ role: "assistant", content: result.ai_description }]);
      }
    } catch (err) {
      console.error("保存失败:", err);
      alert("保存失败，请重试");
      setPhase("composing");
    }
  };

  // ==================== 开始 AI 对话 ====================

  const handleStartChat = async () => {
    if (!memoryId) return;
    setShowChat(true);
    setPhase("chat");

    // 如果没有 AI 描述，主动请求开场白
    if (!aiDescription) {
      setChatLoading(true);
      try {
        const res = await startChat(memoryId);
        setMessages([{ role: "assistant", content: res.reply }]);
      } catch { /* */ }
      finally { setChatLoading(false); }
    }
  };

  // ==================== 对话 ====================

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !memoryId) return;
    setChatInput("");
    const newMsgs = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setChatLoading(true);
    scrollDown();
    try {
      const res = await sendMessage(memoryId, text);
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
      scrollDown();
    } catch { /* */ }
    finally { setChatLoading(false); }
  };

  const handleSummarize = async () => {
    if (!memoryId) return;
    setChatLoading(true);
    try {
      await summarizeChat(memoryId);
      setShowChat(false);
      setPhase("saved");
    } catch { /* */ }
    finally { setChatLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ==================== 重置 ====================

  const resetAll = () => {
    if (pending.photoPreview) URL.revokeObjectURL(pending.photoPreview);
    setPending({ text: "", photoFile: null, photoPreview: null, audioBlob: null, audioDuration: 0 });
    setMemoryId(null);
    setMessages([]);
    setChatInput("");
    setAiDescription(null);
    setShowChat(false);
    setPhase("idle");
    setSpread(0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ==================== 渲染 ====================

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#030305" }}>
      {/* 3D 粒子背景 */}
      <div className="absolute inset-0 z-0">
        <Suspense fallback={null}>
          <NebulaScene
            imageUrl={pending.photoPreview}
            audioLevel={recording ? audioAnalyzer.level : { low: 0, high: 0 }}
            spread={spread}
          />
        </Suspense>
      </div>

      {/* 系统状态 — 右上角指示器 */}
      <SystemStatus />

      {/* ===== 主输入界面 ===== */}
      {(phase === "idle" || phase === "composing") && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg px-4 space-y-4">

            {/* 时间线入口 */}
            <div className="flex justify-center">
              <a href="/timeline"
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs
                           text-white/20 hover:text-white/50 transition-all duration-300
                           hover:bg-white/5">
                <Clock className="w-3.5 h-3.5" />
                时间线
              </a>
            </div>

            {/* 文字输入区 — 始终可见 */}
            <div className="relative">
              <textarea
                ref={textRef}
                value={pending.text}
                onChange={handleTextChange}
                rows={phase === "composing" ? 4 : 2}
                placeholder="写下此刻的想法..."
                className="w-full bg-transparent text-white/70 placeholder:text-white/20 text-sm
                           py-4 px-5 resize-none outline-none font-light tracking-wide
                           transition-all duration-500"
                style={{
                  caretColor: "#00FFCC",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "16px",
                  backdropFilter: "blur(20px)",
                }}
              />

              {/* 文字输入区底部工具栏 */}
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex items-center gap-1">
                  {/* 照片按钮 */}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-9 h-9 rounded-full flex items-center justify-center
                               text-white/25 hover:text-white/60 transition-all duration-300
                               hover:bg-white/5"
                    title="添加照片"
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  {/* 语音按钮 */}
                  <button
                    onClick={toggleVoice}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      recording
                        ? "bg-white/10 text-[#00FFCC] animate-pulse-glow"
                        : "text-white/25 hover:text-white/60 hover:bg-white/5"
                    }`}
                    title={recording ? "停止录音" : "语音输入"}
                  >
                    {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                {/* 保存按钮 */}
                {hasContent && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full
                               text-sm transition-all duration-500 animate-fade-up"
                    style={{
                      background: "rgba(0,255,204,0.12)",
                      border: "1px solid rgba(0,255,204,0.3)",
                      color: "#00FFCC",
                    }}
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存到时间线
                  </button>
                )}
              </div>
            </div>

            {/* 录音状态条 */}
            {recording && (
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl animate-fade-up"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(0,255,204,0.15)",
                }}>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="audio-bar w-1 rounded-full"
                      style={{ height: `${8 + Math.random() * 16}px`, opacity: 0.3 + Math.random() * 0.7 }} />
                  ))}
                </div>
                <span className="text-[#00FFCC] text-sm font-light tracking-wider">
                  {fmt(duration)}
                </span>
                {streamTranscribe.active && (
                  <span className="text-white/30 text-sm flex-1 truncate">
                    {streamTranscribe.text || "聆听中..."}
                  </span>
                )}
              </div>
            )}

            {/* 照片预览 */}
            {pending.photoPreview && (
              <div className="relative animate-fade-up">
                <div className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    backdropFilter: "blur(20px)",
                  }}>
                  <img src={pending.photoPreview} alt=""
                    className="w-full max-h-48 object-cover opacity-80" />
                  <button onClick={removePhoto}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center
                               bg-black/50 text-white/60 hover:text-white/90 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 语音已录制提示 */}
            {pending.audioBlob && !recording && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl animate-fade-up"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                <Mic className="w-4 h-4 text-[#00FFCC] flex-shrink-0" />
                <span className="text-white/40 text-sm">语音已录制 ({fmt(pending.audioDuration)})</span>
                <button onClick={() => setPending((p) => ({ ...p, audioBlob: null, audioDuration: 0 }))}
                  className="ml-auto text-white/20 hover:text-white/50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 快捷提示（空态） */}
            {phase === "idle" && !recording && (
              <p className="text-center text-white/15 text-xs tracking-widest font-light pt-2">
                文字 · 语音 · 照片 — 随心记录
              </p>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </div>
      )}

      {/* ===== 保存中 ===== */}
      {phase === "saving" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full animate-pulse-glow"
                style={{ border: "1px solid rgba(0,255,204,0.2)" }} />
              <Loader2 className="w-16 h-16 text-[#00FFCC]/50 animate-spin" />
            </div>
            <p className="text-white/30 text-sm tracking-widest font-light">
              正在沉淀记忆...
            </p>
          </div>
        </div>
      )}

      {/* ===== 保存成功 ===== */}
      {phase === "saved" && !showChat && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center gap-6 animate-fade-up">
            {/* 成功动画 */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full"
                style={{
                  background: "rgba(0,255,204,0.08)",
                  border: "1px solid rgba(0,255,204,0.2)",
                }} />
              <Check className="w-8 h-8 text-[#00FFCC]" />
            </div>

            <div className="text-center">
              <p className="text-white/60 text-lg font-light tracking-wide mb-1">
                记忆已保存
              </p>
              <p className="text-white/25 text-xs tracking-wider">
                瞬间已被珍藏
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* 去时间线 */}
              <a href="/timeline"
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm transition-all duration-300"
                style={{
                  background: "rgba(0,255,204,0.12)",
                  border: "1px solid rgba(0,255,204,0.3)",
                  color: "#00FFCC",
                }}>
                <Clock className="w-4 h-4" />
                查看时间线
                <ArrowRight className="w-3.5 h-3.5" />
              </a>

              {/* AI 聊天 */}
              <button onClick={handleStartChat}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm transition-all duration-300"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.5)",
                }}>
                <MessageCircle className="w-4 h-4" />
                和 AI 聊聊
              </button>
            </div>

            {/* 继续记录 */}
            <button onClick={resetAll}
              className="text-white/20 text-xs hover:text-white/40 transition-colors tracking-wider mt-2">
              继续记录下一个瞬间
            </button>
          </div>
        </div>
      )}

      {/* ===== AI 对话层 ===== */}
      {phase === "chat" && showChat && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end pointer-events-none">
          {/* 消息流 */}
          <div className="pointer-events-auto max-h-[50vh] overflow-y-auto px-6 pb-4 space-y-3
                          [mask-image:linear-gradient(to_bottom,transparent_0%,black_15%)]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
                    msg.role === "user"
                      ? "rounded-br-md text-white/80"
                      : "rounded-bl-md text-white/60"
                  }`}
                  style={{
                    background: msg.role === "user"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 text-sm text-white/30 rounded-2xl rounded-bl-md"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="animate-blink">...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 实时转录 */}
          {recording && streamTranscribe.active && (
            <div className="px-6 pb-2 pointer-events-none">
              <p className="text-white/40 text-sm font-light tracking-wide">
                {streamTranscribe.text || <span className="text-white/15 animate-pulse">聆听中...</span>}
              </p>
            </div>
          )}

          {/* 输入条 */}
          <div className="pointer-events-auto px-4 pb-6 pt-2">
            <div className="flex items-end gap-2 max-w-2xl mx-auto"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "16px",
                backdropFilter: "blur(20px)",
              }}>
              <button
                onClick={toggleVoice}
                className={`flex-shrink-0 w-10 h-10 m-1.5 rounded-full flex items-center justify-center transition-all duration-300 ${
                  recording
                    ? "bg-white/10 text-[#00FFCC] animate-pulse-glow"
                    : "text-white/25 hover:text-white/50"
                }`}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <textarea
                value={recording ? (streamTranscribe.text || chatInput) : chatInput}
                onChange={(e) => !recording && setChatInput(e.target.value)}
                onKeyDown={!recording ? handleKeyDown : undefined}
                readOnly={recording}
                placeholder={recording ? `${fmt(duration)} 录音中...` : "和记忆聊聊..."}
                rows={1}
                className="flex-1 bg-transparent text-white/70 placeholder:text-white/15 text-sm
                           py-3 resize-none outline-none font-light tracking-wide max-h-24"
                style={{ caretColor: "#00FFCC" }}
              />

              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || chatLoading || recording}
                className="flex-shrink-0 w-10 h-10 m-1.5 rounded-full flex items-center justify-center
                           text-white/25 hover:text-white/50 disabled:opacity-20 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* 总结并退出对话 */}
            <div className="flex justify-center mt-3">
              <button onClick={handleSummarize} disabled={chatLoading}
                className="text-white/20 text-xs hover:text-[#00FFCC]/60 transition-colors tracking-wider
                           disabled:opacity-30">
                <Sparkles className="w-3 h-3 inline mr-1" />
                总结并保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 全局重置按钮（右上角） ===== */}
      {phase !== "idle" && (
        <button
          onClick={resetAll}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full flex items-center justify-center
                     text-white/15 hover:text-white/40 transition-colors"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
