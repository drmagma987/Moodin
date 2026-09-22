import { parseCsv } from "@/lib/fantasy/csv";
import type {
  AdvancedMetricSignalSnapshot,
  InSeasonAdvancedUsageSnapshot,
  InSeasonPlayerSnapshot,
  PlayerPosition,
  TeamOffenseEnvironmentSnapshot,
} from "@/lib/fantasy/types";

function numberValue(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildPbpAdvancedMetricsFromCsv(csv: string, gameId: string) {
  const rows = parseCsv(csv).filter((row) => row.game_id === gameId);
  const teamEnvironments: TeamOffenseEnvironmentSnapshot[] = [];
  const receivingByName = new Map<string, { airYards: number; teamAirYards: number }>();
  const quarterbackByName = new Map<string, { cpoe: number; attempts: number; teamProe: number }>();

  for (const team of [...new Set(rows.map((row) => row.posteam).filter(Boolean))]) {
    const teamRows = rows.filter((row) => row.posteam === team);
    const passOe = teamRows
      .filter((row) => row.play_type === "pass" || row.play_type === "run")
      .map((row) => numberValue(row.pass_oe))
      .filter((value): value is number => value !== null);
    const proe = average(passOe) ?? 0;
    const targetRows = teamRows.filter((row) => row.pass_attempt === "1" && row.receiver_player_name);
    const teamAirYards = targetRows.reduce((sum, row) => sum + (numberValue(row.air_yards) ?? 0), 0);

    for (const row of targetRows) {
      const name = row.receiver_player_name;
      const key = normalizeName(name);
      const current = receivingByName.get(key) ?? { airYards: 0, teamAirYards };
      current.airYards += numberValue(row.air_yards) ?? 0;
      receivingByName.set(key, current);
    }

    const quarterbackRows = teamRows.filter((row) => row.pass_attempt === "1" && row.passer_player_name);
    const quarterbackNames = [...new Set(quarterbackRows.map((row) => row.passer_player_name))];
    const quarterbacks = quarterbackNames.map((playerName) => {
      const attempts = quarterbackRows.filter((row) => row.passer_player_name === playerName);
      const cpoeValues = attempts.map((row) => numberValue(row.cpoe)).filter((value): value is number => value !== null);
      const cpoe = average(cpoeValues) ?? 0;
      quarterbackByName.set(normalizeName(playerName), { cpoe, attempts: attempts.length, teamProe: proe });
      return {
        playerName,
        attempts: attempts.length,
        cpoe: Number(cpoe.toFixed(2)),
        status: attempts.length >= 10 ? "verified" as const : "insufficient-sample" as const,
      };
    });

    teamEnvironments.push({
      team,
      week: Number(rows[0]?.week ?? 0),
      plays: passOe.length,
      proe: Number(proe.toFixed(2)),
      quarterbacks,
    });
  }

  return { receivingByName, quarterbackByName, teamEnvironments };
}

export function buildNgsRushingMetricsFromCsv(csv: string, season: number, week: number) {
  const parsed = parseCsv(csv).filter((row) => Number(row.season) === season);
  const exact = parsed.filter((row) => Number(row.week) === week);
  // nflverse's live NGS release uses week=0 for the current season-to-date row.
  // In Week 1 only, that aggregate is exactly the completed game. Later weeks
  // must use an exact weekly row so a season aggregate cannot masquerade as one game.
  const rows = exact.length > 0 ? exact : week === 1 ? parsed.filter((row) => Number(row.week) === 0) : [];
  return new Map(
    rows
      .map((row) => [
        normalizeName(row.player_display_name),
        {
          attempts: numberValue(row.rush_attempts) ?? 0,
          rushingYardsOverExpected: numberValue(row.rush_yards_over_expected),
          rushingYardsOverExpectedPerAttempt: numberValue(row.rush_yards_over_expected_per_att),
        },
      ] as const),
  );
}

export function buildNgsPassingMetricsFromCsv(csv: string, season: number, week: number) {
  return new Map(
    parseCsv(csv)
      .filter((row) => Number(row.season) === season && Number(row.week) === week && row.season_type === "REG")
      .map((row) => [
        normalizeName(row.player_display_name),
        {
          attempts: numberValue(row.attempts) ?? 0,
          avgTimeToThrow: numberValue(row.avg_time_to_throw),
          avgCompletedAirYards: numberValue(row.avg_completed_air_yards),
          avgIntendedAirYards: numberValue(row.avg_intended_air_yards),
          aggressiveness: numberValue(row.aggressiveness),
          completionPercentageAboveExpectation: numberValue(row.completion_percentage_above_expectation),
          passerRating: numberValue(row.passer_rating),
        },
      ] as const),
  );
}

export function buildNgsReceivingMetricsFromCsv(csv: string, season: number, week: number) {
  return new Map(
    parseCsv(csv)
      .filter((row) => Number(row.season) === season && Number(row.week) === week && row.season_type === "REG")
      .map((row) => [
        normalizeName(row.player_display_name),
        {
          targets: numberValue(row.targets) ?? 0,
          avgCushion: numberValue(row.avg_cushion),
          avgSeparation: numberValue(row.avg_separation),
          avgIntendedAirYards: numberValue(row.avg_intended_air_yards),
          intendedAirYardsShare: numberValue(row.percent_share_of_intended_air_yards),
          catchPercentage: numberValue(row.catch_percentage),
          avgYacAboveExpectation: numberValue(row.avg_yac_above_expectation),
        },
      ] as const),
  );
}

export function buildForcedMissedTackleMetricsFromCsv(csv: string, season: number, week: number) {
  const metrics = new Map<string, { attempts: number; forcedMissedTackles: number; forcedMissedTackleRate: number }>();
  for (const row of parseCsv(csv)) {
    if (Number(row.season) !== season || Number(row.week) !== week) continue;
    const name = row.player_display_name || row.player_name;
    const attempts = numberValue(row.rush_attempts ?? row.attempts ?? row.carries);
    const forcedMissedTackles = numberValue(row.forced_missed_tackles);
    if (!name || attempts === null || attempts <= 0 || forcedMissedTackles === null) continue;
    metrics.set(normalizeName(name), {
      attempts,
      forcedMissedTackles,
      forcedMissedTackleRate: Number((forcedMissedTackles / attempts).toFixed(3)),
    });
  }
  return metrics;
}

function primaryPosition(player: InSeasonPlayerSnapshot): PlayerPosition {
  return player.player.positions[0] ?? "WR";
}

function confidenceForSample(position: PlayerPosition, advanced: InSeasonAdvancedUsageSnapshot) {
  if (position === "QB") {
    return advanced.statuses.quarterbackEnvironment === "verified" ? "medium" as const : "low" as const;
  }
  if (position === "RB") {
    return advanced.rushingYardsOverExpectedPerAttempt !== null ? "medium" as const : "low" as const;
  }
  if ((advanced.routes ?? 0) >= 25) return "medium" as const;
  return "low" as const;
}

function rosterContext(player: InSeasonPlayerSnapshot, teamsById: Map<string, string>) {
  if (player.availability === "my-roster") return "Your roster";
  if (player.rosterTeamId) return teamsById.get(player.rosterTeamId) ?? "League roster";
  return "Free agent";
}

export function buildAdvancedMetricSignals(
  players: InSeasonPlayerSnapshot[],
  teamsById: Map<string, string>,
): AdvancedMetricSignalSnapshot[] {
  const signals: AdvancedMetricSignalSnapshot[] = [];
  for (const player of players) {
    const advanced = player.advancedUsage;
    if (!advanced || !advanced.sources.length || advanced.week !== player.evidence?.week) continue;
    const position = primaryPosition(player);
    const context = rosterContext(player, teamsById);

    if ((position === "WR" || position === "TE" || position === "RB") && advanced.routes !== null && Number.isFinite(advanced.routes) && advanced.statuses.routes === "verified") {
      const tprr = advanced.targetsPerRouteRun;
      const yprr = advanced.yardsPerRouteRun;
      const airShare = advanced.statuses.airYards === "verified" ? advanced.airYardsShare : null;
      const estimatedTargets = advanced.routes * (tprr ?? 0);
      const routeQualified = position === "RB"
        ? advanced.routes >= 8 && estimatedTargets >= 2
        : advanced.routes >= 12 && estimatedTargets >= 3;
      const eliteEfficiency = routeQualified && ((tprr ?? 0) >= 0.25 || (yprr ?? 0) >= 2.25);
      const airYardsWatch = routeQualified && (airShare ?? 0) >= 0.25 && (yprr ?? 0) < 1.5;
      if (eliteEfficiency || airYardsWatch) {
        const classification = airYardsWatch ? "air-yards-watch" as const : "elite-target" as const;
        const score = (tprr ?? 0) * 35 + (yprr ?? 0) * 4 + (airShare ?? 0) * 24;
        signals.push({
          playerId: player.player.id,
          playerName: player.player.fullName,
          position,
          rosterContext: context,
          classification,
          confidence: confidenceForSample(position, advanced),
          score: Number(score.toFixed(2)),
          headline: classification === "elite-target" ? "High-value route efficiency" : "Air-yards breakout watch",
          metrics: [
            tprr === null ? "TPRR unavailable" : `${(tprr * 100).toFixed(1)}% TPRR`,
            yprr === null ? "YPRR unavailable" : `${yprr.toFixed(2)} YPRR`,
            airShare === null ? "Air share unavailable" : `${(airShare * 100).toFixed(1)}% air-yards share`,
          ],
          analysis: classification === "elite-target"
            ? "Targets and production arrived at an unusually strong rate per route. Treat this as an early role-quality signal, with Week 1 sample caution."
            : "The production lagged the downfield opportunity. Sustained routes plus this air-yards share can precede an explosive correction.",
        });
      }
    }

    if (position === "RB" && advanced.rushingYardsOverExpectedPerAttempt !== null && Number.isFinite(advanced.rushingYardsOverExpectedPerAttempt) && advanced.rushingYardsOverExpected !== null && advanced.statuses.rushingYardsOverExpected === "verified") {
      const positive = advanced.rushingYardsOverExpectedPerAttempt > 0;
      const fmtText = advanced.forcedMissedTackleRate === null || advanced.statuses.forcedMissedTackles !== "verified"
        ? "FMT rate pending charting"
        : `${(advanced.forcedMissedTackleRate * 100).toFixed(1)}% FMT rate`;
      signals.push({
        playerId: player.player.id,
        playerName: player.player.fullName,
        position,
        rosterContext: context,
        classification: positive ? "runner-creation" : "runner-warning",
        confidence: confidenceForSample(position, advanced),
        score: Number((advanced.rushingYardsOverExpectedPerAttempt * 5).toFixed(2)),
        headline: positive ? "Creating beyond blocking" : "Efficiency below expectation",
        metrics: [
          `${advanced.rushingYardsOverExpected! >= 0 ? "+" : ""}${advanced.rushingYardsOverExpected!.toFixed(1)} RYOE`,
          `${advanced.rushingYardsOverExpectedPerAttempt >= 0 ? "+" : ""}${advanced.rushingYardsOverExpectedPerAttempt.toFixed(2)} RYOE/att`,
          fmtText,
        ],
        analysis: positive
          ? "Next Gen Stats credits the runner with more yardage than blocking and box context predicted. Confirm with missed-tackle charting before calling it a stable talent edge."
          : "The runner finished below contextual expectation. Volume can still carry fantasy value, so this is a talent-efficiency warning rather than a drop signal.",
      });
    }

    if (position === "QB" && advanced.cpoe !== null && advanced.teamProe !== null && advanced.statuses.quarterbackEnvironment === "verified") {
      signals.push({
        playerId: player.player.id,
        playerName: player.player.fullName,
        position,
        rosterContext: context,
        classification: "qb-environment",
        confidence: confidenceForSample(position, advanced),
        score: Number((advanced.cpoe * 0.5 + advanced.teamProe * 0.35).toFixed(2)),
        headline: advanced.cpoe > 0 && advanced.teamProe > 0 ? "Accurate passer in a volume-positive offense" : "Accuracy and volume split",
        metrics: [`${advanced.cpoe >= 0 ? "+" : ""}${advanced.cpoe.toFixed(1)} CPOE`, `${advanced.teamProe >= 0 ? "+" : ""}${advanced.teamProe.toFixed(1)}% PROE`],
        analysis: advanced.teamProe > 0
          ? "The offense passed more often than game context predicted, supporting repeatable fantasy volume if accuracy holds."
          : "Accuracy and pass volume should be read separately: the quarterback result may be sound, but the offense was below expected pass rate.",
      });
    }
  }

  return signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}
