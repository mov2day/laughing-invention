/**
 * Unit tests for the AI dispatch module (web demo variant).
 * Covers settings persistence, offline generation dispatch, and CORS-fallback
 * for copilot/anthropic/openai when they fail.
 */
import { generate, listModels, getSettings, setSettings, DEFAULT_ANTHROPIC_MODELS } from "../ai";

const SAMPLE = {
  name: "t",
  targetOrigin: "https://x.io",
  steps: [
    { id: "1", type: "click", label: "Click Sign In",
      selector: { strategy: "data-testid", value: "signin" } },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe("Settings", () => {
  test("default provider is offline", () => {
    expect(getSettings().provider).toBe("offline");
  });

  test("setSettings persists to localStorage", () => {
    setSettings({ provider: "anthropic", model: "claude-opus-4-5-20251101", apiKey: "sk-x" });
    expect(getSettings().provider).toBe("anthropic");
    expect(getSettings().apiKey).toBe("sk-x");
  });
});

describe("listModels", () => {
  test("anthropic list matches defaults", async () => {
    const models = await listModels("anthropic");
    expect(models.length).toBe(DEFAULT_ANTHROPIC_MODELS.length);
    expect(models[0].id).toBe(DEFAULT_ANTHROPIC_MODELS[0].id);
  });

  test("unknown provider returns deterministic list", async () => {
    const models = await listModels("unknown");
    expect(models[0].id).toBe("deterministic");
  });
});

describe("generate dispatch", () => {
  test("offline provider returns deterministic playwright code", async () => {
    setSettings({ provider: "offline" });
    const r = await generate({ session: SAMPLE, framework: "playwright" });
    expect(r.ok).toBe(true);
    expect(r.data.code).toContain("import { test, expect } from '@playwright/test';");
    expect(r.data.provider).toBe("offline");
  });

  test("copilot in web demo returns error with offline fallback code", async () => {
    setSettings({ provider: "copilot", model: "gpt-4o" });
    const r = await generate({ session: SAMPLE, framework: "playwright" });
    expect(r.ok).toBe(false);
    expect(r.data.code).toContain("test('t'");
    expect(r.error).toMatch(/extension|CORS/i);
  });

  test("anthropic missing key returns offline fallback", async () => {
    setSettings({ provider: "anthropic", apiKey: "" });
    const r = await generate({ session: SAMPLE, framework: "cypress" });
    expect(r.ok).toBe(false);
    expect(r.data.code).toContain("describe('t'");
  });

  test("openai missing key returns offline fallback", async () => {
    setSettings({ provider: "openai", openaiKey: "" });
    const r = await generate({ session: SAMPLE, framework: "selenium" });
    expect(r.ok).toBe(false);
    expect(r.data.code).toContain("from selenium import webdriver");
  });
});
