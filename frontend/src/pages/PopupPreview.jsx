import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { Settings as SettingsIcon, Copy, Download, X } from "lucide-react";
import { demoSession } from "@/data/demoSession";
import { offlineGenerate } from "@/lib/generate";
import { useSettings } from "@/context/SettingsContext";
import SettingsModal from "@/components/SettingsModal";
import AddAssertionModal from "@/components/AddAssertionModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* A polished interactive simulation of the Chrome extension popup. */
export default function PopupPreview() {
  const { settings, setSettings } = useSettings();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState("normal"); // normal | assert | pick
  const [testName, setTestName] = useState("Login and create a Todo");
  const [framework, setFramework] = useState(settings.framework || "playwright");
  const [stepIndex, setStepIndex] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [tick, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Picker sandbox state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState(null);
  const [capturedAssertions, setCapturedAssertions] = useState([]);

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
                  width: 380, height: 640, background: "#0A0A0A",
                  border: "1px solid #27272A", borderRadius: 12,
                  boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(250,250,250,0.04)",
                  overflow: "hidden", display: "flex", flexDirection: "column",
                }}
              >
                {/* fake chrome dots */}
                <div className="absolute top-2 right-2 font-mono text-[9px] text-zinc-600 uppercase tracking-[0.14em]">POPUP · 380×640</div>

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

                  {/* Mode toggles (granular assertion control) */}
                  <div className="mt-2.5 space-y-1.5">
                    <button
                      onClick={() => setMode((m) => (m === "assert" ? "normal" : "assert"))}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 border rounded text-left transition-colors ${mode === "assert" ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"}`}
                      data-testid="popup-assert-toggle"
                    >
                      <span className="inline-block w-7 h-4 rounded-full relative" style={{ background: mode === "assert" ? "#10B981" : "#27272A" }}>
                        <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ left: mode === "assert" ? "14px" : "2px", background: mode === "assert" ? "#fff" : "#A1A1AA" }} />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-200 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> ASSERT MODE
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-zinc-500">click = validate</span>
                    </button>
                    <button
                      onClick={() => setMode((m) => (m === "pick" ? "normal" : "pick"))}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 border rounded text-left transition-colors ${mode === "pick" ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 hover:border-zinc-700"}`}
                      data-testid="popup-pick-toggle"
                    >
                      <span className="inline-block w-7 h-4 rounded-full relative" style={{ background: mode === "pick" ? "#3B82F6" : "#27272A" }}>
                        <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ left: mode === "pick" ? "14px" : "2px", background: mode === "pick" ? "#fff" : "#A1A1AA" }} />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-200 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" /> PICK ASSERTION
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-zinc-500">click → picker</span>
                    </button>
                    <div className="font-mono text-[9px] text-zinc-500 text-center mt-1.5 tracking-[0.04em]">
                      <kbd className="border border-zinc-800 rounded px-1 py-0.5 text-[9px]">Shift</kbd>+<kbd className="border border-zinc-800 rounded px-1 py-0.5 text-[9px]">Click</kbd> quick
                      <span className="mx-1">·</span>
                      <kbd className="border border-zinc-800 rounded px-1 py-0.5 text-[9px]">Alt</kbd>+<kbd className="border border-zinc-800 rounded px-1 py-0.5 text-[9px]">Click</kbd> picker
                    </div>
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

            {/* Interactive picker sandbox */}
            <div className="mt-10 border border-zinc-800 rounded p-5 bg-[#0F0F0F]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="micro text-zinc-500">LIVE SANDBOX</div>
                  <div className="font-display text-lg font-semibold tracking-tight mt-1">Try the picker on these elements</div>
                </div>
                <button onClick={() => setMode("pick")} className={`btn btn-sm ${mode === "pick" ? "btn-primary" : ""}`} data-testid="sandbox-pick-mode-btn">
                  {mode === "pick" ? "PICK MODE ON" : "TURN ON PICK MODE"}
                </button>
              </div>
              <p className="text-[12px] text-zinc-500 leading-relaxed mb-4">
                With <span className="text-white">PICK MODE</span> active, click any element below to open the granular assertion picker — choose a type,
                tune the expected value, pick the selector strategy, and save. Or hold <kbd className="border border-zinc-700 rounded px-1 py-0.5 text-[10px]">Alt</kbd> and click.
              </p>
              <SandboxPage
                pickMode={mode === "pick"}
                onPick={(el) => { setPickTarget(el); setPickerOpen(true); }}
                onAltClick={(el) => { setPickTarget(el); setPickerOpen(true); }}
              />
              {capturedAssertions.length > 0 && (
                <div className="mt-4 space-y-1" data-testid="sandbox-captured-list">
                  <div className="micro text-zinc-500 mb-2">CAPTURED ({capturedAssertions.length})</div>
                  {capturedAssertions.map((a, i) => (
                    <div key={i} className="grid grid-cols-[90px_1fr_24px] gap-2 items-center border border-emerald-500/30 bg-emerald-500/5 rounded px-2 py-2 font-mono text-[11px]">
                      <span className="text-emerald-400 uppercase tracking-[0.1em] text-[10px]">{a.type}</span>
                      <span className="text-zinc-200 truncate">{a.expected ?? a.target ?? "—"}</span>
                      <button onClick={() => setCapturedAssertions((xs) => xs.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400"><X size={12}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AddAssertionModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        defaultExpected={pickTarget?.text || pickTarget?.value || ""}
        onAdd={(assertion) => {
          setCapturedAssertions((xs) => [...xs, { ...assertion, target: pickTarget?.label }]);
          setPickerOpen(false);
          showToast(`Assertion captured on ${pickTarget?.label}`);
        }}
      />
    </div>
  );
}

function SandboxPage({ pickMode, onPick, onAltClick }) {
  const handle = (e, meta) => {
    if (!pickMode && !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.altKey) onAltClick(meta);
    else onPick(meta);
  };
  const dim = pickMode ? "cursor-crosshair" : "";
  const outline = pickMode ? "hover:outline hover:outline-2 hover:outline-emerald-500 hover:outline-offset-2" : "";
  return (
    <div className={`border border-dashed border-zinc-800 rounded p-4 bg-[#0A0A0A] ${dim}`} data-testid="sandbox-page">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-zinc-500">demo.todoapp.com/app</span>
        <span className="ml-auto font-mono text-[10px] text-emerald-500">{pickMode ? "● PICK MODE" : ""}</span>
      </div>
      <h3
        onClick={(e) => handle(e, { label: "h1:Welcome back", text: "Welcome back, demo@testcapture.ai", tagName: "H1" })}
        className={`text-xl font-display font-semibold mb-3 ${outline}`}
        data-testid="sandbox-heading"
      >Welcome back, demo@testcapture.ai</h3>
      <p
        onClick={(e) => handle(e, { label: "p:tagline", text: "You have 3 todos due today.", tagName: "P" })}
        className={`text-zinc-400 text-sm mb-4 ${outline}`}
        data-testid="sandbox-tagline"
      >You have 3 todos due today.</p>
      <div className="flex gap-2 mb-4">
        <button
          onClick={(e) => handle(e, { label: "button:new-todo-btn", text: "+ Add Todo", tagName: "BUTTON" })}
          className={`btn btn-primary btn-sm ${outline}`}
          data-testid="sandbox-add-btn"
        >+ Add Todo</button>
        <button
          onClick={(e) => handle(e, { label: "button:save-todo", text: "Save", tagName: "BUTTON" })}
          className={`btn btn-sm ${outline}`}
          data-testid="sandbox-save-btn"
        >Save</button>
      </div>
      <input
        onClick={(e) => handle(e, { label: "input:todo-input", text: "", value: "Finish TestCapture review", tagName: "INPUT" })}
        readOnly
        defaultValue="Finish TestCapture review"
        className={`input mb-3 ${outline}`}
        data-testid="sandbox-input"
      />
      <ul className="border border-zinc-800 rounded divide-y divide-zinc-800">
        {["Write tests for login", "Refactor the dashboard", "Ship TestCapture v1"].map((t, i) => (
          <li key={i}
            onClick={(e) => handle(e, { label: `li:todo-${i}`, text: t, tagName: "LI" })}
            className={`px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 ${outline}`}
            data-testid={`sandbox-todo-${i}`}
          >{t}</li>
        ))}
      </ul>
      {!pickMode && (
        <div className="mt-3 text-[11px] text-zinc-500 text-center">
          Tip: Turn on <span className="text-white">PICK MODE</span>, or hold <kbd className="border border-zinc-700 rounded px-1 py-0.5 text-[10px]">Alt</kbd> + click any element above.
        </div>
      )}
    </div>
  );
}

function typeBar(t) {
  return { click: "bar-click", type: "bar-type", navigate: "bar-navigate", validate: "bar-validate", select: "bar-select" }[t] || "";
}
