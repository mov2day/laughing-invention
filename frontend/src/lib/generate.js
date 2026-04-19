// Offline deterministic generators — mirrors the backend fallback and gives instant preview
// before an AI call (or when no proxy/key is configured). Now honours structured assertions.

function assertLines(framework, selectorVal, strategy, assertions = []) {
  if (!assertions?.length) return [];
  const out = [];
  if (framework === "playwright") {
    const loc =
      strategy === "data-testid" ? `page.getByTestId('${selectorVal}')` :
      strategy === "aria-label" ? `page.getByLabel('${selectorVal}')` :
      strategy === "role" ? `page.getByRole('${selectorVal}')` :
      `page.locator('${selectorVal}')`;
    for (const a of assertions) {
      const exp = a.expected ?? "";
      if (a.type === "containsText") out.push(`  await expect(${loc}).toContainText('${exp}');`);
      else if (a.type === "visible") out.push(`  await expect(${loc}).toBeVisible();`);
      else if (a.type === "exists") out.push(`  await expect(${loc}).toBeAttached();`);
      else if (a.type === "countEquals") out.push(`  await expect(${loc}).toHaveCount(${parseInt(exp || "1", 10)});`);
      else if (a.type === "valueEquals") out.push(`  await expect(${loc}).toHaveValue('${exp}');`);
      else if (a.type === "urlContains") out.push(`  await expect(page).toHaveURL(/${exp}/);`);
    }
  } else if (framework === "cypress") {
    const get = strategy === "data-testid" ? `cy.get('[data-testid="${selectorVal}"]')` : `cy.get('${selectorVal}')`;
    for (const a of assertions) {
      const exp = a.expected ?? "";
      if (a.type === "containsText") out.push(`    ${get}.should('contain.text', '${exp}');`);
      else if (a.type === "visible") out.push(`    ${get}.should('be.visible');`);
      else if (a.type === "exists") out.push(`    ${get}.should('exist');`);
      else if (a.type === "countEquals") out.push(`    ${get}.should('have.length', ${parseInt(exp || "1", 10)});`);
      else if (a.type === "valueEquals") out.push(`    ${get}.should('have.value', '${exp}');`);
      else if (a.type === "urlContains") out.push(`    cy.url().should('include', '${exp}');`);
    }
  } else if (framework === "selenium") {
    const by = strategy === "xpath" ? "By.XPATH" : "By.CSS_SELECTOR";
    const val = strategy === "data-testid" ? `[data-testid="${selectorVal}"]` : selectorVal;
    for (const a of assertions) {
      const exp = a.expected ?? "";
      if (a.type === "containsText") out.push(`    assert '${exp}' in driver.find_element(${by}, '${val}').text`);
      else if (a.type === "visible") out.push(`    assert driver.find_element(${by}, '${val}').is_displayed()`);
      else if (a.type === "exists") out.push(`    assert driver.find_element(${by}, '${val}') is not None`);
      else if (a.type === "valueEquals") out.push(`    assert driver.find_element(${by}, '${val}').get_attribute('value') == '${exp}'`);
      else if (a.type === "urlContains") out.push(`    assert '${exp}' in driver.current_url`);
    }
  } else if (framework === "karate") {
    for (const a of assertions) {
      const exp = a.expected ?? "";
      if (a.type === "containsText") out.push(`    * match text("${selectorVal}") contains "${exp}"`);
      else if (a.type === "visible") out.push(`    * waitFor("${selectorVal}")`);
      else if (a.type === "urlContains") out.push(`    * match driver.url contains "${exp}"`);
    }
  }
  return out;
}

export function offlineGenerate(session, framework) {
  const name = session?.name || "Recorded test";
  const origin = session?.targetOrigin || "https://example.com";
  const steps = session?.steps || [];
  const lines = [];

  if (framework === "playwright") {
    lines.push("import { test, expect } from '@playwright/test';", "", `test('${name}', async ({ page }) => {`, `  await page.goto('${origin}');`);
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
      lines.push(...assertLines("playwright", sv, strat, s.assertions));
    }
    lines.push("});");
    return lines.join("\n");
  }

  if (framework === "cypress") {
    lines.push(`describe('${name}', () => {`, `  it('runs the captured flow', () => {`, `    cy.visit('${origin}');`);
    for (const s of steps) {
      const sv = s.selector?.value || "";
      const strat = s.selector?.strategy || "css";
      const get = strat === "data-testid" ? `cy.get('[data-testid="${sv}"]')` : strat === "aria-label" ? `cy.get('[aria-label="${sv}"]')` : `cy.get('${sv}')`;
      if (s.type === "click") lines.push(`    ${get}.click(); // ${s.label}`);
      else if (s.type === "type") lines.push(`    ${get}.type('${s.value ?? ""}');`);
      else if (s.type === "navigate") lines.push(`    cy.visit('${s.value ?? ""}');`);
      else if (s.type === "validate") lines.push(`    ${get}.should('contain.text', '${s.value ?? ""}');`);
      lines.push(...assertLines("cypress", sv, strat, s.assertions));
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
    const fn = (name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")) || "recorded_flow";
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
      lines.push(...assertLines("selenium", sv, strat, s.assertions));
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
    const strat = s.selector?.strategy || "css";
    if (s.type === "click") lines.push(`    * click("${sv}")  # ${s.label}`);
    else if (s.type === "type") lines.push(`    * input("${sv}", "${s.value ?? ""}")`);
    else if (s.type === "navigate") lines.push(`    * driver '${s.value ?? ""}'`);
    else if (s.type === "validate") lines.push(`    * match text("${sv}") contains "${s.value ?? ""}"`);
    lines.push(...assertLines("karate", sv, strat, s.assertions));
  }
  return lines.join("\n");
}
