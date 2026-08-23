import type { PlayerPosition, ProposedTransaction } from "@/lib/fantasy/types";
import type { YahooDraftRawEvent } from "@/lib/fantasy/yahooDraft";

export type YahooFantasyPageKind =
  | "draft-room"
  | "draft-overview"
  | "draft-waiting-room"
  | "players"
  | "team-roster"
  | "transactions"
  | "managers"
  | "league-home"
  | "matchups"
  | "research"
  | "unknown";

export type YahooUrlStability = "stable" | "fragile" | "unknown";

export type YahooUrlInteraction =
  | "read-only-navigation"
  | "manual-action-landing"
  | "unknown";

export type YahooUrlInspection = {
  url: string;
  host: string;
  path: string;
  leagueId: string | null;
  teamPageId: string | null;
  pageKind: YahooFantasyPageKind;
  stability: YahooUrlStability;
  interaction: YahooUrlInteraction;
  supportedActions: Array<"draft-sync" | "add-drop" | "trade-proposal">;
  parameterizedFields: string[];
  notes: string[];
};

export type YahooActionHandoffPlan = {
  supported: boolean;
  transactionKind: ProposedTransaction["kind"];
  interaction: YahooUrlInteraction;
  landingUrl: string | null;
  completion: "manual-in-yahoo" | "unsupported";
  notes: string[];
};

export type YahooExtensionEnvelope = {
  version: 1;
  emittedAt: string;
  provider: "yahoo-browser-extension";
  page: {
    url: string;
    title: string;
    kind: YahooFantasyPageKind;
    leagueId: string | null;
  };
  payload:
    | YahooExtensionStateSnapshotPayload
    | YahooLeagueInventoryPayload
    | {
        kind: "draft-sync";
        currentPickText: string | null;
        roundText: string | null;
        teamOnClockText: string | null;
        recentPickTexts: string[];
        events: YahooDraftRawEvent[];
      }
    | {
        kind: "page-probe";
        currentPickText: string | null;
        roundText: string | null;
        teamOnClockText: string | null;
        recentPickTexts: string[];
        headings: string[];
        selectorMatches: Record<string, string[]>;
      };
};

export type YahooSnapshotPlayer = {
  providerPlayerId: string;
  fullName: string;
  nflTeam: string | null;
  positions: string[];
  availability: "available" | "rostered" | "unknown";
  rosterStatusLabel: string | null;
  fantasyTeamId: string | null;
};

export type YahooProviderNeutralSnapshot = {
  schemaVersion: 1;
  source: "yahoo-browser";
  leagueId: string | null;
  teamId: string | null;
  pageType: YahooFantasyPageKind;
  players: YahooSnapshotPlayer[];
  draft: null | {
    roomId: string | null;
    userSlot: string | null;
    currentPick: number | null;
    currentPickText: string | null;
    currentTeamId: string | null;
    currentTeamLabel: string | null;
    picks: YahooDraftRawEvent[];
    availablePlayers: YahooSnapshotPlayer[];
    selectorConfidence: "provisional" | "verified";
  };
};

export type YahooExtensionDiagnostics = {
  deterministicSignals: string[];
  provisionalSignals: string[];
  unavailableSignals: string[];
  unsupportedActions: string[];
};

export type YahooExtensionStateSnapshotPayload = {
  kind: "state-snapshot";
  snapshot: YahooProviderNeutralSnapshot;
  diagnostics: YahooExtensionDiagnostics;
};

export type YahooLeagueInventoryCoverage = {
  myRosterCaptured: boolean;
  availablePositions: PlayerPosition[];
  teamRosterIds: string[];
  pagesFetched: number;
  partial: boolean;
  errors: string[];
};

export type YahooLeagueInventorySnapshot = {
  schemaVersion: 1;
  source: "yahoo-browser";
  leagueId: string;
  myTeamId: string;
  startedAt: string;
  completedAt: string;
  players: YahooSnapshotPlayer[];
  coverage: YahooLeagueInventoryCoverage;
};

export type YahooLeagueInventoryPayload = {
  kind: "league-inventory";
  inventory: YahooLeagueInventorySnapshot;
  diagnostics: YahooExtensionDiagnostics;
};

