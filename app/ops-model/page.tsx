import { FantasyWorkbook } from "@/components/fantasy/fantasy-workbook";
import { getInSeasonCommandCenterDataset } from "@/lib/fantasy/inSeason";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OperationsModelPage() {
  return <FantasyWorkbook dataset={getInSeasonCommandCenterDataset()} />;
}
