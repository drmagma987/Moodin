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
import styles from "./fantasy-workbook.module.css";

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function position(player: InSeasonPlayerSnapshot) {
  return player.player.positions[0] ?? "WR";
}

function nameFor(playerId: string | null, dataset: InSeasonCommandCenterDataset) {
  if (!playerId) return "Open roster spot";
  return dataset.players.find((entry) => entry.player.id === playerId)?.player.fullName ?? playerId;
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

function Inspector({ eyebrow, title, meta, children, onClose }: { eyebrow: string; title: string; meta?: string; children: React.ReactNode; onClose: () => void }) {
  return <aside className={styles.inspector}><button className={styles.closeInspector} onClick={onClose} aria-label="Close details">×</button><p className={styles.inspectorEyebrow}>{eyebrow}</p><h2 className={styles.inspectorTitle}>{title}</h2>{meta ? <p className={styles.inspectorMeta}>{meta}</p> : null}{children}</aside>;
}

export function WaiversSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const recommendations = dataset.waiverRecommendations.filter((entry) => entry.verdict !== "pass");
  const [selectedId, setSelectedId] = useState<string | null>(recommendations[0]?.addPlayerId ?? null);
  const selected = recommendations.find((entry) => entry.addPlayerId === selectedId) ?? null;
  return <div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}><div className={styles.gridRegion}><table className={styles.table} aria-label="Waiver recommendations"><thead><tr><th className={styles.rowNumber}></th>{["A · Rank", "B · Add", "C · Position", "D · Drop", "E · Bid Range", "F · Starter Δ", "G · Upside Δ", "H · Confidence", "I · Verdict"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{recommendations.map((recommendation, index) => { const player = dataset.players.find((entry) => entry.player.id === recommendation.addPlayerId); if (!player) return null; const active = recommendation.addPlayerId === selectedId; return <tr key={recommendation.addPlayerId} className={`${styles.dataRow} ${active ? styles.selectedRow : ""}`} onClick={() => setSelectedId(recommendation.addPlayerId)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{index + 1}</td><td className={styles.primaryCell}>{player.player.fullName}</td><td>{position(player)}</td><td>{nameFor(recommendation.dropPlayerId, dataset)}</td><td className={styles.numberCell}>{recommendation.faabRange?.label ?? "Watch"}</td><td className={`${styles.numberCell} ${recommendation.starterDelta >= 0 ? styles.positiveCell : styles.negativeCell}`}>{signed(recommendation.starterDelta)}</td><td className={styles.numberCell}>{signed(recommendation.playoffUpsideDelta)}</td><td className={recommendation.confidence === "high" ? styles.positiveCell : styles.warningCell}>{recommendation.confidence}</td><td className={`${styles.actionCell} ${active ? styles.selectedCell : ""}`}>{recommendation.verdict}</td></tr>; })}</tbody></table></div>{selected ? <WaiverInspector recommendation={selected} dataset={dataset} onClose={() => setSelectedId(null)} /> : null}</div>;
}

function WaiverInspector({ recommendation, dataset, onClose }: { recommendation: WaiverRecommendationSnapshot; dataset: InSeasonCommandCenterDataset; onClose: () => void }) {
  return <Inspector eyebrow={`${recommendation.verdict} · ${recommendation.confidence} confidence`} title={nameFor(recommendation.addPlayerId, dataset)} meta={`${recommendation.opportunityType.replaceAll("-", " ")} · edge ${recommendation.edgeScore.toFixed(1)}`} onClose={onClose}><p className={styles.inspectorText}>{recommendation.opportunityCase}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Transaction</p><p className={styles.inspectorValue}>Add {nameFor(recommendation.addPlayerId, dataset)}{recommendation.dropPlayerId ? ` · Drop ${nameFor(recommendation.dropPlayerId, dataset)}` : " · Use open spot"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Bid guidance</p><p className={styles.inspectorValue}>{recommendation.faabRange?.label ?? "Watch only"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>What breaks the case</p><p className={styles.inspectorValue}>{recommendation.primaryRisk}</p></div></Inspector>;
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

export function LeagueSheet({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const teamNames = new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name] as const));
  const trends = new Map(dataset.opportunityTrends.map((trend) => [trend.playerId, trend] as const));
  const rows = [...dataset.players].sort((a, b) => (a.marketRank ?? 999) - (b.marketRank ?? 999));
  const selected = dataset.players.find((player) => player.player.id === selectedId) ?? null;
  const selectedTrend = selected ? trends.get(selected.player.id) : null;
  return <div className={`${styles.workspace} ${selected ? styles.workspaceWithInspector : ""}`}><div className={styles.gridRegion}><table className={styles.table} aria-label="League player map"><thead><tr><th className={styles.rowNumber}></th>{["A · Player", "B · Pos", "C · Team", "D · Owner", "E · Market Rank", "F · ROS Median", "G · Usage", "H · Recommendation"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((player, index) => { const trend = trends.get(player.player.id); const owner = player.availability === "my-roster" ? "My Team" : player.availability === "free-agent" ? "Free Agent" : teamNames.get(player.rosterTeamId ?? "") ?? "League roster"; return <tr key={player.player.id} className={`${styles.dataRow} ${selectedId === player.player.id ? styles.selectedRow : ""}`} onClick={() => setSelectedId(player.player.id)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{player.player.fullName}</td><td>{position(player)}</td><td>{player.player.team}</td><td>{owner}</td><td className={styles.numberCell}>{player.marketRank ?? "—"}</td><td className={styles.numberCell}>{player.rosProjection.p50.toFixed(1)}</td><td className={`${styles.numberCell} ${(trend?.opportunityScore ?? 0) >= 0 ? styles.positiveCell : styles.negativeCell}`}>{trend ? signed(trend.opportunityScore) : "—"}</td><td className={styles.actionCell}>{trend?.recommendation ?? "hold"}</td></tr>; })}</tbody></table></div>{selected ? <Inspector eyebrow={`${position(selected)} · ${selected.player.team} · ${selected.availability.replaceAll("-", " ")}`} title={selected.player.fullName} meta={`Market rank ${selected.marketRank ?? "—"} · ROS ${selected.rosProjection.p50.toFixed(1)}`} onClose={() => setSelectedId(null)}><p className={styles.inspectorText}>{selectedTrend?.summary ?? selected.opportunityContext?.reason ?? "No actionable role change is currently modeled."}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Current call</p><p className={styles.inspectorValue}>{selectedTrend?.recommendation ?? "Hold"} · {selectedTrend?.classification.replaceAll("-", " ") ?? "priced normally"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Usage window</p><p className={styles.inspectorValue}>{Math.round(selected.recentUsage.snapShare * 100)}% snaps · {selected.recentUsage.targetsPerGame.toFixed(1)} targets · {selected.recentUsage.carriesPerGame.toFixed(1)} carries per game</p></div></Inspector> : null}</div>;
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
      const refreshed = new Map<string, InSeasonPlayerSnapshot>(body.players.map((player: InSeasonPlayerSnapshot) => [player.player.id, player]));
      const players = applyCurrentSeasonProjectionUpdates(dataset.players.map((player) => { const update = refreshed.get(player.player.id); return update ? { ...update, availability: player.availability, rosterTeamId: player.rosterTeamId, injuryStatus: player.injuryStatus === "IR" && update.injuryStatus !== "IR" ? "IR" : update.injuryStatus } : player; }), { week: body.week ?? dataset.evidenceStatus.week, capturedAt: body.capturedAt ?? new Date().toISOString(), observationWeight: dataset.evidenceStatus.evidenceWeight });
      const waiverRecommendations = buildWaiverRecommendationSnapshots(players, dataset.myTeam);
      const tradeIdeas = buildTradeIdeaSnapshots(players, dataset.myTeam, dataset.leagueTeams);
      onDatasetChange({ ...dataset, players, waiverRecommendations, tradeIdeas, opportunityTrends: buildOpportunityTrendSnapshots(players), advancedMetricSignals: buildAdvancedMetricSignals(players, new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name]))), actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas), evidenceStatus: { ...dataset.evidenceStatus, ...(body.slate ?? {}), week: body.week ?? dataset.evidenceStatus.week, capturedAt: body.capturedAt ?? dataset.evidenceStatus.capturedAt, matchedPlayers: body.observedPlayers ?? dataset.evidenceStatus.matchedPlayers } });
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

  const rows = [
    { source: "Weekly evidence", captured: dataset.evidenceStatus.capturedAt, coverage: `${dataset.evidenceStatus.matchedPlayers} players`, state: "Loaded", action: "Refresh", run: refreshEvidence },
    { source: "Yahoo roster snapshot", captured: dataset.rosterSnapshot.capturedAt, coverage: dataset.rosterSnapshot.source, state: "Loaded", action: "Bridge", run: refreshYahoo },
    { source: "League configuration", captured: leagueSourceOfTruth.updatedAt, coverage: leagueSourceOfTruth.version, state: "Validated", action: "Locked", run: null },
  ];
  return <div className={styles.sheetStack}><section className={styles.syncToolbar}><button disabled={busy} onClick={() => void refreshEvidence()}>Refresh evidence</button><button disabled={busy} onClick={() => void refreshYahoo()}>Read Yahoo bridge</button><label className={styles.fileButton}><input type="file" accept="application/pdf,.pdf" onChange={(event) => void previewPdf(event.target.files?.[0])} disabled={busy} />Choose Yahoo PDF</label>{preview?.ready ? <button onClick={applyPdf}>Apply validated PDF</button> : null}<span>{busy ? "Working…" : status}</span></section><div className={styles.workspace}><div className={styles.gridRegion}><table className={styles.table} aria-label="Data source status"><thead><tr><th className={styles.rowNumber}></th>{["A · Source", "B · Captured", "C · Coverage", "D · State", "E · Action", "F · Integrity note"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.source} className={styles.dataRow}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{row.source}</td><td>{new Date(row.captured).toLocaleString()}</td><td>{row.coverage}</td><td className={styles.positiveCell}>{row.state}</td><td className={row.run ? styles.actionCell : ""} onClick={() => row.run?.()}>{row.action}</td><td>{index === 2 ? `${leagueSourceOfTruth.teams} teams · canonical source` : "Previous snapshot retained on failure"}</td></tr>)}{preview ? <tr><th className={styles.rowNumber}>4</th><td className={styles.primaryCell}>PDF preview</td><td>Current session</td><td>{preview.detectedTeams}/{leagueSourceOfTruth.teams} teams · {preview.matchedPlayers} players</td><td className={preview.ready ? styles.positiveCell : styles.negativeCell}>{preview.ready ? "Ready" : "Blocked"}</td><td>{preview.ownershipChanges.length} changes</td><td>{preview.blockers[0] ?? preview.warnings[0] ?? "Every roster row matched"}</td></tr> : null}</tbody></table></div></div></div>;
}

export function DraftArchiveSheet() {
  return <div className={styles.archiveSheet}><p className={styles.inspectorEyebrow}>2026 frozen workbook</p><h2>Draft Archive</h2><p>The final board, rehearsal tools, decision journal, and draft-day state remain preserved separately from the live in-season model.</p><Link href="/fantasy-football?view=draft">Open the archived draft workbook →</Link></div>;
}
