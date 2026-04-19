import React, { useEffect, useState } from "react";
import { useSettings } from "@/context/SettingsContext";
import { X, Eye, EyeOff, ExternalLink } from "lucide-react";

export default function SettingsModal({ open, onClose }) {
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [show, setShow] = useState(false);

  useEffect(() => { if (open) setForm(settings); }, [open, settings]);

  if (!open) return null;

  function save() {
    setSettings(form);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="settings-modal-backdrop"
    >
      <div
        className="w-full max-w-md bg-[#121212] border border-zinc-800 rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="micro text-zinc-500">CONFIGURATION</div>
            <div className="font-display text-lg font-semibold tracking-tight mt-1">Settings</div>
          </div>
          <button className="text-zinc-500 hover:text-white" onClick={onClose} data-testid="settings-close-btn"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="label block mb-2">Anthropic API Key</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="input pr-10"
                data-testid="settings-apikey-input"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                data-testid="settings-toggle-apikey"
              >
                {show ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
            <div className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
              Stored in this browser (localStorage). Leave blank to fall back to the bundled offline template.
              Get a key from <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-white underline underline-offset-2 inline-flex items-center gap-1">console.anthropic.com <ExternalLink size={10}/></a>.
            </div>
          </div>

          <div>
            <label className="label block mb-2">Model</label>
            <select
              className="input"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              data-testid="settings-model-select"
            >
              <option value="claude-sonnet-4-5-20250929">claude-sonnet-4-5</option>
              <option value="claude-opus-4-5-20251101">claude-opus-4-5</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
              <option value="claude-4-sonnet-20250514">claude-4-sonnet</option>
            </select>
          </div>

          <div>
            <label className="label block mb-2">Default framework</label>
            <select
              className="input"
              value={form.framework}
              onChange={(e) => setForm({ ...form, framework: e.target.value })}
              data-testid="settings-framework-select"
            >
              <option value="playwright">Playwright</option>
              <option value="cypress">Cypress</option>
              <option value="selenium">Selenium</option>
              <option value="karate">Karate</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button className="btn btn-ghost" onClick={onClose} data-testid="settings-cancel-btn">Cancel</button>
          <button className="btn btn-primary" onClick={save} data-testid="settings-save-btn">Save</button>
        </div>
      </div>
    </div>
  );
}
