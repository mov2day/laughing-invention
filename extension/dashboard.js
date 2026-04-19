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
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `testcapture.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#tc-new-session").addEventListener("click", async () => {
    const name = prompt("Session name?", `Session ${new Date().toLocaleString()}`);
    if (!name) return;
    const res = await send({ type: "TC_START", name });
    if (res?.session) { await refreshList(); loadSession(res.session.id); toast("Recording started in active tab"); }
  });
  $("#tc-settings-open").addEventListener("click", () => ($("#tc-settings-modal").hidden = false));
  $("#tc-settings-close").addEventListener("click", () => ($("#tc-settings-modal").hidden = true));
  $("#tc-dash-settings-save").addEventListener("click", async () => {
    const settings = {
      apiKey: $("#tc-dash-api-key").value.trim(),
      model: $("#tc-dash-model").value,
      proxyUrl: $("#tc-dash-proxy").value.trim(),
      framework: state.framework,
    };
    await chrome.storage.local.set({ tc_settings: settings });
    $("#tc-settings-modal").hidden = true;
    toast("Settings saved");
  });
}

async function loadSettings() {
  const { tc_settings } = await chrome.storage.local.get("tc_settings");
  const s = tc_settings || {};
  $("#tc-dash-api-key").value = s.apiKey || "";
  $("#tc-dash-model").value = s.model || "claude-sonnet-4-5-20250929";
  $("#tc-dash-proxy").value = s.proxyUrl || "";
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
    </div>`;
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
  const { tc_settings } = await chrome.storage.local.get("tc_settings");
  const proxy = tc_settings?.proxyUrl || "";
  let code = null;
  if (proxy) {
    try {
      const r = await fetch(proxy.replace(/\/$/, "") + "/generate-script", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: s, framework: state.framework, apiKey: tc_settings?.apiKey || undefined, model: tc_settings?.model || undefined }),
      });
      const data = await r.json();
      code = data.code;
      $("#tc-code-meta").textContent = (data.model || "").toUpperCase();
    } catch (e) { console.warn(e); }
  }
  if (!code) {
    code = offlineGenerate(s, state.framework);
    $("#tc-code-meta").textContent = "OFFLINE";
  }
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
  const name = session.name || "Recorded test";
  const origin = session.targetOrigin || "https://example.com";
  const steps = session.steps || [];
  const lines = [];
  if (framework === "playwright") {
    lines.push("import { test, expect } from '@playwright/test';", "", `test('${name}', async ({ page }) => {`, `  await page.goto('${origin}');`);
    steps.forEach((s) => {
      const sv = s.selector?.value || ""; const strat = s.selector?.strategy || "css";
      const loc = strat === "data-testid" ? `page.getByTestId('${sv}')` : strat === "aria-label" ? `page.getByLabel('${sv}')` : strat === "role" ? `page.getByRole('${sv}')` : `page.locator('${sv}')`;
      if (s.type === "click") lines.push(`  await ${loc}.click(); // ${s.label}`);
      else if (s.type === "type") lines.push(`  await ${loc}.fill('${s.value || ""}');`);
      else if (s.type === "navigate") lines.push(`  await page.goto('${s.value || ""}');`);
      else if (s.type === "validate") lines.push(`  await expect(${loc}).toContainText('${s.value || ""}');`);
      else if (s.type === "select") lines.push(`  await ${loc}.selectOption('${s.value || ""}');`);
    });
    lines.push("});");
  } else if (framework === "cypress") {
    lines.push(`describe('${name}', () => {`, `  it('runs', () => {`, `    cy.visit('${origin}');`);
    steps.forEach((s) => {
      const sv = s.selector?.value || ""; const strat = s.selector?.strategy || "css";
      const get = strat === "data-testid" ? `cy.get('[data-testid="${sv}"]')` : `cy.get('${sv}')`;
      if (s.type === "click") lines.push(`    ${get}.click();`);
      else if (s.type === "type") lines.push(`    ${get}.type('${s.value || ""}');`);
      else if (s.type === "navigate") lines.push(`    cy.visit('${s.value || ""}');`);
      else if (s.type === "validate") lines.push(`    ${get}.should('contain.text', '${s.value || ""}');`);
    });
    lines.push("  });", "});");
  } else if (framework === "selenium") {
    lines.push("from selenium import webdriver", "from selenium.webdriver.common.by import By", "", `def test_${name.toLowerCase().replace(/\s+/g, "_")}():`, "    driver = webdriver.Chrome()", `    driver.get('${origin}')`);
    steps.forEach((s) => {
      const sv = s.selector?.value || ""; const by = s.selector?.strategy === "xpath" ? "By.XPATH" : "By.CSS_SELECTOR";
      if (s.type === "click") lines.push(`    driver.find_element(${by}, '${sv}').click()`);
      else if (s.type === "type") lines.push(`    driver.find_element(${by}, '${sv}').send_keys('${s.value || ""}')`);
      else if (s.type === "navigate") lines.push(`    driver.get('${s.value || ""}')`);
      else if (s.type === "validate") lines.push(`    assert '${s.value || ""}' in driver.find_element(${by}, '${sv}').text`);
    });
    lines.push("    driver.quit()");
  } else if (framework === "karate") {
    lines.push(`Feature: ${name}`, "", "  Scenario: Captured flow", `    * driver '${origin}'`);
    steps.forEach((s) => {
      const sv = s.selector?.value || "";
      if (s.type === "click") lines.push(`    * click("${sv}")`);
      else if (s.type === "type") lines.push(`    * input("${sv}", "${s.value || ""}")`);
      else if (s.type === "navigate") lines.push(`    * driver '${s.value || ""}'`);
      else if (s.type === "validate") lines.push(`    * match text("${sv}") contains "${s.value || ""}"`);
    });
  }
  return lines.join("\n");
}
