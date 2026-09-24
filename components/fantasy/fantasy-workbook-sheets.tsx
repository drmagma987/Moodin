"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { analyzeTradeProposal, buildOpportunityTrendSnapshots, buildTradeIdeaSnapshots, buildTransactionQueue, buildWaiverRecommendationSnapshots } from "@/lib/fantasy/inSeason";
import { buildAdvancedMetricSignals } from "@/lib/fantasy/inSeasonAdvancedMetrics";
import { applyCurrentSeasonProjectionUpdates } from "@/lib/fantasy/currentSeasonProjections";
import { applyYahooLeagueInventory } from "@/lib/fantasy/yahooInventory";
import { buildYahooInventoryFromPdfPreview, extractYahooRosterPdfLines, parseYahooRosterPdfLines, type YahooRosterPdfPreview } from "@/lib/fantasy/yahooRosterPdf";
import type { YahooLeagueInventorySnapshot } from "@/lib/fantasy/yahooBridge";
import type { InSeasonCommandCenterDataset, InSeasonPlayerSnapshot, TradeIdeaSnapshot, WaiverRecommendationSnapshot } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { weeklyWaiverContext, weeklyWaiverMarketRows } from "@/lib/fantasy/weeklyWaiverContext";
import styles from "./fantasy-workbook.module.css";

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function position(player: InSeasonPlayerSnapshot) {
  return player.player.positions[0] ?? "WR";
}

function nameFor(playerId: string | null, dataset: InSeasonCommandCenterDataset) {
  if (!playerId) return "Open roster spot";
  return dataset.players.find((entry) => entry.player.id === playerId)?.player.fullName ?? "Unknown player";
}

function rebuildFromInventory(base: InSeasonCommandCenterDataset, inventory: YahooLeagueInventorySnapshot) {
  const applied = applyYahooLeagueInventory(base.players, inventory, { maxAgeMinutes: inventory.source === "yahoo-roster-pdf" ? 7 * 24 * 60 : 15 });
  const baseTeams = new Map(base.leagueTeams.map((team) => [team.teamId, team] as const));
  const teamNames = new Map(base.leagueTeams.map((team) => [team.teamId, team.name] as const));
  const myTeam = {
    ...baseTeams.get(inventory.myTeamId),
    teamId: inventory.myTeamId,
    name: teamNames.get(inventory.myTeamId) ?? "My Team",
    playerIds: applied.players.filter((player) => player.availability === "my-roster").map((player) => player.player.id),
  };
  const teamIds = Array.from(new Set(applied.players.map((player) => player.rosterTeamId).filter((teamId): teamId is string => Boolean(teamId))));
  const leagueTeams = teamIds.map((teamId) => ({
    ...baseTeams.get(teamId),
    teamId,
    name: teamNames.get(teamId) ?? (teamId === inventory.myTeamId ? "My Team" : `Yahoo Team ${teamId}`),
    playerIds: applied.players.filter((player) => player.rosterTeamId === teamId).map((player) => player.player.id),
  }));
  const opportunityTrends = buildOpportunityTrendSnapshots(applied.players);
  const tradeIdeas = buildTradeIdeaSnapshots(applied.players, myTeam, leagueTeams);
  const waiverRecommendations = buildWaiverRecommendationSnapshots(applied.players, myTeam);
  return {
    applied,
    dataset: {
      ...base,
      players: applied.players,
      myTeam,
      leagueTeams,
      advancedMetricSignals: buildAdvancedMetricSignals(applied.players, teamNames),
      opportunityTrends,
      tradeIdeas,
      waiverRecommendations,
      actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
      rosterSnapshot: { source: inventory.source === "yahoo-roster-pdf" ? "Yahoo Starting Rosters PDF" : "Yahoo league inventory", capturedAt: inventory.completedAt, persistence: "device-local" as const },
    },
  };
}

