/* TestCapture AI — Dashboard controller */
const $ = (s) => document.querySelector(s);
const state = {
  sessions: [],
  currentId: null,
  currentSession: null,
  framework: "playwright",
  activeStepId: null,
};

init();

async function init() {
  // Resolve session via query param or active
  const params = new URLSearchParams(location.search);
  const requestedId = params.get("session");
  await loadSettings();
  await refreshList();
  if (requestedId) await loadSession(requestedId);
  else if (state.sessions[0]) await loadSession(state.sessions[0].id);
  bindEvents();
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "TC_STEP_ADDED" && msg.sessionId === state.currentId) loadSession(state.currentId);
    if (msg?.type === "TC_STATE") refreshList();
  });
}

function bindEvents() {
  $("#tc-frame-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tc-frame-tab");
    if (!tab) return;
    document.querySelectorAll(".tc-frame-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.framework = tab.dataset.framework;
    renderCode();
    generate();
  });
  $("#tc-regen-btn").addEventListener("click", () => generate(true));
  $("#tc-copy-code-btn").addEventListener("click", async () => {
    const code = $("#tc-code").textContent;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast("Copied");
  });
  $("#tc-download-btn").addEventListener("click", () => {
    const code = $("#tc-code").textContent;
    if (!code) return;
    const ext = { playwright: "spec.ts", cypress: "cy.js", selenium: "py", karate: "feature" }[state.framework] || "txt";
    const filename = `testcapture-${state.currentSession?.name?.replace(/\s+/g, "-") || "session"}.${ext}`;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    if (chrome.downloads?.download) {
      chrome.downloads.download({ url, filename, saveAs: true }, () => setTimeout(() => URL.revokeObjectURL(url), 4000));
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    toast(`Downloaded ${filename}`);
  });
  $("#tc-new-session").addEventListener("click", async () => {
    const name = prompt("Session name?", `Session ${new Date().toLocaleString()}`);
    if (!name) return;
    const res = await send({ type: "TC_START", name });
    if (res?.session) { await refreshList(); loadSession(res.session.id); toast("Recording started in active tab"); }
  });
  $("#tc-settings-open").addEventListener("click", () => ($("#tc-settings-modal").hidden = false));
  $("#tc-settings-close").addEventListener("click", () => ($("#tc-settings-modal").hidden = true));
  $("#tc-dash-provider").addEventListener("change", async (e) => { showProviderBlocks(e.target.value); await populateModelList(e.target.value); });
  $("#tc-dash-refresh-models").addEventListener("click", async (e) => { e.preventDefault(); await populateModelList($("#tc-dash-provider").value); });
  $("#tc-dash-connect").addEventListener("click", async () => { const url = chrome.runtime.getURL("auth.html"); await chrome.tabs.create({ url }); });
  $("#tc-dash-disconnect").addEventListener("click", async () => { await window.TCAI.copilot.disconnect(); await refreshCopilotStatus(); toast("Disconnected"); });
  $("#tc-dash-settings-save").addEventListener("click", async () => {
    await window.TCAI.setSettings({
      provider: $("#tc-dash-provider").value,
      model: $("#tc-dash-model").value,
      apiKey: $("#tc-dash-anthropic").value.trim(),
      openaiKey: $("#tc-dash-openai").value.trim(),
    });
    const key = $("#tc-dash-license").value.trim();
    if (key) await validateLicense(key); else await chrome.storage.local.remove("tc_license");
    await refreshLicenseStatus();
    $("#tc-settings-modal").hidden = true;
    toast("Settings saved");
  });
}

async function validateLicense(key) {
  try {
    const backend = await getBackendUrl();
    if (!backend) { await chrome.storage.local.set({ tc_license: { key, valid: false, reason: "no-backend" } }); return; }
    const r = await fetch(backend.replace(/\/$/, "") + "/api/license/activate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }),
    });
    const data = await r.json();
    await chrome.storage.local.set({ tc_license: { key, valid: !!data.valid, plan: data.plan, features: data.features || [] } });
  } catch (e) {
    await chrome.storage.local.set({ tc_license: { key, valid: false, reason: String(e) } });
  }
}

