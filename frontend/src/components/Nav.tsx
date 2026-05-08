"use client";

import { useState } from "react";
import { systemInit, downloadVoskModel, InitResult } from "@/lib/api";
import { Settings, CheckCircle, AlertCircle, Loader2, X, Download } from "lucide-react";

export default function Nav() {
  const [showInit, setShowInit] = useState(false);
  const [initResult, setInitResult] = useState<InitResult | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelMsg, setModelMsg] = useState("");

  const handleInit = async () => {
    setShowInit(true);
    setInitLoading(true);
    setInitResult(null);
    setModelMsg("");
    try {
      const result = await systemInit();
      setInitResult(result);
    } catch (err) {
      setInitResult({
        overall: "error",
        steps: [{ name: "请求", status: "error", detail: String(err) }],
      });
    } finally {
      setInitLoading(false);
    }
  };

  const handleDownloadModel = async () => {
    setModelDownloading(true);
    setModelMsg("");
    try {
      const result = await downloadVoskModel();
      setModelMsg(result.message);
      const init = await systemInit();
      setInitResult(init);
    } catch (err) {
      setModelMsg("下载失败: " + String(err));
    } finally {
      setModelDownloading(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(3,3,5,0.4)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="text-lg font-serif text-film-300 tracking-wider">Memory Shards</span>
            <span className="text-xs text-dark-400 font-light">记忆碎片</span>
          </a>
          <div className="flex items-center gap-5 text-sm">
            <a href="/" className="text-dark-300 hover:text-film-300 transition-colors">记录</a>
            <a href="/timeline" className="text-dark-300 hover:text-film-300 transition-colors">时间线</a>
            <button onClick={handleInit} className="text-dark-500 hover:text-dark-300 transition-colors" title="一键初始化">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {showInit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-md w-full mx-4 animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-serif text-film-200">系统初始化</h3>
              <button onClick={() => setShowInit(false)} className="text-dark-500 hover:text-dark-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {initLoading ? (
              <div className="flex items-center justify-center gap-3 py-8 text-dark-400">
                <Loader2 className="w-5 h-5 animate-spin text-film-400" />
                <span>正在检查系统状态...</span>
              </div>
            ) : initResult ? (
              <div className="space-y-3">
                {initResult.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-dark-900/50">
                    {step.status === "ok" ? (
                      <CheckCircle className="w-4 h-4 mt-0.5 text-green-400 flex-shrink-0" />
                    ) : step.status === "warn" ? (
                      <AlertCircle className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dark-200">{step.name}</p>
                      <p className="text-xs text-dark-400 mt-0.5">{step.detail}</p>
                    </div>
                  </div>
                ))}

                {initResult.steps.some((s) => s.name === "语音模型" && s.status === "warn") && (
                  <div className="pt-2">
                    <button onClick={handleDownloadModel} disabled={modelDownloading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                                 bg-film-800 text-film-200 hover:bg-film-700 text-sm transition-colors disabled:opacity-50">
                      {modelDownloading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />正在下载语音模型...</>
                      ) : (
                        <><Download className="w-4 h-4" />下载语音识别模型（约 50MB）</>
                      )}
                    </button>
                    {modelMsg && <p className="text-xs text-dark-400 text-center mt-2">{modelMsg}</p>}
                  </div>
                )}

                <div className={`text-center text-sm mt-4 py-2 rounded-lg ${
                  initResult.overall === "ok" ? "bg-green-900/20 text-green-400" : "bg-amber-900/20 text-amber-400"
                }`}>
                  {initResult.overall === "ok" ? "系统就绪" : "部分组件异常，请检查配置"}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