export type YahooExtensionPreviewResult = {
  inspection: YahooUrlInspection;
  payloadKind: YahooExtensionEnvelope["payload"]["kind"];
  recentPickCount: number;
  currentPickText: string | null;
  roundText: string | null;
  teamOnClockText: string | null;
  recentPickTexts: string[];
  nextStep: string;
};

export type YahooExtensionEnvelopeComparison = {
  samePage: boolean;
  emittedAtOrder: "newer" | "same" | "older" | "unknown";
  staleLikely: boolean;
  extractedEventCount: number;
  previousExtractedEventCount: number;
  incrementalEvents: YahooDraftRawEvent[];
  duplicateEventCount: number;
  notes: string[];
};

type YahooPlayersListUrlOptions = {
  leagueId: string;
  position?: PlayerPosition | "ALL" | "W/R/T";
  status?: "ALL" | "FA" | "W" | "T";
  catType?: "S_S";
};

const YAHOO_FANTASY_HOST_PATTERN =
  /^(football|baseball|basketball|hockey)\.fantasysports\.yahoo\.com$/;

function normalizePosition(position?: PlayerPosition | "ALL" | "W/R/T") {
  return position ?? "ALL";
}

function normalizeEventName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildYahooDraftEventIdentity(event: YahooDraftRawEvent) {
  return [
    event.overallPick ?? "",
    event.teamId ?? event.teamLabel ?? "",
    event.yahooPlayerId ?? "",
    normalizeEventName(event.playerName),
    event.team ?? "",
    event.position ?? "",
  ].join("|");
}

export function buildYahooPlayersListUrl(options: YahooPlayersListUrlOptions) {
  const url = new URL(`https://football.fantasysports.yahoo.com/f1/${options.leagueId}/players`);
  const position = normalizePosition(options.position);

  if (position !== "ALL") {
    url.searchParams.set("pos", position);
  }

  if (options.status) {
    url.searchParams.set("status", options.status);
  }

  if (options.catType) {
    url.searchParams.set("cat_type", options.catType);
  }

  return url.toString();
}

export function buildYahooManagersUrl(leagueId: string) {
  return `https://football.fantasysports.yahoo.com/f1/${leagueId}/teams`;
}

export function buildYahooTransactionsUrl(leagueId: string) {
  return `https://football.fantasysports.yahoo.com/f1/${leagueId}/transactions`;
}

