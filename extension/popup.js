/* TestCapture AI — popup controller (TCAI client-side AI) */
const $ = (sel) => document.querySelector(sel);
const state = { recording: false, paused: false, sessionId: null, startTime: null, steps: [], framework: "playwright", provider: "offline", model: null };

// --- Init ---
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

  $("#tc-assert-mode").checked = !!bg.assertMode;
  $("#tc-assert-mode").closest(".tc-assert-toggle")?.classList.toggle("is-on", !!bg.assertMode);
  $("#tc-pick-mode").checked = !!bg.pickMode;
  $("#tc-pick-mode").closest(".tc-pick-toggle")?.classList.toggle("is-on", !!bg.pickMode);

  await loadAISettingsIntoUI();
  await refreshCopilotStatus();
  await populateModelList(state.provider);
  if (state.sessionId) await refreshSession();
  $("#tc-framework").value = state.framework;
  renderRecordingUI();
  if (state.recording) startTimer();
  updateProviderPill();
})();

// --- Settings panel ---
$("#tc-settings-btn").addEventListener("click", () => { const p = $("#tc-settings-panel"); p.hidden = !p.hidden; });
$("#tc-provider").addEventListener("change", async (e) => {
  state.provider = e.target.value;
  showProviderBlocks(state.provider);
  await populateModelList(state.provider);
});
$("#tc-refresh-models").addEventListener("click", async (e) => { e.preventDefault(); await populateModelList(state.provider, true); });
$("#tc-connect-copilot").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("auth.html");
  await chrome.tabs.create({ url });
  window.close();
});
$("#tc-disconnect-copilot").addEventListener("click", async () => {
  await window.TCAI.copilot.disconnect();
  await refreshCopilotStatus();
  toast("Disconnected");
});
$("#tc-settings-save").addEventListener("click", async () => {
  await window.TCAI.setSettings({
    provider: $("#tc-provider").value,
    model: $("#tc-model").value,
    apiKey: $("#tc-anthropic-key").value.trim(),
    openaiKey: $("#tc-openai-key").value.trim(),
  });
  state.provider = $("#tc-provider").value;
  state.model = $("#tc-model").value;
  updateProviderPill();
  toast("Saved");
  $("#tc-settings-panel").hidden = true;
});

async function loadAISettingsIntoUI() {
  const s = await window.TCAI.getSettings();
  state.provider = s.provider || "offline";
  state.model = s.model;
  $("#tc-provider").value = state.provider;
  $("#tc-anthropic-key").value = s.apiKey || "";
  $("#tc-openai-key").value = s.openaiKey || "";
  showProviderBlocks(state.provider);
}
function showProviderBlocks(p) {
  document.querySelectorAll(".tc-provider-block").forEach((el) => { el.hidden = el.dataset.provider !== p; });
}
async function populateModelList(provider, forceReload = false) {
  const sel = $("#tc-model");
  sel.innerHTML = `<option value="">Loading…</option>`;
  try {
    let models = [];
    if (provider === "offline") {
      sel.innerHTML = `<option value="deterministic">deterministic</option>`;
      return;
    }
    models = await window.TCAI.listModels(provider);
    if (!models.length) {
      sel.innerHTML = `<option value="">No models available — check credentials</option>`;
      return;
    }
    sel.innerHTML = models.map((m) => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.label || m.id)}</option>`).join("");
    const saved = await window.TCAI.getSettings();
    if (saved.model && [...sel.options].some((o) => o.value === saved.model)) sel.value = saved.model;
  } catch (e) {
    sel.innerHTML = `<option value="">Error loading models</option>`;
    console.warn(e);
  }
}
async function refreshCopilotStatus() {
  const st = await window.TCAI.copilot.status();
  const pill = $("#tc-copilot-status");
  if (st.signed_in) {
    pill.textContent = st.session_valid ? "Connected ✓" : "Connected · Token stale (auto-refresh)";
    pill.className = "tc-pill ok";
    $("#tc-connect-copilot").hidden = true;
    $("#tc-disconnect-copilot").hidden = false;
  } else {
    pill.textContent = "Not connected";
    pill.className = "tc-pill";
    $("#tc-connect-copilot").hidden = false;
    $("#tc-disconnect-copilot").hidden = true;
  }
}
function updateProviderPill() {
  const pill = $("#tc-provider-pill");
  pill.className = `tc-mini-pill ${state.provider}`;
  pill.textContent = state.provider;
}

// --- Record controls ---
$("#tc-record-btn").addEventListener("click", async () => {
  if (!state.recording) {
    const name = $("#tc-test-name").value.trim() || undefined;
    const res = await send({ type: "TC_START", name });
    if (res?.session) {
      state.recording = true; state.paused = false; state.sessionId = res.session.id;
      state.startTime = res.session.startTime; state.steps = res.session.steps || [];
      renderRecordingUI(); renderSteps(); startTimer();
    }
  } else {
    const res = await send({ type: "TC_STOP" });
    state.recording = false; state.paused = false;
    stopTimer(); renderRecordingUI();
    if (res?.session) toast(`Saved — ${res.session.steps.length} steps`);
  }
});
$("#tc-pause-btn").addEventListener("click", async () => {
  const res = await send({ type: "TC_PAUSE" });
  state.paused = !!res?.paused;
  renderRecordingUI();
});
$("#tc-assert-mode").addEventListener("change", async (e) => {
  const on = !!e.target.checked;
  e.target.closest(".tc-assert-toggle")?.classList.toggle("is-on", on);
  if (on) { $("#tc-pick-mode").checked = false; $("#tc-pick-mode").closest(".tc-pick-toggle")?.classList.remove("is-on"); }
  await send({ type: "TC_SET_ASSERT_MODE", assertMode: on });
});
$("#tc-pick-mode").addEventListener("change", async (e) => {
  const on = !!e.target.checked;
  e.target.closest(".tc-pick-toggle")?.classList.toggle("is-on", on);
  if (on) { $("#tc-assert-mode").checked = false; $("#tc-assert-mode").closest(".tc-assert-toggle")?.classList.remove("is-on"); }
  await send({ type: "TC_SET_PICK_MODE", pickMode: on });
});
$("#tc-framework").addEventListener("change", async (e) => {
  state.framework = e.target.value;
  await send({ type: "TC_SET_FRAMEWORK", framework: state.framework });
});

// --- Generate / Copy / Export ---
$("#tc-copy-btn").addEventListener("click", async () => {
  setBusy("#tc-copy-btn", "…");
  const code = await generateCode();
  restoreBtn("#tc-copy-btn", "COPY");
  if (!code) return;
  try { await navigator.clipboard.writeText(code); toast("Copied"); }
  catch { toast("Clipboard blocked"); }
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
  let ok = false;
  try {
    if (chrome.downloads?.download) {
      await new Promise((r) => chrome.downloads.download({ url, filename, saveAs: false }, (id) => { ok = !!id; r(); }));
    }
  } catch (e) { console.warn(e); }
  if (!ok) { const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Exported ${filename}`);
});
$("#tc-open-dash-btn").addEventListener("click", async () => {
  await send({ type: "TC_OPEN_DASHBOARD", sessionId: state.sessionId });
});
$("#tc-open-dash-top").addEventListener("click", async () => {
  await send({ type: "TC_OPEN_DASHBOARD", sessionId: state.sessionId });
});

