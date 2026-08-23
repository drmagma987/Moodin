const DEFAULT_ENDPOINT = "http://127.0.0.1:3000/api/fantasy/yahoo-extension";
const APPROVED_YAHOO_ORIGIN = "https://football.fantasysports.yahoo.com";
const BREAKING_NEWS_ALARM = "moodin-breaking-news";
const MAX_SEEN_ALERTS = 200;

function isApprovedBridgeEndpoint(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/api/fantasy/yahoo-extension" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function isApprovedYahooSender(sender) {
  try {
    return new URL(sender.url || "").origin === APPROVED_YAHOO_ORIGIN;
  } catch {
    return false;
  }
}

function isApprovedMoodinSender(sender) {
  try {
    const url = new URL(sender.url || "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/fantasy-football";
  } catch {
    return false;
  }
}

function isManualAlert(value) {
  return Boolean(
    value &&
    typeof value.id === "string" &&
    typeof value.playerId === "string" &&
    typeof value.headline === "string" &&
    typeof value.sourceLabel === "string" &&
    value.headline.length <= 1_000
  );
}

async function getBridgeEndpoint() {
  const stored = await chrome.storage.local.get(["bridgeEndpoint"]);
  return isApprovedBridgeEndpoint(stored.bridgeEndpoint)
    ? stored.bridgeEndpoint
    : DEFAULT_ENDPOINT;
}

function breakingNewsEndpoint(bridgeEndpoint) {
  const url = new URL(bridgeEndpoint);
  url.pathname = "/api/fantasy/breaking-news";
  return url.toString();
}

async function requestYahooInventoryScan() {
  const stored = await chrome.storage.local.get(["lastYahooTabId"]);
  if (!Number.isInteger(stored.lastYahooTabId)) {
    return { ok: false, error: "Open the Yahoo league once so Moodin can refresh inventory." };
  }
  try {
    return await chrome.tabs.sendMessage(stored.lastYahooTabId, { type: "MOODIN_SCAN_LEAGUE" });
  } catch {
    return { ok: false, error: "The saved Yahoo tab is no longer available. Open the league again." };
  }
}

async function showBreakingNotification(alert, scanResult) {
  const message = scanResult?.ok
    ? `${alert.sourceLabel}. Yahoo roster and free-agent inventory refreshed.`
    : `${alert.sourceLabel}. Open Yahoo to refresh roster availability.`;
  await chrome.notifications.create(`moodin-alert:${alert.id}`, {
    type: "basic",
    iconUrl: "icon.png",
    title: alert.headline.slice(0, 120),
    message: message.slice(0, 240),
    priority: 2,
    requireInteraction: true,
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setBadgeText({ text: "!" });
}

async function pollBreakingNews(options = {}) {
  const endpoint = breakingNewsEndpoint(await getBridgeEndpoint());
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Breaking-news watcher returned ${response.status}.`);
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.alerts)) throw new Error("Breaking-news watcher returned an invalid response.");
  const stored = await chrome.storage.local.get(["seenBreakingAlertIds", "breakingAlertsPrimed"]);
  const seen = new Set(Array.isArray(stored.seenBreakingAlertIds) ? stored.seenBreakingAlertIds : []);
  if (!stored.breakingAlertsPrimed && !options.notifyExisting) {
    await chrome.storage.local.set({
      breakingAlertsPrimed: true,
      seenBreakingAlertIds: payload.alerts.map((alert) => alert.id).slice(0, MAX_SEEN_ALERTS),
      lastBreakingNewsCheckAt: new Date().toISOString(),
      lastBreakingNewsResult: { ok: true, newAlertCount: 0, primed: true },
    });
    return { ok: true, newAlertCount: 0, primed: true };
  }
  const freshAlerts = payload.alerts.filter((alert) => typeof alert.id === "string" && !seen.has(alert.id));
  let scanResult = null;
  if (freshAlerts.some((alert) => alert.requiresYahooScan)) scanResult = await requestYahooInventoryScan();
  for (const alert of freshAlerts.slice().reverse()) {
    await showBreakingNotification(alert, scanResult);
    seen.add(alert.id);
  }
  const result = { ok: true, newAlertCount: freshAlerts.length, primed: true, scanResult };
  await chrome.storage.local.set({
    breakingAlertsPrimed: true,
    seenBreakingAlertIds: [...seen].slice(-MAX_SEEN_ALERTS),
    lastBreakingNewsCheckAt: new Date().toISOString(),
    lastBreakingNewsResult: result,
    lastBreakingAlert: freshAlerts[0] ?? null,
  });
  return result;
}

function scheduleBreakingNewsWatcher() {
  chrome.alarms.create(BREAKING_NEWS_ALARM, { delayInMinutes: 0.1, periodInMinutes: 10 });
}

chrome.runtime.onInstalled.addListener(scheduleBreakingNewsWatcher);
chrome.runtime.onStartup.addListener(scheduleBreakingNewsWatcher);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== BREAKING_NEWS_ALARM) return;
  pollBreakingNews().catch(async (error) => {
    await chrome.storage.local.set({
      lastBreakingNewsCheckAt: new Date().toISOString(),
      lastBreakingNewsResult: { ok: false, error: error instanceof Error ? error.message : String(error) },
    });
  });
});

async function forwardEnvelope(envelope) {
  const endpoint = await getBridgeEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  const body = (await response.text()).slice(0, 4_000);
  return { endpoint, ok: response.ok, status: response.status, body };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !isApprovedYahooSender(sender) ||
    !message ||
    message.type !== "MOODIN_YAHOO_ENVELOPE" ||
    !message.envelope
  ) {
    return false;
  }

  forwardEnvelope(message.envelope)
    .then(async (result) => {
      await chrome.storage.local.set({
        lastEnvelope: message.envelope,
        lastEnvelopeAt: new Date().toISOString(),
        lastBridgeResult: result,
        ...(sender.tab?.id ? { lastYahooTabId: sender.tab.id } : {}),
      });
      sendResponse(result);
    })
    .catch(async (error) => {
      const result = {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      await chrome.storage.local.set({ lastBridgeResult: result });
      sendResponse(result);
    });

  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "MOODIN_GET_BRIDGE_STATUS") {
    return false;
  }

  chrome.storage.local
    .get([
      "bridgeEndpoint",
      "lastEnvelope",
      "lastEnvelopeAt",
      "lastBridgeResult",
      "lastBreakingNewsCheckAt",
      "lastBreakingNewsResult",
      "lastBreakingAlert",
    ])
    .then((stored) =>
      sendResponse({
        endpoint: isApprovedBridgeEndpoint(stored.bridgeEndpoint)
          ? stored.bridgeEndpoint
          : DEFAULT_ENDPOINT,
        lastEnvelope: stored.lastEnvelope || null,
        lastEnvelopeAt: stored.lastEnvelopeAt || null,
        lastBridgeResult: stored.lastBridgeResult || null,
        lastBreakingNewsCheckAt: stored.lastBreakingNewsCheckAt || null,
        lastBreakingNewsResult: stored.lastBreakingNewsResult || null,
        lastBreakingAlert: stored.lastBreakingAlert || null,
      }),
    );
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "MOODIN_CHECK_BREAKING_NEWS") return false;
  pollBreakingNews().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isApprovedMoodinSender(sender) || !message || message.type !== "MOODIN_HANDLE_MANUAL_ALERT" || !isManualAlert(message.alert)) {
    return false;
  }
  requestYahooInventoryScan()
    .then(async (scanResult) => {
      await showBreakingNotification(message.alert, scanResult);
      await chrome.storage.local.set({
        lastBreakingAlert: message.alert,
        lastBreakingNewsCheckAt: new Date().toISOString(),
        lastBreakingNewsResult: { ok: true, newAlertCount: 1, manual: true, scanResult },
      });
      sendResponse({ ok: true, scanResult });
    })
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith("moodin-alert:")) return;
  getBridgeEndpoint().then((endpoint) => {
    const url = new URL(endpoint);
    url.pathname = "/fantasy-football";
    chrome.tabs.create({ url: url.toString() });
  });
  chrome.action.setBadgeText({ text: "" });
});

scheduleBreakingNewsWatcher();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "MOODIN_START_LEAGUE_SCAN") return false;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab?.id || !String(tab.url || "").startsWith(`${APPROVED_YAHOO_ORIGIN}/`)) {
      sendResponse({ ok: false, error: "Open the Yahoo league in the active tab first." });
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "MOODIN_SCAN_LEAGUE" }, sendResponse);
  }).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "MOODIN_SET_BRIDGE_ENDPOINT") {
    return false;
  }

  if (!isApprovedBridgeEndpoint(message.endpoint)) {
    sendResponse({ ok: false, error: "Use a localhost Moodin Yahoo bridge URL." });
    return false;
  }

  chrome.storage.local.set({ bridgeEndpoint: message.endpoint }).then(() => {
    sendResponse({ ok: true, endpoint: message.endpoint });
  });
  return true;
});
