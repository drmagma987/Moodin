import { parseCsv } from "@/lib/fantasy/csv";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { completedGameEvidenceMeta } from "@/lib/fantasy/completedGameEvidence";
import type { InSeasonPlayerSnapshot } from "@/lib/fantasy/types";
import { buildNgsRushingMetricsFromCsv } from "@/lib/fantasy/inSeasonAdvancedMetrics";

export type WeeklyEvidenceBundle = {
  season: number;
  week: number;
  capturedAt: string;
  statsCsv?: string;
  snapsCsv?: string;
  ngsRushingCsv?: string;
  metadata?: Record<string, { full_name?: string; first_name?: string; last_name?: string; team?: string; position?: string; depth_chart_order?: number | null; injury_status?: string | null }>;
  sources: Array<{ label: string; url: string; status: "loaded" | "unavailable"; detail: string }>;
};

const normalize = (value: string) => value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
const normalizeMetricName = (value: string) => value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const number = (value: string | undefined) => value !== undefined && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const normalizeTeam = (team: string) => ({ JAC: "JAX", LA: "LAR", WSH: "WAS", OAK: "LV", SD: "LAC", STL: "LAR" }[team.trim().toUpperCase()] ?? team.trim().toUpperCase());
const normalizePosition = (position?: string) => ["FB", "HB"].includes(position?.toUpperCase() ?? "") ? "RB" : position?.toUpperCase();
const key = (name: string, team: string) => `${normalize(name)}:${normalizeTeam(team)}`;

export type EvidenceMatchStatus = "matched" | "source-unavailable" | "absent" | "ambiguous" | "position-mismatch" | "invalid-values";
export type EvidenceMatchAudit = { playerId: string; name: string; stats: EvidenceMatchStatus; snaps: EvidenceMatchStatus; context: EvidenceMatchStatus };

/** Join only unique identities in the requested season/week. An absent row is
 * unknown, never zero activity or an inferred injury. No ownership is changed. */
