export type RankingsExportRow = {
  rank: number;
  status: "★ Target" | "🚫 Fade" | null;
  draftSlot: number | null;
  draftRound: number | null;
  playerId: string;
  fullName: string;
  team: string | null;
  position: string | null;
  modelRank: number | null;
  yahooXRank: number | null;
  yahooAdp: number | null;
  aggregateRank: number | null;
  rankSpread: number | null;
};

export async function buildRankingsWorkbook(input: {
  rankings: RankingsExportRow[];
  exportedAt: string;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  boardFingerprint: string;
}) {
  const excelJs = await import("exceljs");
  const WorkbookConstructor = excelJs.Workbook ?? excelJs.default.Workbook;
  const workbook = new WorkbookConstructor();
  workbook.creator = "Moodin Fantasy Supertool";
  workbook.created = new Date(input.exportedAt);
  const worksheet = workbook.addWorksheet("Rankings", {
    views: [{ state: "frozen", ySplit: 7 }],
    properties: { defaultRowHeight: 18 },
  });
  worksheet.addRow(["Moodin Fantasy Personal Rankings — Top 300"]);
  worksheet.addRow(["Exported At", input.exportedAt]);
  worksheet.addRow(["League Config", input.leagueConfigVersion]);
  worksheet.addRow(["League Fingerprint", input.leagueConfigFingerprint]);
  worksheet.addRow(["Board Fingerprint", input.boardFingerprint]);
  worksheet.addRow([]);
  const headers = ["Personal Rank", "Status", "Draft Slot", "Draft Round", "Player ID", "Player", "Team", "Position", "Model Rank", "Yahoo XRank", "Yahoo ADP", "Aggregate Rank", "Rank Spread"];
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 24;

  for (const ranking of input.rankings.slice(0, 300)) {
    const row = worksheet.addRow([ranking.rank, ranking.status, ranking.draftSlot, ranking.draftRound, ranking.playerId, ranking.fullName, ranking.team, ranking.position, ranking.modelRank, ranking.yahooXRank, ranking.yahooAdp, ranking.aggregateRank, ranking.rankSpread]);
    if (ranking.status === "★ Target") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
    } else if (ranking.status === "🚫 Fade") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE8E6" } };
    }
  }

  worksheet.autoFilter = { from: "A7", to: `M${Math.min(input.rankings.length, 300) + 7}` };
  worksheet.columns = [
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 28 },
    { width: 24 }, { width: 9 }, { width: 10 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 15 }, { width: 12 },
  ];
  worksheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF17324D" } };
  worksheet.mergeCells("A1:M1");
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