export function applyWorkbookEvidenceResponse(dataset: InSeasonCommandCenterDataset, body: Record<string, unknown>) {
  const responsePlayers = Array.isArray(body.players) ? body.players as InSeasonPlayerSnapshot[] : [];
  const refreshed = new Map<string, InSeasonPlayerSnapshot>(responsePlayers.map((player) => [player.player.id, player]));
  const players = applyCurrentSeasonProjectionUpdates(dataset.players.map((player) => {
    const update = refreshed.get(player.player.id);
    return update ? {
      ...update,
      availability: player.availability,
      rosterTeamId: player.rosterTeamId,
      injuryStatus: player.injuryStatus === "IR" && update.injuryStatus !== "IR" ? "IR" : update.injuryStatus,
    } : player;
  }), {
    week: typeof body.week === "number" ? body.week : dataset.evidenceStatus.week,
    capturedAt: typeof body.capturedAt === "string" ? body.capturedAt : new Date().toISOString(),
    observationWeight: dataset.evidenceStatus.evidenceWeight,
  });
  const waiverRecommendations = buildWaiverRecommendationSnapshots(players, dataset.myTeam);
  const tradeIdeas = buildTradeIdeaSnapshots(players, dataset.myTeam, dataset.leagueTeams);
  const slate = body.slate && typeof body.slate === "object" ? body.slate as Partial<InSeasonCommandCenterDataset["evidenceStatus"]> : {};
  const refreshedSources = Array.isArray(body.sources)
    ? body.sources.filter((source): source is InSeasonCommandCenterDataset["evidenceStatus"]["sources"][number] =>
        Boolean(source) && typeof source === "object" && typeof (source as { label?: unknown }).label === "string" && typeof (source as { url?: unknown }).url === "string")
    : null;
  return {
    ...dataset,
    players,
    waiverRecommendations,
    tradeIdeas,
    opportunityTrends: buildOpportunityTrendSnapshots(players),
    productionOpportunity: Array.isArray(body.productionOpportunity)
      ? body.productionOpportunity as InSeasonCommandCenterDataset["productionOpportunity"]
      : dataset.productionOpportunity,
    advancedMetricSignals: buildAdvancedMetricSignals(players, new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name]))),
    actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
    evidenceStatus: {
      ...dataset.evidenceStatus,
      ...slate,
      week: typeof body.week === "number" ? body.week : dataset.evidenceStatus.week,
      capturedAt: typeof body.capturedAt === "string" ? body.capturedAt : dataset.evidenceStatus.capturedAt,
      matchedPlayers: typeof body.observedPlayers === "number" ? body.observedPlayers : dataset.evidenceStatus.matchedPlayers,
      sources: refreshedSources ?? (Array.isArray(slate.sources) ? slate.sources : dataset.evidenceStatus.sources),
    },
  };
}

function Inspector({ eyebrow, title, meta, children, onClose }: { eyebrow: string; title: string; meta?: string; children: React.ReactNode; onClose: () => void }) {
  return <aside className={styles.inspector}><button className={styles.closeInspector} onClick={onClose} aria-label="Close details">×</button><p className={styles.inspectorEyebrow}>{eyebrow}</p><h2 className={styles.inspectorTitle}>{title}</h2>{meta ? <p className={styles.inspectorMeta}>{meta}</p> : null}{children}</aside>;
}