export function inspectYahooFantasyUrl(rawUrl: string): YahooUrlInspection {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      host: "",
      path: "",
      leagueId: null,
      teamPageId: null,
      pageKind: "unknown",
      stability: "unknown",
      interaction: "unknown",
      supportedActions: [],
      parameterizedFields: [],
      notes: ["Invalid URL."],
    };
  }

  if (!YAHOO_FANTASY_HOST_PATTERN.test(parsed.host)) {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId: null,
      teamPageId: null,
      pageKind: "unknown",
      stability: "unknown",
      interaction: "unknown",
      supportedActions: [],
      parameterizedFields: [],
      notes: ["Not a Yahoo fantasy sport host."],
    };
  }

  const leagueScopedMatch = parsed.pathname.match(/^\/f1\/(\d+)(?:\/([^/]+))?$/);
  const leagueId = leagueScopedMatch?.[1] ?? null;
  const leaf = leagueScopedMatch?.[2] ?? "";
  const teamPageId = leaf && /^\d+$/.test(leaf) ? leaf : null;

  if (leagueScopedMatch && !leaf) {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "league-home",
      stability: "stable",
      interaction: "read-only-navigation",
      supportedActions: [],
      parameterizedFields: [],
      notes: ["League home is a stable navigation target, but not an action initiator."],
    };
  }

  if (leagueScopedMatch && leaf === "players") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "players",
      stability: "stable",
      interaction: "manual-action-landing",
      supportedActions: ["add-drop"],
      parameterizedFields: [
        "pos",
        "sort",
        "sdir",
        "status",
        "eteam",
        "fteam",
        "stat1",
        "jsenabled",
      ],
      notes: [
        "Yahoo Help documents add/drop from the Player List page.",
        "Observed player-list URLs show the page is strongly parameterized by filter and sort state.",
        "No stable one-click player-specific add/drop query contract is verified yet.",
      ],
    };
  }

  if (leagueScopedMatch && leaf === "draft") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "draft-overview",
      stability: "stable",
      interaction: "read-only-navigation",
      supportedActions: [],
      parameterizedFields: [],
      notes: [
        "League Draft Central is a stable overview and research page.",
        "It is not the live private draft room and does not expose current-pick state.",
      ],
    };
  }

  if (leagueScopedMatch && leaf === "transactions") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "transactions",
      stability: "stable",
      interaction: "read-only-navigation",
      supportedActions: [],
      parameterizedFields: [],
      notes: ["Transactions is stable for history and reconciliation, not action initiation."],
    };
  }

  if (leagueScopedMatch && leaf === "teams") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "managers",
      stability: "stable",
      interaction: "manual-action-landing",
      supportedActions: ["trade-proposal"],
      parameterizedFields: [],
      notes: [
        "Yahoo Help says trade proposals start by choosing a team, then using Propose Trade.",
        "A direct team-page or prefilled trade URL is still unverified.",
      ],
    };
  }

  if (leagueScopedMatch && leaf === "playermatchups") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "matchups",
      stability: "stable",
      interaction: "read-only-navigation",
      supportedActions: [],
      parameterizedFields: ["pos", "status", "tab"],
      notes: ["Useful for read-only research. Team-slot status filtering appears URL-driven."],
    };
  }

  if (parsed.pathname === "/f1/draft") {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId: null,
      teamPageId: null,
      pageKind: "research",
      stability: "stable",
      interaction: "read-only-navigation",
      supportedActions: [],
      parameterizedFields: [],
      notes: ["Draft Central is stable, but it is not the live private draft-room contract."],
    };
  }

  if (parsed.pathname.includes("draft")) {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId: null,
      pageKind: "draft-room",
      stability: "fragile",
      interaction: "manual-action-landing",
      supportedActions: ["draft-sync"],
      parameterizedFields: [],
      notes: [
        "Draft participation is officially supported, but a stable private live-room URL pattern is not yet verified.",
        "Use DOM extraction only from pages the signed-in user can already open.",
      ],
    };
  }

  if (leagueScopedMatch && teamPageId) {
    return {
      url: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      leagueId,
      teamPageId,
      pageKind: "team-roster",
      stability: "stable",
      interaction: "manual-action-landing",
      supportedActions: ["add-drop"],
      parameterizedFields: [],
      notes: [
        "Numeric league-scoped team paths appear to represent a team roster homepage.",
        "Treat this as a stable landing page for roster review and manual drop-side work.",
        "Direct parameterized drop or trade-initiation URLs are still unverified.",
      ],
    };
  }

  return {
    url: rawUrl,
    host: parsed.host,
    path: parsed.pathname,
    leagueId,
    teamPageId,
    pageKind: "unknown",
    stability: "unknown",
    interaction: "unknown",
    supportedActions: [],
    parameterizedFields: [],
    notes: ["Pattern not classified yet."],
  };
}

function preferredLandingPosition(transaction: ProposedTransaction): PlayerPosition | "ALL" {
  if (transaction.kind !== "add-drop" || transaction.add.length === 0) {
    return "ALL";
  }

  const firstPosition = transaction.add[0]?.positions?.[0];
  return firstPosition ?? "ALL";
}

export function buildYahooActionHandoffPlan(
  transaction: ProposedTransaction,
  leagueId: string,
): YahooActionHandoffPlan {
  if (transaction.kind === "add-drop") {
    const position = preferredLandingPosition(transaction);
    const landingUrl = buildYahooPlayersListUrl({
      leagueId,
      position,
      status: "ALL",
      catType: "S_S",
    });

    return {
      supported: true,
      transactionKind: transaction.kind,
      interaction: "manual-action-landing",
      landingUrl,
      completion: "manual-in-yahoo",
      notes: [
        "Land on the Player List with a position filter and finish the add/drop in Yahoo.",
        "Treat this as human-in-the-loop until a stable action URL or official write path is verified.",
      ],
    };
  }

  const landingUrl = buildYahooManagersUrl(leagueId);

  return {
    supported: true,
    transactionKind: transaction.kind,
    interaction: "manual-action-landing",
    landingUrl,
    completion: "manual-in-yahoo",
    notes: [
      "Land on the Managers page, navigate to the counterparty team, then use Yahoo's Propose Trade flow.",
      "No parameterized, prefilled Yahoo trade URL is verified yet.",
    ],
  };
}