async function generateCode() {
  const r = await send({ type: "TC_GET_ACTIVE_SESSION" });
  const session = r?.session || { steps: state.steps, name: $("#tc-test-name").value.trim() || "Recorded test", targetOrigin: null };
  if (!session.steps?.length) { toast("Nothing to generate"); return null; }
  const result = await window.TCAI.generate({ session, framework: state.framework });
  if (!result.ok) toast(`AI error — offline used`);
  return result.data?.code || null;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TC_STEP_ADDED" && msg.sessionId === state.sessionId) refreshSession();
  if (msg?.type === "TC_STATE") {
    state.recording = msg.state.recording; state.paused = msg.state.paused;
    state.sessionId = msg.state.activeSessionId; state.startTime = msg.state.startTime;
    renderRecordingUI();
  }
});
async function refreshSession() {
  const res = await send({ type: "TC_GET_ACTIVE_SESSION" });
  if (res?.session) { state.steps = res.session.steps || []; renderSteps(); }
}

function renderRecordingUI() {
  const btn = $("#tc-record-btn");
  const label = $("#tc-record-label");
  if (state.recording) { btn.classList.add("is-recording"); label.textContent = "STOP"; $("#tc-pause-btn").disabled = false; $("#tc-pause-btn").textContent = state.paused ? "RESUME" : "PAUSE"; }
  else { btn.classList.remove("is-recording"); label.textContent = "RECORD"; $("#tc-pause-btn").disabled = true; $("#tc-pause-btn").textContent = "PAUSE"; }
}
function renderSteps() {
  const container = $("#tc-recent-steps");
  $("#tc-step-counter").textContent = state.steps.length;
  if (!state.steps.length) { container.innerHTML = '<div class="tc-empty">Waiting for interactions…</div>'; return; }
  const last = state.steps.slice(-6).reverse();
  container.innerHTML = last.map((s, i) => {
    const n = state.steps.length - i;
    return `<div class="tc-step ${escapeHtml(s.type)}"><span class="k">${String(n).padStart(2, "0")}</span><span class="l">${escapeHtml(s.label || s.type)}</span></div>`;
  }).join("");
}

let timerHandle = null;
function startTimer() { stopTimer(); timerHandle = setInterval(() => {
  if (!state.startTime) return;
  const s = Math.floor((Date.now() - state.startTime) / 1000);
  $("#tc-timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}, 500); }
function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }

function send(msg) { return new Promise((r) => { try { chrome.runtime.sendMessage(msg, (x) => r(x)); } catch { r(null); } }); }
const _btnO = {};
function setBusy(sel, label) { const el = $(sel); if (!el) return; _btnO[sel] = el.textContent; el.disabled = true; el.textContent = label; }
function restoreBtn(sel, fb) { const el = $(sel); if (!el) return; el.disabled = false; el.textContent = _btnO[sel] || fb; }
function toast(txt) { const t = $("#tc-toast"); t.textContent = txt; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 1500); }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