async function getBackendUrl() {
  const { tc_backend_url } = await chrome.storage.local.get("tc_backend_url");
  return tc_backend_url || "";
}

async function loadSettings() {
  const s = await window.TCAI.getSettings();
  $("#tc-dash-provider").value = s.provider || "offline";
  $("#tc-dash-anthropic").value = s.apiKey || "";
  $("#tc-dash-openai").value = s.openaiKey || "";
  showProviderBlocks(s.provider || "offline");
  await refreshCopilotStatus();
  await populateModelList(s.provider || "offline");
  await refreshLicenseStatus();
}
function showProviderBlocks(p) {
  document.querySelectorAll(".tc-provider-block").forEach((el) => { el.hidden = el.dataset.provider !== p; });
}
async function refreshCopilotStatus() {
  const st = await window.TCAI.copilot.status();
  const pill = $("#tc-dash-copilot-status");
  if (st.signed_in) { pill.textContent = st.session_valid ? "Connected ✓" : "Connected"; pill.className = "tc-pill ok"; $("#tc-dash-connect").hidden = true; $("#tc-dash-disconnect").hidden = false; }
  else { pill.textContent = "Not connected"; pill.className = "tc-pill"; $("#tc-dash-connect").hidden = false; $("#tc-dash-disconnect").hidden = true; }
}
async function populateModelList(provider) {
  const sel = $("#tc-dash-model");
  sel.innerHTML = `<option value="">Loading…</option>`;
  try {
    if (provider === "offline") { sel.innerHTML = `<option value="deterministic">deterministic</option>`; return; }
    const models = await window.TCAI.listModels(provider);
    sel.innerHTML = models.length
      ? models.map((m) => `<option value="${esc(m.id)}">${esc(m.label || m.id)}</option>`).join("")
      : `<option value="">No models — check credentials</option>`;
    const s = await window.TCAI.getSettings();
    if (s.model && [...sel.options].some((o) => o.value === s.model)) sel.value = s.model;
  } catch (e) {
    sel.innerHTML = `<option value="">Error loading models</option>`;
  }
}
async function refreshLicenseStatus() {
  const { tc_license } = await chrome.storage.local.get("tc_license");
  const pill = $("#tc-dash-license-status");
  const input = $("#tc-dash-license");
  if (tc_license?.key) {
    input.value = tc_license.key;
    pill.textContent = tc_license.valid ? `Active · ${tc_license.plan || "team"}` : "Inactive (validation failed)";
    pill.className = tc_license.valid ? "tc-pill ok" : "tc-pill warn";
  } else {
    pill.textContent = "Inactive"; pill.className = "tc-pill";
  }
}

async function refreshList() {
  const res = await send({ type: "TC_LIST_SESSIONS" });
  state.sessions = res?.sessions || [];
  renderList();
}

function renderList() {
  const c = $("#tc-session-list");
  if (!state.sessions.length) {
    c.innerHTML = '<div class="tc-empty" style="padding:20px 0">No sessions yet — click NEW SESSION.</div>';
    return;
  }
  c.innerHTML = state.sessions.map((s) => `
    <div class="tc-session-item ${s.id === state.currentId ? "active" : ""}" data-id="${s.id}">
      <div class="n">${esc(s.name)}</div>
      <div class="m">${new Date(s.startTime).toLocaleString()} · ${s.steps?.length || 0} steps · ${esc(s.status || "saved")}</div>
    </div>`).join("");
  c.querySelectorAll(".tc-session-item").forEach((el) => el.addEventListener("click", () => loadSession(el.dataset.id)));
}

async function loadSession(id) {
  const res = await send({ type: "TC_GET_SESSION", id });
  if (!res?.session) return;
  state.currentId = id;
  state.currentSession = res.session;
  state.activeStepId = res.session.steps?.[0]?.id || null;
  $("#tc-session-name").textContent = res.session.name;
  $("#tc-session-origin").textContent = res.session.targetOrigin || "—";
  $("#tc-session-status").textContent = res.session.status || "saved";
  $("#tc-session-steps-count").textContent = res.session.steps?.length || 0;
  renderTimeline();
  renderInspector();
  renderList();
  await generate();
}

