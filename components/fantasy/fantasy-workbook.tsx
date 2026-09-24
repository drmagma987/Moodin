"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InSeasonCommandCenterDataset, TransactionQueueEntry } from "@/lib/fantasy/types";
import { applyWorkbookEvidenceResponse, DataSyncSheet, DraftArchiveSheet, NextGenStatsSheet, ProductionOpportunitySheet, TradesSheet, WaiverMarketSheet, WaiversSheet } from "./fantasy-workbook-sheets";
import styles from "./fantasy-workbook.module.css";

type WorkbookMode = "work" | "fantasy";
type FantasySheet = "edge" | "opportunity" | "waivers" | "market" | "trades" | "league" | "sync" | "draft";

type WorkRow = {
  unit: string;
  workstream: string;
  completion: string;
  variance: string;
  status: "On track" | "Monitor" | "At risk";
  due: string;
  next: string;
};

const WORK_SHEETS = ["Summary", "Forecast", "Capacity", "Variance", "Notes"] as const;
const FANTASY_SHEETS: Array<{ id: FantasySheet; label: string }> = [
  { id: "edge", label: "Edge Brief" },
  { id: "opportunity", label: "xFP Monitor" },
  { id: "waivers", label: "Waivers" },
  { id: "market", label: "Waiver Market" },
  { id: "trades", label: "Trade Lab" },
  { id: "league", label: "Next Gen Stats" },
  { id: "sync", label: "Data Sync" },
  { id: "draft", label: "Draft Archive" },
];

const WORK_ROWS: WorkRow[] = [
  { unit: "North Region", workstream: "Q3 forecast", completion: "92.4%", variance: "+3.8%", status: "On track", due: "Sep 25", next: "Review" },
  { unit: "Central Region", workstream: "Pipeline", completion: "87.1%", variance: "-1.2%", status: "Monitor", due: "Sep 26", next: "Hold" },
  { unit: "South Region", workstream: "Utilization", completion: "95.6%", variance: "+4.1%", status: "On track", due: "Sep 27", next: "Review" },
  { unit: "Enterprise", workstream: "Renewal model", completion: "78.9%", variance: "-3.4%", status: "At risk", due: "Sep 25", next: "Escalate" },
  { unit: "Commercial", workstream: "Capacity plan", completion: "89.7%", variance: "+0.9%", status: "On track", due: "Sep 30", next: "Hold" },
  { unit: "Operations", workstream: "Backlog aging", completion: "83.2%", variance: "-0.4%", status: "Monitor", due: "Oct 01", next: "Review" },
  { unit: "Finance", workstream: "Run-rate check", completion: "97.3%", variance: "+2.7%", status: "On track", due: "Oct 02", next: "Hold" },
  { unit: "Customer Success", workstream: "Coverage", completion: "85.8%", variance: "+1.6%", status: "On track", due: "Oct 03", next: "Review" },
  { unit: "Programs", workstream: "Milestone plan", completion: "73.5%", variance: "-5.2%", status: "At risk", due: "Sep 29", next: "Escalate" },
  { unit: "Analytics", workstream: "Data quality", completion: "91.0%", variance: "+1.1%", status: "On track", due: "Oct 04", next: "Hold" },
  { unit: "Enablement", workstream: "Training plan", completion: "88.4%", variance: "+0.3%", status: "Monitor", due: "Oct 05", next: "Review" },
  { unit: "Strategy", workstream: "Scenario B", completion: "82.6%", variance: "-2.1%", status: "Monitor", due: "Oct 07", next: "Hold" },
];

