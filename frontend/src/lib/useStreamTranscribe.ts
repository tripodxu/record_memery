/**
 * 流式语音转录 Hook
 *
 * 通过 WebSocket 将音频块实时发送到 Vosk，
 * 实现边说边转录、逐字显示。
 */
import { useRef, useCallback, useState } from "react";

interface TranscribeState {
  /** 当前实时文本（含未确认的临时文本） */
  text: string;
  /** 是否正在录音转录 */
  active: boolean;
}

export function useStreamTranscribe() {
  const [state, setState] = useState<TranscribeState>({ text: "", active: false });
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 已确认的文本段
  const finalTextsRef = useRef<string[]>([]);
  // 当前临时文本
  const partialRef = useRef("");

  const updateDisplay = useCallback(() => {
    const parts = [...finalTextsRef.current, partialRef.current].filter(Boolean);
    setState({ text: parts.join(" "), active: true });
  }, []);

  /**
   * 开始流式转录
   * @param onText 实时回调，参数为当前完整文本
   */
  const start = useCallback(async () => {
    // 建立 WebSocket 连接
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/transcribe`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    finalTextsRef.current = [];
    partialRef.current = "";

    ws.onopen = () => {
      console.log("[StreamTranscribe] WebSocket 已连接");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "partial":
            partialRef.current = msg.text || "";
            updateDisplay();
            break;
          case "final":
            if (msg.text) finalTextsRef.current.push(msg.text);
            partialRef.current = "";
            updateDisplay();
            break;
          case "done":
            // 全部完成
            setState({ text: msg.text || finalTextsRef.current.join(" "), active: false });
            break;
          case "error":
            console.error("[StreamTranscribe]", msg.msg);
            setState((s) => ({ ...s, active: false }));
            break;
        }
      } catch {}
    };

    ws.onerror = (e) => {
      console.error("[StreamTranscribe] WebSocket 错误", e);
      setState((s) => ({ ...s, active: false }));
    };

    ws.onclose = () => {
      console.log("[StreamTranscribe] WebSocket 已关闭");
      setState((s) => ({ ...s, active: false }));
    };

    // 等 WebSocket 连接就绪
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket 连接超时")), 5000);
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket 连接失败"));
      };
    });

    // 开始录音，直接采集 PCM 发送到 WebSocket
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const data = e.inputBuffer.getChannelData(0);
      // float32 → int16 PCM
      const pcm = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(pcm.buffer);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    setState({ text: "", active: true });
  }, [updateDisplay]);

  /**
   * 停止录音并获取最终转录结果
   * @returns 最终完整文本
   */
  const stop = useCallback((): string => {
    // 停止音频采集
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    // 通知服务端录音结束
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("end");
      // 不立即关闭，等待 "done" 消息
    }

    // 返回当前已累积的文本
    const fullText = finalTextsRef.current.join(" ").trim();
    setState({ text: fullText, active: false });
    return fullText;
  }, []);

  /**
   * 取消转录（不保存）
   */
  const cancel = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    finalTextsRef.current = [];
    partialRef.current = "";
    setState({ text: "", active: false });
  }, []);

  return { ...state, start, stop, cancel };
}