function renderTimeline() {
  const c = $("#tc-timeline");
  const s = state.currentSession;
  if (!s || !s.steps?.length) { c.innerHTML = '<div class="tc-empty">No steps yet. Interact with the tab being recorded.</div>'; return; }
  c.innerHTML = s.steps.map((step, i) => {
    const sel = step.selector?.value || "";
    return `
    <div class="tc-step-card ${esc(step.type)} ${step.id === state.activeStepId ? "active" : ""}" data-id="${step.id}">
      <span class="num">${String(i + 1).padStart(2, "0")}</span>
      <div>
        <div class="lab">${esc(step.label)}</div>
        <div class="sel">${esc(sel).slice(0, 80)}</div>
      </div>
      <span class="tag">${esc(step.type)}</span>
    </div>`;
  }).join("");
  c.querySelectorAll(".tc-step-card").forEach((el) => el.addEventListener("click", () => {
    state.activeStepId = el.dataset.id;
    renderTimeline();
    renderInspector();
  }));
}

function renderInspector() {
  const c = $("#tc-inspector");
  const s = state.currentSession;
  if (!s) return;
  const step = s.steps?.find((x) => x.id === state.activeStepId);
  if (!step) { c.innerHTML = '<div class="tc-empty">Select a step</div>'; return; }
  const props = step.elementProps || {};
  const alts = step.selector?.alternatives || [];
  const assertions = step.assertions || [];
  c.innerHTML = `
    <div class="row"><span class="k">type</span><span class="v">${esc(step.type)}</span></div>
    <div class="row"><span class="k">tag</span><span class="v">${esc(props.tagName || "—")}</span></div>
    <div class="row"><span class="k">id</span><span class="v">${esc(props.id || "—")}</span></div>
    <div class="row"><span class="k">name</span><span class="v">${esc(props.name || "—")}</span></div>
    <div class="row"><span class="k">text</span><span class="v">${esc((props.text || "").slice(0, 120))}</span></div>
    <div class="row"><span class="k">value</span><span class="v">${esc(step.value ?? "—")}</span></div>
    <div class="row"><span class="k">url</span><span class="v">${esc((step.url || "").slice(0, 120))}</span></div>

    <div class="sel-list">
      <div class="tc-section-title" style="margin: 14px 0 8px">SELECTORS — PRIORITY ORDER</div>
      ${alts.map((a) => `<div class="sel"><span class="k">${esc(a.strategy)}</span><span class="v">${esc(a.value)}</span><span class="badge ${stabilityClass(a.strategy)}">${stabilityLabel(a.strategy)}</span></div>`).join("") || '<div class="tc-empty">No alternatives captured.</div>'}
    </div>

    <div class="sel-list">
      <div class="tc-section-title" style="margin: 14px 0 8px; display:flex; justify-content:space-between; align-items:center">
        <span>ASSERTIONS (${assertions.length})</span>
        <button class="tc-btn" id="tc-add-assert-btn" data-testid="dash-add-assertion-btn" style="padding:4px 8px;font-size:9px">+ ADD</button>
      </div>
      <div id="tc-assert-list">
        ${assertions.length ? assertions.map((a, i) => `
          <div class="sel" style="grid-template-columns:100px 1fr 24px">
            <span class="k">${esc(a.type)}</span>
            <span class="v">${esc(a.expected ?? a.target ?? "—")}</span>
            <button class="tc-btn tc-btn-ghost" data-remove-assert="${i}" title="Remove assertion" style="padding:2px 4px;font-size:10px">✕</button>
          </div>`).join("") : '<div class="tc-empty">No assertions on this step. Add one via the button above or Shift+Click during recording.</div>'}
      </div>
      <button class="tc-btn" id="tc-delete-step-btn" data-testid="dash-delete-step-btn" style="margin-top:10px;width:100%">✕ DELETE STEP</button>
    </div>`;

  // wire buttons
  const addBtn = document.getElementById("tc-add-assert-btn");
  if (addBtn) addBtn.addEventListener("click", onAddAssertion);
  document.querySelectorAll("[data-remove-assert]").forEach((el) =>
    el.addEventListener("click", async () => {
      const idx = Number(el.getAttribute("data-remove-assert"));
      await send({ type: "TC_REMOVE_ASSERTION", sessionId: s.id, stepId: step.id, index: idx });
      await loadSession(state.currentId);
    })
  );
  const delBtn = document.getElementById("tc-delete-step-btn");
  if (delBtn) delBtn.addEventListener("click", async () => {
    if (!confirm("Delete this step?")) return;
    await send({ type: "TC_DELETE_STEP", sessionId: s.id, stepId: step.id });
    await loadSession(state.currentId);
  });
}