export function applyWeeklyEvidenceBundle(players: InSeasonPlayerSnapshot[], bundle: WeeklyEvidenceBundle) {
  if (bundle.season !== leagueSourceOfTruth.season || bundle.week !== completedGameEvidenceMeta.week) throw new Error("Evidence season/week does not match the active slate.");
  if (!Number.isFinite(Date.parse(bundle.capturedAt)) || Date.now() - Date.parse(bundle.capturedAt) > 14 * 86_400_000 || Date.parse(bundle.capturedAt) - Date.now() > 86_400_000) throw new Error("Evidence timestamp is invalid or stale.");
  const rows = (csv?: string) => csv ? parseCsv(csv).filter((row) => Number(row.season) === bundle.season && Number(row.week) === bundle.week && (row.season_type ?? row.game_type) === "REG") : [];
  const index = (records: Record<string, string>[], nameField: string) => {
    const result = new Map<string, Record<string, string> | null>();
    for (const row of records) {
      const identity = key(row[nameField] ?? row.player_name ?? "", row.team ?? row.recent_team ?? "");
      result.set(identity, result.has(identity) ? null : row);
    }
    return result;
  };
  const stats = index(rows(bundle.statsCsv), "player_display_name");
  const snaps = index(rows(bundle.snapsCsv), "player");
  const metadata = new Map<string, NonNullable<WeeklyEvidenceBundle["metadata"]>[string] | null>();
  const ngsRushing = bundle.ngsRushingCsv ? buildNgsRushingMetricsFromCsv(bundle.ngsRushingCsv, bundle.season, bundle.week) : new Map();
  for (const record of Object.values(bundle.metadata ?? {})) {
    const identity = key(record.full_name ?? [record.first_name, record.last_name].filter(Boolean).join(" "), record.team ?? "");
    metadata.set(identity, metadata.has(identity) ? null : record);
  }
  let observedPlayers = 0;
  let contextPlayers = 0;
  const updatedPlayerIds: string[] = [];
  const matchAudit: EvidenceMatchAudit[] = [];
  const updated = players.map((original) => {
    const identity = key(original.player.fullName, original.player.team);
    const stat = stats.get(identity);
    const snap = snaps.get(identity);
    const context = metadata.get(identity);
    const player = structuredClone(original);
    const positionMatches = (position?: string) => {
      const sourcePosition = normalizePosition(position);
      if (sourcePosition === normalizePosition(player.player.positions[0])) return true;
      // nflverse's Week 1 offensive stats retain Travis Hunter's official CB/DB
      // designation even though the same verified JAX identity logged offensive
      // WR snaps and fantasy production. Keep this exact name/team exception
      // narrow so ordinary defensive namesakes remain rejected.
      return normalize(player.player.fullName) === "travishunter"
        && normalizeTeam(player.player.team) === "JAX"
        && player.player.positions.includes("WR")
        && (sourcePosition === "CB" || sourcePosition === "DB");
    };
    if (context && positionMatches(context.position)) {
      contextPlayers += 1;
      if (typeof context.depth_chart_order === "number" && context.depth_chart_order > 0) {
        player.depthChartOrder = context.depth_chart_order;
        if (!player.currentRole || player.currentRole === "unknown") player.currentRole = context.depth_chart_order === 1 ? "projected-starter" : "competition";
      }
      // A blank designation is not proof that an IR player has been activated.
      if (context.injury_status) player.injuryStatus = /^(NA|N\/A)$/i.test(context.injury_status.trim()) ? "unknown" : context.injury_status;
      else if (player.injuryStatus !== "IR") player.injuryStatus = "No injury designation reported";
    }
    const targets = number(stat?.targets);
    const carries = number(stat?.carries);
    const yards = number(stat?.receiving_yards);
    const offenseSnaps = number(snap?.offense_snaps);
    const snapShare = number(snap?.offense_pct);
    const validBox = Boolean(stat && positionMatches(stat.position) && targets !== null && targets >= 0 && carries !== null && carries >= 0 && yards !== null);
    const validSnaps = Boolean(snap && positionMatches(snap.position) && offenseSnaps !== null && offenseSnaps >= 0 && snapShare !== null && snapShare >= 0 && snapShare <= 1);
    const matchStatus = (available: boolean, row: { position?: string } | null | undefined, valid: boolean): EvidenceMatchStatus =>
      !available ? "source-unavailable" : row === null ? "ambiguous" : !row ? "absent" : !positionMatches(row.position) ? "position-mismatch" : !valid ? "invalid-values" : "matched";
    matchAudit.push({ playerId: player.player.id, name: player.player.fullName,
      stats: matchStatus(bundle.statsCsv !== undefined, stat, validBox),
      snaps: matchStatus(bundle.snapsCsv !== undefined, snap, validSnaps),
      context: matchStatus(bundle.metadata !== undefined, context, true) });
    if (validBox || validSnaps) {
      observedPlayers += 1;
      const previousAge = player.evidence ? Date.parse(bundle.capturedAt) - Date.parse(player.evidence.capturedAt) : NaN;
      const previous = player.evidence?.week === bundle.week && player.evidence.source.trim() && previousAge >= -86_400_000 && previousAge <= 14 * 86_400_000 ? player.evidence : undefined;
      player.evidence = { week: bundle.week, capturedAt: bundle.capturedAt, source: "nflverse weekly stats / PFR snaps",
        boxScore: validBox, snaps: validSnaps, routes: false,
        ...(validBox ? { observedTargets: targets!, observedCarries: carries!, observedReceivingYards: yards! } : {}),
        participation: validSnaps && offenseSnaps === 0 ? "zero-snaps" : "played",
      };
      if (previous) {
        player.evidence.source = [...new Set([player.evidence.source, previous.source])].join("; ");
        player.evidence.routes = previous.routes;
        player.evidence.boxScore ||= previous.boxScore;
        player.evidence.snaps ||= previous.snaps;
        player.evidence.observedTargets ??= previous.observedTargets;
        player.evidence.observedCarries ??= previous.observedCarries;
        player.evidence.observedReceivingYards ??= previous.observedReceivingYards;
      }
      player.evidence.capturedAt = bundle.capturedAt;
      player.recentUsage.games = 1;
      const weight = completedGameEvidenceMeta.evidenceWeight;
      const blend = (prior: number, observed: number) => Number((prior * (1 - weight) + observed * weight).toFixed(3));
      if (validBox) {
        player.recentUsage.targetsPerGame = blend(player.baselineUsage.targetsPerGame, targets!);
        player.recentUsage.carriesPerGame = blend(player.baselineUsage.carriesPerGame, carries!);
        const targetShare = number(stat?.target_share);
        if (targetShare !== null && targetShare >= 0 && targetShare <= 1) player.recentUsage.targetShare = blend(player.baselineUsage.targetShare, targetShare);
        // Reconcile ratios only when a verified same-week route denominator exists.
        if (player.evidence.routes && player.advancedUsage?.week === bundle.week && player.advancedUsage.statuses.routes === "verified" && (player.advancedUsage.routes ?? 0) > 0) {
          player.advancedUsage.targetsPerRouteRun = Number((targets! / player.advancedUsage.routes!).toFixed(3));
          player.advancedUsage.yardsPerRouteRun = Number((yards! / player.advancedUsage.routes!).toFixed(3));
        }
        const ngs = player.player.positions[0] === "RB" ? ngsRushing.get(normalizeMetricName(player.player.fullName)) : undefined;
        const ngsArithmeticMatches = ngs
          && ngs.rushingYardsOverExpected !== null
          && ngs.rushingYardsOverExpectedPerAttempt !== null
          && Math.abs((ngs.rushingYardsOverExpected / ngs.attempts) - ngs.rushingYardsOverExpectedPerAttempt) <= 0.02;
        if (ngs && ngs.attempts === carries && ngs.attempts > 0 && ngsArithmeticMatches) {
          const previousAdvanced = player.advancedUsage;
          player.advancedUsage = {
            week: bundle.week,
            games: 1,
            routes: previousAdvanced?.week === bundle.week ? previousAdvanced.routes : null,
            targetsPerRouteRun: previousAdvanced?.week === bundle.week ? previousAdvanced.targetsPerRouteRun : null,
            yardsPerRouteRun: previousAdvanced?.week === bundle.week ? previousAdvanced.yardsPerRouteRun : null,
            airYards: previousAdvanced?.week === bundle.week ? previousAdvanced.airYards : null,
            airYardsShare: previousAdvanced?.week === bundle.week ? previousAdvanced.airYardsShare : null,
            rushingYardsOverExpected: ngs.rushingYardsOverExpected,
            rushingYardsOverExpectedPerAttempt: ngs.rushingYardsOverExpectedPerAttempt,
            forcedMissedTackles: previousAdvanced?.week === bundle.week ? previousAdvanced.forcedMissedTackles : null,
            forcedMissedTackleRate: previousAdvanced?.week === bundle.week ? previousAdvanced.forcedMissedTackleRate : null,
            cpoe: previousAdvanced?.week === bundle.week ? previousAdvanced.cpoe : null,
            teamProe: previousAdvanced?.week === bundle.week ? previousAdvanced.teamProe : null,
            statuses: {
              routes: previousAdvanced?.week === bundle.week ? previousAdvanced.statuses.routes : "pending-source",
              airYards: previousAdvanced?.week === bundle.week ? previousAdvanced.statuses.airYards : "pending-source",
              rushingYardsOverExpected: "verified",
              forcedMissedTackles: previousAdvanced?.week === bundle.week ? previousAdvanced.statuses.forcedMissedTackles : "pending-source",
              quarterbackEnvironment: previousAdvanced?.week === bundle.week ? previousAdvanced.statuses.quarterbackEnvironment : "pending-source",
            },
            sources: [...new Set([...(previousAdvanced?.week === bundle.week ? previousAdvanced.sources : []), "NFL Next Gen Stats via nflverse"])],
          };
        }
      }
      if (validSnaps) player.recentUsage.snapShare = blend(player.baselineUsage.snapShare, snapShare!);
    }
    if (JSON.stringify(player) !== JSON.stringify(original)) updatedPlayerIds.push(player.player.id);
    return player;
  });
  return { players: updated, updatedPlayerIds, observedPlayers, contextPlayers, matchAudit, sourceStatsRows: stats.size, sourceSnapRows: snaps.size };
}

