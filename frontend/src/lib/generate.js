// Offline deterministic generators — mirrors the backend fallback and gives instant preview
// before an AI call (or when no proxy/key is configured).
export function offlineGenerate(session, framework) {
  const name = session?.name || "Recorded test";
  const origin = session?.targetOrigin || "https://example.com";
  const steps = session?.steps || [];
  const lines = [];

  if (framework === "playwright") {
    lines.push("import { test, expect } from '@playwright/test';");
    lines.push("");
    lines.push(`test('${name}', async ({ page }) => {`);
    lines.push(`  await page.goto('${origin}');`);
    for (const s of steps) {
      const sv = s.selector?.value || "";
      const strat = s.selector?.strategy || "css";
      const loc =
        strat === "data-testid" ? `page.getByTestId('${sv}')` :
        strat === "aria-label" ? `page.getByLabel('${sv}')` :
        strat === "role+text" ? `page.getByRole('${sv.split(":")[0]}', { name: '${sv.split(":").slice(1).join(":")}' })` :
        strat === "role" ? `page.getByRole('${sv}')` :
        `page.locator('${sv}')`;
      if (s.type === "click") lines.push(`  // ${s.label}`, `  await ${loc}.click();`);
      else if (s.type === "type") lines.push(`  // ${s.label}`, `  await ${loc}.fill('${s.value ?? ""}');`);
      else if (s.type === "navigate") lines.push(`  await page.goto('${s.value ?? ""}');`);
      else if (s.type === "validate") lines.push(`  // Assert: ${s.label}`, `  await expect(${loc}).toContainText('${s.value ?? ""}');`);
      else if (s.type === "select") lines.push(`  await ${loc}.selectOption('${s.value ?? ""}');`);
    }
    lines.push("});");
    return lines.join("\n");
  }

  if (framework === "cypress") {
    lines.push(`describe('${name}', () => {`);
    lines.push(`  it('runs the captured flow', () => {`);
    lines.push(`    cy.visit('${origin}');`);
    for (const s of steps) {
      const sv = s.selector?.value || "";
      const strat = s.selector?.strategy || "css";
      const get =
        strat === "data-testid" ? `cy.get('[data-testid="${sv}"]')` :
        strat === "aria-label" ? `cy.get('[aria-label="${sv}"]')` :
        `cy.get('${sv}')`;
      if (s.type === "click") lines.push(`    ${get}.click(); // ${s.label}`);
      else if (s.type === "type") lines.push(`    ${get}.type('${s.value ?? ""}');`);
      else if (s.type === "navigate") lines.push(`    cy.visit('${s.value ?? ""}');`);
      else if (s.type === "validate") lines.push(`    ${get}.should('contain.text', '${s.value ?? ""}');`);
    }
    lines.push("  });", "});");
    return lines.join("\n");
  }

  if (framework === "selenium") {
    lines.push("from selenium import webdriver");
    lines.push("from selenium.webdriver.common.by import By");
    lines.push("from selenium.webdriver.support.ui import WebDriverWait");
    lines.push("from selenium.webdriver.support import expected_conditions as EC");
    lines.push("");
    const fn = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    lines.push(`def test_${fn}():`);
    lines.push("    driver = webdriver.Chrome()");
    lines.push(`    driver.get('${origin}')`);
    lines.push("    wait = WebDriverWait(driver, 10)");
    for (const s of steps) {
      const sv = s.selector?.value || "";
      const strat = s.selector?.strategy || "css";
      const by = strat === "xpath" ? "By.XPATH" : "By.CSS_SELECTOR";
      const val = strat === "data-testid" ? `[data-testid="${sv}"]` : sv;
      if (s.type === "click") lines.push(`    wait.until(EC.element_to_be_clickable((${by}, '${val}'))).click()  # ${s.label}`);
      else if (s.type === "type") lines.push(`    driver.find_element(${by}, '${val}').send_keys('${s.value ?? ""}')`);
      else if (s.type === "navigate") lines.push(`    driver.get('${s.value ?? ""}')`);
      else if (s.type === "validate") lines.push(`    assert '${s.value ?? ""}' in driver.find_element(${by}, '${val}').text`);
    }
    lines.push("    driver.quit()");
    return lines.join("\n");
  }

  // karate
  lines.push(`Feature: ${name}`);
  lines.push("");
  lines.push(`  Scenario: Captured flow`);
  lines.push("    * configure driver = { type: 'chrome' }");
  lines.push(`    * driver '${origin}'`);
  for (const s of steps) {
    const sv = s.selector?.value || "";
    if (s.type === "click") lines.push(`    * click("${sv}")  # ${s.label}`);
    else if (s.type === "type") lines.push(`    * input("${sv}", "${s.value ?? ""}")`);
    else if (s.type === "navigate") lines.push(`    * driver '${s.value ?? ""}'`);
    else if (s.type === "validate") lines.push(`    * match text("${sv}") contains "${s.value ?? ""}"`);
  }
  return lines.join("\n");
}
