import React, { useEffect, useState } from "react";
import { useSettings } from "@/context/SettingsContext";
import { X, Eye, EyeOff, ExternalLink, RefreshCw, ShieldCheck, KeyRound, Check, AlertTriangle } from "lucide-react";
import { listModels, activateLicense, getLicense, clearLicense } from "@/lib/ai";

const PROVIDERS = [
  { id: "copilot", label: "GitHub Copilot", hint: "Requires the Chrome extension (direct browser calls are CORS-blocked)." },
  { id: "anthropic", label: "Anthropic (direct)", hint: "Your Claude API key, called straight from your browser." },
  { id: "openai", label: "OpenAI (direct)", hint: "Your OpenAI key, called directly." },
  { id: "offline", label: "Offline templates", hint: "No network. Deterministic code generated locally." },
];

export default function SettingsModal({ open, onClose }) {
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [license, setLicense] = useState(getLicense());
  const [licenseKey, setLicenseKey] = useState(license?.key || "");
  const [licenseStatus, setLicenseStatus] = useState(license?.valid ? "valid" : "inactive");
  const [licenseMsg, setLicenseMsg] = useState(license?.message || "");

  useEffect(() => { if (open) { setForm(settings); refreshModels(settings.provider); } }, [open, settings]);

  async function refreshModels(provider) {
    setLoadingModels(true);
    try { setModels(await listModels(provider)); } finally { setLoadingModels(false); }
  }

  async function handleActivate() {
    if (!licenseKey.trim()) return;
    setLicenseStatus("checking"); setLicenseMsg("");
    try {
      const r = await activateLicense(licenseKey.trim());
      if (r.valid) { setLicenseStatus("valid"); setLicenseMsg(r.message || "Activated"); setLicense(getLicense()); }
      else { setLicenseStatus("invalid"); setLicenseMsg(r.message || r.error || "Invalid key"); }
    } catch (e) { setLicenseStatus("invalid"); setLicenseMsg(String(e.message || e)); }
  }
  function handleDeactivate() {
    clearLicense(); setLicense(null); setLicenseKey(""); setLicenseStatus("inactive"); setLicenseMsg("");
  }

  if (!open) return null;

  function save() { setSettings(form); onClose(); }
  const providerSpec = PROVIDERS.find((p) => p.id === form.provider) || PROVIDERS[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose} data-testid="settings-modal-backdrop">
      <div className="w-full max-w-xl max-h-[92vh] overflow-auto bg-[#121212] border border-zinc-800 rounded-md shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 bg-[#121212] flex items-center justify-between px-5 py-4 border-b border-zinc-800 z-10">
          <div>
            <div className="micro text-zinc-500">CONFIGURATION</div>
            <div className="font-display text-lg font-semibold tracking-tight mt-1">Settings</div>
          </div>
          <button className="text-zinc-500 hover:text-white" onClick={onClose} data-testid="settings-close-btn"><X size={18}/></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Provider */}
          <div>
            <label className="label block mb-2">AI Provider</label>
            <div className="grid grid-cols-2 gap-2" data-testid="settings-provider-grid">
              {PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => { setForm({ ...form, provider: p.id, model: null }); refreshModels(p.id); }}
                  className={`text-left border rounded px-3 py-2.5 transition-colors ${form.provider === p.id ? "border-white bg-white/5" : "border-zinc-800 hover:border-zinc-700"}`}
                  data-testid={`settings-provider-${p.id}`}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.1em]">{p.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Provider-specific credentials */}
          {form.provider === "anthropic" && (
            <div>
              <label className="label block mb-2">Anthropic API Key</label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={form.apiKey || ""}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-ant-..." className="input pr-10" data-testid="settings-apikey-input" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" data-testid="settings-toggle-apikey">
                  {show ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              <div className="text-[11px] text-zinc-500 mt-2">Get one at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-white underline inline-flex items-center gap-1">console.anthropic.com <ExternalLink size={10}/></a></div>
            </div>
          )}
          {form.provider === "openai" && (
            <div>
              <label className="label block mb-2">OpenAI API Key</label>
              <input type={show ? "text" : "password"} value={form.openaiKey || ""}
                onChange={(e) => setForm({ ...form, openaiKey: e.target.value })}
                placeholder="sk-..." className="input" data-testid="settings-openai-input" />
              <div className="text-[11px] text-zinc-500 mt-2">Get one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-white underline inline-flex items-center gap-1">platform.openai.com/api-keys <ExternalLink size={10}/></a></div>
            </div>
          )}
          {form.provider === "copilot" && (
            <div className="border border-blue-500/30 bg-blue-500/5 rounded p-4 text-[12px] text-zinc-300 leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-blue-400 mb-2"><ShieldCheck size={14}/> Copilot requires the Chrome extension</div>
              GitHub's device-authorization flow can't complete from a cross-origin page. Install the extension, click <span className="font-mono">Connect GitHub</span> in its popup, and your Copilot subscription is wired up — this web demo simply mirrors the UX. Until then, Copilot generations will fall back to the offline template.
            </div>
          )}

          {/* Model */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Model</label>
              <button className="text-zinc-500 hover:text-white" onClick={() => refreshModels(form.provider)} data-testid="settings-refresh-models">
                <RefreshCw size={12} className={loadingModels ? "animate-spin" : ""} />
              </button>
            </div>
            <select className="input" value={form.model || ""} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="settings-model-select">
              <option value="">{loadingModels ? "Loading…" : "Select a model"}</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
            </select>
            <div className="text-[11px] text-zinc-500 mt-2">{providerSpec.hint}</div>
          </div>

          {/* Default framework */}
          <div>
            <label className="label block mb-2">Default framework</label>
            <select className="input" value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })} data-testid="settings-framework-select">
              <option value="playwright">Playwright</option>
              <option value="cypress">Cypress</option>
              <option value="selenium">Selenium</option>
              <option value="karate">Karate</option>
            </select>
          </div>

          {/* Team activation key */}
          <div className="border border-zinc-800 rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={14} className="text-amber-400"/>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-300">Team activation key</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em]">
                {licenseStatus === "valid" && <span className="text-emerald-400 inline-flex items-center gap-1"><Check size={10}/> ACTIVE {license?.plan ? "· " + license.plan : ""}</span>}
                {licenseStatus === "invalid" && <span className="text-red-400 inline-flex items-center gap-1"><AlertTriangle size={10}/> INVALID</span>}
                {licenseStatus === "checking" && <span className="text-zinc-500">Checking…</span>}
                {licenseStatus === "inactive" && <span className="text-zinc-500">Inactive</span>}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
              Activating a key unlocks the optional team backend — shared sessions, invites, seat management.
              Leave blank to keep using TestCapture standalone. <span className="font-mono text-zinc-400">TC-DEMO-TEAM-2026</span> is the free demo key.
            </p>
            <div className="flex gap-2">
              <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="TC-XXXX-XXXX-XXXX" className="input" data-testid="settings-license-input"/>
              <button className="btn btn-primary" onClick={handleActivate} disabled={!licenseKey.trim()} data-testid="settings-activate-btn">Activate</button>
              {licenseStatus === "valid" && <button className="btn btn-ghost" onClick={handleDeactivate} data-testid="settings-deactivate-btn">Remove</button>}
            </div>
            {licenseMsg && <div className={`text-[11px] mt-2 ${licenseStatus === "valid" ? "text-emerald-400" : "text-amber-400"}`} data-testid="settings-license-msg">{licenseMsg}</div>}
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#121212] flex justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button className="btn btn-ghost" onClick={onClose} data-testid="settings-cancel-btn">Cancel</button>
          <button className="btn btn-primary" onClick={save} data-testid="settings-save-btn">Save</button>
        </div>
      </div>
    </div>
  );
}
