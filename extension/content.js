/*
 * TestCapture AI — Content Script
 * Captures user interactions on the page under test and forwards them to the background
 * service worker. Supports Shift+Click to create an assertion instead of a click step.
 */
(function () {
  "use strict";
  if (window.__TC_CONTENT_INJECTED__) return;
  window.__TC_CONTENT_INJECTED__ = true;

  let recording = false;
  let assertMode = false;
  let lastTypeBuffer = { selector: null, value: "", stepId: null };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "TC_SET_RECORDING") {
      recording = !!msg.recording;
      showIndicator();
      sendResponse({ ok: true });
    } else if (msg?.type === "TC_SET_ASSERT_MODE") {
      assertMode = !!msg.assertMode;
      showIndicator();
      sendResponse({ ok: true });
    } else if (msg?.type === "TC_PING") {
      sendResponse({ ok: true, recording, assertMode });
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

  function onClick(e) {
    if (!recording) return;
    const el = e.target;
    const selector = window.__TC_buildSelector(el);
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

  function onInput(e) {
    if (!recording) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    const selector = window.__TC_buildSelector(el);
    const value = redactIfPassword(el, el.value || "");
    // Coalesce rapid keystrokes into one 'type' step for the same element
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

  // Hook history navigation
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function () { const r = origPush.apply(this, arguments); onNavigate(); return r; };
  history.replaceState = function () { const r = origReplace.apply(this, arguments); onNavigate(); return r; };
  window.addEventListener("popstate", onNavigate);

  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onChange, true);

  // Visual indicator
  function showIndicator() {
    let el = document.getElementById("__tc_indicator__");
    const on = recording;
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.id = "__tc_indicator__";
        Object.assign(el.style, {
          position: "fixed",
          zIndex: 2147483647,
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
      if (assertMode) {
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
