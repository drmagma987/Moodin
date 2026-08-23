(function exposeMoodinYahooExtractor(root, factory) {
  const extractor = factory();
  root.MoodinYahooExtractor = extractor;
  if (typeof module === "object" && module.exports) {
    module.exports = extractor;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildExtractor() {
  "use strict";

  const APPROVED_HOST = "football.fantasysports.yahoo.com";
  const PLAYER_LINK_SELECTOR =
    'a[data-ys-playerid][href*="sports.yahoo.com/nfl/players/"]';
  const LIVE_DRAFT_PATH_HINT = /^\/draftclient\/f1\/(\d+)\/(\d+)\/?$/i;
  const POSITION_PATTERN = /\b([A-Za-z]{2,3})\s*-\s*(QB|RB|WR|TE|K|DEF|DST)\b/i;
  const SAFE_QUERY_FIELDS = new Set([
    "pos",
    "sort",
    "sdir",
    "status",
    "eteam",
    "fteam",
    "stat1",
    "stat2",
    "jsenabled",
    "count",
    "myteam",
    "cut_type",
    "week",
  ]);

  function cleanText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function parsePositiveInteger(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function classifyYahooPage(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return { leagueId: null, teamId: null, pageType: "unknown" };
    }

    if (url.hostname !== APPROVED_HOST) {
      return { leagueId: null, teamId: null, pageType: "unknown" };
    }

    const liveDraftMatch = url.pathname.match(LIVE_DRAFT_PATH_HINT);
    if (liveDraftMatch) {
      return {
        leagueId: null,
        teamId: null,
        pageType: "draft-room",
        draftRoomId: liveDraftMatch[1],
        draftSlot: liveDraftMatch[2],
      };
    }

    const match = url.pathname.match(/^\/f1\/(\d+)(?:\/([^/]+))?\/?$/);
    const leagueId = match ? match[1] : null;
    const leaf = match ? match[2] || "" : "";

    if (leaf === "players") {
      return { leagueId, teamId: null, pageType: "players" };
    }
    if (leaf === "draft") {
      return { leagueId, teamId: null, pageType: "draft-overview" };
    }
    if (leaf === "mock_waiting") {
      return { leagueId, teamId: null, pageType: "draft-waiting-room" };
    }
    if (leaf === "transactions") {
      return { leagueId, teamId: null, pageType: "transactions" };
    }
    if (leaf === "teams") {
      return { leagueId, teamId: null, pageType: "managers" };
    }
    if (leaf === "playermatchups" || leaf === "matchup") {
      return { leagueId, teamId: null, pageType: "matchups" };
    }
    if (leaf === "research") {
      return { leagueId, teamId: null, pageType: "research" };
    }
    if (/^\d+$/.test(leaf)) {
      return { leagueId, teamId: leaf, pageType: "team-roster" };
    }
    if (match && !leaf) {
      return { leagueId, teamId: null, pageType: "league-home" };
    }

    return { leagueId, teamId: null, pageType: "unknown" };
  }

  function sanitizeYahooPageUrl(rawUrl) {
    const url = new URL(rawUrl);
    const sanitized = new URL(`${url.origin}${url.pathname}`);
    for (const [key, value] of url.searchParams) {
      if (SAFE_QUERY_FIELDS.has(key.toLowerCase())) {
        sanitized.searchParams.append(key, value.slice(0, 120));
      }
    }
    return sanitized.toString();
  }

  function findMyTeamId(document, leagueId, rawUrl) {
    if (!leagueId) {
      return null;
    }

    const expected = new RegExp(`^/f1/${leagueId}/(\\d+)/?$`);
    for (const link of document.querySelectorAll("a[href]")) {
      if (cleanText(link.textContent).toLowerCase() !== "my team") {
        continue;
      }
      try {
        const match = new URL(link.getAttribute("href"), rawUrl).pathname.match(expected);
        if (match) {
          return match[1];
        }
      } catch {
        // Ignore malformed links.
      }
    }

    return null;
  }

  function findRosterStatusCellIndex(table) {
    if (!table) {
      return -1;
    }

    for (const row of table.querySelectorAll("tr")) {
      const cells = Array.from(row.children).filter((cell) =>
        ["TH", "TD"].includes(cell.tagName),
      );
      const index = cells.findIndex(
        (cell) => cleanText(cell.textContent).toLowerCase() === "roster status",
      );
      if (index >= 0) {
        return index;
      }
    }

    return -1;
  }

  function normalizeAvailability(pageType, rosterStatusLabel) {
    if (pageType === "team-roster") {
      return "rostered";
    }

    const label = cleanText(rosterStatusLabel).toUpperCase();
    if (["FA", "W", "WA", "AVAILABLE"].includes(label)) {
      return "available";
    }
    if (label) {
      return "rostered";
    }
    return "unknown";
  }

  function extractPlayers(document, pageType, teamId) {
    const players = [];
    const seen = new Set();

    for (const link of document.querySelectorAll(PLAYER_LINK_SELECTOR)) {
      const yahooPlayerId = cleanText(link.getAttribute("data-ys-playerid"));
      const playerName = cleanText(link.getAttribute("title") || link.textContent);
      if (!/^\d+$/.test(yahooPlayerId) || !playerName || seen.has(yahooPlayerId)) {
        continue;
      }

      const row = link.closest("tr");
      const playerCell = link.closest("td");
      const identitySource = playerCell
        ? Array.from(playerCell.querySelectorAll("*")).map((node) => node.textContent).join(" ")
        : row?.textContent;
      const identityText = cleanText(identitySource);
      const identityMatch = identityText.match(POSITION_PATTERN);
      const table = row ? row.closest("table") : null;
      const statusIndex = findRosterStatusCellIndex(table);
      const cells = row
        ? Array.from(row.children).filter((cell) => ["TH", "TD"].includes(cell.tagName))
        : [];
      const rosterStatusLabel = statusIndex >= 0 ? cleanText(cells[statusIndex]?.textContent) : null;
      const availability = normalizeAvailability(pageType, rosterStatusLabel);

      players.push({
        providerPlayerId: yahooPlayerId,
        fullName: playerName.slice(0, 120),
        nflTeam: identityMatch ? identityMatch[1].toUpperCase() : null,
        positions: identityMatch
          ? [identityMatch[2].toUpperCase() === "DEF" ? "DST" : identityMatch[2].toUpperCase()]
          : [],
        availability,
        rosterStatusLabel: rosterStatusLabel ? rosterStatusLabel.slice(0, 80) : null,
        fantasyTeamId: availability === "rostered" && pageType === "team-roster" ? teamId : null,
      });
      seen.add(yahooPlayerId);
    }

    return players.slice(0, 500);
  }

  function extractLeagueTeamIds(document, leagueId, rawUrl) {
    if (!leagueId) return [];
    const pattern = new RegExp(`^/f1/${leagueId}/(\\d+)/?$`);
    const ids = new Set();
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        const match = new URL(link.getAttribute("href"), rawUrl).pathname.match(pattern);
        if (match) ids.add(match[1]);
      } catch {
        // Ignore malformed links.
      }
    }
    return Array.from(ids).slice(0, 32);
  }

  function firstText(document, selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = cleanText(node?.textContent);
      if (text) {
        return text.slice(0, 160);
      }
    }
    return null;
  }

  function collectLiveDraftSemanticSignals(document) {
    const selector = [
      "[data-testid]",
      "[data-test-id]",
      "[data-player-id]",
      "[data-playerid]",
      "[data-ys-playerid]",
      "[aria-label]",
      "[role]",
    ].join(",");
    const signals = [];
    const seen = new Set();

    for (const node of document.querySelectorAll(selector)) {
      for (const attribute of Array.from(node.attributes || [])) {
        if (!/^(data-testid|data-test-id|data-player-id|data-playerid|data-ys-playerid|aria-label|role)$/.test(attribute.name)) {
          continue;
        }
        const value = cleanText(attribute.value);
        if (!/(draft|pick|clock|player|roster|available|round|team)/i.test(value)) {
          continue;
        }
        const signal = `${attribute.name}=${value}`.slice(0, 120);
        if (!seen.has(signal)) {
          signals.push(signal);
          seen.add(signal);
        }
        if (signals.length >= 20) {
          return signals;
        }
      }
    }

    const structuralCounts = [
      `frames=${document.querySelectorAll("iframe").length}`,
      `canvases=${document.querySelectorAll("canvas").length}`,
      `shadow-hosts=${Array.from(document.querySelectorAll("*")).filter((node) => Boolean(node.shadowRoot)).length}`,
    ];
    for (const signal of structuralCounts) {
      signals.push(signal);
    }

    const relevantTextPattern =
      /\b(on the clock|your turn|pick(?:\s+|\s*#)\d+|round\s+\d+|available players|draft results|draft board)\b/i;
    for (const node of document.querySelectorAll("h1,h2,h3,h4,h5,h6,button,[role],div,span,li")) {
      const text = cleanText(node.textContent);
      if (!text || text.length > 180 || !relevantTextPattern.test(text)) {
        continue;
      }
      const id = cleanText(node.id);
      const classes = Array.from(node.classList || []).slice(0, 5).join(".");
      const signal = `text-node:${node.tagName.toLowerCase()}${id ? `#${id}` : ""}${classes ? `.${classes}` : ""}=${text}`.slice(0, 120);
      if (!seen.has(signal)) {
        signals.push(signal);
        seen.add(signal);
      }
      if (signals.length >= 20) {
        break;
      }
    }

    return signals.slice(0, 20);
  }

  function parseDraftPickNode(node) {
    const playerLink = node.querySelector(PLAYER_LINK_SELECTOR);
    const playerName = cleanText(playerLink?.getAttribute("title") || playerLink?.textContent);
    if (!playerName) {
      return null;
    }

    const overallPick = parsePositiveInteger(
      node.getAttribute("data-overall-pick") || node.getAttribute("data-pick"),
    );
    return {
      overallPick: overallPick || undefined,
      teamId: cleanText(node.getAttribute("data-team-id")) || undefined,
      teamLabel: cleanText(node.getAttribute("data-team-name")) || undefined,
      playerName: playerName.slice(0, 120),
      yahooPlayerId: cleanText(playerLink.getAttribute("data-ys-playerid")) || undefined,
    };
  }

  function extractDraftState(document, players, pageType) {
    if (pageType !== "draft-room") {
      return null;
    }

    const pickNodes = document.querySelectorAll(
      '[data-test-id="draft-pick"], [data-testid="draft-pick"], [data-ys-draft-pick]',
    );
    const picks = Array.from(pickNodes)
      .map(parseDraftPickNode)
      .filter(Boolean)
      .slice(0, 300);
    const currentPickText = firstText(document, [
      '[data-test-id="current-pick"]',
      '[data-testid="current-pick"]',
      '[data-ys-current-pick]',
    ]);
    const currentTeamText = firstText(document, [
      '[data-test-id="team-on-clock"]',
      '[data-testid="team-on-clock"]',
      '[data-ys-team-on-clock]',
    ]);

    return {
      roomId: null,
      userSlot: null,
      currentPick: currentPickText
        ? parsePositiveInteger(currentPickText.match(/\d+/)?.[0])
        : null,
      currentPickText,
      currentTeamId: null,
      currentTeamLabel: currentTeamText,
      picks,
      availablePlayers: players.filter((player) => player.availability === "available"),
      selectorConfidence: "provisional",
    };
  }

  function extractYahooSnapshot(document, rawUrl) {
    const page = classifyYahooPage(rawUrl);
    if (page.pageType === "unknown") {
      throw new Error("Yahoo extraction is allowed only on approved league pages.");
    }

    const myTeamId = page.teamId || findMyTeamId(document, page.leagueId, rawUrl);
    const players = extractPlayers(document, page.pageType, page.teamId || myTeamId);
    const draft = extractDraftState(document, players, page.pageType);
    if (draft && page.draftRoomId) {
      draft.roomId = page.draftRoomId;
      draft.userSlot = page.draftSlot || null;
    }
    const verifiedPlayerMarkup = document.querySelector(PLAYER_LINK_SELECTOR) !== null;
    const liveDraftSemanticSignals =
      page.pageType === "draft-room" ? collectLiveDraftSemanticSignals(document) : [];

    return {
      snapshot: {
        schemaVersion: 1,
        source: "yahoo-browser",
        leagueId: page.leagueId,
        teamId: myTeamId,
        pageType: page.pageType,
        players,
        draft,
      },
      diagnostics: {
        deterministicSignals: [
          ...(page.leagueId ? ["league-id-from-url"] : []),
          ...(myTeamId ? ["team-id-from-my-team-link-or-url"] : []),
          ...(verifiedPlayerMarkup
            ? ["player-id-from-data-ys-playerid", "player-identity-from-visible-row"]
            : []),
        ],
        provisionalSignals:
          page.pageType === "draft-room"
            ? ["live-draft-selectors", ...liveDraftSemanticSignals]
            : [],
        unavailableSignals:
          page.pageType === "draft-room"
            ? []
            : ["live-draft-current-pick", "live-draft-current-team", "live-draft-pick-history"],
        unsupportedActions: ["add-drop", "trade", "draft-pick"],
      },
    };
  }

  return {
    APPROVED_HOST,
    PLAYER_LINK_SELECTOR,
    classifyYahooPage,
    sanitizeYahooPageUrl,
    extractYahooSnapshot,
    extractLeagueTeamIds,
  };
});