export function extractYahooDraftEventsFromEnvelope(
  envelope: YahooExtensionEnvelope,
): YahooDraftRawEvent[] {
  if (envelope.payload.kind === "draft-sync") {
    return envelope.payload.events;
  }
  if (envelope.payload.kind === "state-snapshot") {
    return envelope.payload.snapshot.draft?.picks ?? [];
  }
  return [];
}

export function buildYahooExtensionPreview(
  envelope: YahooExtensionEnvelope,
): YahooExtensionPreviewResult {
  const inspection = inspectYahooFantasyUrl(envelope.page.url);
  const events = extractYahooDraftEventsFromEnvelope(envelope);
  if (envelope.payload.kind === "league-inventory") {
    return {
      inspection,
      payloadKind: envelope.payload.kind,
      recentPickCount: 0,
      currentPickText: null,
      roundText: null,
      teamOnClockText: null,
      recentPickTexts: [],
      nextStep: envelope.payload.inventory.coverage.partial
        ? "Inventory scan is partial; resolve coverage errors before using it for add/drop advice."
        : "League inventory is ready for roster and free-agent matching.",
    };
  }
  const snapshotDraft =
    envelope.payload.kind === "state-snapshot" ? envelope.payload.snapshot.draft : null;
  const currentPickText =
    envelope.payload.kind === "state-snapshot"
      ? snapshotDraft?.currentPickText ?? null
      : envelope.payload.currentPickText;
  const roundText =
    envelope.payload.kind === "state-snapshot" ? null : envelope.payload.roundText;
  const teamOnClockText =
    envelope.payload.kind === "state-snapshot"
      ? snapshotDraft?.currentTeamLabel ?? null
      : envelope.payload.teamOnClockText;
  const recentPickTexts =
    envelope.payload.kind === "state-snapshot"
      ? events.map((event) =>
          [event.overallPick ? `Pick ${event.overallPick}` : "Pick", event.playerName]
            .filter(Boolean)
            .join(" "),
        )
      : envelope.payload.recentPickTexts;

  return {
    inspection,
    payloadKind: envelope.payload.kind,
    recentPickCount: events.length,
    currentPickText,
    roundText,
    teamOnClockText,
    recentPickTexts: recentPickTexts.slice(0, 8),
    nextStep:
      envelope.payload.kind === "draft-sync" || snapshotDraft
        ? "Map validated events into the live War Room or manual importer."
        : envelope.payload.kind === "state-snapshot"
          ? "Use the validated roster/player snapshot now; live draft fields remain unavailable until a draft room is open."
          : "Use the probe output to finalize deterministic Yahoo selectors before enabling live sync.",
  };
}

function getEmittedAtOrder(previous: YahooExtensionEnvelope, next: YahooExtensionEnvelope) {
  const previousTime = Date.parse(previous.emittedAt);
  const nextTime = Date.parse(next.emittedAt);

  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) {
    return "unknown" as const;
  }

  if (nextTime > previousTime) {
    return "newer" as const;
  }

  if (nextTime < previousTime) {
    return "older" as const;
  }

  return "same" as const;
}

