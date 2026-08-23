import { collegeResearch2026 } from "@/lib/fantasy/data/collegeResearch2026.generated";
import { parseAdvancedResearchJson } from "@/lib/fantasy/advancedResearch";

const parsed = parseAdvancedResearchJson(JSON.stringify(collegeResearch2026));

export const collegeResearchInputs = parsed.inputs;

export const collegeResearchMeta = {
  rookieSeason: 2026,
  evidenceSeasons: [2020, 2021, 2022, 2023, 2024, 2025],
  recordCount: parsed.inputs.length,
  errors: parsed.errors,
  provider: "SportsDataverse cfbfastR / ESPN-derived play-by-play",
  generatedAt: "2026-08-13",
  recencyWeighting: "none",
} as const;
