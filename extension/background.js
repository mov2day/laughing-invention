/*
 * TestCapture AI — Background Service Worker (MV3)
 * Responsibilities:
 *  - Own the single source of truth for recording state (persisted to chrome.storage.local)
 *  - Accept step captures from content scripts and append to the active session
 *  - Broadcast state updates to popup and dashboard pages
 */

const STATE_KEY = "tc_state";
const SESSION_PREFIX = "tc_session_";

async function getState() {
  const out = await chrome.storage.local.get(STATE_KEY);
  return out[STATE_KEY] || {
    recording: false,
    paused: false,
    assertMode: false,
    activeSessionId: null,
    activeTabId: null,
    startTime: null,
    framework: "playwright",
  };
}

async function setState(patch) {
  const curr = await getState();
  const next = { ...curr, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  broadcast({ type: "TC_STATE", state: next });
  return next;
}

async function getSession(id) {
  if (!id) return null;
  const out = await chrome.storage.local.get(SESSION_PREFIX + id);
  return out[SESSION_PREFIX + id] || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_PREFIX + session.id]: session });
}

async function listSessions() {
  const all = await chrome.storage.local.get(null);
  const arr = [];
  for (const key of Object.keys(all)) {
    if (key.startsWith(SESSION_PREFIX)) arr.push(all[key]);
  }
  return arr.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function startRecording(name, tabId) {
  const id = crypto.randomUUID();
  const tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const session = {
    id,
    name: name || `Session ${new Date().toLocaleString()}`,
    status: "recording",
    startTime: Date.now(),
    targetTabId: tab?.id,
    targetOrigin: tab?.url ? new URL(tab.url).origin : null,
    steps: [],
    selectedFramework: (await getState()).framework,
    generatedCode: {},
  };
  await saveSession(session);
  await setState({ recording: true, paused: false, activeSessionId: id, activeTabId: tab?.id, startTime: session.startTime });

  // Push initial "navigate" step
  if (tab?.url) {
    session.steps.push({
      id: crypto.randomUUID(),
      type: "navigate",
      label: `Navigate to ${tab.url}`,
      timestamp: Date.now(),
      selector: { strategy: "url", value: tab.url, stability: "high", alternatives: [] },
      value: tab.url,
      elementProps: {},
      url: tab.url,
    });
    await saveSession(session);
  }

  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TC_SET_RECORDING", recording: true });
    } catch (_) {
      // Content script not yet injected; inject now
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/selector.js", "content.js"],
        });
        await chrome.tabs.sendMessage(tab.id, { type: "TC_SET_RECORDING", recording: true });
      } catch (e) {
        console.warn("[TC] could not inject content script", e);
      }
    }
  }
  return session;
}

async function stopRecording() {
  const state = await getState();
  if (!state.activeSessionId) return null;
  const session = await getSession(state.activeSessionId);
  if (session) {
    session.status = "stopped";
    await saveSession(session);
  }
  if (state.activeTabId) {
    try {
      await chrome.tabs.sendMessage(state.activeTabId, { type: "TC_SET_RECORDING", recording: false });
    } catch (_) {}
  }
  await setState({ recording: false, paused: false });
  return session;
}

async function togglePause() {
  const state = await getState();
  const next = !state.paused;
  if (state.activeTabId) {
    try {
      await chrome.tabs.sendMessage(state.activeTabId, { type: "TC_SET_RECORDING", recording: !next });
    } catch (_) {}
  }
  await setState({ paused: next });
  return next;
}

async function appendStep(step) {
  const state = await getState();
  if (!state.recording || state.paused || !state.activeSessionId) return;
  const session = await getSession(state.activeSessionId);
  if (!session) return;
  if (step.replace) {
    const idx = session.steps.findIndex((s) => s.id === step.id);
    delete step.replace;
    if (idx >= 0) {
      session.steps[idx] = { ...session.steps[idx], ...step };
    } else {
      step.stepNumber = session.steps.length + 1;
      session.steps.push(step);
    }
  } else {
    step.stepNumber = session.steps.length + 1;
    session.steps.push(step);
  }
  await saveSession(session);
  broadcast({ type: "TC_STEP_ADDED", sessionId: session.id, step });
}