export function compareYahooExtensionEnvelopes(
  previous: YahooExtensionEnvelope,
  next: YahooExtensionEnvelope,
): YahooExtensionEnvelopeComparison {
  const previousEvents = extractYahooDraftEventsFromEnvelope(previous);
  const nextEvents = extractYahooDraftEventsFromEnvelope(next);
  const previousIds = new Set(previousEvents.map(buildYahooDraftEventIdentity));
  const incrementalEvents = nextEvents.filter((event) => !previousIds.has(buildYahooDraftEventIdentity(event)));
  const duplicateEventCount = nextEvents.length - incrementalEvents.length;
  const emittedAtOrder = getEmittedAtOrder(previous, next);
  const samePage = previous.page.url === next.page.url;
  const notes: string[] = [];
  let staleLikely = false;

  if (!samePage) {
    notes.push("Page URL changed between snapshots, so the comparison may be cross-context.");
  }

  if (emittedAtOrder === "older") {
    staleLikely = true;
    notes.push("The new envelope is older than the previous snapshot by emittedAt timestamp.");
  } else if (emittedAtOrder === "same") {
    notes.push("Both envelopes share the same emittedAt timestamp.");
  }

  if (
    samePage &&
    previous.payload.kind === "draft-sync" &&
    next.payload.kind === "draft-sync" &&
    nextEvents.length < previousEvents.length
  ) {
    staleLikely = true;
    notes.push("Draft-sync event count moved backward on the same page.");
  }

  if (
    samePage &&
    previous.payload.kind === "draft-sync" &&
    next.payload.kind === "draft-sync" &&
    incrementalEvents.length === 0 &&
    nextEvents.length === previousEvents.length
  ) {
    notes.push("No new draft events were detected compared with the previous snapshot.");
  }

  if (
    next.payload.kind === "page-probe" &&
    next.payload.recentPickTexts.length === 0
  ) {
    notes.push("This page-probe envelope did not expose recent pick text yet.");
  }

  return {
    samePage,
    emittedAtOrder,
    staleLikely,
    extractedEventCount: nextEvents.length,
    previousExtractedEventCount: previousEvents.length,
    incrementalEvents,
    duplicateEventCount,
    notes,
  };
}

export const yahooExtensionFixtureEnvelope: YahooExtensionEnvelope = {
  version: 1,
  emittedAt: "2026-08-12T20:15:00-04:00",
  provider: "yahoo-browser-extension",
  page: {
    url: "https://football.fantasysports.yahoo.com/f1/750909/draftclient",
    title: "Yahoo Sports Fantasy Football Draft",
    kind: "draft-room",
    leagueId: "750909",
  },
  payload: {
    kind: "draft-sync",
    currentPickText: "Pick 3",
    roundText: "Round 1",
    teamOnClockText: "Team 3",
    recentPickTexts: [
      "Pick 1 Jahmyr Gibbs DET RB",
      "Pick 2 Bijan Robinson ATL RB",
    ],
    events: [
      {
        overallPick: 1,
        teamId: "team-1",
        playerName: "Jahmyr Gibbs",
        yahooPlayerId: "40059",
        team: "DET",
        position: "RB",
        pickedAt: "2026-08-12T20:11:00-04:00",
      },
      {
        overallPick: 2,
        teamId: "team-2",
        playerName: "Bijan Robinson",
        yahooPlayerId: "33186",
        team: "ATL",
        position: "RB",
        pickedAt: "2026-08-12T20:12:10-04:00",
      },
    ],
  },
};