async function onAddAssertion() {
  const s = state.currentSession;
  const step = s?.steps?.find((x) => x.id === state.activeStepId);
  if (!step) return;
  const type = prompt(
    "Assertion type?\n  containsText   — element text contains value\n  visible        — element is visible\n  exists         — element is attached\n  countEquals    — number of matches\n  valueEquals    — input value equals\n  urlContains    — current URL contains",
    "containsText"
  );
  if (!type) return;
  const expected = prompt("Expected value (leave blank for visible/exists):", step.value || "");
  const assertion = { type: type.trim(), expected: expected || null, target: step.selector?.value || null };
  await send({ type: "TC_ADD_ASSERTION", sessionId: s.id, stepId: step.id, assertion });
  await loadSession(state.currentId);
  toast("Assertion added");
}

function stabilityClass(s) { return ["data-testid", "aria-label"].includes(s) ? "high" : ["role", "id", "role+text"].includes(s) ? "medium" : "low"; }
function stabilityLabel(s) { const c = stabilityClass(s); return c.toUpperCase(); }

async function generate(force = false) {
  const s = state.currentSession;
  if (!s) return;
  if (!s.steps?.length) { $("#tc-code").textContent = "// No steps captured yet"; return; }
  if (!force && s.generatedCode?.[state.framework]) {
    renderCode(s.generatedCode[state.framework]);
    $("#tc-code-meta").textContent = "CACHED";
    return;
  }
  $("#tc-code-meta").textContent = "GENERATING…";
  $("#tc-code").textContent = "// generating…";
  const result = await window.TCAI.generate({ session: s, framework: state.framework });
  const code = result.data?.code || offlineGenerate(s, state.framework);
  $("#tc-code-meta").textContent = result.ok
    ? `${(result.data.provider || "").toUpperCase()} · ${(result.data.model || "").toUpperCase()}`
    : "OFFLINE · FALLBACK";
  s.generatedCode = { ...(s.generatedCode || {}), [state.framework]: code };
  await send({ type: "TC_UPDATE_SESSION", session: s });
  renderCode(code);
}

function renderCode(code) {
  const c = code ?? state.currentSession?.generatedCode?.[state.framework] ?? "";
  $("#tc-code").innerHTML = highlight(c);
}

function highlight(src) {
  const kw = /(\b(?:import|from|as|export|const|let|var|function|async|await|if|else|return|class|new|of|in|for|while|def|from|describe|it|test)\b)/g;
  let s = esc(src);
  s = s.replace(kw, '<span class="k">$1</span>');
  s = s.replace(/(['"`][^'"`]*?['"`])/g, '<span class="s">$1</span>');
  s = s.replace(/(\/\/[^\n]*)/g, '<span class="c">$1</span>');
  s = s.replace(/(#\s[^\n]*)/g, '<span class="c">$1</span>');
  return s;
}

function send(msg) { return new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x))); }
function toast(txt) { const t = $("#tc-toast"); t.textContent = txt; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 1500); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function offlineGenerate(session, framework) {
  return window.TCAI.offlineGenerate(session, framework);
}
