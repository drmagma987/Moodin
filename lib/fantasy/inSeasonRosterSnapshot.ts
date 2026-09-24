import { warRoomArtifact } from "@/lib/fantasy/warRoomArtifact";
import type {
  DraftCandidate,
  InSeasonPlayerSnapshot,
  InSeasonTeamSnapshot,
  PlayerPosition,
  UsageWindowSnapshot,
} from "@/lib/fantasy/types";

export const inSeasonRosterSnapshotMeta = {
  source: "Yahoo Starting Rosters PDF",
  capturedAt: "2026-09-23T10:22:09-04:00",
  week: 3,
} as const;

export const inSeasonRosterSnapshotTeams = [
  {
    teamId: "dirty-sanchez",
    name: "Dirty Sanchez",
    players: ["Jaxson Dart", "Jonathan Taylor", "De'Von Achane", "Zay Flowers", "Rashee Rice", "Jameson Williams", "Juwan Johnson", "Ashton Jeanty", "Mike Evans", "Cam Little", "George Kittle", "Trevor Lawrence", "Quentin Johnston", "Matthew Golden", "Keaton Mitchell", "Malik Willis"],
  },
  {
    teamId: "dakked-raw",
    name: "Nabers think I did 9🏈11",
    aliases: ["Dakked Raw"],
    satisfiedPositions: ["QB"] as PlayerPosition[],
    preferredStarterNames: ["Caleb Williams"],
    players: ["Bryce Young", "Kenneth Walker III", "Chase Brown", "Garrett Wilson", "Luther Burden III", "Carnell Tate", "Dalton Schultz", "Bucky Irving", "Tony Pollard", "Ka'imi Fairbairn", "Colston Loveland", "Caleb Williams", "Kyle Monangai", "Makai Lemon", "Emmett Johnson", "Adonai Mitchell"],
  },
  {
    teamId: "like-a-good-nabers",
    name: "Like a good Nabers...",
    players: ["Josh Allen", "Derrick Henry", "D'Andre Swift", "Christian Watson", "DK Metcalf", "Stefon Diggs", "Dalton Kincaid", "Michael Wilson", "Jeremiyah Love", "Evan McPherson", "Tucker Kraft", "Josh Jacobs", "Jakobi Meyers", "Jake Ferguson", "Tyreek Hill", "Tre Tucker"],
  },
  {
    teamId: "husky-fever",
    name: "Husky Fever",
    players: ["Jared Goff", "Christian McCaffrey", "Kyren Williams", "CeeDee Lamb", "Davante Adams", "Khalil Shakir", "Tyler Warren", "Jaylen Warren", "TreVeyon Henderson", "Harrison Mevis", "Mark Andrews", "Jayden Daniels", "Bo Nix", "Rachaad White", "Kayshon Boutte", "Malachi Fields", "A.J. Brown"],
  },
  {
    teamId: "gabagool",
    name: "Gabagool",
    players: ["Jalen Hurts", "Breece Hall", "Cam Skattebo", "Drake London", "Emeka Egbuka", "Tee Higgins", "Trey McBride", "Jalen Coker", "Chris Godwin Jr.", "Jason Myers", "Rhamondre Stevenson", "Jacory Croskey-Merritt", "Woody Marks", "Matthew Stafford", "Tyler Shough", "Darren Waller"],
  },
  {
    teamId: "your-moms-fav-friend",
    name: "Your moms fav friend",
    players: ["Lamar Jackson", "James Cook III", "David Montgomery", "Nico Collins", "George Pickens", "Jaylen Waddle", "Travis Kelce", "Parker Washington", "Jayden Reed", "Jake Bates", "Brian Thomas Jr.", "Jordan Addison", "Dallas Goedert", "Aaron Jones Sr.", "Jordan Love", "Ray Davis"],
  },
  {
    teamId: "juggalo-all-stars",
    name: "Juggalo All-Stars",
    players: ["Justin Herbert", "Bijan Robinson", "Omarion Hampton", "Puka Nacua", "Ladd McConkey", "DJ Moore", "Sam LaPorta", "Bhayshul Tuten", "Chuba Hubbard", "Brandon Aubrey", "Rico Dowdle", "Chris Rodriguez Jr.", "Kaelon Black", "Dontayvion Wicks", "Marvin Harrison Jr.", "Jordyn Tyson", "Michael Pittman Jr."],
  },
  {
    teamId: "njigba-please",
    name: "Njigba Please",
    players: ["Patrick Mahomes", "Travis Etienne Jr.", "Quinshon Judkins", "Jaxon Smith-Njigba", "Malik Nabers", "Tetairoa McMillan", "Isaiah Likely", "Devaughn Vele", "Brock Bowers", "Tyler Loop", "Blake Corum", "Rashod Bateman", "Drake Maye", "Tyler Allgeier", "Tank Bigsby", "Jonah Coleman"],
  },
  {
    teamId: "fc-netanyah00",
    name: "FC Netanyah00",
    players: ["Dak Prescott", "Jahmyr Gibbs", "Jadarian Price", "Amon-Ra St. Brown", "DeVonta Smith", "Chris Olave", "Harold Fannin Jr.", "Romeo Doubs", "Josh Downs", "Eddy Pineiro", "Rome Odunze", "J.K. Dobbins", "Brock Purdy", "Caleb Douglas", "Denzel Boston", "Emanuel Wilson", "Isiah Pacheco"],
  },
  {
    teamId: "peyton-and-brady-place",
    name: "Peyton and Brady place",
    players: ["Joe Burrow", "Saquon Barkley", "Javonte Williams", "Justin Jefferson", "Ja'Marr Chase", "Terry McLaurin", "Kyle Pitts Sr.", "MarShawn Lloyd", "Deebo Samuel Sr.", "Harrison Butker", "Courtland Sutton", "Jordan Mason", "RJ Harvey", "Greg Dulcich", "Baker Mayfield", "Alvin Kamara", "Zach Charbonnet"],
  },
] as const;