export function WaiversSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const recommendations = dataset.waiverRecommendations.filter((entry) => entry.verdict !== "pass");
  const [selectedId, setSelectedId] = useState<string | null>(recommendations[0]?.addPlayerId ?? null);
  const selected = recommendations.find((entry) => entry.addPlayerId === selectedId) ?? null;
  return <div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}><div className={styles.gridRegion}><table className={styles.table} aria-label="Waiver recommendations"><thead><tr><th className={styles.rowNumber}></th>{["A · Rank", "B · Add", "C · Position", "D · Drop", "E · Bid Range", "F · Starter Δ", "G · Upside Δ", "H · Confidence", "I · Verdict"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{recommendations.map((recommendation, index) => { const player = dataset.players.find((entry) => entry.player.id === recommendation.addPlayerId); if (!player) return null; const active = recommendation.addPlayerId === selectedId; return <tr key={recommendation.addPlayerId} className={`${styles.dataRow} ${active ? styles.selectedRow : ""}`} onClick={() => setSelectedId(recommendation.addPlayerId)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{index + 1}</td><td className={styles.primaryCell}>{player.player.fullName}</td><td>{position(player)}</td><td>{nameFor(recommendation.dropPlayerId, dataset)}</td><td className={styles.numberCell}>{recommendation.faabRange?.label ?? "Watch"}</td><td className={`${styles.numberCell} ${recommendation.starterDelta >= 0 ? styles.positiveCell : styles.negativeCell}`}>{signed(recommendation.starterDelta)}</td><td className={styles.numberCell}>{signed(recommendation.playoffUpsideDelta)}</td><td className={recommendation.confidence === "high" ? styles.positiveCell : styles.warningCell}>{recommendation.confidence}</td><td className={`${styles.actionCell} ${active ? styles.selectedCell : ""}`}>{recommendation.verdict}</td></tr>; })}</tbody></table></div>{selected ? <WaiverInspector recommendation={selected} dataset={dataset} onClose={() => setSelectedId(null)} /> : null}</div>;
}

export function WaiverMarketSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const availabilityByName = new Map(dataset.players.map((player) => [player.player.fullName, player.availability] as const));
  return <div className={styles.sheetStack}><div className={styles.marketNote}><strong>Week {weeklyWaiverContext.week} external market</strong><span>RotoBaller has published its priority order and Baller Move; its Week 3 FAAB dollar article was not live at the last check. FantasyPros PPR highlighted ranks and $100-budget bids are shown where published.</span><span className={styles.sourceLinks}><a href={weeklyWaiverContext.sources.rotoballer.url} target="_blank" rel="noreferrer">RotoBaller source ↗</a><a href={weeklyWaiverContext.sources.fantasyPros.url} target="_blank" rel="noreferrer">FantasyPros source ↗</a></span></div><div className={styles.gridRegion}><table className={`${styles.table} ${styles.marketTable}`} aria-label={`Week ${weeklyWaiverContext.week} external waiver market`}><thead><tr><th className={styles.rowNumber}></th>{["A · Player", "B · Pos", "C · RotoBaller Rank", "D · RotoBaller Move", "E · FP PPR Rank", "F · FP True Value", "G · FP Budget", "H · FP Desperate", "I · Yahoo Status"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{weeklyWaiverMarketRows.map((row, index) => <tr key={row.playerName}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{row.playerName}</td><td>{row.position}</td><td className={styles.numberCell}>#{row.rotoballerRank}</td><td className={styles.wrapCell}>{row.rotoballerMove}</td><td className={styles.numberCell}>{row.fantasyProsPprRank ? `#${row.fantasyProsPprRank}` : "—"}</td><td className={styles.numberCell}>{row.fantasyProsTrueValue === undefined ? "—" : `$${row.fantasyProsTrueValue}`}</td><td className={styles.numberCell}>{row.fantasyProsBudget === undefined ? "—" : `$${row.fantasyProsBudget}`}</td><td className={styles.numberCell}>{row.fantasyProsDesperate === undefined ? "—" : `$${row.fantasyProsDesperate}`}</td><td>{(availabilityByName.get(row.playerName) ?? "not in model").replaceAll("-", " ")}</td></tr>)}</tbody></table></div></div>;
}

function WaiverInspector({ recommendation, dataset, onClose }: { recommendation: WaiverRecommendationSnapshot; dataset: InSeasonCommandCenterDataset; onClose: () => void }) {
  return <Inspector eyebrow={`${recommendation.verdict} · ${recommendation.confidence} confidence`} title={nameFor(recommendation.addPlayerId, dataset)} meta={`${recommendation.opportunityType.replaceAll("-", " ")} · edge ${recommendation.edgeScore.toFixed(1)}`} onClose={onClose}><p className={styles.inspectorText}>{recommendation.opportunityCase}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Transaction</p><p className={styles.inspectorValue}>Add {nameFor(recommendation.addPlayerId, dataset)}{recommendation.dropPlayerId ? ` · Drop ${nameFor(recommendation.dropPlayerId, dataset)}` : " · Use open spot"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Bid guidance</p><p className={styles.inspectorValue}>{recommendation.faabRange?.label ?? "Watch only"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>What breaks the case</p><p className={styles.inspectorValue}>{recommendation.primaryRisk}</p></div></Inspector>;
}

type OpportunityFilter = "all" | "breakout" | "role-breakout" | "buy-low" | "regression-risk";

export function ProductionOpportunitySheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(dataset.productionOpportunity[0]?.playerId ?? null);
  const teamNames = new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name] as const));
  const rows = dataset.productionOpportunity.filter((snapshot) => {
    if (filter === "all") return true;
    if (filter === "regression-risk") return snapshot.classification === "sell-high" || snapshot.classification === "touchdown-trap";
    return snapshot.classification === filter;
  });
  const selected = dataset.productionOpportunity.find((snapshot) => snapshot.playerId === selectedId) ?? null;
  const selectedPlayer = selected ? dataset.players.find((player) => player.player.id === selected.playerId) ?? null : null;
  const sourceReady = dataset.productionOpportunity.some((snapshot) => snapshot.source === "ffopportunity");
  const ownerFor = (player: InSeasonPlayerSnapshot) => player.availability === "my-roster"
    ? "My Team"
    : player.availability === "free-agent"
      ? "Free Agent"
      : teamNames.get(player.rosterTeamId ?? "") ?? "League roster";
  const gapClass = (gap: number | null) => gap === null
    ? ""
    : gap >= 2.5 ? styles.positiveCell : gap <= -3 ? styles.negativeCell : "";
  const signalClass = (classification: InSeasonCommandCenterDataset["productionOpportunity"][number]["classification"]) =>
    classification === "breakout" || classification === "role-breakout" || classification === "buy-low"
      ? styles.positiveCell
      : classification === "sell-high" || classification === "touchdown-trap"
        ? styles.negativeCell
        : styles.warningCell;

  return <div className={styles.sheetStack}>
    <div className={styles.opportunityToolbar}>
      <div><strong>Production vs. Opportunity</strong><span>{sourceReady ? "Play-level PPR xFP plus independent role movement" : "Role-only mode · play-level xFP feed pending"}</span></div>
      <div className={styles.opportunityFilters}>{([
        ["all", "All"], ["breakout", "Breakouts"], ["role-breakout", "Role gains"], ["buy-low", "Buy low"], ["regression-risk", "Regression risk"],
      ] as Array<[OpportunityFilter, string]>).map(([value, label]) => <button key={value} className={filter === value ? styles.opportunityFilterActive : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    </div>
    <div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}>
      <div className={styles.gridRegion}>
        <table className={`${styles.table} ${styles.opportunityTable}`} aria-label="Production versus expected opportunity">
          <thead><tr><th className={styles.rowNumber}></th>{["A · Player", "B · Pos", "C · Owner", "D · Actual/G", "E · xFP/G", "F · xFP−Actual", "G · xFP Trend", "H · Snap Δ", "I · Route Δ", "J · xTD / TD", "K · Signal", "L · Confidence"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{rows.map((snapshot, index) => {
            const player = dataset.players.find((entry) => entry.player.id === snapshot.playerId);
            if (!player) return null;
            const active = snapshot.playerId === selectedId;
            return <tr key={snapshot.playerId} className={`${styles.dataRow} ${active ? styles.selectedRow : ""}`} onClick={() => setSelectedId(snapshot.playerId)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{player.player.fullName}</td><td>{position(player)}</td><td>{ownerFor(player)}</td><td className={styles.numberCell}>{snapshot.actualPointsPerGame?.toFixed(1) ?? "—"}</td><td className={styles.numberCell}>{snapshot.expectedPointsPerGame?.toFixed(1) ?? "—"}</td><td className={`${styles.numberCell} ${gapClass(snapshot.opportunityGapPerGame)}`}>{snapshot.opportunityGapPerGame === null ? "—" : signed(snapshot.opportunityGapPerGame)}</td><td className={styles.numberCell}>{snapshot.expectedPointsTrend === null ? "—" : signed(snapshot.expectedPointsTrend)}</td><td className={styles.numberCell}>{signed(snapshot.snapShareDelta * 100)} pts</td><td className={styles.numberCell}>{signed(snapshot.routeParticipationDelta * 100)} pts</td><td className={styles.numberCell}>{snapshot.expectedTouchdowns === null ? "—" : `${snapshot.expectedTouchdowns.toFixed(1)} / ${snapshot.actualTouchdowns?.toFixed(0) ?? "—"}`}</td><td className={`${signalClass(snapshot.classification)} ${active ? styles.selectedCell : ""}`}>{snapshot.classification.replaceAll("-", " ")}</td><td>{snapshot.confidence} · {snapshot.sampleWeeks} wk</td></tr>;
          })}</tbody>
        </table>
        {rows.length === 0 ? <div className={styles.emptySheet}><div><strong>No players clear this filter.</strong><p>That is a valid result; do not manufacture a breakout from thin evidence.</p></div></div> : null}
      </div>
      {selected && selectedPlayer ? <Inspector eyebrow={`${selected.classification.replaceAll("-", " ")} · ${selected.confidence} confidence`} title={selectedPlayer.player.fullName} meta={`${position(selectedPlayer)} · ${selectedPlayer.player.team} · ${ownerFor(selectedPlayer)}`} onClose={() => setSelectedId(null)}><p className={styles.inspectorText}>{selected.summary}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Production gap</p><p className={styles.inspectorValue}>{selected.expectedPointsPerGame === null ? "Play-level xFP pending" : `${selected.actualPointsPerGame?.toFixed(1)} actual PPR/G vs. ${selected.expectedPointsPerGame.toFixed(1)} xFP/G · ${signed(selected.opportunityGapPerGame ?? 0)} expected-minus-actual`}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Role movement</p><p className={styles.inspectorValue}>{signed(selected.snapShareDelta * 100)} snap-share points · {signed(selected.routeParticipationDelta * 100)} route-share points · role score {signed(selected.roleScore)}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Model evidence</p>{selected.drivers.map((driver) => <p key={driver} className={styles.inspectorValue}>{driver}</p>)}</div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Interpretation</p><p className={styles.inspectorValue}>Positive xFP−actual means the opportunity has been better than the box score. Negative means production is running hot. Role breakout is deliberately separate because future usage can change before past xFP catches up.</p></div></Inspector> : null}
    </div>
  </div>;
}

export function TradesSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const myRoster = useMemo(() => dataset.players.filter((player) => player.availability === "my-roster" && position(player) !== "K"), [dataset.players]);
  const targets = useMemo(() => dataset.players.filter((player) => (player.availability === "trade-target" || player.availability === "league-rostered") && position(player) !== "K"), [dataset.players]);
  const [sendId, setSendId] = useState(myRoster[0]?.player.id ?? "");
  const [send2Id, setSend2Id] = useState("");
  const [receiveId, setReceiveId] = useState(targets[0]?.player.id ?? "");
  const [receive2Id, setReceive2Id] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(dataset.tradeIdeas.length ? 0 : null);
  const selected = selectedIndex === null ? null : dataset.tradeIdeas[selectedIndex] ?? null;
  const receiveTeam = dataset.players.find((player) => player.player.id === receiveId)?.rosterTeamId;
  const receive2Targets = targets.filter((player) => player.player.id !== receiveId && player.rosterTeamId === receiveTeam);
  const packageIncomplete = Boolean(send2Id) !== Boolean(receive2Id);
  const customTrade = useMemo(() => packageIncomplete ? null : analyzeTradeProposal(dataset.players, dataset.myTeam, dataset.leagueTeams, [sendId, send2Id].filter(Boolean), [receiveId, receive2Id].filter(Boolean)), [dataset, packageIncomplete, receive2Id, receiveId, send2Id, sendId]);
  return <div className={styles.sheetStack}><section className={styles.matrixPanel}><div><p className={styles.matrixLabel}>You send</p><div className={styles.matrixFields}><select value={sendId} onChange={(event) => setSendId(event.target.value)}>{myRoster.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {position(player)}</option>)}</select><select value={send2Id} onChange={(event) => setSend2Id(event.target.value)}><option value="">No second player</option>{myRoster.filter((player) => player.player.id !== sendId).map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {position(player)}</option>)}</select></div></div><div className={styles.matrixArrow}>→</div><div><p className={styles.matrixLabel}>You receive</p><div className={styles.matrixFields}><select value={receiveId} onChange={(event) => { setReceiveId(event.target.value); setReceive2Id(""); }}>{targets.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {position(player)}</option>)}</select><select value={receive2Id} onChange={(event) => setReceive2Id(event.target.value)}><option value="">No second player</option>{receive2Targets.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {position(player)}</option>)}</select></div></div><div className={styles.matrixResult}><span className={styles.matrixLabel}>Model result</span><strong>{packageIncomplete ? "Match both second slots" : customTrade?.verdict.replaceAll("-", " ") ?? "Select players"}</strong>{customTrade && customTrade.verdict !== "insufficient-data" ? <small>{signed(customTrade.immediateStarterDelta)} now · {signed(customTrade.restOfSeasonDelta)} ROS</small> : null}</div></section><div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}><div className={styles.gridRegion}><table className={styles.table} aria-label="Modeled trade ideas"><thead><tr><th className={styles.rowNumber}></th>{["A · Send", "B · Receive", "C · Manager", "D · Now Δ", "E · ROS Δ", "F · Their Δ", "G · Package", "H · Verdict"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{dataset.tradeIdeas.map((idea, index) => <tr key={`${idea.givePlayerIds.join("-")}-${idea.targetPlayerIds.join("-")}`} className={`${styles.dataRow} ${selectedIndex === index ? styles.selectedRow : ""}`} onClick={() => setSelectedIndex(index)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{idea.givePlayerIds.map((id) => nameFor(id, dataset)).join(" + ")}</td><td className={styles.primaryCell}>{idea.targetPlayerIds.map((id) => nameFor(id, dataset)).join(" + ")}</td><td>{idea.counterpartyTeamName}</td><td className={`${styles.numberCell} ${idea.immediateStarterDelta >= 0 ? styles.positiveCell : styles.negativeCell}`}>{signed(idea.immediateStarterDelta)}</td><td className={styles.numberCell}>{signed(idea.restOfSeasonDelta)}</td><td className={styles.numberCell}>{signed(idea.counterpartyStarterDelta)}</td><td>{idea.format.replaceAll("-", " ")}</td><td className={idea.verdict === "pursue" ? styles.positiveCell : styles.warningCell}>{idea.verdict}</td></tr>)}</tbody></table></div>{selected ? <TradeInspector idea={selected} dataset={dataset} onClose={() => setSelectedIndex(null)} /> : null}</div></div>;
}

function TradeInspector({ idea, dataset, onClose }: { idea: TradeIdeaSnapshot; dataset: InSeasonCommandCenterDataset; onClose: () => void }) {
  return <Inspector eyebrow={`${idea.verdict} · ${idea.format.replaceAll("-", " ")}`} title={`Get ${idea.targetPlayerIds.map((id) => nameFor(id, dataset)).join(" + ")}`} meta={`Send ${idea.givePlayerIds.map((id) => nameFor(id, dataset)).join(" + ")} · ${idea.counterpartyTeamName}`} onClose={onClose}><p className={styles.inspectorText}>{idea.summary}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Lineup impact</p><p className={styles.inspectorValue}>{signed(idea.immediateStarterDelta)} now · {signed(idea.restOfSeasonDelta)} return-adjusted · {signed(idea.playoffUpsideDelta)} upside</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Why they might accept</p><p className={styles.inspectorValue}>{signed(idea.counterpartyStarterDelta)} immediate value · {idea.constructionSummary}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Anchor check</p><p className={styles.inspectorValue}>{idea.qualitySummary}</p></div></Inspector>;
}

type NextGenSortKey = "player" | "position" | "team" | "rushAttempts" | "ryoe" | "ryoePerAttempt" | "targets" | "separation" | "yacoe" | "passAttempts" | "cpoe" | "timeToThrow" | "intendedAirYards";

type NextGenRow = {
  player: InSeasonPlayerSnapshot;
  playerName: string;
  position: string;
  team: string;
  owner: string;
  rushAttempts: number | null;
  ryoe: number | null;
  ryoePerAttempt: number | null;
  targets: number | null;
  separation: number | null;
  yacoe: number | null;
  passAttempts: number | null;
  cpoe: number | null;
  timeToThrow: number | null;
  intendedAirYards: number | null;
};

const nextGenColumns: Array<{ key: NextGenSortKey; label: string; numeric?: boolean }> = [
  { key: "player", label: "A · Player" },
  { key: "position", label: "B · Pos" },
  { key: "team", label: "C · Team" },
  { key: "rushAttempts", label: "D · Rush Att", numeric: true },
  { key: "ryoe", label: "E · RYOE", numeric: true },
  { key: "ryoePerAttempt", label: "F · RYOE/Att", numeric: true },
  { key: "targets", label: "G · Targets", numeric: true },
  { key: "separation", label: "H · Separation", numeric: true },
  { key: "yacoe", label: "I · YACOE", numeric: true },
  { key: "passAttempts", label: "J · Pass Att", numeric: true },
  { key: "cpoe", label: "K · CPOE", numeric: true },
  { key: "timeToThrow", label: "L · Time to Throw", numeric: true },
  { key: "intendedAirYards", label: "M · Intended Air", numeric: true },
];

function metric(value: number | null, digits = 1, suffix = "") {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}

export function NextGenStatsSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<NextGenSortKey>("ryoePerAttempt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const teamNames = new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name] as const));
  const rows: NextGenRow[] = dataset.players.flatMap((player) => {
    const advanced = player.advancedUsage;
    if (!advanced || advanced.week !== dataset.evidenceStatus.week) return [];
    const passing = advanced.nextGenPassing;
    const receiving = advanced.nextGenReceiving;
    const hasRushing = advanced.statuses.rushingYardsOverExpected === "verified" && advanced.rushingYardsOverExpectedPerAttempt !== null;
    if (!passing && !receiving && !hasRushing) return [];
    return [{
      player,
      playerName: player.player.fullName,
      position: position(player),
      team: player.player.team,
      owner: player.availability === "my-roster" ? "My Team" : player.availability === "free-agent" ? "Free Agent" : teamNames.get(player.rosterTeamId ?? "") ?? "League roster",
      rushAttempts: hasRushing ? player.evidence?.observedCarries ?? null : null,
      ryoe: hasRushing ? advanced.rushingYardsOverExpected : null,
      ryoePerAttempt: hasRushing ? advanced.rushingYardsOverExpectedPerAttempt : null,
      targets: receiving?.targets ?? null,
      separation: receiving?.avgSeparation ?? null,
      yacoe: receiving?.avgYacAboveExpectation ?? null,
      passAttempts: passing?.attempts ?? null,
      cpoe: passing?.completionPercentageAboveExpectation ?? null,
      timeToThrow: passing?.avgTimeToThrow ?? null,
      intendedAirYards: passing?.avgIntendedAirYards ?? receiving?.avgIntendedAirYards ?? null,
    }];
  }).sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    if (left === null) return 1;
    if (right === null) return -1;
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return direction === "asc" ? comparison : -comparison;
  });
  const selected = rows.find((row) => row.player.player.id === selectedId) ?? null;

  function chooseSort(key: NextGenSortKey) {
    if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection(key === "player" || key === "position" || key === "team" ? "asc" : "desc"); }
  }

  return <div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}><div className={styles.gridRegion}><table className={`${styles.table} ${styles.nextGenTable}`} aria-label={`Week ${dataset.evidenceStatus.week} Next Gen Stats`}><thead><tr><th className={styles.rowNumber}></th>{nextGenColumns.map((column) => <th key={column.key}><button className={styles.sortHeader} onClick={() => chooseSort(column.key)}>{column.label}{sortKey === column.key ? direction === "asc" ? " ▲" : " ▼" : ""}</button></th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.player.player.id} className={`${styles.dataRow} ${selectedId === row.player.player.id ? styles.selectedRow : ""}`} onClick={() => setSelectedId(row.player.player.id)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{row.playerName}</td><td>{row.position}</td><td>{row.team}</td><td className={styles.numberCell}>{row.rushAttempts ?? "—"}</td><td className={styles.numberCell}>{metric(row.ryoe, 1)}</td><td className={`${styles.numberCell} ${row.ryoePerAttempt !== null ? row.ryoePerAttempt >= 0 ? styles.positiveCell : styles.negativeCell : ""}`}>{metric(row.ryoePerAttempt, 2)}</td><td className={styles.numberCell}>{row.targets ?? "—"}</td><td className={styles.numberCell}>{metric(row.separation, 2)}</td><td className={`${styles.numberCell} ${row.yacoe !== null ? row.yacoe >= 0 ? styles.positiveCell : styles.negativeCell : ""}`}>{metric(row.yacoe, 2)}</td><td className={styles.numberCell}>{row.passAttempts ?? "—"}</td><td className={`${styles.numberCell} ${row.cpoe !== null ? row.cpoe >= 0 ? styles.positiveCell : styles.negativeCell : ""}`}>{metric(row.cpoe, 1, "%")}</td><td className={styles.numberCell}>{metric(row.timeToThrow, 2, "s")}</td><td className={styles.numberCell}>{metric(row.intendedAirYards, 1)}</td></tr>)}</tbody></table>{rows.length === 0 ? <div className={styles.emptySheet}>Refresh evidence to load exact-week Next Gen Stats.</div> : null}</div>{selected ? <Inspector eyebrow={`Week ${dataset.evidenceStatus.week} Next Gen Stats · ${selected.position} · ${selected.owner}`} title={selected.playerName} meta={`${selected.team} · verified nflverse NGS row`} onClose={() => setSelectedId(null)}><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Rushing</p><p className={styles.inspectorValue}>{selected.rushAttempts ?? "—"} attempts · {metric(selected.ryoe, 1)} RYOE · {metric(selected.ryoePerAttempt, 2)} per attempt</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Receiving</p><p className={styles.inspectorValue}>{selected.targets ?? "—"} targets · {metric(selected.separation, 2)} yards separation · {metric(selected.yacoe, 2)} YAC over expected</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Passing</p><p className={styles.inspectorValue}>{selected.passAttempts ?? "—"} attempts · {metric(selected.cpoe, 1, "%")} CPOE · {metric(selected.timeToThrow, 2, "s")} time to throw · {metric(selected.intendedAirYards, 1)} intended air yards</p></div></Inspector> : null}</div>;
}

export function DataSyncSheet({ dataset, onDatasetChange }: { dataset: InSeasonCommandCenterDataset; onDatasetChange: (next: InSeasonCommandCenterDataset) => void }) {
  const [status, setStatus] = useState("Ready. The active snapshot remains in place until a replacement clears validation.");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<YahooRosterPdfPreview | null>(null);

  async function refreshEvidence() {
    setBusy(true); setStatus("Refreshing weekly evidence…");
    try {
      const response = await fetch("/api/fantasy/evidence", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.players)) throw new Error(body.error ?? "Refresh failed");
      onDatasetChange(applyWorkbookEvidenceResponse(dataset, body));
      setStatus(`${body.observedPlayers ?? 0} player observations refreshed. Missing records remain unknown rather than zero.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Evidence refresh failed; the previous snapshot was retained."); } finally { setBusy(false); }
  }

  async function refreshYahoo() {
    setBusy(true); setStatus("Checking the Yahoo bridge…");
    try {
      const response = await fetch("/api/fantasy/yahoo-extension", { cache: "no-store" });
      const body = await response.json() as { inventorySnapshot?: YahooLeagueInventorySnapshot | null };
      if (!response.ok || !body.inventorySnapshot) throw new Error("No recent Yahoo scan found. Use the roster PDF import instead.");
      const rebuilt = rebuildFromInventory(dataset, body.inventorySnapshot);
      if (!rebuilt.applied.transactionReady) throw new Error(rebuilt.applied.blockers.join(" "));
      onDatasetChange(rebuilt.dataset);
      setStatus(`Yahoo inventory applied: ${rebuilt.applied.matchedCount} modeled players matched.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Yahoo refresh failed; the previous snapshot was retained."); } finally { setBusy(false); }
  }

  async function previewPdf(file: File | undefined) {
    if (!file) return;
    setBusy(true); setPreview(null); setStatus("Reading Yahoo roster PDF…");
    try { const lines = await extractYahooRosterPdfLines(file); const nextPreview = parseYahooRosterPdfLines(lines, dataset.players, dataset.leagueTeams); setPreview(nextPreview); setStatus(nextPreview.ready ? `${nextPreview.detectedTeams} teams and ${nextPreview.matchedPlayers} players matched. Ready to apply.` : nextPreview.blockers.join(" ")); }
    catch { setStatus("The PDF could not be read. Print Yahoo's Starting Rosters page with selectable text."); }
    finally { setBusy(false); }
  }

  function applyPdf() {
    if (!preview?.ready) return;
    try { const inventory = buildYahooInventoryFromPdfPreview(preview, dataset.players, dataset.myTeam.teamId); const rebuilt = rebuildFromInventory(dataset, inventory); if (!rebuilt.applied.transactionReady) throw new Error(rebuilt.applied.blockers.join(" ")); onDatasetChange(rebuilt.dataset); window.localStorage.setItem("fantasy-in-season-yahoo-pdf-inventory-v1", JSON.stringify(inventory)); setStatus("Yahoo roster PDF applied and every recommendation recalculated."); setPreview(null); }
    catch (error) { setStatus(error instanceof Error ? error.message : "The roster PDF could not be applied."); }
  }

  const xfpSource = dataset.evidenceStatus.sources.find((source) => /ffopportunity/i.test(source.label));
  const xfpPlayers = dataset.productionOpportunity.filter((snapshot) => snapshot.source === "ffopportunity").length;
  const rows = [
    { source: "Weekly evidence", captured: dataset.evidenceStatus.capturedAt, coverage: `${dataset.evidenceStatus.matchedPlayers} players`, state: "Loaded", action: "Refresh", run: refreshEvidence },
    { source: "Play-level expected points", captured: dataset.evidenceStatus.capturedAt, coverage: xfpPlayers ? `${xfpPlayers} qualified players` : "Role-only fallback", state: xfpSource?.status === "unavailable" || !xfpPlayers ? "Fallback" : "Loaded", action: "Refresh", run: refreshEvidence },
    { source: "Yahoo roster snapshot", captured: dataset.rosterSnapshot.capturedAt, coverage: dataset.rosterSnapshot.source, state: "Loaded", action: "Bridge", run: refreshYahoo },
    { source: "League configuration", captured: leagueSourceOfTruth.updatedAt, coverage: leagueSourceOfTruth.version, state: "Validated", action: "Locked", run: null },
  ];
  return <div className={styles.sheetStack}><section className={styles.syncToolbar}><button disabled={busy} onClick={() => void refreshEvidence()}>Refresh evidence</button><button disabled={busy} onClick={() => void refreshYahoo()}>Read Yahoo bridge</button><label className={styles.fileButton}><input type="file" accept="application/pdf,.pdf" onChange={(event) => void previewPdf(event.target.files?.[0])} disabled={busy} />Choose Yahoo PDF</label>{preview?.ready ? <button onClick={applyPdf}>Apply validated PDF</button> : null}<span>{busy ? "Working…" : status}</span></section><div className={styles.workspace}><div className={styles.gridRegion}><table className={styles.table} aria-label="Data source status"><thead><tr><th className={styles.rowNumber}></th>{["A · Source", "B · Captured", "C · Coverage", "D · State", "E · Action", "F · Integrity note"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.source} className={styles.dataRow}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{row.source}</td><td>{new Date(row.captured).toLocaleString()}</td><td>{row.coverage}</td><td className={row.state === "Fallback" ? styles.warningCell : styles.positiveCell}>{row.state}</td><td className={row.run ? styles.actionCell : ""} onClick={() => row.run?.()}>{row.action}</td><td>{row.source === "League configuration" ? `${leagueSourceOfTruth.teams} teams · canonical source` : row.source === "Play-level expected points" ? xfpSource?.detail ?? "Previous snapshot retained on failure" : "Previous snapshot retained on failure"}</td></tr>)}{preview ? <tr><th className={styles.rowNumber}>{rows.length + 1}</th><td className={styles.primaryCell}>PDF preview</td><td>Current session</td><td>{preview.detectedTeams}/{leagueSourceOfTruth.teams} teams · {preview.matchedPlayers} players</td><td className={preview.ready ? styles.positiveCell : styles.negativeCell}>{preview.ready ? "Ready" : "Blocked"}</td><td>{preview.ownershipChanges.length} changes</td><td>{preview.blockers[0] ?? preview.warnings[0] ?? "Every roster row matched"}</td></tr> : null}</tbody></table></div></div></div>;
}

export function DraftArchiveSheet() {
  return <div className={styles.archiveSheet}><p className={styles.inspectorEyebrow}>2026 frozen workbook</p><h2>Draft Archive</h2><p>The final board, rehearsal tools, decision journal, and draft-day state remain preserved separately from the live in-season model.</p><Link href="/fantasy-football?view=draft">Open the archived draft workbook →</Link></div>;
}