async function setAssertMode(on) {
  const state = await setState({ assertMode: !!on });
  if (state.activeTabId) {
    try {
      await chrome.tabs.sendMessage(state.activeTabId, { type: "TC_SET_ASSERT_MODE", assertMode: !!on });
    } catch (_) {}
  }
  return state;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "TC_QUERY_STATE":
          sendResponse({ state: await getState(), recording: (await getState()).recording });
          return;
        case "TC_START":
          sendResponse({ session: await startRecording(msg.name, msg.tabId) });
          return;
        case "TC_STOP":
          sendResponse({ session: await stopRecording() });
          return;
        case "TC_PAUSE":
          sendResponse({ paused: await togglePause() });
          return;
        case "TC_CAPTURE_STEP":
          await appendStep(msg.step);
          sendResponse({ ok: true });
          return;
        case "TC_GET_ACTIVE_SESSION": {
          const s = await getState();
          const session = await getSession(s.activeSessionId);
          sendResponse({ session });
          return;
        }
        case "TC_GET_SESSION":
          sendResponse({ session: await getSession(msg.id) });
          return;
        case "TC_LIST_SESSIONS":
          sendResponse({ sessions: await listSessions() });
          return;
        case "TC_DELETE_SESSION":
          await chrome.storage.local.remove(SESSION_PREFIX + msg.id);
          sendResponse({ ok: true });
          return;
        case "TC_UPDATE_SESSION":
          await saveSession(msg.session);
          sendResponse({ ok: true });
          return;
        case "TC_SET_FRAMEWORK":
          await setState({ framework: msg.framework });
          sendResponse({ ok: true });
          return;
        case "TC_SET_ASSERT_MODE":
          await setAssertMode(msg.assertMode);
          sendResponse({ ok: true });
          return;
        case "TC_UPDATE_STEP": {
          const session = await getSession(msg.sessionId);
          if (session) {
            const idx = session.steps.findIndex((s) => s.id === msg.step.id);
            if (idx >= 0) session.steps[idx] = { ...session.steps[idx], ...msg.step };
            await saveSession(session);
          }
          sendResponse({ ok: true });
          return;
        }
        case "TC_DELETE_STEP": {
          const session = await getSession(msg.sessionId);
          if (session) {
            session.steps = session.steps.filter((s) => s.id !== msg.stepId);
            session.steps.forEach((s, i) => (s.stepNumber = i + 1));
            await saveSession(session);
          }
          sendResponse({ ok: true });
          return;
        }
        case "TC_ADD_ASSERTION": {
          const session = await getSession(msg.sessionId);
          if (session) {
            const step = session.steps.find((s) => s.id === msg.stepId);
            if (step) {
              step.assertions = step.assertions || [];
              step.assertions.push(msg.assertion);
              await saveSession(session);
            }
          }
          sendResponse({ ok: true });
          return;
        }
        case "TC_REMOVE_ASSERTION": {
          const session = await getSession(msg.sessionId);
          if (session) {
            const step = session.steps.find((s) => s.id === msg.stepId);
            if (step && step.assertions) {
              step.assertions = step.assertions.filter((_, i) => i !== msg.index);
              await saveSession(session);
            }
          }
          sendResponse({ ok: true });
          return;
        }
        case "TC_OPEN_DASHBOARD": {
          const url = chrome.runtime.getURL("dashboard.html") + (msg.sessionId ? `?session=${msg.sessionId}` : "");
          await chrome.tabs.create({ url });
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      console.error("[TC bg] error", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep channel open for async
});

// Re-inject content script when user navigates in the tab being recorded
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const state = await getState();
  if (state.recording && state.activeTabId === tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "TC_SET_RECORDING", recording: !state.paused });
    } catch (_) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/selector.js", "content.js"] });
        await chrome.tabs.sendMessage(tabId, { type: "TC_SET_RECORDING", recording: !state.paused });
      } catch (_) {}
    }
  }
});

console.log("[TestCapture AI] background service worker ready");
