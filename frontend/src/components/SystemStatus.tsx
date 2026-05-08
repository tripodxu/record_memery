"use client";

import { useState, useEffect, useRef } from "react";
import { checkSystemStatus, SystemStatus as StatusType, systemInit, downloadVoskModel } from "@/lib/api";
import {
  CheckCircle, AlertCircle, XCircle, ChevronDown,
  Loader2, Settings, X, Download, RefreshCw,
} from "lucide-react";

export default function SystemStatus() {
  const [status, setStatus] = useState<StatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    check();
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const check = async () => {
    setLoading(true);
    try {
      const result = await checkSystemStatus();
      setStatus(result);
    } catch {
      setStatus({
        overall: "error",
        checks: [{ name: "后端服务", status: "error", detail: "无法连接后端" }],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFix = async () => {
    setFixing(true);
    try { await systemInit(); await check(); }
    catch { /* */ }
    finally { setFixing(false); }
  };

  const handleDownloadModel = async () => {
    setDownloadingModel(true);
    try { await downloadVoskModel(); await check(); }
    catch { /* */ }
    finally { setDownloadingModel(false); }
  };

  const hasWarn = status?.checks.some((c) => c.status === "warn");
  const hasError = status?.checks.some((c) => c.status === "error");

  return (
    <div className="fixed top-3 right-14 z-50" ref={panelRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-300
                   hover:bg-white/5"
        style={{
          background: expanded ? "rgba(255,255,255,0.05)" : "transparent",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        title="系统状态"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-white/20" />
        ) : hasError ? (
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        ) : hasWarn ? (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FFCC]/70" />
        )}
        <span className="text-[10px] text-white/25 tracking-wider">
          {loading ? "..." : hasError ? "异常" : hasWarn ? "待处理" : "就绪"}
        </span>
      </button>

      {/* 下拉面板 */}
      {expanded && status && (
        <div className="absolute top-full right-0 mt-2 w-72 rounded-xl overflow-hidden animate-fade-up"
          style={{
            background: "rgba(10,10,14,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          }}>

          {/* 标题 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Settings className="w-3 h-3 text-white/20" />
              <span className="text-[11px] text-white/35 tracking-wider">环境检测</span>
            </div>
            <button onClick={check}
              className="p-1 rounded text-white/15 hover:text-white/35 transition-colors"
              title="刷新">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* 检查项 */}
          <div className="px-4 py-2.5 space-y-2">
            {status.checks.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {item.status === "ok" ? (
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-[#00FFCC]/50 flex-shrink-0" />
                ) : item.status === "warn" ? (
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-amber-400/70 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mt-0.5 text-red-400/70 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-white/45">{item.name}</span>
                  <p className="text-[10px] text-white/20 mt-0.5 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          {(hasWarn || hasError) && (
            <div className="px-4 pb-3 flex gap-2">
              {status.checks.some((c) => c.name === "存储目录" && c.status !== "ok") && (
                <button onClick={handleAutoFix} disabled={fixing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                             bg-white/5 text-white/35 hover:text-white/55 text-[11px] transition-colors disabled:opacity-50">
                  {fixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
                  修复
                </button>
              )}
              {status.checks.some((c) => c.name === "语音识别" && c.status === "warn") && (
                <button onClick={handleDownloadModel} disabled={downloadingModel}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                             bg-white/5 text-white/35 hover:text-white/55 text-[11px] transition-colors disabled:opacity-50">
                  {downloadingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  下载模型
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
