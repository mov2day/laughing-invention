/*
 * TestCapture AI — In-page Assertion Picker
 * A fully-isolated picker UI (Shadow DOM) that lets the user choose an assertion type,
 * expected value, and selector strategy for any element they click during recording.
 *
 * Exposes:
 *   window.__TC_openPicker(element, selectorResult, { onSave, onCancel })
 *   window.__TC_closePicker()
 *   window.__TC_pickerOpen() -> boolean
 *
 * The picker lives in a closed shadow root attached to an element at the top of
 * <html>. This keeps host-page CSS and sites-with-strict-CSP from breaking us.
 */
(function () {
  "use strict";

  const HOST_ID = "__tc_picker_host__";
  let hostEl = null;
  let currentState = null; // { resolve, reject }

  const TYPES = [
    { id: "containsText", label: "Contains text", hint: "Element's text contains the expected value.", needsValue: true, defaultFrom: "text" },
    { id: "visible", label: "Is visible", hint: "Element is rendered & visible.", needsValue: false },
    { id: "exists", label: "Exists in DOM", hint: "Element is present.", needsValue: false },
    { id: "valueEquals", label: "Input value equals", hint: "For inputs/selects: value matches exactly.", needsValue: true, defaultFrom: "value" },
    { id: "countEquals", label: "Match count equals", hint: "Number of elements matching the selector.", needsValue: true, defaultFrom: "count" },
    { id: "urlContains", label: "URL contains", hint: "window.location.href contains the expected substring.", needsValue: true, defaultFrom: "url" },
  ];

  function openPicker(targetEl, selectorResult, handlers) {
    closePicker();
    const picker = buildUI(targetEl, selectorResult, handlers);
    hostEl = picker.host;
    document.documentElement.appendChild(hostEl);
    currentState = { handlers, picker };
    // Focus expected value when visible
    setTimeout(() => picker.shadow.getElementById("tc_expected")?.focus(), 10);
    // close on Escape
    document.addEventListener("keydown", onKey, true);
  }

  function closePicker() {
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null;
    currentState = null;
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation(); e.preventDefault();
      currentState?.handlers?.onCancel?.();
      closePicker();
    }
  }

  function buildUI(targetEl, selectorResult, handlers) {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    // Backdrop captures scroll-wheel to keep the card stable
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.addEventListener("click", () => { handlers?.onCancel?.(); closePicker(); });
    shadow.appendChild(backdrop);

    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-testid", "tc-assertion-picker");
    card.addEventListener("click", (e) => e.stopPropagation());

    const props = elementPropsOf(targetEl);
    const alternatives = selectorResult.alternatives || [];

    card.innerHTML = `
      <div class="head">
        <div class="title">
          <span class="dot"></span>
          <span>Add assertion</span>
        </div>
        <button class="close" title="Close (Esc)" data-testid="tc-picker-close">&times;</button>
      </div>
      <div class="target">
        <div class="tag">&lt;${escAttr(props.tagName || "*")}&gt;</div>
        <div class="txt" title="${escAttr(props.text || "")}">${escHtml((props.text || props.value || "—").slice(0, 60))}</div>
      </div>

      <div class="sect-label">ASSERTION TYPE</div>
      <div class="type-grid" role="radiogroup" aria-label="Assertion type">
        ${TYPES.map((t, i) => `
          <button class="type ${i === 0 ? "is-on" : ""}" data-type="${t.id}" data-testid="tc-picker-type-${t.id}">
            <span class="type-lbl">${escHtml(t.label)}</span>
            <span class="type-hint">${escHtml(t.hint)}</span>
          </button>`).join("")}
      </div>

      <div class="field" id="tc_expected_wrap">
        <label class="sect-label" for="tc_expected">EXPECTED VALUE</label>
        <input id="tc_expected" type="text" autocomplete="off" spellcheck="false" data-testid="tc-picker-expected" />
      </div>

      <div class="sect-label">SELECTOR (choose the most stable)</div>
      <div class="sel-list" id="tc_sel_list">
        ${alternatives.map((a, i) => `
          <label class="sel ${i === 0 ? "is-on" : ""}">
            <input type="radio" name="tc_sel" value="${i}" ${i === 0 ? "checked" : ""} data-testid="tc-picker-sel-${a.strategy}"/>
            <span class="sel-strat">${escHtml(a.strategy)}</span>
            <span class="sel-val" title="${escAttr(a.value)}">${escHtml((a.value || "").slice(0, 70))}</span>
            <span class="sel-badge ${stabClass(a.strategy)}">${stabClass(a.strategy).toUpperCase()}</span>
          </label>`).join("")}
      </div>

      <div class="foot">
        <button class="btn ghost" id="tc_cancel" data-testid="tc-picker-cancel">Cancel</button>
        <button class="btn primary" id="tc_save" data-testid="tc-picker-save">Save assertion</button>
      </div>
      <div class="hint-row">Esc cancels · ⏎ saves · this records one <code>validate</code> step.</div>
    `;
    shadow.appendChild(card);
    host.style.pointerEvents = "auto";

    // Position near the target element
    positionCard(card, targetEl);

    // Wire interactions
    let selectedType = TYPES[0];
    let selectedSelIdx = 0;

    shadow.querySelectorAll(".type").forEach((btn) => {
      btn.addEventListener("click", () => {
        shadow.querySelectorAll(".type").forEach((b) => b.classList.remove("is-on"));
        btn.classList.add("is-on");
        selectedType = TYPES.find((t) => t.id === btn.dataset.type) || TYPES[0];
        updateExpectedForType(shadow, targetEl, selectedType);
      });
    });
    shadow.querySelectorAll("input[name=tc_sel]").forEach((r) => {
      r.addEventListener("change", () => {
        selectedSelIdx = Number(r.value);
        shadow.querySelectorAll(".sel").forEach((s) => s.classList.remove("is-on"));
        r.parentElement.classList.add("is-on");
      });
    });
    shadow.getElementById("tc_cancel").addEventListener("click", () => { handlers?.onCancel?.(); closePicker(); });
    shadow.getElementById("tc-picker-close").addEventListener("click", () => { handlers?.onCancel?.(); closePicker(); });
    shadow.getElementById("tc_save").addEventListener("click", () => commit(shadow, handlers, () => selectedType, () => selectedSelIdx, selectorResult));
    shadow.getElementById("tc_expected").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(shadow, handlers, () => selectedType, () => selectedSelIdx, selectorResult); }
    });

    // Initial expected value
    updateExpectedForType(shadow, targetEl, selectedType);
    return { host, shadow };
  }

  function commit(shadow, handlers, getType, getIdx, selectorResult) {
    const type = getType();
    const idx = getIdx();
    const expected = shadow.getElementById("tc_expected").value;
    const sel = selectorResult.alternatives?.[idx] || { strategy: selectorResult.strategy, value: selectorResult.value };
    const out = {
      assertion: {
        type: type.id,
        expected: type.needsValue ? expected : null,
        target: sel.value,
      },
      selector: {
        strategy: sel.strategy,
        value: sel.value,
        stability: stabClass(sel.strategy),
        alternatives: selectorResult.alternatives || [],
      },
    };
    handlers?.onSave?.(out);
    closePicker();
  }

  function updateExpectedForType(shadow, target, type) {
    const wrap = shadow.getElementById("tc_expected_wrap");
    const input = shadow.getElementById("tc_expected");
    if (!type.needsValue) {
      wrap.style.display = "none";
      input.value = "";
      return;
    }
    wrap.style.display = "";
    let val = "";
    const props = elementPropsOf(target);
    if (type.defaultFrom === "text") val = (props.text || "").slice(0, 120);
    else if (type.defaultFrom === "value") val = target?.value || "";
    else if (type.defaultFrom === "url") val = location.pathname || "/";
    else if (type.defaultFrom === "count") val = "1";
    input.value = val;
    input.select?.();
  }

  function positionCard(card, target) {
    const r = target.getBoundingClientRect();
    const CW = 380, CH = 460;
    let left = Math.min(window.innerWidth - CW - 16, Math.max(16, r.left));
    let top = r.bottom + 10;
    if (top + CH > window.innerHeight - 16) {
      // position above the target instead
      top = Math.max(16, r.top - CH - 10);
    }
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function elementPropsOf(el) {
    if (!el) return {};
    return {
      tagName: el.tagName,
      id: el.id,
      name: el.getAttribute?.("name"),
      text: (el.innerText || el.value || "").trim(),
      value: el.value,
    };
  }

  function stabClass(strategy) {
    if (["data-testid", "aria-label"].includes(strategy)) return "high";
    if (["role", "id", "role+text"].includes(strategy)) return "medium";
    return "low";
  }

  function escHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escAttr(s) { return escHtml(s); }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.32); backdrop-filter: blur(2px); }
    .card {
      position: fixed; width: 380px; max-height: 88vh; overflow: auto;
      background: #0F0F0F; color: #FAFAFA; border: 1px solid #27272A; border-radius: 8px;
      box-shadow: 0 24px 64px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(250,250,250,0.04);
      font: 13px/1.5 "Geist", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 14px;
    }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .title { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -0.01em; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 0 4px rgba(16,185,129,0.16); display: inline-block; }
    .close { background: transparent; border: 1px solid #27272A; color: #A1A1AA; width: 26px; height: 26px; border-radius: 4px; cursor: pointer; font: 16px/1 ui-monospace, monospace; }
    .close:hover { color: #fff; border-color: #3F3F46; }
    .target {
      display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;
      border: 1px dashed #27272A; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px;
    }
    .tag { font: 700 10px/1 "JetBrains Mono", ui-monospace, monospace; color: #3B82F6; letter-spacing: 0.06em; }
    .txt { font: 12px/1.3 "JetBrains Mono", monospace; color: #E4E4E7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sect-label { font: 700 10px/1 "JetBrains Mono", monospace; color: #71717A; letter-spacing: 0.14em; margin: 10px 0 6px; text-transform: uppercase; }
    .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .type {
      text-align: left; border: 1px solid #27272A; border-radius: 5px; padding: 7px 9px; background: transparent; color: #E4E4E7; cursor: pointer;
      display: flex; flex-direction: column; gap: 3px; transition: border-color 120ms, background 120ms;
    }
    .type:hover { border-color: #3F3F46; background: #171717; }
    .type.is-on { border-color: #10B981; background: rgba(16,185,129,0.08); }
    .type-lbl { font: 600 11px/1.2 "JetBrains Mono", monospace; color: #FAFAFA; letter-spacing: 0.04em; }
    .type-hint { font-size: 10px; color: #71717A; line-height: 1.35; }
    .field { margin-top: 10px; }
    #tc_expected {
      width: 100%; background: transparent; color: #FAFAFA; border: 1px solid #27272A; border-radius: 4px;
      padding: 9px 11px; font: 12.5px/1.4 "JetBrains Mono", monospace; outline: none;
    }
    #tc_expected:focus { border-color: #71717A; }
    .sel-list { display: flex; flex-direction: column; gap: 3px; }
    .sel {
      display: grid; grid-template-columns: 14px 80px 1fr 46px; gap: 6px; align-items: center;
      border: 1px solid #27272A; border-radius: 4px; padding: 6px 8px; cursor: pointer; font: 11px "JetBrains Mono", monospace;
    }
    .sel:hover { border-color: #3F3F46; }
    .sel.is-on { border-color: #FAFAFA; background: #171717; }
    .sel input { accent-color: #FAFAFA; margin: 0; }
    .sel-strat { color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
    .sel-val { color: #E4E4E7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sel-badge { text-align: center; border-radius: 2px; padding: 3px 0; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; }
    .sel-badge.high { background: #10B981; color: #000; }
    .sel-badge.medium { background: #F59E0B; color: #000; }
    .sel-badge.low { background: #EF4444; color: #fff; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .btn {
      border: 1px solid #27272A; background: transparent; color: #FAFAFA; cursor: pointer;
      padding: 8px 12px; border-radius: 4px; font: 700 11px/1 "JetBrains Mono", monospace; letter-spacing: 0.12em; text-transform: uppercase;
      transition: background 120ms, border-color 120ms;
    }
    .btn:hover { border-color: #3F3F46; background: #171717; }
    .btn.primary { background: #FAFAFA; color: #0A0A0A; border-color: #FAFAFA; }
    .btn.primary:hover { background: #E4E4E7; }
    .btn.ghost { color: #A1A1AA; border-color: transparent; }
    .hint-row { margin-top: 10px; font: 10px/1.4 "JetBrains Mono", monospace; color: #52525B; letter-spacing: 0.04em; text-align: center; }
    .hint-row code { background: #171717; padding: 1px 4px; border-radius: 2px; color: #A1A1AA; }
  `;

  window.__TC_openPicker = openPicker;
  window.__TC_closePicker = closePicker;
  window.__TC_pickerOpen = () => !!hostEl;
})();