export const inSeasonSnapshotMyTeamId = "fc-netanyah00";
const injuredReserveNames = new Set([
  "a j brown",
  "isiah pacheco",
  "jordyn tyson",
  "jordan mason",
  "michael pittman",
  "zach charbonnet",
]);

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeProjectedReturn(value: string | undefined) {
  if (!value) return null;
  const [month, day, year] = value.split("/").map(Number);
  if (!month || !day || !year) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function projectedUsage(candidate: DraftCandidate): UsageWindowSnapshot {
  const position = candidate.player.positions[0] ?? "WR";
  const stats = candidate.projection.stats;
  const role = candidate.context?.currentRole;
  const snapShare = role === "locked-starter" ? 0.78 : role === "projected-starter" ? 0.64 : role === "competition" ? 0.45 : role === "backup" ? 0.25 : 0.5;
  const receptions = stats.receptions ?? 0;
  const targets = receptions > 0 ? receptions / (position === "RB" ? 0.78 : 0.67) : 0;
  const carries = (stats.rushingYards ?? 0) / (position === "QB" ? 5.5 : 4.4);
  return {
    games: 0,
    snapShare,
    routeParticipation: position === "WR" || position === "TE" ? Math.min(0.95, snapShare + 0.08) : position === "RB" ? snapShare * 0.66 : 0,
    carriesPerGame: Number((carries / 17).toFixed(2)),
    targetsPerGame: Number((targets / 17).toFixed(2)),
    targetShare: 0,
    airYardsShare: 0,
    redZoneTouchesPerGame: 0,
    fantasyPointsPerGame: Number((candidate.projection.range.p50 / 17).toFixed(2)),
  };
}

export function buildPdfRosterInSeasonSnapshot() {
  const ownerByName = new Map<string, string>();
  for (const team of inSeasonRosterSnapshotTeams) {
    for (const playerName of team.players) ownerByName.set(normalizeName(playerName), team.teamId);
  }

  const supportedPositions = new Set<PlayerPosition>(["QB", "RB", "WR", "TE", "K"]);
  const players: InSeasonPlayerSnapshot[] = warRoomArtifact.candidates
    .filter((candidate) => candidate.player.positions.some((position) => supportedPositions.has(position)))
    .map((candidate) => {
      const rosterTeamId = ownerByName.get(normalizeName(candidate.player.fullName)) ?? null;
      const baselineUsage = projectedUsage(candidate);
      return {
        player: candidate.player,
        projectionBasis: "preseason-prior",
        availability: rosterTeamId === inSeasonSnapshotMyTeamId ? "my-roster" : rosterTeamId ? "league-rostered" : "free-agent",
        rosterTeamId,
        weeklyProjection: {
          p10: Number((candidate.projection.range.p10 / 17).toFixed(2)),
          p50: Number((candidate.projection.range.p50 / 17).toFixed(2)),
          p90: Number((candidate.projection.range.p90 / 17).toFixed(2)),
        },
        rosProjection: candidate.projection.range,
        baselineUsage,
        recentUsage: { ...baselineUsage },
        marketTrend: "steady",
        marketTrendCount: 0,
        marketRank: candidate.market.aggregateRank ?? candidate.market.yahooXRank ?? candidate.market.ecr ?? candidate.market.adp ?? null,
        marketTier: candidate.market.tier ?? null,
        currentRole: candidate.context?.currentRole ?? "unknown",
        injuryStatus: injuredReserveNames.has(normalizeName(candidate.player.fullName))
          ? "IR"
          : candidate.context?.healthStatus ?? null,
        projectedReturnDate: normalizeProjectedReturn(
          candidate.context?.qualitative?.evidence.find((evidence) => evidence.estimatedReturn)?.estimatedReturn,
        ),
      } satisfies InSeasonPlayerSnapshot;
    });

  const playerByName = new Map(players.map((player) => [normalizeName(player.player.fullName), player] as const));
  const teams: InSeasonTeamSnapshot[] = inSeasonRosterSnapshotTeams.map((team) => ({
    teamId: team.teamId,
    name: team.name,
    aliases: "aliases" in team ? [...team.aliases] : undefined,
    playerIds: team.players
      .map((name) => playerByName.get(normalizeName(name))?.player.id)
      .filter((playerId): playerId is string => Boolean(playerId)),
    managerPreferences: "satisfiedPositions" in team ? {
      satisfiedPositions: [...team.satisfiedPositions],
      preferredStarterPlayerIds: team.preferredStarterNames
        .map((name) => playerByName.get(normalizeName(name))?.player.id)
        .filter((playerId): playerId is string => Boolean(playerId)),
    } : undefined,
  }));
  const unmatchedRosterPlayers = inSeasonRosterSnapshotTeams.flatMap((team) =>
    team.players.filter((name) => !playerByName.has(normalizeName(name))).map((name) => `${team.name}: ${name}`),
  );
  const myTeam = teams.find((team) => team.teamId === inSeasonSnapshotMyTeamId);
  if (!myTeam) throw new Error("The PDF roster snapshot is missing FC Netanyah00.");

  return { players, teams, myTeam, unmatchedRosterPlayers };
}
