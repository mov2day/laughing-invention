/*
 * TestCapture AI — Unified AI Provider Module
 *
 * Exposes a single `window.TCAI` API used by popup.js and dashboard.js. Works
 * entirely inside the extension — no backend required.
 *
 * Providers:
 *   - 'copilot'    GitHub Copilot (device flow; ephemeral token refreshed automatically)
 *   - 'anthropic'  Direct Anthropic Claude API (user key)
 *   - 'openai'     Direct OpenAI API (user key)
 *   - 'offline'    Deterministic templates (default; no network)
 *
 * Storage keys used (chrome.storage.local):
 *   tc_ai_settings         { provider, model, apiKey, openaiKey }
 *   tc_copilot_gh_token    raw GitHub OAuth token (gho_…)
 *   tc_copilot_session     { token, expires_at, refresh_in, model_cache, last_model_refresh }
 *
 * All high-level functions return {ok, data|error} shape.
 */
(function () {
  "use strict";

  const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"; // public VSCode client id, used by every community Copilot client
  const COPILOT_UA = "GithubCopilot/1.155.0";
  const COPILOT_EDITOR = "vscode/1.83.1";
  const COPILOT_PLUGIN = "copilot-chat/0.11.1";

  const DEFAULT_ANTHROPIC_MODELS = [
    { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { id: "claude-4-sonnet-20250514", label: "Claude 4 Sonnet" },
  ];

  const DEFAULT_OPENAI_MODELS = [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "o1-mini", label: "o1-mini" },
  ];

  // ---------- Settings helpers ----------
  async function getSettings() {
    const { tc_ai_settings } = await chrome.storage.local.get("tc_ai_settings");
    return Object.assign(
      { provider: "offline", model: null, apiKey: "", openaiKey: "" },
      tc_ai_settings || {}
    );
  }
  async function setSettings(patch) {
    const curr = await getSettings();
    const next = { ...curr, ...patch };
    await chrome.storage.local.set({ tc_ai_settings: next });
    return next;
  }

  // ---------- Shared prompt ----------
  const FRAMEWORK_GUIDES = {
    playwright: "Language: TypeScript. Use @playwright/test. Export one test().",
    cypress: "Language: JavaScript. Use describe/it with Cypress 13+ chain syntax.",
    selenium: "Language: Python. Use selenium 4 + webdriver-manager, pytest-style function.",
    karate: "Language: Karate DSL .feature file. Use Feature/Scenario/Given/When/Then.",
  };
  const SYSTEM_PROMPT = [
    "You are an expert Test Automation Engineer. Given a recorded browser session (JSON of user steps including selectors, values, and assertions), produce a clean, runnable automation script in the requested framework.",
    "",
    "Rules:",
    "- Output ONLY the code. No markdown fences, no commentary, no explanations.",
    "- Use the highest-priority selector available per step (prefer data-testid > aria-label > role+text > id > CSS > XPath).",
    "- Preserve the order of steps exactly.",
    "- For password fields, values arrive pre-redacted as '********' — keep a placeholder variable instead.",
    "- Include the step's structured assertions directly after each step with correct framework syntax.",
    "- Ensure proper imports, waits, and a single test function.",
  ].join("\n");

  function buildPrompt(session, framework) {
    const sanitized = JSON.parse(JSON.stringify(session));
    sanitized.steps = (sanitized.steps || []).map((s) => ({ ...s, screenshot: undefined }));
    return (
      `Framework: ${framework}\n` +
      `${FRAMEWORK_GUIDES[framework] || ""}\n\n` +
      "Session JSON:\n```json\n" +
      JSON.stringify(sanitized, null, 2) +
      "\n```\n\nProduce the single clean script now."
    );
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

  // ---------- Offline (deterministic) ----------
  function offlineGenerate(session, framework) {
    const steps = session.steps || [];
    const name = session.name || "Recorded test";
    const origin = session.targetOrigin || "https://example.com";
    const lines = [];
    const assertLines = (sel, strat, aa) => {
      const out = [];
      if (!aa?.length) return out;
      for (const a of aa) {
        const exp = a.expected ?? "";
        if (framework === "playwright") {
          const loc =
            strat === "data-testid" ? `page.getByTestId('${sel}')` :
            strat === "aria-label" ? `page.getByLabel('${sel}')` :
            strat === "role" ? `page.getByRole('${sel}')` :
            `page.locator('${sel}')`;
          if (a.type === "containsText") out.push(`  await expect(${loc}).toContainText('${exp}');`);
          else if (a.type === "visible") out.push(`  await expect(${loc}).toBeVisible();`);
          else if (a.type === "exists") out.push(`  await expect(${loc}).toBeAttached();`);
          else if (a.type === "valueEquals") out.push(`  await expect(${loc}).toHaveValue('${exp}');`);
          else if (a.type === "countEquals") out.push(`  await expect(${loc}).toHaveCount(${parseInt(exp || "1", 10)});`);
          else if (a.type === "urlContains") out.push(`  await expect(page).toHaveURL(/${exp}/);`);
        } else if (framework === "cypress") {
          const get = strat === "data-testid" ? `cy.get('[data-testid="${sel}"]')` : `cy.get('${sel}')`;
          if (a.type === "containsText") out.push(`    ${get}.should('contain.text', '${exp}');`);
          else if (a.type === "visible") out.push(`    ${get}.should('be.visible');`);
          else if (a.type === "exists") out.push(`    ${get}.should('exist');`);
          else if (a.type === "valueEquals") out.push(`    ${get}.should('have.value', '${exp}');`);
          else if (a.type === "countEquals") out.push(`    ${get}.should('have.length', ${parseInt(exp || "1", 10)});`);
          else if (a.type === "urlContains") out.push(`    cy.url().should('include', '${exp}');`);
        } else if (framework === "selenium") {
          const by = strat === "xpath" ? "By.XPATH" : "By.CSS_SELECTOR";
          const val = strat === "data-testid" ? `[data-testid="${sel}"]` : sel;
          if (a.type === "containsText") out.push(`    assert '${exp}' in driver.find_element(${by}, '${val}').text`);
          else if (a.type === "visible") out.push(`    assert driver.find_element(${by}, '${val}').is_displayed()`);
          else if (a.type === "exists") out.push(`    assert driver.find_element(${by}, '${val}') is not None`);
          else if (a.type === "valueEquals") out.push(`    assert driver.find_element(${by}, '${val}').get_attribute('value') == '${exp}'`);
          else if (a.type === "urlContains") out.push(`    assert '${exp}' in driver.current_url`);
        } else if (framework === "karate") {
          if (a.type === "containsText") out.push(`    * match text("${sel}") contains "${exp}"`);
          else if (a.type === "visible") out.push(`    * waitFor("${sel}")`);
          else if (a.type === "urlContains") out.push(`    * match driver.url contains "${exp}"`);
        }
      }
      return out;
    };

    if (framework === "playwright") {
      lines.push("import { test, expect } from '@playwright/test';", "", `test('${name}', async ({ page }) => {`, `  await page.goto('${origin}');`);
      for (const s of steps) {
        const sv = s.selector?.value || ""; const st = s.selector?.strategy || "css";
        const loc =
          st === "data-testid" ? `page.getByTestId('${sv}')` :
          st === "aria-label" ? `page.getByLabel('${sv}')` :
          st === "role+text" ? `page.getByRole('${sv.split(":")[0]}', { name: '${sv.split(":").slice(1).join(":")}' })` :
          st === "role" ? `page.getByRole('${sv}')` :
          `page.locator('${sv}')`;
        if (s.type === "click") lines.push(`  // ${s.label}`, `  await ${loc}.click();`);
        else if (s.type === "type") lines.push(`  await ${loc}.fill('${s.value ?? ""}');`);
        else if (s.type === "navigate") lines.push(`  await page.goto('${s.value ?? ""}');`);
        else if (s.type === "validate") lines.push(`  // Assert: ${s.label}`, `  await expect(${loc}).toContainText('${s.value ?? ""}');`);
        else if (s.type === "select") lines.push(`  await ${loc}.selectOption('${s.value ?? ""}');`);
        lines.push(...assertLines(sv, st, s.assertions));
      }
      lines.push("});");
    } else if (framework === "cypress") {
      lines.push(`describe('${name}', () => {`, `  it('runs the captured flow', () => {`, `    cy.visit('${origin}');`);
      for (const s of steps) {
        const sv = s.selector?.value || ""; const st = s.selector?.strategy || "css";
        const get = st === "data-testid" ? `cy.get('[data-testid="${sv}"]')` : `cy.get('${sv}')`;
        if (s.type === "click") lines.push(`    ${get}.click(); // ${s.label}`);
        else if (s.type === "type") lines.push(`    ${get}.type('${s.value ?? ""}');`);
        else if (s.type === "navigate") lines.push(`    cy.visit('${s.value ?? ""}');`);
        else if (s.type === "validate") lines.push(`    ${get}.should('contain.text', '${s.value ?? ""}');`);
        lines.push(...assertLines(sv, st, s.assertions));
      }
      lines.push("  });", "});");
    } else if (framework === "selenium") {
      lines.push("from selenium import webdriver", "from selenium.webdriver.common.by import By", "", `def test_${name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "recorded_flow"}():`, "    driver = webdriver.Chrome()", `    driver.get('${origin}')`);
      for (const s of steps) {
        const sv = s.selector?.value || ""; const st = s.selector?.strategy || "css";
        const by = st === "xpath" ? "By.XPATH" : "By.CSS_SELECTOR";
        const val = st === "data-testid" ? `[data-testid="${sv}"]` : sv;
        if (s.type === "click") lines.push(`    driver.find_element(${by}, '${val}').click()  # ${s.label}`);
        else if (s.type === "type") lines.push(`    driver.find_element(${by}, '${val}').send_keys('${s.value ?? ""}')`);
        else if (s.type === "navigate") lines.push(`    driver.get('${s.value ?? ""}')`);
        else if (s.type === "validate") lines.push(`    assert '${s.value ?? ""}' in driver.find_element(${by}, '${val}').text`);
        lines.push(...assertLines(sv, st, s.assertions));
      }
      lines.push("    driver.quit()");
    } else {
      lines.push(`Feature: ${name}`, "", "  Scenario: Captured flow", "    * configure driver = { type: 'chrome' }", `    * driver '${origin}'`);
      for (const s of steps) {
        const sv = s.selector?.value || ""; const st = s.selector?.strategy || "css";
        if (s.type === "click") lines.push(`    * click("${sv}")  # ${s.label}`);
        else if (s.type === "type") lines.push(`    * input("${sv}", "${s.value ?? ""}")`);
        else if (s.type === "navigate") lines.push(`    * driver '${s.value ?? ""}'`);
        else if (s.type === "validate") lines.push(`    * match text("${sv}") contains "${s.value ?? ""}"`);
        lines.push(...assertLines(sv, st, s.assertions));
      }
    }
    return lines.join("\n");
  }

  // ---------- Anthropic ----------
  async function anthropicGenerate(session, framework, model, apiKey) {
    if (!apiKey) throw new Error("Missing Anthropic API key. Add it in Settings.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    return stripFences(text);
  }

  // ---------- OpenAI ----------
  async function openaiGenerate(session, framework, model, apiKey) {
    if (!apiKey) throw new Error("Missing OpenAI API key. Add it in Settings.");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return stripFences(data.choices?.[0]?.message?.content || "");
  }

  async function openaiListModels(apiKey) {
    if (!apiKey) return DEFAULT_OPENAI_MODELS;
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return DEFAULT_OPENAI_MODELS;
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id));
      return ids.length ? ids.map((id) => ({ id, label: id })) : DEFAULT_OPENAI_MODELS;
    } catch { return DEFAULT_OPENAI_MODELS; }
  }

  // ---------- GitHub Copilot ----------
  async function copilotStartDevice() {
    const res = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: `client_id=${encodeURIComponent(COPILOT_CLIENT_ID)}&scope=read:user`,
    });
    if (!res.ok) throw new Error(`Device start failed ${res.status}`);
    const data = await res.json();
    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      interval: data.interval || 5,
      expires_in: data.expires_in || 900,
    };
  }

  async function copilotPollOnce(device_code) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body:
        `client_id=${encodeURIComponent(COPILOT_CLIENT_ID)}` +
        `&device_code=${encodeURIComponent(device_code)}` +
        `&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
    });
    const data = await res.json();
    if (data.error) return { pending: data.error === "authorization_pending", slow: data.error === "slow_down", error: data.error };
    return { token: data.access_token };
  }

  async function copilotExchangeSession(gho) {
    const res = await fetch("https://api.github.com/copilot_internal/v2/token", {
      headers: {
        authorization: `token ${gho}`,
        "User-Agent": COPILOT_UA,
        "Editor-Version": COPILOT_EDITOR,
        "Editor-Plugin-Version": COPILOT_PLUGIN,
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Copilot session exchange failed ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    // data.token is 'tid=...;exp=...;...', expires_at is unix seconds
    return { token: data.token, expires_at: data.expires_at, refresh_in: data.refresh_in || 1500 };
  }

  async function copilotEnsureSession() {
    const { tc_copilot_gh_token } = await chrome.storage.local.get("tc_copilot_gh_token");
    if (!tc_copilot_gh_token) throw new Error("Not signed in to GitHub Copilot. Connect it in Settings.");
    const { tc_copilot_session } = await chrome.storage.local.get("tc_copilot_session");
    const now = Math.floor(Date.now() / 1000);
    if (tc_copilot_session?.token && tc_copilot_session.expires_at && tc_copilot_session.expires_at - 60 > now) {
      return tc_copilot_session;
    }
    const fresh = await copilotExchangeSession(tc_copilot_gh_token);
    const saved = { ...fresh, updated_at: now };
    await chrome.storage.local.set({ tc_copilot_session: saved });
    return saved;
  }

  async function copilotListModels() {
    const sess = await copilotEnsureSession();
    const res = await fetch("https://api.githubcopilot.com/models", {
      headers: {
        authorization: `Bearer ${sess.token}`,
        "copilot-integration-id": "vscode-chat",
        "editor-version": COPILOT_EDITOR,
        "editor-plugin-version": COPILOT_PLUGIN,
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Copilot list models ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    const models = (data.data || [])
      .filter((m) => m.capabilities?.type === "chat" || m.capabilities?.family)
      .map((m) => ({
        id: m.id,
        label: m.name || m.id,
        vendor: m.vendor || "",
        family: m.capabilities?.family || "",
      }));
    return models.length ? models : [{ id: "gpt-4o", label: "GPT-4o (Copilot)" }];
  }

  async function copilotGenerate(session, framework, model) {
    const sess = await copilotEnsureSession();
    const res = await fetch("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sess.token}`,
        "copilot-integration-id": "vscode-chat",
        "editor-version": COPILOT_EDITOR,
        "editor-plugin-version": COPILOT_PLUGIN,
        "openai-intent": "conversation-panel",
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(session, framework) },
        ],
        temperature: 0.2,
        stream: false,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Copilot ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return stripFences(data.choices?.[0]?.message?.content || "");
  }

  async function copilotDisconnect() {
    await chrome.storage.local.remove(["tc_copilot_gh_token", "tc_copilot_session"]);
  }

  async function copilotStatus() {
    const { tc_copilot_gh_token, tc_copilot_session } = await chrome.storage.local.get(["tc_copilot_gh_token", "tc_copilot_session"]);
    const now = Math.floor(Date.now() / 1000);
    return {
      signed_in: !!tc_copilot_gh_token,
      session_valid: !!(tc_copilot_session?.token && tc_copilot_session.expires_at > now),
      expires_in: tc_copilot_session?.expires_at ? tc_copilot_session.expires_at - now : 0,
    };
  }

  // ---------- High-level dispatch ----------
  async function generate({ session, framework }) {
    const s = await getSettings();
    const provider = s.provider || "offline";
    try {
      if (provider === "copilot") {
        const code = await copilotGenerate(session, framework, s.model);
        return { ok: true, data: { code, provider, model: s.model || "gpt-4o" } };
      }
      if (provider === "anthropic") {
        const code = await anthropicGenerate(session, framework, s.model, s.apiKey);
        return { ok: true, data: { code, provider, model: s.model || "claude-sonnet-4-5-20250929" } };
      }
      if (provider === "openai") {
        const code = await openaiGenerate(session, framework, s.model, s.openaiKey);
        return { ok: true, data: { code, provider, model: s.model || "gpt-4o" } };
      }
      return { ok: true, data: { code: offlineGenerate(session, framework), provider: "offline", model: "deterministic" } };
    } catch (err) {
      console.warn("[TCAI] generate failed:", err);
      return {
        ok: false,
        error: String(err.message || err),
        data: { code: offlineGenerate(session, framework), provider: "offline-fallback", model: "deterministic" },
      };
    }
  }

  async function listModels(provider) {
    try {
      if (provider === "copilot") return await copilotListModels();
      if (provider === "anthropic") return DEFAULT_ANTHROPIC_MODELS;
      if (provider === "openai") {
        const s = await getSettings();
        return await openaiListModels(s.openaiKey);
      }
    } catch (e) {
      return [];
    }
    return [];
  }

  window.TCAI = {
    // settings
    getSettings, setSettings,
    // generation
    generate,
    listModels,
    offlineGenerate,
    // copilot device flow
    copilot: {
      startDevice: copilotStartDevice,
      pollOnce: copilotPollOnce,
      saveGhoToken: async (token) => chrome.storage.local.set({ tc_copilot_gh_token: token }),
      ensureSession: copilotEnsureSession,
      status: copilotStatus,
      listModels: copilotListModels,
      disconnect: copilotDisconnect,
    },
    // for diagnostics
    DEFAULT_ANTHROPIC_MODELS,
    DEFAULT_OPENAI_MODELS,
  };
})();