function workRowsForSheet(sheet: (typeof WORK_SHEETS)[number]) {
  const sheetOffset = WORK_SHEETS.indexOf(sheet);
  return WORK_ROWS.map((row, index) => {
    const completion = Math.min(99.4, Math.max(68.2, Number.parseFloat(row.completion) + ((index * 7 + sheetOffset * 3) % 9 - 4) * 0.7));
    const variance = ((index * 5 + sheetOffset * 7) % 13 - 6) * 0.6;
    const status: WorkRow["status"] = completion < 79 || variance < -2.5 ? "At risk" : completion < 88 || variance < 0 ? "Monitor" : "On track";
    return { ...row, workstream: sheet === "Summary" ? row.workstream : `${sheet} ${index % 3 === 0 ? "review" : index % 3 === 1 ? "model" : "plan"}`, completion: `${completion.toFixed(1)}%`, variance: `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%`, status };
  });
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function playerName(playerId: string | null, dataset: InSeasonCommandCenterDataset) {
  if (!playerId) return "Open roster spot";
  return dataset.players.find((entry) => entry.player.id === playerId)?.player.fullName ?? "Unknown player";
}

function transactionLabel(action: InSeasonCommandCenterDataset["actionQueue"][number]) {
  const transaction = action.proposedTransaction;
  if (transaction.kind === "add-drop") {
    const adds = transaction.add.map((player) => player.fullName).join(" + ");
    const drops = transaction.drop.map((player) => player.fullName).join(" + ");
    return drops ? `${adds} / ${drops}` : adds;
  }
  return `${transaction.send.map((player) => player.fullName).join(" + ")} → ${transaction.receive.map((player) => player.fullName).join(" + ")}`;
}

function waiverForAction(action: TransactionQueueEntry | null, dataset: InSeasonCommandCenterDataset) {
  const transaction = action?.proposedTransaction;
  if (!transaction || transaction.kind !== "add-drop") return null;
  return dataset.waiverRecommendations.find((entry) => entry.addPlayerId === transaction.add[0]?.playerId) ?? null;
}

function tradeForAction(action: TransactionQueueEntry | null, dataset: InSeasonCommandCenterDataset) {
  const transaction = action?.proposedTransaction;
  if (!transaction || transaction.kind !== "trade-proposal") return null;
  const sendIds = transaction.send.map((player) => player.playerId).filter(Boolean).join("|");
  const receiveIds = transaction.receive.map((player) => player.playerId).filter(Boolean).join("|");
  return dataset.tradeIdeas.find((entry) => entry.givePlayerIds.join("|") === sendIds && entry.targetPlayerIds.join("|") === receiveIds) ?? null;
}

export function FantasyWorkbook({ dataset: initialDataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [dataset, setDataset] = useState(initialDataset);
  const [mode, setMode] = useState<WorkbookMode>("work");
  const [fantasySheet, setFantasySheet] = useState<FantasySheet>("edge");
  const [workSheet, setWorkSheet] = useState<(typeof WORK_SHEETS)[number]>("Summary");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(dataset.actionQueue[0]?.id ?? null);

  useEffect(() => {
    document.title = "Weekly Operations Model";
    const activateWorkMode = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMode("work");
    };
    window.addEventListener("keydown", activateWorkMode);
    return () => window.removeEventListener("keydown", activateWorkMode);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fantasy/evidence", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.players)) throw new Error(body.error ?? "Refresh failed");
        if (!cancelled) setDataset((current) => applyWorkbookEvidenceResponse(current, body));
      })
      .catch(() => {
        // Retain the verified bundled snapshot when live evidence is unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  const selectedAction = useMemo(
    () => dataset.actionQueue.find((entry) => entry.id === selectedActionId) ?? null,
    [dataset.actionQueue, selectedActionId],
  );

  const selectedWaiver = waiverForAction(selectedAction, dataset);
  const selectedTrade = tradeForAction(selectedAction, dataset);
  const workRows = useMemo(() => workRowsForSheet(workSheet), [workSheet]);

  const switchMode = (nextMode: WorkbookMode) => setMode(nextMode);
  const activeSheetLabel = mode === "work"
    ? workSheet
    : FANTASY_SHEETS.find((sheet) => sheet.id === fantasySheet)?.label ?? "Edge Brief";

  return (
    <main className={styles.shell}>
      <div className={styles.workbook}>
        <header>
          <div className={styles.titleBar}>
            <span className={styles.titleName}>Weekly Operations Model.xlsx — {mode === "work" ? "Saved" : "Private view"}</span>
            <div className={styles.titleActions}><span>Search</span><span>Comments</span><span>Share</span></div>
          </div>
          <div className={styles.menuBar} aria-label="Workbook menu">
            {['File', 'Home', 'Insert', 'Data', 'Review', 'View'].map((item) => <button key={item} className={`${styles.menuButton} ${item === 'Home' ? styles.menuButtonActive : ''}`}>{item}</button>)}
          </div>
          <div className={styles.ribbon}>
            <div className={styles.ribbonGroup}><button className={styles.toolButton}>▣ Paste</button><button className={styles.toolButton}><strong>B</strong></button><button className={styles.toolButton}><em>I</em></button></div>
            <div className={styles.ribbonGroup}><button className={styles.toolButton}>Sort A–Z</button><button className={styles.toolButton}>Filter</button><button className={styles.toolButton}>Σ Sum</button></div>
            <div className={styles.modeControl}>
              <span className={styles.modeLabel}>Workbook view</span>
              <div className={styles.modeToggle} aria-label="Workbook view">
                <button className={`${styles.modeButton} ${mode === "work" ? styles.modeButtonActive : ""}`} aria-pressed={mode === "work"} onClick={() => switchMode("work")}>Work</button>
                <button className={`${styles.modeButton} ${mode === "fantasy" ? styles.modeButtonActive : ""}`} aria-pressed={mode === "fantasy"} onClick={() => switchMode("fantasy")}>FF</button>
              </div>
            </div>
          </div>
          <div className={styles.formulaBar}>
            <div className={styles.nameBox}>{mode === "work" ? "G7" : selectedAction ? `E${Math.max(2, dataset.actionQueue.findIndex((entry) => entry.id === selectedAction.id) + 2)}` : "A1"}</div>
            <div className={styles.formulaIcon}>fx</div>
            <div className={styles.formulaValue}>{mode === "work" ? '=IF(E7>0,"REVIEW","HOLD")' : selectedAction ? `=DECISION_EDGE("${selectedAction.kind.toUpperCase()}","${selectedAction.priority.toUpperCase()}")` : "=REFRESH_REQUIRED()"}</div>
          </div>
        </header>

        {mode === "work" ? (
          <div className={styles.workspace}>
            <div className={styles.gridRegion}>
              <table className={styles.table} aria-label={`${workSheet} operating model`}>
                <thead><tr><th className={styles.rowNumber}></th>{["A · Business Unit", "B · Workstream", "C · Completion", "D · Variance", "E · Status", "F · Due", "G · Next Step"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
                <tbody>{workRows.map((row, index) => <tr key={`${row.unit}-${row.workstream}`} className={styles.dataRow}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{row.unit}</td><td className={styles.primaryCell}>{row.workstream}</td><td className={styles.numberCell}>{row.completion}</td><td className={styles.numberCell}>{row.variance}</td><td className={row.status === "On track" ? styles.positiveCell : styles.warningCell}>{row.status}</td><td>{row.due}</td><td className={styles.actionCell}>{row.next}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : fantasySheet === "edge" ? (
          <div className={`${styles.workspace} ${selectedAction ? styles.workspaceWithInspector : ""}`}>
            <div className={styles.gridRegion}>
              <table className={styles.table} aria-label="Fantasy decision queue">
                <thead><tr><th className={styles.rowNumber}></th>{["A · Priority", "B · Decision", "C · Player / Package", "D · Countermove", "E · Edge", "F · Confidence", "G · Action"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
                <tbody>{dataset.actionQueue.map((action, index) => {
                  const waiver = waiverForAction(action, dataset);
                  const trade = tradeForAction(action, dataset);
                  const edge = waiver?.edgeScore ?? trade?.starterDelta ?? 0;
                  const confidence = waiver?.confidence ?? trade?.verdict ?? "review";
                  const countermove = action.proposedTransaction.kind === "add-drop" ? playerName(action.proposedTransaction.drop[0]?.playerId ?? null, dataset) : trade?.counterpartyTeamName ?? "League manager";
                  const isSelected = action.id === selectedActionId;
                  return <tr key={action.id} className={`${styles.dataRow} ${isSelected ? styles.selectedRow : ""}`} onClick={() => setSelectedActionId(action.id)}><th className={styles.rowNumber}>{index + 1}</th><td className={styles.primaryCell}>{action.priority.replace("-", " ")}</td><td>{action.kind === "waiver" ? "Add / drop" : "Trade proposal"}</td><td className={styles.primaryCell}>{transactionLabel(action)}</td><td>{countermove}</td><td className={`${styles.numberCell} ${edge >= 0 ? styles.positiveCell : styles.negativeCell}`}>{signed(edge)}</td><td className={confidence === "high" || confidence === "pursue" ? styles.positiveCell : styles.warningCell}>{confidence}</td><td className={`${styles.actionCell} ${isSelected ? styles.selectedCell : ""}`}>Review</td></tr>;
                })}</tbody>
              </table>
            </div>
            {selectedAction ? <aside className={styles.inspector} aria-label="Selected recommendation details"><button className={styles.closeInspector} onClick={() => setSelectedActionId(null)} aria-label="Close details">×</button><p className={styles.inspectorEyebrow}>{selectedAction.kind} · {selectedAction.priority}</p><h2 className={styles.inspectorTitle}>{selectedAction.title}</h2><p className={styles.inspectorMeta}>{transactionLabel(selectedAction)}</p><p className={styles.inspectorText}>{selectedAction.summary}</p><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>Model call</p><p className={styles.inspectorValue}>{selectedWaiver ? `${selectedWaiver.verdict.toUpperCase()} · ${selectedWaiver.faabRange?.label ?? "Watch only"}` : selectedTrade ? `${selectedTrade.verdict.toUpperCase()} · ${signed(selectedTrade.starterDelta)} starter value` : "Review supporting evidence"}</p></div><div className={styles.inspectorBlock}><p className={styles.inspectorLabel}>What could break the case</p><p className={styles.inspectorValue}>{selectedWaiver?.primaryRisk ?? selectedTrade?.qualitySummary ?? "Recheck roster ownership and current injury context before acting."}</p></div></aside> : null}
          </div>
        ) : fantasySheet === "opportunity" ? <ProductionOpportunitySheet dataset={dataset} />
          : fantasySheet === "waivers" ? <WaiversSheet dataset={dataset} />
          : fantasySheet === "market" ? <WaiverMarketSheet dataset={dataset} />
          : fantasySheet === "trades" ? <TradesSheet dataset={dataset} />
            : fantasySheet === "league" ? <NextGenStatsSheet dataset={dataset} />
              : fantasySheet === "sync" ? <DataSyncSheet dataset={dataset} onDatasetChange={setDataset} />
                : fantasySheet === "draft" ? <DraftArchiveSheet />
                  : <div className={styles.emptySheet}><div><strong>{activeSheetLabel}</strong></div></div>}

        <nav className={styles.sheetBar} aria-label="Workbook sheets">
          <button className={`${styles.sheetButton} ${styles.sheetAdd}`} aria-label="Add worksheet">＋</button>
          {mode === "work" ? WORK_SHEETS.map((sheet) => <button key={sheet} className={`${styles.sheetButton} ${workSheet === sheet ? styles.sheetButtonActive : ""}`} onClick={() => setWorkSheet(sheet)}>{sheet}</button>) : FANTASY_SHEETS.map((sheet) => <button key={sheet.id} className={`${styles.sheetButton} ${fantasySheet === sheet.id ? styles.sheetButtonActive : ""}`} onClick={() => setFantasySheet(sheet.id)}>{sheet.label}</button>)}
        </nav>
        <footer className={styles.statusBar}><span>{mode === "work" ? "Ready · AutoSave on · Esc loads Work view" : `Week ${dataset.evidenceStatus.week} · ${dataset.rosterSnapshot.source} · advisory only`}</span><span>{mode === "work" ? "Average: 87.1   Count: 12   Sum: 1,045" : `${dataset.leagueTeams.length} teams · ${dataset.players.filter((player) => player.availability !== "free-agent").length} rostered · ${dataset.players.filter((player) => player.availability === "free-agent").length} available · `}<Link className={styles.classicLink} href="/fantasy-football?ui=classic">Classic view</Link></span></footer>
      </div>
    </main>
  );
}
