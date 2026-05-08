/**
 * 音频分析器 Hook
 *
 * 捕获麦克风音频，分析低频/高频能量，
 * 用于驱动粒子系统的视觉反应。
 */
import { useRef, useCallback, useState } from "react";

interface AudioLevel {
  low: number;   // 0-1, 低频能量 (bass)
  high: number;  // 0-1, 高频能量 (treble)
  raw: number;   // 0-1, 原始音量
}

export function useAudioAnalyzer() {
  const [level, setLevel] = useState<AudioLevel>({ low: 0, high: 0, raw: 0 });
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  const analyze = useCallback(() => {
    if (!activeRef.current || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // 频段划分
    const binCount = data.length;
    const lowEnd = Math.floor(binCount * 0.1);   // 低频: 0-10%
    const highStart = Math.floor(binCount * 0.4); // 高频: 40%+

    let lowSum = 0, highSum = 0, totalSum = 0;
    for (let i = 0; i < binCount; i++) {
      const v = data[i] / 255;
      totalSum += v;
      if (i < lowEnd) lowSum += v;
      if (i >= highStart) highSum += v;
    }

    const low = lowEnd > 0 ? lowSum / lowEnd : 0;
    const high = (binCount - highStart) > 0 ? highSum / (binCount - highStart) : 0;
    const raw = totalSum / binCount;

    setLevel({ low, high, raw });
    rafRef.current = requestAnimationFrame(analyze);
  }, []);

  /**
   * 开始音频分析（需要麦克风权限）
   */
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      activeRef.current = true;
      rafRef.current = requestAnimationFrame(analyze);
    } catch (e) {
      console.warn("音频分析器启动失败:", e);
    }
  }, [analyze]);

  /**
   * 停止音频分析
   */
  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    analyserRef.current = null;
    setLevel({ low: 0, high: 0, raw: 0 });
  }, []);

  return { level, start, stop };
}
