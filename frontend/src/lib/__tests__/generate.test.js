/**
 * Unit tests for the offline generator. Run with:
 *   cd /app/frontend && yarn test --watchAll=false
 */
import { offlineGenerate } from "../generate";

const SESSION = {
  name: "Login flow",
  targetOrigin: "https://demo.test",
  steps: [
    { id: "1", type: "navigate", label: "Navigate", value: "https://demo.test",
      selector: { strategy: "url", value: "https://demo.test" } },
    { id: "2", type: "click", label: "Click Sign In",
      selector: { strategy: "data-testid", value: "signin-btn" } },
    { id: "3", type: "type", label: "Type email", value: "a@b.co",
      selector: { strategy: "aria-label", value: "Email" } },
    { id: "4", type: "validate", label: "Assert welcome", value: "Welcome",
      selector: { strategy: "role+text", value: "heading:Welcome" },
      assertions: [
        { type: "visible" },
        { type: "valueEquals", expected: "active" },
      ],
    },
  ],
};

describe("offlineGenerate", () => {
  test("playwright emits imports and a test()", () => {
    const code = offlineGenerate(SESSION, "playwright");
    expect(code).toContain("import { test, expect } from '@playwright/test';");
    expect(code).toContain("test('Login flow'");
    expect(code).toContain("page.goto('https://demo.test');");
  });

  test("playwright uses getByTestId for data-testid", () => {
    const code = offlineGenerate(SESSION, "playwright");
    expect(code).toContain("page.getByTestId('signin-btn').click();");
  });

  test("playwright emits structured assertions after step", () => {
    const code = offlineGenerate(SESSION, "playwright");
    expect(code).toContain("toBeVisible()");
    expect(code).toContain("toHaveValue('active')");
  });

  test("cypress emits describe/it and cy.get", () => {
    const code = offlineGenerate(SESSION, "cypress");
    expect(code).toContain("describe('Login flow'");
    expect(code).toContain("cy.visit('https://demo.test');");
    expect(code).toContain("cy.get('[data-testid=\"signin-btn\"]')");
    expect(code).toContain("should('be.visible')");
    expect(code).toContain("should('have.value', 'active')");
  });

  test("selenium emits By.CSS_SELECTOR and pytest-style test", () => {
    const code = offlineGenerate(SESSION, "selenium");
    expect(code).toContain("from selenium import webdriver");
    expect(code).toContain("def test_login_flow():");
    expect(code).toContain("By.CSS_SELECTOR");
    expect(code).toContain("driver.quit()");
    expect(code).toContain("is_displayed()");
  });

  test("karate emits Feature/Scenario headers", () => {
    const code = offlineGenerate(SESSION, "karate");
    expect(code).toContain("Feature: Login flow");
    expect(code).toContain("Scenario: Captured flow");
    expect(code).toContain("* driver 'https://demo.test'");
    expect(code).toContain('* match text("heading:Welcome") contains "Welcome"');
  });

  test("empty session produces valid (if trivial) output", () => {
    const code = offlineGenerate({ name: "empty", targetOrigin: "https://x.io", steps: [] }, "playwright");
    expect(code).toContain("test('empty'");
    expect(code).toContain("page.goto('https://x.io');");
  });

  test("playwright handles role+text selector strategy properly", () => {
    const s = { ...SESSION, steps: [SESSION.steps[3]] };
    const code = offlineGenerate(s, "playwright");
    expect(code).toContain("page.getByRole('heading', { name: 'Welcome' })");
  });
});