export function isYahooExtensionEnvelope(value: unknown): value is YahooExtensionEnvelope {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "emittedAt", "provider", "page", "payload"])) {
    return false;
  }

  if (
    value.version !== 1 ||
    value.provider !== "yahoo-browser-extension" ||
    !isShortString(value.emittedAt, 80) ||
    !Number.isFinite(Date.parse(value.emittedAt))
  ) {
    return false;
  }

  if (
    !isRecord(value.page) ||
    !hasOnlyKeys(value.page, ["url", "title", "kind", "leagueId"]) ||
    !isShortString(value.page.url, 2_000) ||
    !isApprovedYahooUrl(value.page.url) ||
    !isShortString(value.page.title, 200) ||
    !isYahooPageKind(value.page.kind) ||
    !(value.page.leagueId === null || isId(value.page.leagueId))
  ) {
    return false;
  }

  if (!isRecord(value.payload)) {
    return false;
  }

  if (value.payload.kind === "state-snapshot") {
    return (
      hasOnlyKeys(value.payload, ["kind", "snapshot", "diagnostics"]) &&
      isYahooSnapshot(value.payload.snapshot, value.page.kind, value.page.leagueId) &&
      isDiagnostics(value.payload.diagnostics)
    );
  }

  if (value.payload.kind === "league-inventory") {
    return (
      hasOnlyKeys(value.payload, ["kind", "inventory", "diagnostics"]) &&
      isYahooLeagueInventory(value.payload.inventory, value.page.leagueId) &&
      isDiagnostics(value.payload.diagnostics)
    );
  }

  if (value.payload.kind === "draft-sync") {
    return (
      hasOnlyKeys(value.payload, [
        "kind",
        "currentPickText",
        "roundText",
        "teamOnClockText",
        "recentPickTexts",
        "events",
      ]) &&
      isNullableShortString(value.payload.currentPickText, 160) &&
      isNullableShortString(value.payload.roundText, 160) &&
      isNullableShortString(value.payload.teamOnClockText, 160) &&
      isStringArray(value.payload.recentPickTexts, 50, 300) &&
      Array.isArray(value.payload.events) &&
      value.payload.events.length <= 300 &&
      value.payload.events.every(isDraftEvent)
    );
  }

  if (value.payload.kind === "page-probe") {
    return (
      hasOnlyKeys(value.payload, [
        "kind",
        "currentPickText",
        "roundText",
        "teamOnClockText",
        "recentPickTexts",
        "headings",
        "selectorMatches",
      ]) &&
      isNullableShortString(value.payload.currentPickText, 160) &&
      isNullableShortString(value.payload.roundText, 160) &&
      isNullableShortString(value.payload.teamOnClockText, 160) &&
      isStringArray(value.payload.recentPickTexts, 50, 300) &&
      isStringArray(value.payload.headings, 30, 300) &&
      isRecord(value.payload.selectorMatches) &&
      Object.keys(value.payload.selectorMatches).length <= 30 &&
      Object.values(value.payload.selectorMatches).every((entry) =>
        isStringArray(entry, 50, 300),
      )
    );
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNullableShortString(value: unknown, maxLength: number) {
  return value === null || isShortString(value, maxLength);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function isApprovedYahooUrl(value: string) {
  try {
    const parsed = new URL(value);
    const safeQueryFields = new Set([
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
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "football.fantasysports.yahoo.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hash === "" &&
      Array.from(parsed.searchParams.keys()).every((key) =>
        safeQueryFields.has(key.toLowerCase()),
      )
    );
  } catch {
    return false;
  }
}

function isYahooPageKind(value: unknown): value is YahooFantasyPageKind {
  return [
    "draft-room",
    "draft-overview",
    "draft-waiting-room",
    "players",
    "team-roster",
    "transactions",
    "managers",
    "league-home",
    "matchups",
    "research",
    "unknown",
  ].includes(String(value));
}

function isStringArray(value: unknown, maxItems: number, maxLength: number) {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((entry) => isShortString(entry, maxLength))
  );
}

function isSnapshotPlayer(value: unknown): value is YahooSnapshotPlayer {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "providerPlayerId",
      "fullName",
      "nflTeam",
      "positions",
      "availability",
      "rosterStatusLabel",
      "fantasyTeamId",
    ])
  ) {
    return false;
  }

  return (
    /^\d{1,12}$/.test(String(value.providerPlayerId)) &&
    isShortString(value.fullName, 120) &&
    (value.nflTeam === null || /^[A-Z]{2,3}$/.test(String(value.nflTeam))) &&
    isStringArray(value.positions, 4, 10) &&
    ["available", "rostered", "unknown"].includes(String(value.availability)) &&
    isNullableShortString(value.rosterStatusLabel, 80) &&
    (value.fantasyTeamId === null || isId(value.fantasyTeamId))
  );
}

