/**
 * TestCapture AI — Frontend AI Provider (browser, web demo)
 *
 * Mirror of /app/extension/lib/ai.js but adapted for the React app:
 *   - Uses localStorage instead of chrome.storage.local
 *   - Provides the same generate() / listModels() / copilot.{…} API
 *
 * In the hosted web demo, Chrome's host_permissions aren't available, so
 * direct third-party API calls (Copilot, Anthropic, OpenAI) may be blocked
 * by CORS. The demo therefore falls back to the offline generator for those
 * providers — the *extension* is the real home of these integrations.
 */

const LS_KEY_SETTINGS = "tc_web_ai_settings";
const LS_KEY_COPILOT_GHO = "tc_web_copilot_gho";
const LS_KEY_COPILOT_SESSION = "tc_web_copilot_session";

export const DEFAULT_ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];
export const DEFAULT_OPENAI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "o1-mini", label: "o1-mini" },
];
export const DEFAULT_COPILOT_MODELS = [
  { id: "gpt-4o", label: "GPT-4o (Copilot)" },
  { id: "gpt-4.1", label: "GPT-4.1 (Copilot)" },
  { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet (Copilot)" },
  { id: "o1", label: "o1 (Copilot)" },
];

function readLS(key, fallback = null) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getSettings() {
  return Object.assign(
    { provider: "offline", model: null, apiKey: "", openaiKey: "" },
    readLS(LS_KEY_SETTINGS, {})
  );
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeLS(LS_KEY_SETTINGS, next);
  return next;
}

// ---------- Offline generator ----------
export { offlineGenerate } from "./generate";
import { offlineGenerate as _offlineGen } from "./generate";

// ---------- Prompt ----------
const FRAMEWORK_GUIDES = {
  playwright: "Language: TypeScript. Use @playwright/test. Export one test().",
  cypress: "Language: JavaScript. Use describe/it with Cypress 13+ chain syntax.",
  selenium: "Language: Python. Use selenium 4 + webdriver-manager, pytest-style.",
  karate: "Language: Karate DSL .feature. Use Feature/Scenario/Given/When/Then.",
};
const SYSTEM_PROMPT = [
  "You are an expert Test Automation Engineer. Given a recorded browser session (JSON of user steps including selectors, values, and assertions), produce a clean, runnable automation script in the requested framework.",
  "Rules: Output ONLY the code (no fences). Use the highest-priority selector per step. Preserve step order. Password values arrive pre-redacted as '********'. Include each step's structured assertions with correct framework syntax.",
].join("\n");

function buildPrompt(session, framework) {
  const sanitized = JSON.parse(JSON.stringify(session));
  sanitized.steps = (sanitized.steps || []).map((s) => ({ ...s, screenshot: undefined }));
  return `Framework: ${framework}\n${FRAMEWORK_GUIDES[framework] || ""}\n\nSession JSON:\n\`\`\`json\n${JSON.stringify(sanitized, null, 2)}\n\`\`\`\n\nProduce the single clean script now.`;
}

function stripFences(text) {
  const t = (text || "").trim();
  if (!t.startsWith("```")) return t;
  const parts = t.split("```");
  if (parts.length < 2) return t;
  let body = parts[1];
  if (body.includes("\n")) body = body.split("\n").slice(1).join("\n");
  return body.trim();
}

// ---------- Anthropic (direct; CORS may block in browser) ----------
async function anthropicGenerate(session, framework, model, apiKey) {
  if (!apiKey) throw new Error("Missing Anthropic API key");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(session, framework) }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  return stripFences((data.content || []).map((b) => b.text || "").join(""));
}

async function openaiGenerate(session, framework, model, apiKey) {
  if (!apiKey) throw new Error("Missing OpenAI API key");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(session, framework) },
      ],
      temperature: 0.2,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const data = await r.json();
  return stripFences(data.choices?.[0]?.message?.content || "");
}

// ---------- Dispatch ----------
export async function generate({ session, framework }) {
  const s = getSettings();
  const provider = s.provider || "offline";
  try {
    if (provider === "offline") {
      return { ok: true, data: { code: _offlineGen(session, framework), provider: "offline", model: "deterministic" } };
    }
    if (provider === "anthropic") {
      const code = await anthropicGenerate(session, framework, s.model, s.apiKey);
      return { ok: true, data: { code, provider: "anthropic", model: s.model || "claude-sonnet-4-5-20250929" } };
    }
    if (provider === "openai") {
      const code = await openaiGenerate(session, framework, s.model, s.openaiKey);
      return { ok: true, data: { code, provider: "openai", model: s.model || "gpt-4o" } };
    }
    // Copilot in the web demo: CORS-blocked from github/copilot APIs. Fall back to offline + explain.
    if (provider === "copilot") {
      const code = _offlineGen(session, framework);
      return {
        ok: false,
        error: "Copilot calls require the Chrome extension (CORS-restricted in the browser). The extension calls GitHub Copilot directly with its ephemeral token.",
        data: { code, provider: "offline-fallback", model: "deterministic" },
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: String(err.message || err),
      data: { code: _offlineGen(session, framework), provider: "offline-fallback", model: "deterministic" },
    };
  }
  return { ok: true, data: { code: _offlineGen(session, framework), provider: "offline", model: "deterministic" } };
}

export async function listModels(provider) {
  if (provider === "anthropic") return DEFAULT_ANTHROPIC_MODELS;
  if (provider === "openai") return DEFAULT_OPENAI_MODELS;
  if (provider === "copilot") return DEFAULT_COPILOT_MODELS;
  return [{ id: "deterministic", label: "deterministic" }];
}

// Team backend helpers
const API_BASE = process.env.REACT_APP_BACKEND_URL ? `${process.env.REACT_APP_BACKEND_URL}/api` : "";
export const LICENSE_KEY = "tc_web_license";

export async function activateLicense(key) {
  if (!API_BASE) return { valid: false, error: "Backend not configured" };
  const r = await fetch(`${API_BASE}/license/activate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const data = await r.json();
  if (data.valid) writeLS(LICENSE_KEY, { key, ...data });
  return data;
}
export function getLicense() { return readLS(LICENSE_KEY); }
export function clearLicense() { localStorage.removeItem(LICENSE_KEY); }
