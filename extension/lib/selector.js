/*
 * TestCapture AI — Selector Resolver
 * Multi-priority strategy: data-testid > aria-label > role > id > role+text > CSS path > XPath
 * Exposes window.__TC_buildSelector(element) returning { strategy, value, stability, alternatives }
 */
(function () {
  "use strict";

  const STABILITY = {
    "data-testid": "high",
    "aria-label": "high",
    role: "medium",
    id: "medium",
    "role+text": "medium",
    css: "low",
    xpath: "low",
  };

  function escapeAttr(v) {
    return String(v).replace(/(["\\])/g, "\\$1");
  }

  function idUnique(doc, id) {
    try {
      return doc.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
    } catch (_) {
      return false;
    }
  }

  function roleOf(el) {
    if (el.getAttribute("role")) return el.getAttribute("role");
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a" && el.getAttribute("href")) return "link";
    if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset"].includes(t)) return "button";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    return null;
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const path = [];
    while (el && el.nodeType === 1 && path.length < 6) {
      let selector = el.nodeName.toLowerCase();
      if (el.id && idUnique(el.ownerDocument, el.id)) {
        selector = `#${CSS.escape(el.id)}`;
        path.unshift(selector);
        break;
      }
      const classes = (el.className && typeof el.className === "string")
        ? el.className.trim().split(/\s+/).filter((c) => c && !/^(ng-|is-|active|hover|focus|tc-)/.test(c))
        : [];
      if (classes.length) selector += "." + classes.slice(0, 2).map(CSS.escape).join(".");
      const parent = el.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.nodeName === el.nodeName);
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(el) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(" > ");
  }

  function xPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id && idUnique(el.ownerDocument, el.id)) return `//*[@id="${escapeAttr(el.id)}"]`;
    const parts = [];
    while (el && el.nodeType === 1) {
      let idx = 1;
      let sib = el.previousElementSibling;
      while (sib) {
        if (sib.nodeName === el.nodeName) idx++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${el.nodeName.toLowerCase()}[${idx}]`);
      el = el.parentElement;
      if (parts.length > 8) break;
    }
    return "/" + parts.join("/");
  }

  function buildSelector(el) {
    if (!el || !(el instanceof Element)) {
      return { strategy: "css", value: "", stability: "low", alternatives: [] };
    }

    const alternatives = [];
    let primary = null;

    const testid =
      el.getAttribute("data-testid") ||
      el.getAttribute("data-test") ||
      el.getAttribute("data-cy") ||
      el.getAttribute("data-qa");
    if (testid) {
      primary = primary || { strategy: "data-testid", value: testid };
      alternatives.push({ strategy: "data-testid", value: testid });
    }

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      primary = primary || { strategy: "aria-label", value: ariaLabel };
      alternatives.push({ strategy: "aria-label", value: ariaLabel });
    }

    const role = roleOf(el);
    const text = (el.innerText || el.value || "").trim().slice(0, 40);
    if (role && text) {
      primary = primary || { strategy: "role+text", value: `${role}:${text}` };
      alternatives.push({ strategy: "role+text", value: `${role}:${text}` });
    }
    if (role) alternatives.push({ strategy: "role", value: role });

    if (el.id && idUnique(el.ownerDocument, el.id)) {
      primary = primary || { strategy: "id", value: `#${el.id}` };
      alternatives.push({ strategy: "id", value: `#${el.id}` });
    }

    const css = cssPath(el);
    if (css) {
      primary = primary || { strategy: "css", value: css };
      alternatives.push({ strategy: "css", value: css });
    }

    const xp = xPath(el);
    alternatives.push({ strategy: "xpath", value: xp });

    if (!primary) primary = { strategy: "xpath", value: xp };

    return {
      strategy: primary.strategy,
      value: primary.value,
      stability: STABILITY[primary.strategy] || "low",
      alternatives,
    };
  }

  window.__TC_buildSelector = buildSelector;
  window.__TC_cssPath = cssPath;
})();