export async function fetchWeeklyEvidenceBundle(): Promise<WeeklyEvidenceBundle> {
  const season = leagueSourceOfTruth.season;
  const sources = [
    { label: "nflverse weekly player stats", url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`, field: "statsCsv" },
    { label: "nflverse/PFR snaps", url: `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`, field: "snapsCsv" },
    { label: "Sleeper player context", url: "https://api.sleeper.app/v1/players/nfl", field: "metadata" },
    { label: "NFL Next Gen Stats rushing via nflverse", url: "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_rushing.csv.gz", field: "ngsRushingCsv" },
  ] as const;
  const bundle: WeeklyEvidenceBundle = { season, week: completedGameEvidenceMeta.week, capturedAt: new Date().toISOString(), sources: [] };
  await Promise.all(sources.map(async (source) => {
    try {
      const response = await fetch(source.url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (source.field === "metadata") bundle.metadata = await response.json();
      else if (source.field === "ngsRushingCsv") {
        if (!response.body) throw new Error("Empty compressed response");
        bundle.ngsRushingCsv = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
      } else bundle[source.field] = await response.text();
      bundle.sources.push({ label: source.label, url: source.url, status: "loaded", detail: "Downloaded; season/week and identity checks apply before use." });
    } catch (error) {
      bundle.sources.push({ label: source.label, url: source.url, status: "unavailable", detail: error instanceof Error ? error.message : "Source unavailable" });
    }
  }));
  return bundle;
}
