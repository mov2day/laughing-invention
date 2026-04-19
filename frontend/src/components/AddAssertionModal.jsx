import React, { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";

const TYPES = [
  { id: "containsText", label: "Contains text", hint: "Element's text/content contains the expected value." },
  { id: "visible", label: "Is visible", hint: "Element exists and is rendered (no expected value needed)." },
  { id: "exists", label: "Exists in DOM", hint: "Element is attached to the DOM (no expected value needed)." },
  { id: "valueEquals", label: "Input value equals", hint: "For <input>/<select>: value matches exactly." },
  { id: "countEquals", label: "Match count equals", hint: "Number of matching elements equals the expected integer." },
  { id: "urlContains", label: "URL contains", hint: "Current window.location.href contains the expected substring." },
];

export default function AddAssertionModal({ open, onClose, onAdd, defaultExpected = "" }) {
  const [type, setType] = useState("containsText");
  const [expected, setExpected] = useState(defaultExpected);

  useEffect(() => { if (open) { setType("containsText"); setExpected(defaultExpected || ""); } }, [open, defaultExpected]);

  if (!open) return null;
  const spec = TYPES.find((t) => t.id === type);
  const needsValue = !["visible", "exists"].includes(type);

  function submit() {
    onAdd({ type, expected: needsValue ? expected : null });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#121212] border border-zinc-800 rounded-md shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400"/>
            <div>
              <div className="micro text-zinc-500">STEP ASSERTION</div>
              <div className="font-display text-lg font-semibold tracking-tight mt-1">Add assertion</div>
            </div>
          </div>
          <button className="text-zinc-500 hover:text-white" onClick={onClose} data-testid="add-assertion-close"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="label block mb-2">Assertion type</label>
            <div className="grid grid-cols-2 gap-2" data-testid="assertion-type-grid">
              {TYPES.map((t) => (
                <button key={t.id} onClick={() => setType(t.id)}
                  className={`text-left border rounded px-3 py-2.5 transition-colors ${type === t.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"}`}
                  data-testid={`assertion-type-${t.id}`}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {needsValue && (
            <div>
              <label className="label block mb-2">Expected value</label>
              <input
                className="input"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder={spec?.id === "countEquals" ? "1" : spec?.id === "urlContains" ? "/app" : "e.g. Welcome back"}
                data-testid="assertion-expected-input"
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button className="btn btn-ghost" onClick={onClose} data-testid="assertion-cancel-btn">Cancel</button>
          <button className="btn btn-primary" onClick={submit} data-testid="assertion-save-btn"><ShieldCheck size={12}/> Add assertion</button>
        </div>
      </div>
    </div>
  );
}
