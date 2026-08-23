const statusNode = document.querySelector("#status");
const endpointNode = document.querySelector("#endpoint");
const lastPageNode = document.querySelector("#last-page");
const lastSentNode = document.querySelector("#last-sent");
const inventoryNode = document.querySelector("#inventory");
const newsWatcherNode = document.querySelector("#news-watcher");

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "MOODIN_GET_BRIDGE_STATUS" }, (result) => {
    endpointNode.value = result?.endpoint || "";
    lastPageNode.textContent = result?.lastEnvelope?.page?.kind || "No Yahoo snapshot yet";
    lastSentNode.textContent = result?.lastEnvelopeAt || "—";
    const inventory = result?.lastEnvelope?.payload?.kind === "league-inventory"
      ? result.lastEnvelope.payload.inventory
      : null;
    inventoryNode.textContent = inventory
      ? `${inventory.players.length} players · ${inventory.coverage.partial ? "partial" : "complete"}`
      : "Not scanned";
    newsWatcherNode.textContent = result?.lastBreakingNewsCheckAt
      ? `${result.lastBreakingNewsResult?.ok ? "Active" : "Error"} · ${result.lastBreakingNewsCheckAt}`
      : "Waiting for first check";
    statusNode.textContent = result?.lastBridgeResult?.ok
      ? `Connected (${result.lastBridgeResult.status})`
      : result?.lastBridgeResult?.error || "Waiting for a Yahoo Fantasy page";
  });
}

document.querySelector("#save").addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { type: "MOODIN_SET_BRIDGE_ENDPOINT", endpoint: endpointNode.value.trim() },
    (result) => {
      statusNode.textContent = result?.ok ? "Endpoint saved" : result?.error || "Could not save";
      if (result?.ok) {
        refreshStatus();
      }
    },
  );
});

document.querySelector("#check-news").addEventListener("click", () => {
  statusNode.textContent = "Checking breaking news…";
  chrome.runtime.sendMessage({ type: "MOODIN_CHECK_BREAKING_NEWS" }, (result) => {
    statusNode.textContent = result?.ok
      ? `News checked (${result.newAlertCount ?? 0} new)`
      : result?.error || "News check failed";
    refreshStatus();
  });
});

document.querySelector("#scan").addEventListener("click", () => {
  statusNode.textContent = "Scanning Yahoo league…";
  chrome.runtime.sendMessage({ type: "MOODIN_START_LEAGUE_SCAN" }, (result) => {
    if (chrome.runtime.lastError) {
      statusNode.textContent = chrome.runtime.lastError.message;
      return;
    }
    statusNode.textContent = result?.ok
      ? `Scan complete (${result.result?.playerCount ?? 0} players)`
      : result?.error || "League scan failed";
    refreshStatus();
  });
});

refreshStatus();
