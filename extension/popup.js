/* TestCapture AI — popup controller */
const $ = (sel) => document.querySelector(sel);
const state = { recording: false, paused: false, sessionId: null, startTime: null, steps: [], framework: "playwright" };

// Load settings
chrome.storage.local.get(["tc_settings"], ({ tc_settings }) => {
  const s = tc_settings || {};
  $("#tc-api-key").value = s.apiKey || "";
  $("#tc-model").value = s.model || "claude-sonnet-4-5-20250929";
  $("#tc-proxy").value = s.proxyUrl || "";
  $("#tc-framework").value = s.framework || "playwright";
  state.framework = s.framework || "playwright";
});

$("#tc-settings-btn").addEventListener("click", () => {
  const p = $("#tc-settings-panel");
  p.hidden = !p.hidden;
});
$("#tc-settings-save").addEventListener("click", async () => {
  const settings = {
    apiKey: $("#tc-api-key").value.trim(),
    model: $("#tc-model").value,
    proxyUrl: $("#tc-proxy").value.trim(),
    framework: $("#tc-framework").value,
  };
  await chrome.storage.local.set({ tc_settings: settings });
  toast("Settings saved");
  $("#tc-settings-panel").hidden = true;
});

$("#tc-record-btn").addEventListener("click", async () => {
  if (!state.recording) {
    const name = $("#tc-test-name").value.trim() || undefined;
    const res = await send({ type: "TC_START", name });
    if (res?.session) {
      state.recording = true;
      state.paused = false;
      state.sessionId = res.session.id;
      state.startTime = res.session.startTime;
      state.steps = res.session.steps || [];
      renderRecordingUI();
      renderSteps();
      startTimer();
    }
  } else {
    const res = await send({ type: "TC_STOP" });
    state.recording = false;
    state.paused = false;
    stopTimer();
    renderRecordingUI();
    if (res?.session) toast(`Session saved — ${res.session.steps.length} steps`);
  }
});

$("#tc-pause-btn").addEventListener("click", async () => {
  const res = await send({ type: "TC_PAUSE" });
  state.paused = !!res?.paused;
  renderRecordingUI();
});

$("#tc-assert-mode").addEventListener("change", async (e) => {
  const on = !!e.target.checked;
  const box = e.target.closest(".tc-assert-toggle");
  if (box) box.classList.toggle("is-on", on);
  await send({ type: "TC_SET_ASSERT_MODE", assertMode: on });
});

$("#tc-framework").addEventListener("change", async (e) => {
  state.framework = e.target.value;
  await send({ type: "TC_SET_FRAMEWORK", framework: state.framework });
  const cur = await chrome.storage.local.get("tc_settings");
  await chrome.storage.local.set({ tc_settings: { ...(cur.tc_settings || {}), framework: state.framework } });
});

