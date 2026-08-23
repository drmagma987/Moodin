(function moodinYahooBridgeContentScript() {
  "use strict";

  const extractor = globalThis.MoodinYahooExtractor;
  if (!extractor) {
    return;
  }

  let lastSnapshotSignature = "";
  let pendingTimer = null;

  function emitSnapshot() {
    let extraction;
    try {
      extraction = extractor.extractYahooSnapshot(document, window.location.href);
    } catch {
      return;
    }
    const signature = JSON.stringify(extraction.snapshot);

    if (signature === lastSnapshotSignature) {
      return;
    }

    lastSnapshotSignature = signature;
    chrome.runtime.sendMessage(
      {
        type: "MOODIN_YAHOO_ENVELOPE",
        envelope: {
          version: 1,
          emittedAt: new Date().toISOString(),
          provider: "yahoo-browser-extension",
          page: {
            url: extractor.sanitizeYahooPageUrl(window.location.href),
            title: document.title.slice(0, 200),
            kind: extraction.snapshot.pageType,
            leagueId: extraction.snapshot.leagueId,
          },
          payload: {
            kind: "state-snapshot",
            snapshot: extraction.snapshot,
            diagnostics: extraction.diagnostics,
          },
        },
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  }

  function scheduleSnapshot() {
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer);
    }

    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      emitSnapshot();
    }, 800);
  }

  async function fetchYahooDocument(url) {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`${new URL(url).pathname} returned ${response.status}`);
    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function mergePlayer(target, player) {
    const existing = target.get(player.providerPlayerId);
    if (!existing || (existing.availability === "unknown" && player.availability !== "unknown")) {
      target.set(player.providerPlayerId, player);
    }
  }

  async function scanAvailablePosition(leagueId, position, players, coverage, errors) {
    const seenPageIds = new Set();
    for (let count = 0; count < 500; count += 25) {
      const url = `https://football.fantasysports.yahoo.com/f1/${leagueId}/players?status=A&pos=${position}&count=${count}`;
      try {
        const pageDocument = await fetchYahooDocument(url);
        coverage.pagesFetched += 1;
        const extraction = extractor.extractYahooSnapshot(pageDocument, url);
        const pageIds = extraction.snapshot.players.map((player) => player.providerPlayerId);
        const signature = pageIds.join(",");
        if (pageIds.length === 0 || seenPageIds.has(signature)) break;
        seenPageIds.add(signature);
        for (const player of extraction.snapshot.players) mergePlayer(players, player);
        if (pageIds.length < 25) break;
      } catch (error) {
        errors.push(`${position} availability: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
        return false;
      }
    }
    coverage.availablePositions.push(position);
    return true;
  }

  async function scanLeagueInventory() {
    const startedAt = new Date().toISOString();
    const current = extractor.extractYahooSnapshot(document, window.location.href);
    const leagueId = current.snapshot.leagueId;
    const myTeamId = current.snapshot.teamId;
    if (!leagueId || !myTeamId) throw new Error("Open an authenticated Yahoo league page with a visible My Team link first.");
    const players = new Map();
    const errors = [];
    const coverage = { myRosterCaptured: false, availablePositions: [], teamRosterIds: [], pagesFetched: 0, partial: false, errors };

    try {
      const rosterUrl = `https://football.fantasysports.yahoo.com/f1/${leagueId}/${myTeamId}`;
      const rosterDocument = await fetchYahooDocument(rosterUrl);
      coverage.pagesFetched += 1;
      const roster = extractor.extractYahooSnapshot(rosterDocument, rosterUrl);
      for (const player of roster.snapshot.players) mergePlayer(players, player);
      coverage.myRosterCaptured = roster.snapshot.players.length > 0;
      if (!coverage.myRosterCaptured) errors.push("My Team page returned no player rows.");
    } catch (error) {
      errors.push(`My roster: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
    }

    let teamIds = [];
    try {
      const managersUrl = `https://football.fantasysports.yahoo.com/f1/${leagueId}/teams`;
      const managersDocument = await fetchYahooDocument(managersUrl);
      coverage.pagesFetched += 1;
      teamIds = extractor.extractLeagueTeamIds(managersDocument, leagueId, managersUrl);
      if (teamIds.length === 0) errors.push("Managers page exposed no team roster links.");
    } catch (error) {
      errors.push(`League teams: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
    }

    for (const teamId of teamIds) {
      try {
        const teamUrl = `https://football.fantasysports.yahoo.com/f1/${leagueId}/${teamId}`;
        const teamDocument = await fetchYahooDocument(teamUrl);
        coverage.pagesFetched += 1;
        const team = extractor.extractYahooSnapshot(teamDocument, teamUrl);
        for (const player of team.snapshot.players) mergePlayer(players, player);
        if (team.snapshot.players.length > 0) coverage.teamRosterIds.push(teamId);
      } catch (error) {
        errors.push(`Team ${teamId}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
      }
    }

    for (const position of ["QB", "RB", "WR", "TE"]) {
      await scanAvailablePosition(leagueId, position, players, coverage, errors);
    }
    coverage.partial = !coverage.myRosterCaptured || coverage.availablePositions.length < 4 || errors.length > 0;
    const leagueUrl = `https://football.fantasysports.yahoo.com/f1/${leagueId}`;
    const envelope = {
      version: 1,
      emittedAt: new Date().toISOString(),
      provider: "yahoo-browser-extension",
      page: { url: leagueUrl, title: document.title.slice(0, 200), kind: "league-home", leagueId },
      payload: {
        kind: "league-inventory",
        inventory: { schemaVersion: 1, source: "yahoo-browser", leagueId, myTeamId, startedAt, completedAt: new Date().toISOString(), players: Array.from(players.values()).slice(0, 750), coverage },
        diagnostics: {
          deterministicSignals: ["my-roster-from-team-page", "league-rosters-from-team-pages", "available-players-from-status-a"],
          provisionalSignals: [],
          unavailableSignals: coverage.partial ? ["complete-league-inventory"] : [],
          unsupportedActions: ["add-drop", "trade", "draft-pick"],
        },
      },
    };
    const result = await chrome.runtime.sendMessage({ type: "MOODIN_YAHOO_ENVELOPE", envelope });
    return { ...result, playerCount: envelope.payload.inventory.players.length, coverage };
  }

  emitSnapshot();

  const observer = new MutationObserver(scheduleSnapshot);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "MOODIN_SCAN_LEAGUE") return false;
    scanLeagueInventory()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
})();