function isDraftEvent(value: unknown): value is YahooDraftRawEvent {
  if (!isRecord(value) || !isShortString(value.playerName, 120)) {
    return false;
  }
  const allowed = [
    "overallPick",
    "round",
    "pickInRound",
    "teamId",
    "teamLabel",
    "playerName",
    "yahooPlayerId",
    "team",
    "position",
    "pickedAt",
  ];
  return (
    hasOnlyKeys(value, allowed) &&
    ["overallPick", "round", "pickInRound"].every(
      (key) => value[key] === undefined || (Number.isInteger(value[key]) && Number(value[key]) > 0),
    ) &&
    ["teamId", "yahooPlayerId"].every(
      (key) => value[key] === undefined || isId(value[key]),
    ) &&
    ["teamLabel", "team", "position", "pickedAt"].every(
      (key) => value[key] === undefined || isShortString(value[key], 160),
    )
  );
}

function isYahooSnapshot(value: unknown, pageKind: unknown, leagueId: unknown) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "source",
      "leagueId",
      "teamId",
      "pageType",
      "players",
      "draft",
    ]) ||
    value.schemaVersion !== 1 ||
    value.source !== "yahoo-browser" ||
    value.pageType !== pageKind ||
    value.leagueId !== leagueId ||
    !(value.teamId === null || isId(value.teamId)) ||
    !Array.isArray(value.players) ||
    value.players.length > 500 ||
    !value.players.every(isSnapshotPlayer)
  ) {
    return false;
  }

  if (value.draft === null) {
    return true;
  }
  if (
    value.pageType !== "draft-room" ||
    !isRecord(value.draft) ||
    !hasOnlyKeys(value.draft, [
      "currentPick",
      "roomId",
      "userSlot",
      "currentPickText",
      "currentTeamId",
      "currentTeamLabel",
      "picks",
      "availablePlayers",
      "selectorConfidence",
    ])
  ) {
    return false;
  }
  return (
    (value.draft.roomId === null || isId(value.draft.roomId)) &&
    (value.draft.userSlot === null || isId(value.draft.userSlot)) &&
    (value.draft.currentPick === null ||
      (Number.isInteger(value.draft.currentPick) && Number(value.draft.currentPick) > 0)) &&
    isNullableShortString(value.draft.currentPickText, 160) &&
    (value.draft.currentTeamId === null || isId(value.draft.currentTeamId)) &&
    isNullableShortString(value.draft.currentTeamLabel, 160) &&
    Array.isArray(value.draft.picks) &&
    value.draft.picks.length <= 300 &&
    value.draft.picks.every(isDraftEvent) &&
    Array.isArray(value.draft.availablePlayers) &&
    value.draft.availablePlayers.length <= 500 &&
    value.draft.availablePlayers.every(isSnapshotPlayer) &&
    ["provisional", "verified"].includes(String(value.draft.selectorConfidence))
  );
}

function isYahooLeagueInventory(value: unknown, leagueId: unknown) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["schemaVersion", "source", "leagueId", "myTeamId", "startedAt", "completedAt", "players", "coverage"]) ||
    value.schemaVersion !== 1 ||
    value.source !== "yahoo-browser" ||
    value.leagueId !== leagueId ||
    !isId(value.myTeamId) ||
    !isShortString(value.startedAt, 80) ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !isShortString(value.completedAt, 80) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !Array.isArray(value.players) ||
    value.players.length > 750 ||
    !value.players.every(isSnapshotPlayer) ||
    !isRecord(value.coverage) ||
    !hasOnlyKeys(value.coverage, ["myRosterCaptured", "availablePositions", "teamRosterIds", "pagesFetched", "partial", "errors"])
  ) return false;
  return (
    typeof value.coverage.myRosterCaptured === "boolean" &&
    isStringArray(value.coverage.availablePositions, 8, 10) &&
    isStringArray(value.coverage.teamRosterIds, 32, 80) &&
    Number.isInteger(value.coverage.pagesFetched) &&
    Number(value.coverage.pagesFetched) >= 0 &&
    Number(value.coverage.pagesFetched) <= 100 &&
    typeof value.coverage.partial === "boolean" &&
    isStringArray(value.coverage.errors, 30, 200)
  );
}

function isDiagnostics(value: unknown) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "deterministicSignals",
      "provisionalSignals",
      "unavailableSignals",
      "unsupportedActions",
    ])
  ) {
    return false;
  }
  return Object.values(value).every((entry) => isStringArray(entry, 30, 120));
}