$("#tc-copy-btn").addEventListener("click", async () => {
  setBusy("#tc-copy-btn", "…");
  const code = await generateCode();
  restoreBtn("#tc-copy-btn", "COPY");
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast("Code copied");
  } catch (e) {
    console.warn(e);
    toast("Clipboard blocked");
  }
});
$("#tc-export-btn").addEventListener("click", async () => {
  setBusy("#tc-export-btn", "…");
  const code = await generateCode();
  restoreBtn("#tc-export-btn", "EXPORT");
  if (!code) return;
  const ext = { playwright: "spec.ts", cypress: "cy.js", selenium: "py", karate: "feature" }[state.framework] || "txt";
  const filename = `testcapture-${Date.now()}.${ext}`;
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  // Prefer chrome.downloads (reliable in popup context). Fall back to anchor click.
  let downloaded = false;
  try {
    if (chrome.downloads?.download) {
      await new Promise((resolve) => {
        chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
          downloaded = !!id;
          resolve();
        });
      });
    }
  } catch (e) { console.warn("chrome.downloads failed", e); }
  if (!downloaded) {
    // Fallback for when 'downloads' permission is unavailable
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Exported ${filename}`);
});
$("#tc-open-dash-btn").addEventListener("click", async () => {
  await send({ type: "TC_OPEN_DASHBOARD", sessionId: state.sessionId });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TC_STEP_ADDED" && msg.sessionId === state.sessionId) {
    refreshSession();
  }
  if (msg?.type === "TC_STATE") {
    state.recording = msg.state.recording;
    state.paused = msg.state.paused;
    state.sessionId = msg.state.activeSessionId;
    state.startTime = msg.state.startTime;
    renderRecordingUI();
  }
});

(async function init() {
  const [stateRes, tab] = await Promise.all([
    send({ type: "TC_QUERY_STATE" }),
    chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t[0]),
  ]);
  if (tab?.url) {
    try { $("#tc-domain").textContent = new URL(tab.url).host; } catch (_) { $("#tc-domain").textContent = "—"; }
  }
  const bg = stateRes?.state || {};
  state.recording = !!bg.recording;
  state.paused = !!bg.paused;
  state.sessionId = bg.activeSessionId;
  state.startTime = bg.startTime;
  state.framework = bg.framework || state.framework;
  // Restore assert-mode UI
  const assertOn = !!bg.assertMode;
  $("#tc-assert-mode").checked = assertOn;
  $("#tc-assert-mode").closest(".tc-assert-toggle")?.classList.toggle("is-on", assertOn);
  if (state.sessionId) await refreshSession();
  renderRecordingUI();
  if (state.recording) startTimer();
})();

async function refreshSession() {
  const res = await send({ type: "TC_GET_ACTIVE_SESSION" });
  if (res?.session) {
    state.steps = res.session.steps || [];
    renderSteps();
  }
}

function renderRecordingUI() {
  const btn = $("#tc-record-btn");
  const label = $("#tc-record-label");
  if (state.recording) {
    btn.classList.add("is-recording");
    label.textContent = "STOP";
    $("#tc-pause-btn").disabled = false;
    $("#tc-pause-btn").textContent = state.paused ? "RESUME" : "PAUSE";
  } else {
    btn.classList.remove("is-recording");
    label.textContent = "RECORD";
    $("#tc-pause-btn").disabled = true;
    $("#tc-pause-btn").textContent = "PAUSE";
  }
}

function renderSteps() {
  const container = $("#tc-recent-steps");
  $("#tc-step-counter").textContent = state.steps.length;
  if (!state.steps.length) {
    container.innerHTML = '<div class="tc-empty">Waiting for interactions…</div>';
    return;
  }
  const last = state.steps.slice(-6).reverse();
  container.innerHTML = last
    .map((s, i) => {
      const n = state.steps.length - i;
      const label = escapeHtml(s.label || s.type);
      return `<div class="tc-step ${escapeHtml(s.type)}"><span class="k">${String(n).padStart(2, "0")}</span><span class="l">${label}</span></div>`;
    })
    .join("");
}

let timerHandle = null;
function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    if (!state.startTime) return;
    const ms = Date.now() - state.startTime;
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("#tc-timer").textContent = `${mm}:${ss}`;
  }, 500);
}
function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

async function generateCode() {
  const r = await send({ type: "TC_GET_ACTIVE_SESSION" });
  const session = r?.session;
  if (!session || !session.steps?.length) { toast("Nothing to generate yet"); return null; }
  const cur = await chrome.storage.local.get("tc_settings");
  const settings = cur.tc_settings || {};
  const proxy = settings.proxyUrl || "";
  if (!proxy) {
    toast("No proxy URL — offline template used");
    return offlineGenerate(session, state.framework);
  }
  try {
    const res = await fetch(proxy.replace(/\/$/, "") + "/generate-script", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, framework: state.framework, apiKey: settings.apiKey || undefined, model: settings.model || undefined }),
    });
    const data = await res.json();
    return data.code || offlineGenerate(session, state.framework);
  } catch (e) {
    console.warn(e);
    toast("LLM failed — offline template used");
    return offlineGenerate(session, state.framework);
  }
}

function send(msg) {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(r)); } catch (_) { resolve(null); }
  });
}

const _btnOriginal = {};
function setBusy(sel, label) {
  const el = document.querySelector(sel);
  if (!el) return;
  _btnOriginal[sel] = el.textContent;
  el.disabled = true;
  el.textContent = label;
}
function restoreBtn(sel, fallback) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.disabled = false;
  el.textContent = _btnOriginal[sel] || fallback;
}

function toast(txt) {
  const t = $("#tc-toast");
  t.textContent = txt;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.hidden = true), 1500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Offline generator (mirrors backend fallback, simplified)
function offlineGenerate(session, framework) {
  const name = session.name || "Recorded test";
  const origin = session.targetOrigin || "https://example.com";
  const steps = session.steps || [];
  if (framework === "playwright") {
    const lines = [
      "import { test, expect } from '@playwright/test';",
      "",
      `test('${name}', async ({ page }) => {`,
      `  await page.goto('${origin}');`,
    ];
    steps.forEach((s) => {
      const sv = s.selector?.value || "";
      const strat = s.selector?.strategy || "css";
      const loc = strat === "data-testid" ? `page.getByTestId('${sv}')`
        : strat === "aria-label" ? `page.getByLabel('${sv}')`
        : strat === "role" ? `page.getByRole('${sv}')`
        : `page.locator('${sv}')`;
      if (s.type === "click") lines.push(`  await ${loc}.click(); // ${s.label}`);
      else if (s.type === "type") lines.push(`  await ${loc}.fill('${s.value || ""}');`);
      else if (s.type === "navigate") lines.push(`  await page.goto('${s.value || ""}');`);
      else if (s.type === "validate") lines.push(`  await expect(${loc}).toContainText('${s.value || ""}');`);
      else if (s.type === "select") lines.push(`  await ${loc}.selectOption('${s.value || ""}');`);
    });
    lines.push("});");
    return lines.join("\n");
  }
  return JSON.stringify(session.steps, null, 2);
}
