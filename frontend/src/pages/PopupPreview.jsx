import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { Settings as SettingsIcon, Copy, Download } from "lucide-react";
import { demoSession } from "@/data/demoSession";
import { offlineGenerate } from "@/lib/generate";
import { useSettings } from "@/context/SettingsContext";
import SettingsModal from "@/components/SettingsModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* A polished interactive simulation of the Chrome extension popup. */
export default function PopupPreview() {
  const { settings, setSettings } = useSettings();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [testName, setTestName] = useState("Login and create a Todo");
  const [framework, setFramework] = useState(settings.framework || "playwright");
  const [stepIndex, setStepIndex] = useState(0); // how far into demo we've simulated
  const [startTime, setStartTime] = useState(null);
  const [tick, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const steps = demoSession.steps.slice(0, stepIndex);

  // Tick for timer
  useEffect(() => {
    if (!recording || paused) return;
    const h = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(h);
  }, [recording, paused]);

  // Auto-advance demo steps while recording
  useEffect(() => {
    if (!recording || paused) return;
    if (stepIndex >= demoSession.steps.length) return;
    const h = setTimeout(() => setStepIndex((i) => i + 1), 1200);
    return () => clearTimeout(h);
  }, [recording, paused, stepIndex]);

  const elapsed = startTime && recording ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const recent = steps.slice(-6).reverse();

  function toggleRecord() {
    if (!recording) {
      setRecording(true);
      setPaused(false);
      setStepIndex(0);
      setStartTime(Date.now());
    } else {
      setRecording(false);
      setPaused(false);
      showToast(`Session saved — ${steps.length} steps`);
    }
  }

  async function copyCode() {
    let code = offlineGenerate({ ...demoSession, steps: demoSession.steps.slice(0, stepIndex || demoSession.steps.length) }, framework);
    try {
      const res = await axios.post(`${API}/generate-script`, {
        session: { ...demoSession, name: testName, steps: demoSession.steps.slice(0, stepIndex || demoSession.steps.length) },
        framework,
        apiKey: settings.apiKey || undefined,
        model: settings.model,
      });
      if (res.data?.code) code = res.data.code;
    } catch {}
    await navigator.clipboard.writeText(code);
    showToast("Copied to clipboard");
  }

  async function exportCode() {
    const code = offlineGenerate({ ...demoSession, name: testName, steps: demoSession.steps.slice(0, stepIndex || demoSession.steps.length) }, framework);
    const ext = { playwright: "spec.ts", cypress: "cy.js", selenium: "py", karate: "feature" }[framework] || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `testcapture.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(txt) {
    setToast(txt);
    setTimeout(() => setToast(null), 1500);
  }

  return (
    <div className="flex-1 grid-bg">
      <div className="max-w-[1100px] mx-auto px-6 py-14">
        <div className="grid md:grid-cols-[380px_1fr] gap-12 items-start">
          {/* Popup itself */}
          <div className="justify-self-center md:justify-self-end" data-testid="popup-container">
            <div className="relative">
              <div className="absolute -inset-6 bg-white/5 blur-2xl rounded-full pointer-events-none" />
              <div
                className="relative"
                style={{
                  width: 380, height: 560, background: "#0A0A0A",
                  border: "1px solid #27272A", borderRadius: 12,
                  boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(250,250,250,0.04)",
                  overflow: "hidden", display: "flex", flexDirection: "column",
                }}
              >
                {/* fake chrome dots */}
                <div className="absolute top-2 right-2 font-mono text-[9px] text-zinc-600 uppercase tracking-[0.14em]">POPUP · 380×560</div>

                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-6 h-6 rounded bg-gradient-to-br from-white to-zinc-400 relative" style={{ boxShadow: "inset 0 0 0 1px #27272A" }}>
                      <span className="absolute inset-1 border border-[#0A0A0A] rounded-sm" />
                    </span>
                    <div>
                      <div className="font-semibold text-[13px] leading-tight">TestCapture AI</div>
                      <div className="font-mono text-[10px] text-zinc-500 leading-tight">demo.todoapp.com</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="w-7 h-7 border border-zinc-800 rounded text-zinc-400 hover:text-white hover:border-zinc-600 flex items-center justify-center"
                    data-testid="popup-settings-btn"
                  >
                    <SettingsIcon size={14}/>
                  </button>
                </div>

                {/* Record hero */}
                <div className="px-3 pt-3 pb-2 border-b border-zinc-800">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-mono text-2xl font-bold tabular-nums">{steps.length}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">STEPS</span>
                    <span className="flex-1 h-px bg-zinc-800 mx-1" />
                    <span className="font-mono text-sm font-bold text-zinc-400 tabular-nums">{mm}:{ss}</span>
                  </div>
                  <input
                    value={testName} onChange={(e) => setTestName(e.target.value)}
                    placeholder="Test name"
                    className="input mb-2" data-testid="popup-testname-input"
                  />
                  <div className="grid grid-cols-[2fr_1fr] gap-2">
                    <button
                      onClick={toggleRecord}
                      className={`btn ${recording ? "btn-record is-on" : "btn-record"}`}
                      data-testid="popup-record-btn"
                    >
                      <span className="step-dot" style={{ background: "currentColor" }} />
                      {recording ? "STOP" : "RECORD"}
                    </button>
                    <button
                      onClick={() => setPaused((p) => !p)}
                      disabled={!recording}
                      className="btn"
                      data-testid="popup-pause-btn"
                    >
                      {paused ? "RESUME" : "PAUSE"}
                    </button>
                  </div>
                </div>

                {/* Recent steps */}
                <div className="flex-1 overflow-hidden flex flex-col px-3 pt-3 pb-2 min-h-0">
                  <div className="micro text-zinc-500 mb-2">RECENT STEPS</div>
                  <div className="flex-1 overflow-auto flex flex-col gap-1.5" data-testid="popup-recent-steps">
                    {recent.length === 0 && (
                      <div className="text-zinc-600 text-xs text-center py-6">
                        {recording ? "Interact with the tab…" : "Press RECORD to start a simulated capture"}
                      </div>
                    )}
                    {recent.map((s, i) => (
                      <motion.div
                        key={s.id + i}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className={`border border-zinc-800 rounded bg-[#0F0F0F] ${typeBar(s.type)} px-2.5 py-2 flex items-center gap-2 text-[12px]`}
                      >
                        <span className="font-mono text-[9px] text-zinc-500 w-4 tabular-nums">{String(steps.length - i).padStart(2, "0")}</span>
                        <span className="text-zinc-200 truncate flex-1">{s.label}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 px-3 py-2 border-t border-zinc-800">
                  <select
                    value={framework}
                    onChange={(e) => { setFramework(e.target.value); setSettings({ framework: e.target.value }); }}
                    className="input" data-testid="popup-framework-select"
                    style={{ padding: "7px 8px" }}
                  >
                    <option value="playwright">Playwright</option>
                    <option value="cypress">Cypress</option>
                    <option value="selenium">Selenium</option>
                    <option value="karate">Karate</option>
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={copyCode} data-testid="popup-copy-btn"><Copy size={11}/></button>
                  <button className="btn btn-sm" onClick={exportCode} data-testid="popup-export-btn"><Download size={11}/></button>
                  <a href="/dashboard" className="btn btn-ghost btn-sm" data-testid="popup-dashboard-btn">DASH →</a>
                </div>

                {toast && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-16 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.12em]">
                    {toast}
                  </div>
                )}
              </div>
              <div className="text-center mt-4 font-mono text-[10px] text-zinc-600 uppercase tracking-[0.14em]">
                interactive preview — fully clickable
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <span className="micro text-zinc-500">POPUP SURFACE</span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter mt-3 mb-6">The 90% case.</h1>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Most of the time you don't need a dashboard — you just need to hit record, click through the app, and copy a script.
              The popup is optimized for that flow: zero scrolling, one primary action, and framework-switching is a single keystroke away.
            </p>
            <p className="text-zinc-400 leading-relaxed mb-8">
              Hit <button onClick={toggleRecord} className="text-white underline underline-offset-4" data-testid="notes-record-link">{recording ? "Stop" : "Record"}</button> on the popup to the left —
              it will simulate the pre-seeded "Login &amp; create a Todo" session so you can see what capture feels like. Press <span className="font-mono text-white">Pause</span>, swap frameworks, or hit <span className="font-mono text-white">Copy</span> to paste the current script to your clipboard.
            </p>
            <div className="border border-zinc-800 rounded p-5 bg-[#0F0F0F] mb-6">
              <div className="micro text-zinc-500 mb-3">KEYBOARD</div>
              <div className="font-mono text-[12px] text-zinc-300 space-y-1.5">
                <div><kbd className="border border-zinc-700 rounded px-1.5 py-0.5 text-[10px]">Alt</kbd> + <kbd className="border border-zinc-700 rounded px-1.5 py-0.5 text-[10px]">Shift</kbd> + <kbd className="border border-zinc-700 rounded px-1.5 py-0.5 text-[10px]">T</kbd> opens the popup</div>
                <div><kbd className="border border-zinc-700 rounded px-1.5 py-0.5 text-[10px]">Shift</kbd> + <kbd className="border border-zinc-700 rounded px-1.5 py-0.5 text-[10px]">Click</kbd> creates an assertion instead of a click step</div>
              </div>
            </div>
            <div className="flex gap-2">
              <a href="/dashboard" className="btn">Open the full dashboard →</a>
              <a href="/testcapture-extension.zip" download className="btn btn-primary"><Download size={14}/> Install extension</a>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function typeBar(t) {
  return { click: "bar-click", type: "bar-type", navigate: "bar-navigate", validate: "bar-validate", select: "bar-select" }[t] || "";
}
