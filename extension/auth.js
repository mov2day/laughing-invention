/* TestCapture AI — GitHub Device Flow controller */
const $ = (s) => document.querySelector(s);
let devState = null;
let pollHandle = null;

$("#start-btn").addEventListener("click", startFlow);
$("#retry").addEventListener("click", startFlow);
$("#go-popup").addEventListener("click", () => chrome.action.openPopup?.().catch(() => window.close()));
$("#close-tab").addEventListener("click", () => window.close());
$("#copy-code").addEventListener("click", async () => {
  if (!devState?.user_code) return;
  await navigator.clipboard.writeText(devState.user_code);
  $("#copy-code").textContent = "Copied";
  setTimeout(() => ($("#copy-code").textContent = "Copy"), 1500);
});

async function startFlow() {
  show("pending");
  $("#status").textContent = "Requesting device code…";
  try {
    const dc = await window.TCAI.copilot.startDevice();
    devState = dc;
    $("#user-code").textContent = dc.user_code;
    $("#open-github").href = dc.verification_uri;
    $("#expires-label").textContent = Math.floor(dc.expires_in / 60);
    $("#status").textContent = "Waiting for you to enter the code on github.com…";
    startPoll(dc);
  } catch (e) {
    showError(e);
  }
}

function startPoll(dc) {
  clearInterval(pollHandle);
  const started = Date.now();
  const intervalMs = (dc.interval || 5) * 1000;
  const expiresMs = (dc.expires_in || 900) * 1000;
  pollHandle = setInterval(async () => {
    const elapsed = Date.now() - started;
    const pct = Math.min(100, Math.max(2, (elapsed / expiresMs) * 100));
    $("#progress-fill").style.width = pct + "%";
    if (elapsed > expiresMs) {
      clearInterval(pollHandle);
      showError(new Error("Device code expired. Click Retry."));
      return;
    }
    try {
      const r = await window.TCAI.copilot.pollOnce(dc.device_code);
      if (r.token) {
        clearInterval(pollHandle);
        $("#status").textContent = "Authorized. Exchanging Copilot session…";
        await window.TCAI.copilot.saveGhoToken(r.token);
        try {
          await window.TCAI.copilot.ensureSession();
          const models = await window.TCAI.copilot.listModels();
          const cur = await window.TCAI.getSettings();
          await window.TCAI.setSettings({
            provider: "copilot",
            model: cur.model || (models[0]?.id || "gpt-4o"),
          });
          $("#model-summary").textContent =
            `Provider: GitHub Copilot\n` +
            `Default model: ${cur.model || (models[0]?.id || "gpt-4o")}\n` +
            `Available models: ${models.slice(0, 6).map((m) => m.id).join(", ")}${models.length > 6 ? "…" : ""}`;
          show("done");
        } catch (e) {
          showError(e);
        }
      } else if (r.error === "access_denied") {
        clearInterval(pollHandle);
        showError(new Error("Access was denied on GitHub. Click Retry to try again."));
      } else if (r.slow) {
        // server asked us to slow down; no-op this tick
      }
    } catch (e) {
      // transient — keep polling
      console.warn(e);
    }
  }, intervalMs);
}

function show(id) {
  ["intro", "pending", "done", "error"].forEach((s) => ($("#" + s).hidden = s !== id));
}
function showError(e) {
  show("error");
  $("#err-message").textContent = String(e.message || e);
}
