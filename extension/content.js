/*
 * TestCapture AI — Content Script
 * Captures user interactions on the page under test and forwards them to the background
 * service worker. Three assertion modes:
 *   (1) Shift+Click — instant containsText assertion
 *   (2) Assert Mode — all clicks become containsText assertions
 *   (3) Pick Mode   — clicks open an in-page picker where user chooses assertion TYPE, value, selector
 *   (*) Alt+Click — opens the picker for ONE click without toggling mode
 */
(function () {
  "use strict";
  if (window.__TC_CONTENT_INJECTED__) return;
  window.__TC_CONTENT_INJECTED__ = true;

  let recording = false;
  let assertMode = false;
  let pickMode = false;
  let lastTypeBuffer = { selector: null, value: "", stepId: null };
  let hoverEl = null;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "TC_SET_RECORDING") {
      recording = !!msg.recording;
      if (!recording) { window.__TC_closePicker?.(); clearHover(); }
      showIndicator();
      sendResponse({ ok: true });
    } else if (msg?.type === "TC_SET_ASSERT_MODE") {
      assertMode = !!msg.assertMode;
      if (assertMode) pickMode = false;
      showIndicator();
      sendResponse({ ok: true });
    } else if (msg?.type === "TC_SET_PICK_MODE") {
      pickMode = !!msg.pickMode;
      if (pickMode) assertMode = false;
      if (!pickMode) { window.__TC_closePicker?.(); clearHover(); }
      showIndicator();
      sendResponse({ ok: true });
    } else if (msg?.type === "TC_PING") {
      sendResponse({ ok: true, recording, assertMode, pickMode });
    }
    return true;
  });

  // Ask background for initial state
  try {
    chrome.runtime.sendMessage({ type: "TC_QUERY_STATE" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.state) {
        recording = !!res.state.recording && !res.state.paused;
        assertMode = !!res.state.assertMode;
        pickMode = !!res.state.pickMode;
        showIndicator();
      }
    });
  } catch (_) {}

  function send(step) {
    try {
      chrome.runtime.sendMessage({ type: "TC_CAPTURE_STEP", step });
    } catch (e) {
      console.warn("[TestCapture] failed to send step", e);
    }
  }

  function redactIfPassword(el, value) {
    if (el && el.tagName === "INPUT" && (el.type || "").toLowerCase() === "password") {
      return "********";
    }
    return value;
  }

  function propsOf(el) {
    if (!el) return {};
    return {
      tagName: el.tagName,
      type: el.getAttribute && el.getAttribute("type"),
      name: el.getAttribute && el.getAttribute("name"),
      id: el.id || null,
      text: (el.innerText || el.value || "").trim().slice(0, 120),
      placeholder: el.getAttribute && el.getAttribute("placeholder"),
    };
  }

  function isInsidePicker(target) {
    if (!target) return false;
    let n = target;
    while (n) {
      if (n.id === "__tc_picker_host__") return true;
      n = n.parentNode || n.host || null;
    }
    return false;
  }

  function onClick(e) {
    if (!recording) return;
    if (isInsidePicker(e.target)) return;

    const el = e.target;
    const selector = window.__TC_buildSelector(el);

    // Pick mode OR Alt+Click → open typed picker
    if (pickMode || e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.__TC_openPicker?.(el, selector, {
        onSave: ({ assertion, selector: chosenSel }) => {
          flushTypeBuffer();
          send({
            id: crypto.randomUUID(),
            type: "validate",
            label: labelForAssertion(assertion, chosenSel),
            timestamp: Date.now(),
            selector: chosenSel,
            value: assertion.expected ?? null,
            assertions: [assertion],
            elementProps: propsOf(el),
            url: location.href,
          });
        },
        onCancel: () => {},
      });
      return;
    }

    // Shift+Click OR Assert Mode → instant containsText assertion
    const isAssertion = e.shiftKey || assertMode;
    const step = {
      id: crypto.randomUUID(),
      type: isAssertion ? "validate" : "click",
      label: isAssertion
        ? `Assert text contains "${(el.innerText || "").trim().slice(0, 40)}"`
        : `Click ${selector.strategy}: ${selector.value.slice(0, 60)}`,
      timestamp: Date.now(),
      selector,
      value: isAssertion ? (el.innerText || "").trim().slice(0, 80) : undefined,
      assertions: isAssertion ? [{ type: "containsText", expected: (el.innerText || "").trim().slice(0, 80) }] : [],
      elementProps: propsOf(el),
      url: location.href,
    };
    flushTypeBuffer();
    send(step);
  }

  function labelForAssertion(a, sel) {
    const where = `${sel.strategy}:${String(sel.value).slice(0, 40)}`;
    switch (a.type) {
      case "containsText": return `Assert ${where} contains "${String(a.expected).slice(0, 40)}"`;
      case "visible": return `Assert ${where} is visible`;
      case "exists": return `Assert ${where} exists`;
      case "valueEquals": return `Assert ${where}.value = "${String(a.expected).slice(0, 30)}"`;
      case "countEquals": return `Assert count(${where}) = ${a.expected}`;
      case "urlContains": return `Assert URL contains "${String(a.expected).slice(0, 40)}"`;
      default: return `Assert ${a.type}`;
    }
  }

  function onInput(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    if (isInsidePicker(el)) return;
    const selector = window.__TC_buildSelector(el);
    const value = redactIfPassword(el, el.value || "");
    if (lastTypeBuffer.stepId && lastTypeBuffer.selector === selector.value) {
      lastTypeBuffer.value = value;
      send({
        id: lastTypeBuffer.stepId,
        replace: true,
        type: "type",
        label: `Type into ${selector.strategy}: ${selector.value.slice(0, 40)}`,
        timestamp: Date.now(),
        selector,
        value,
        elementProps: propsOf(el),
        url: location.href,
      });
      return;
    }
    const id = crypto.randomUUID();
    lastTypeBuffer = { selector: selector.value, value, stepId: id };
    send({
      id,
      type: "type",
      label: `Type into ${selector.strategy}: ${selector.value.slice(0, 40)}`,
      timestamp: Date.now(),
      selector,
      value,
      elementProps: propsOf(el),
      url: location.href,
    });
  }

  function onChange(e) {
    if (!recording) return;
    const el = e.target;
    if (isInsidePicker(el)) return;
    if (el instanceof HTMLSelectElement) {
      const selector = window.__TC_buildSelector(el);
      flushTypeBuffer();
      send({
        id: crypto.randomUUID(),
        type: "select",
        label: `Select ${el.value} in ${selector.value.slice(0, 40)}`,
        timestamp: Date.now(),
        selector,
        value: el.value,
        elementProps: propsOf(el),
        url: location.href,
      });
    }
  }

  function onMouseMove(e) {
    if (!recording || !pickMode) return;
    if (isInsidePicker(e.target)) return;
    const el = e.target;
    if (el === hoverEl) return;
    clearHover();
    if (!el || el.nodeType !== 1) return;
    hoverEl = el;
    el.setAttribute?.("data-__tc-hover__", "1");
    ensureHoverStyle();
  }

  function clearHover() {
    if (hoverEl && hoverEl.removeAttribute) hoverEl.removeAttribute("data-__tc-hover__");
    hoverEl = null;
  }

  function ensureHoverStyle() {
    if (document.getElementById("__tc_hover_style__")) return;
    const s = document.createElement("style");
    s.id = "__tc_hover_style__";
    s.textContent = `
      [data-__tc-hover__] {
        outline: 2px solid #10B981 !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
        box-shadow: 0 0 0 4px rgba(16,185,129,0.15) !important;
      }
    `;
    document.documentElement.appendChild(s);
  }

  function flushTypeBuffer() {
    lastTypeBuffer = { selector: null, value: "", stepId: null };
  }

  function onNavigate() {
    if (!recording) return;
    send({
      id: crypto.randomUUID(),
      type: "navigate",
      label: `Navigate to ${location.href}`,
      timestamp: Date.now(),
      selector: { strategy: "url", value: location.href, stability: "high", alternatives: [] },
      value: location.href,
      elementProps: {},
      url: location.href,
    });
  }

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function () { const r = origPush.apply(this, arguments); onNavigate(); return r; };
  history.replaceState = function () { const r = origReplace.apply(this, arguments); onNavigate(); return r; };
  window.addEventListener("popstate", onNavigate);

  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("mousemove", onMouseMove, true);

  // Indicator
  function showIndicator() {
    let el = document.getElementById("__tc_indicator__");
    const on = recording;
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.id = "__tc_indicator__";
        Object.assign(el.style, {
          position: "fixed",
          zIndex: 2147483646,
          right: "12px",
          bottom: "12px",
          padding: "6px 10px",
          color: "#fff",
          font: "600 12px/1 ui-monospace, Menlo, monospace",
          borderRadius: "4px",
          pointerEvents: "none",
          letterSpacing: "0.08em",
          transition: "background 160ms, box-shadow 160ms",
        });
        document.documentElement.appendChild(el);
      }
      if (pickMode) {
        el.textContent = "◎ PICK";
        el.style.background = "rgba(59,130,246,0.95)";
        el.style.boxShadow = "0 6px 24px rgba(59,130,246,0.4)";
      } else if (assertMode) {
        el.textContent = "◉ ASSERT";
        el.style.background = "rgba(16,185,129,0.95)";
        el.style.boxShadow = "0 6px 24px rgba(16,185,129,0.4)";
      } else {
        el.textContent = "● REC";
        el.style.background = "rgba(239,68,68,0.95)";
        el.style.boxShadow = "0 6px 24px rgba(239,68,68,0.4)";
      }
    } else if (el) {
      el.remove();
    }
  }
})();
