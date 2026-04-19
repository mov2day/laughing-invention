import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Highlight, themes } from "prism-react-renderer";
import { Copy, Download, RefreshCw, Play, Square, Pause, Plus, Settings as SettingsIcon } from "lucide-react";
import { demoSession } from "@/data/demoSession";
import { offlineGenerate } from "@/lib/generate";
import { useSettings } from "@/context/SettingsContext";
import SettingsModal from "@/components/SettingsModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FRAMEWORKS = [
  { id: "playwright", label: "Playwright", lang: "typescript" },
  { id: "cypress", label: "Cypress", lang: "javascript" },
  { id: "selenium", label: "Selenium (Python)", lang: "python" },
  { id: "karate", label: "Karate", lang: "gherkin" },
];

const TYPE_COLOR = {
  click: "bar-click",
  type: "bar-type",
  navigate: "bar-navigate",
  validate: "bar-validate",
  select: "bar-select",
};

export default function Dashboard() {
  const { settings } = useSettings();
  const [sessions] = useState([demoSession, exampleSession2()]);
  const [currentId, setCurrentId] = useState(demoSession.id);
  const session = sessions.find((s) => s.id === currentId) || demoSession;
  const [framework, setFramework] = useState(settings.framework || "playwright");
  const [activeStepId, setActiveStepId] = useState(session.steps[0]?.id);
  const [code, setCode] = useState("");
  const [codeMeta, setCodeMeta] = useState("OFFLINE");
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Initial offline render for instant first paint
    setCode(offlineGenerate(session, framework));
    setCodeMeta("OFFLINE");
  }, [currentId, framework]); // eslint-disable-line

  const activeStep = useMemo(
    () => session.steps.find((s) => s.id === activeStepId) || session.steps[0],
    [session, activeStepId]
  );
  useEffect(() => setActiveStepId(session.steps[0]?.id), [currentId]); // eslint-disable-line

  async function generateWithAI() {
    setIsGenerating(true);
    setCodeMeta("GENERATING…");
    try {
      const res = await axios.post(`${API}/generate-script`, {
        session,
        framework,
        apiKey: settings.apiKey || undefined,
        model: settings.model,
        provider: settings.provider || "anthropic",
      });
      if (res.data?.code) {
        setCode(res.data.code);
        setCodeMeta((res.data.model || "LLM").toUpperCase());
        showToast(res.data.model === "offline-template" ? "Offline template (add API key in Settings)" : "Generated");
      }
    } catch (e) {
      console.error(e);
      setCode(offlineGenerate(session, framework));
      setCodeMeta("OFFLINE · FALLBACK");
      showToast("AI call failed — showing offline template");
    } finally {
      setIsGenerating(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(code);
    showToast("Copied to clipboard");
  }
  function download() {
    const ext = { playwright: "spec.ts", cypress: "cy.js", selenium: "py", karate: "feature" }[framework] || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `testcapture-${session.id}.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  const langForPrism = useMemo(() => {
    const map = { playwright: "tsx", cypress: "javascript", selenium: "python", karate: "gherkin" };
    return map[framework] || "javascript";
  }, [framework]);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Sidebar */}
      <aside className="w-[260px] border-r border-zinc-800 p-5 flex flex-col min-h-0 bg-[#0A0A0A]">
        <div className="micro text-zinc-500 mb-3">HISTORY</div>
        <div className="flex flex-col gap-1 overflow-auto flex-1" data-testid="sidebar-sessions">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setCurrentId(s.id)}
              data-testid={`session-item-${s.id}`}
              className={`text-left border rounded p-3 bg-[#0F0F0F] transition-colors ${
                s.id === currentId ? "border-white" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="text-sm font-semibold truncate">{s.name}</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-1 uppercase tracking-[0.08em]">
                {new Date(s.startTime).toLocaleDateString()} · {s.steps.length} steps · {s.status}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-zinc-800 mt-4 pt-4 flex flex-col gap-2">
          <button className="btn btn-sm" onClick={() => showToast("Use the extension to record a real session")} data-testid="dash-new-session">
            <Plus size={12} /> New session
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)} data-testid="dash-settings-btn">
            <SettingsIcon size={12} /> Settings
          </button>
        </div>
      </aside>

      {/* Main */}
      <section className="flex-1 flex flex-col min-h-0">
        {/* Topbar */}
        <div className="border-b border-zinc-800 px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <div className="micro text-zinc-500">SESSION</div>
            <h1 className="font-display text-2xl font-bold tracking-tight mt-1" data-testid="dash-session-name">{session.name}</h1>
            <div className="font-mono text-[11px] text-zinc-500 mt-1.5">
              {session.targetOrigin} · <span className="text-emerald-400">{session.status}</span> · {session.steps.length} steps
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex border border-zinc-800 rounded overflow-hidden" role="tablist" data-testid="framework-tabs">
              {FRAMEWORKS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFramework(f.id)}
                  className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] border-r border-zinc-800 last:border-r-0 transition-colors ${
                    framework === f.id ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                  data-testid={`framework-tab-${f.id}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button className="btn" onClick={generateWithAI} disabled={isGenerating} data-testid="regen-btn">
              <RefreshCw size={12} className={isGenerating ? "animate-spin" : ""} /> {isGenerating ? "Generating" : "AI Regenerate"}
            </button>
            <button className="btn btn-primary" onClick={copy} data-testid="copy-code-btn"><Copy size={12}/> Copy</button>
            <button className="btn" onClick={download} data-testid="download-btn"><Download size={12}/> Download</button>
          </div>
        </div>

        {/* 3-column control room */}
        <div className="grid grid-cols-[360px_1fr_340px] flex-1 min-h-0 overflow-hidden">
          {/* Action Timeline */}
          <div className="border-r border-zinc-800 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="micro text-zinc-500">ACTION TIMELINE</span>
              <span className="font-mono text-[10px] text-zinc-500">{session.steps.length} STEPS</span>
            </div>
            <div className="overflow-auto p-3 flex flex-col gap-1.5" data-testid="action-timeline">
              {session.steps.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  data-testid={`timeline-step-${step.stepNumber || i + 1}`}
                  className={`text-left border rounded bg-[#0F0F0F] ${TYPE_COLOR[step.type] || ""} ${
                    step.id === activeStepId ? "border-white bg-[#18181B]" : "border-zinc-800 hover:border-zinc-700"
                  } p-3 transition-colors`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-zinc-500 w-5">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
                      style={{ background: colorFor(step.type), color: textFor(step.type) }}>{step.type}</span>
                    <span className="ml-auto font-mono text-[10px] text-zinc-600">{ago(step.timestamp)}</span>
                  </div>
                  <div className="text-sm text-zinc-200 truncate">{step.label}</div>
                  <div className="font-mono text-[10px] text-zinc-500 truncate mt-1">
                    {step.selector?.strategy}: {step.selector?.value}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Code Editor */}
          <div className="flex flex-col min-h-0 bg-[#0A0A0A]">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="micro text-zinc-500">{session.name} · {FRAMEWORKS.find(f => f.id === framework)?.label}</span>
              <span className="font-mono text-[10px] text-zinc-400">{codeMeta}</span>
            </div>
            <div className="overflow-auto flex-1" data-testid="code-editor">
              <Highlight theme={themes.nightOwl} code={code} language={langForPrism}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={`${className} code-wrap`} style={{ ...style, background: "#0A0A0A" }}>
                    {tokens.map((line, idx) => (
                      <div key={idx} {...getLineProps({ line })}>
                        <span className="inline-block w-8 text-right pr-3 select-none text-zinc-700">{idx + 1}</span>
                        {line.map((token, tIdx) => (
                          <span key={tIdx} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </div>

          {/* Inspector */}
          <div className="flex flex-col min-h-0 border-l border-zinc-800">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="micro text-zinc-500">ELEMENT INSPECTOR</span>
            </div>
            <div className="overflow-auto p-4 flex-1" data-testid="element-inspector">
              {activeStep ? (
                <>
                  <div className="grid grid-cols-[80px_1fr] gap-2 font-mono text-[11px] leading-relaxed">
                    <Row k="type" v={activeStep.type} />
                    <Row k="tag" v={activeStep.elementProps?.tagName || "—"} />
                    <Row k="id" v={activeStep.elementProps?.id || "—"} />
                    <Row k="name" v={activeStep.elementProps?.name || "—"} />
                    <Row k="text" v={(activeStep.elementProps?.text || "").slice(0, 120) || "—"} />
                    <Row k="value" v={activeStep.value ?? "—"} />
                    <Row k="url" v={(activeStep.url || "").slice(0, 80)} />
                  </div>
                  <div className="mt-6">
                    <div className="micro text-zinc-500 mb-2">SELECTORS · PRIORITY ORDER</div>
                    <div className="flex flex-col gap-1.5">
                      {(activeStep.selector?.alternatives || []).map((a, i) => (
                        <div key={i} className="grid grid-cols-[80px_1fr_48px] gap-2 items-center border border-zinc-800 rounded px-2 py-2 font-mono text-[11px]" data-testid={`selector-alt-${i}`}>
                          <span className="text-zinc-500 uppercase tracking-[0.1em] text-[10px]">{a.strategy}</span>
                          <span className="text-zinc-200 truncate">{a.value}</span>
                          <span className={`text-center rounded py-[3px] text-[9px] font-bold tracking-[0.12em] ${stabilityClass(a.strategy)}`}>
                            {stabilityLabel(a.strategy)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-zinc-600 text-sm text-center py-16">Select a step to inspect.</div>
              )}
            </div>
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 rounded px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] z-50" data-testid="dash-toast">
            {toast}
          </div>
        )}
      </section>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Row({ k, v }) {
  return (
    <>
      <span className="text-zinc-500 uppercase tracking-[0.1em] text-[10px]">{k}</span>
      <span className="text-zinc-200 break-all">{v}</span>
    </>
  );
}

function stabilityClass(s) {
  if (["data-testid", "aria-label"].includes(s)) return "stability-high";
  if (["role", "id", "role+text"].includes(s)) return "stability-medium";
  return "stability-low";
}
function stabilityLabel(s) {
  return stabilityClass(s).replace("stability-", "").toUpperCase();
}
function colorFor(t) {
  return { click: "#3B82F6", type: "#A855F7", navigate: "#F59E0B", validate: "#10B981", select: "#22D3EE" }[t] || "#A1A1AA";
}
function textFor(t) {
  return t === "click" || t === "type" ? "#fff" : "#000";
}
function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); return `${h}h`;
}

function exampleSession2() {
  return {
    id: "demo-search",
    name: "Search, filter, and export results",
    project: "demo",
    status: "saved",
    startTime: Date.now() - 1000 * 60 * 60 * 3,
    targetOrigin: "https://app.example.dev",
    selectedFramework: "playwright",
    generatedCode: {},
    steps: [
      { id: "a1", stepNumber: 1, type: "navigate", label: "Navigate to app.example.dev", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "url", value: "https://app.example.dev", stability: "high", alternatives: [{ strategy: "url", value: "https://app.example.dev" }] }, value: "https://app.example.dev", elementProps: {}, url: "https://app.example.dev" },
      { id: "a2", stepNumber: 2, type: "click", label: "Click aria-label: Search", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "aria-label", value: "Search", stability: "high", alternatives: [{ strategy: "aria-label", value: "Search" }, { strategy: "role", value: "searchbox" }, { strategy: "css", value: "header input[type=search]" }] }, elementProps: { tagName: "INPUT", type: "search" }, url: "https://app.example.dev" },
      { id: "a3", stepNumber: 3, type: "type", label: "Type into aria-label: Search", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "aria-label", value: "Search", stability: "high", alternatives: [{ strategy: "aria-label", value: "Search" }] }, value: "invoices 2025", elementProps: { tagName: "INPUT" }, url: "https://app.example.dev" },
      { id: "a4", stepNumber: 4, type: "select", label: "Filter status = Paid", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "data-testid", value: "status-filter", stability: "high", alternatives: [{ strategy: "data-testid", value: "status-filter" }] }, value: "paid", elementProps: { tagName: "SELECT" }, url: "https://app.example.dev" },
      { id: "a5", stepNumber: 5, type: "click", label: "Click Export CSV", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "data-testid", value: "export-csv-btn", stability: "high", alternatives: [{ strategy: "data-testid", value: "export-csv-btn" }, { strategy: "role+text", value: "button:Export CSV" }] }, elementProps: { tagName: "BUTTON", text: "Export CSV" }, url: "https://app.example.dev" },
      { id: "a6", stepNumber: 6, type: "validate", label: "Assert toast contains Exported", timestamp: Date.now() - 1000 * 60 * 60 * 3, selector: { strategy: "role+text", value: "status:Exported", stability: "medium", alternatives: [{ strategy: "role+text", value: "status:Exported" }, { strategy: "css", value: ".toast" }] }, value: "Exported", elementProps: { tagName: "DIV", text: "Exported 42 rows" }, url: "https://app.example.dev" },
    ],
  };
}
