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
  capturedAt: "2026-10-13T09:40:25-04:00",
  week: 6,
} as const;

export const inSeasonRosterSnapshotTeams = [
  {
    teamId: "dirty-sanchez",
    name: "Dirty Sanchez",
    players: ["Trevor Lawrence", "Jonathan Taylor", "Ashton Jeanty", "Zay Flowers", "Mike Evans", "Matthew Golden", "George Kittle", "Jameson Williams", "Malik Washington", "Cam Little", "Juwan Johnson", "Rashee Rice", "Quentin Johnston", "Keaton Mitchell", "Xavier Worthy", "Mike Washington Jr.", "De'Von Achane"],
  },
  {
    teamId: "dakked-raw",
    name: "Nabers think I did 9🏈11",
    aliases: ["Dakked Raw"],
    satisfiedPositions: ["QB"] as PlayerPosition[],
    preferredStarterNames: ["Caleb Williams"],
    players: ["Bryce Young", "Bucky Irving", "Kenneth Walker III", "Garrett Wilson", "Luther Burden III", "Carnell Tate", "Colston Loveland", "Emanuel Wilson", "Tony Pollard", "Ka'imi Fairbairn", "Chase Brown", "Makai Lemon", "Emmett Johnson", "Brian Robinson", "Caleb Williams", "Kyle Monangai"],
  },
  {
    teamId: "like-a-good-nabers",
    name: "Like a good Nabers...",
    players: ["Josh Allen", "Derrick Henry", "D'Andre Swift", "Christian Watson", "Michael Wilson", "DK Metcalf", "Tucker Kraft", "Jeremiyah Love", "Dalton Kincaid", "Evan McPherson", "Stefon Diggs", "Tre Tucker", "Josh Jacobs", "Jakobi Meyers", "Jake Ferguson", "Tyreek Hill"],
  },
  {
    teamId: "husky-fever",
    name: "Husky Fever",
    players: ["Jayden Daniels", "Christian McCaffrey", "Kyren Williams", "CeeDee Lamb", "Davante Adams", "Khalil Shakir", "Tyler Warren", "Jaylen Warren", "Keenan Allen", "Harrison Mevis", "TreVeyon Henderson", "Jared Goff", "Mark Andrews", "Rachaad White", "Kenny Gainwell", "T.J. Hockenson", "A.J. Brown"],
  },
  {
    teamId: "gabagool",
    name: "Gabagool",
    players: ["Matthew Stafford", "Cam Skattebo", "Rhamondre Stevenson", "Drake London", "Chris Godwin Jr.", "Emeka Egbuka", "Trey McBride", "Mike Gesicki", "Tee Higgins", "Spencer Shrader", "Tyler Shough", "Jacory Croskey-Merritt", "Jalen Coker", "Jalen Hurts", "Woody Marks", "Breece Hall"],
  },
  {
    teamId: "your-moms-fav-friend",
    name: "Your moms fav friend",
    players: ["Jordan Love", "James Cook III", "David Montgomery", "George Pickens", "Parker Washington", "Nico Collins", "Dallas Goedert", "Jaylen Waddle", "Aaron Jones Sr.", "Jake Bates", "Pat Freiermuth", "Travis Kelce", "Lamar Jackson", "Brian Thomas Jr.", "Jordan Addison", "KC Concepcion Jr."],
  },
  {
    teamId: "juggalo-all-stars",
    name: "Juggalo All-Stars",
    players: ["Jacoby Brissett", "Bijan Robinson", "Omarion Hampton", "Puka Nacua", "DJ Moore", "Ladd McConkey", "Sam LaPorta", "Bhayshul Tuten", "Chuba Hubbard", "Brandon Aubrey", "Dontayvion Wicks", "Kendrick Bourne", "Tre' Harris", "Marvin Harrison Jr.", "Kyler Murray", "Rico Dowdle", "Jordyn Tyson"],
  },
  {
    teamId: "njigba-please",
    name: "Njigba Please",
    players: ["Drake Maye", "Quinshon Judkins", "Ollie Gordon II", "Jaxon Smith-Njigba", "Malik Nabers", "Devaughn Vele", "Brock Bowers", "Wan'Dale Robinson", "Braelon Allen", "Tyler Loop", "Isaiah Likely", "Tetairoa McMillan", "Patrick Mahomes", "Blake Corum", "Dohnte Meyers", "Keon Coleman", "Travis Etienne Jr."],
  },
  {
    teamId: "fc-netanyah00",
    name: "FC Netanyah00",
    players: ["Brock Purdy", "J.K. Dobbins", "Josh Downs", "Chris Olave", "Rome Odunze", "Harold Fannin Jr.", "Denzel Boston", "Romeo Doubs", "Dak Prescott", "DeVonta Smith", "Amon-Ra St. Brown", "Jahmyr Gibbs", "Kenyon Sadiq", "Jadarian Price", "Will Reichard"],
  },
  {
    teamId: "peyton-and-brady-place",
    name: "Peyton and Brady place",
    players: ["Javonte Williams", "Alvin Kamara", "Terry McLaurin", "Courtland Sutton", "Kyle Pitts Sr.", "RJ Harvey", "MarShawn Lloyd", "Dominic Zvada", "Justin Jefferson", "Roman Wilson", "Deebo Samuel Sr.", "Ja'Marr Chase", "Joe Burrow", "Saquon Barkley", "Zach Charbonnet", "Jordan Mason", "Harrison Butker"],
  },
] as const;

export const inSeasonSnapshotMyTeamId = "fc-netanyah00";
const injuredReserveNames = new Set([
  "a j brown",
  "breece hall",
  "de von achane",
  "jadarian price",
  "jordyn tyson",
  "jordan mason",
  "travis etienne",
  "zach charbonnet",
]);

const currentPlayerContext = new Map<string, Partial<InSeasonPlayerSnapshot>>([
  ["dameon pierce", {
    currentRole: "competition",
    injuryOpportunity: {
      source: "CBS Sports and NFL Fantasy Week 6 reports on Will Shipley and Saquon Barkley",
      capturedAt: "2026-10-13T15:30:00-04:00",
      confirmed: true,
      successorVerified: true,
    },
    opportunityContext: {
      stability: "contingent",
      reason: "Shipley is expected to miss multiple weeks; Pierce starts against Carolina only if Barkley's hamstring absence continues.",
    },
  }],
  ["kendre miller", {
    currentRole: "competition",
    injuryOpportunity: {
      source: "CBS Sports and FantasyPros Week 6 reports on Travis Etienne and Alvin Kamara",
      capturedAt: "2026-10-13T15:30:00-04:00",
      confirmed: true,
      successorVerified: true,
    },
    opportunityContext: {
      stability: "contingent",
      reason: "Miller's season-high 10 Week 5 carries can persist while Kamara manages a back issue and Etienne remains on IR.",
    },
  }],
  ["kimani vidal", {
    currentRole: "competition",
    opportunityContext: {
      stability: "uncertain",
      reason: "Vidal led the Chargers backfield in Week 5 snaps, but the committee and Week 7 bye cap immediate certainty.",
    },
  }],
  ["de vonta smith", {
    injuryStatus: "Out",
    opportunityContext: {
      stability: "uncertain",
      reason: "The Week 6 Yahoo roster snapshot lists Smith out after missing Week 5 with a hamstring injury.",
    },
  }],
  ["kenyon sadiq", {
    injuryStatus: "Questionable",
    opportunityContext: {
      stability: "uncertain",
      reason: "The Week 6 Yahoo roster snapshot lists Sadiq questionable after his Week 5 concussion.",
    },
  }],
  ["breece hall", {
    injuryStatus: "Questionable",
    opportunityContext: {
      stability: "uncertain",
      reason: "Week to week after a Week 3 quad injury and MRI; the Jets have not established a return date.",
    },
  }],
  ["braelon allen", {
    currentRole: "competition",
    injuryOpportunity: {
      source: "NFL and FantasyPros Week 4 reports on Breece Hall's week-to-week quad injury",
      capturedAt: "2026-09-29T09:30:00-04:00",
      confirmed: true,
      successorVerified: true,
    },
    opportunityContext: {
      stability: "contingent",
      reason: "Hall's week-to-week quad injury creates the opening; Allen played 52% of Week 3 snaps but had only seven opportunities, so the projected lead role remains contingent.",
    },
  }],
  ["de von achane", {
    injuryStatus: "Out for season",
    projectedReturnDate: null,
    opportunityContext: {
      stability: "uncertain",
      reason: "Manager-provided September 28 update says the knee injury is season-ending; keep ROS value at zero unless the diagnosis changes.",
    },
  }],
  ["ollie gordon", {
    currentRole: "competition",
    opportunityContext: {
      stability: "contingent",
      reason: "Handled 84% of Miami's Week 3 offensive snaps after Achane exited, but Jaylen Wright was inactive with foot and stinger injuries.",
    },
  }],
  ["jaylen wright", {
    injuryStatus: "Questionable",
    currentRole: "competition",
    opportunityContext: {
      stability: "uncertain",
      reason: "Was Miami's listed RB2 before missing Week 3 with foot and stinger injuries; health and the post-Achane split remain unresolved.",
    },
  }],
  ["jadarian price", {
    currentRole: "competition",
    opportunityContext: {
      stability: "uncertain",
      reason: "Week 3 fell to 28% of Seattle's snaps with five carries, three targets, and a lost fumble while Holani and Wilson each played 36%.",
    },
  }],
  ["zach charbonnet", {
    injuryStatus: "PUP",
    projectedReturnDate: "2026-10-18",
    opportunityContext: {
      stability: "uncertain",
      reason: "Eligible to return after Week 4, but Seattle had not opened his practice window as of September 23; public reporting points to mid-October.",
    },
  }],
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
      const currentContext = currentPlayerContext.get(normalizeName(candidate.player.fullName));
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
        ...currentContext,
      } satisfies InSeasonPlayerSnapshot;
    });

  // Achane's season-ending absence opens real volume, but Miami has not shown
  // that one healthy back inherits his full role. Reallocate only 62% of the
  // prior (the existing RB injury-transfer rate), weighted toward the back who
  // handled 84% of Week 3 snaps. The rest remains lost to committee friction,
  // Malik Willis rushes, and a weak offense.
  const achane = players.find((player) => normalizeName(player.player.fullName) === "de von achane");
  const successorShares = new Map([["ollie gordon", 0.4], ["jaylen wright", 0.22]]);
  if (achane) {
    for (const player of players) {
      const share = successorShares.get(normalizeName(player.player.fullName));
      if (!share) continue;
      player.weeklyProjection = {
        p10: Number((player.weeklyProjection.p10 + achane.weeklyProjection.p10 * share).toFixed(2)),
        p50: Number((player.weeklyProjection.p50 + achane.weeklyProjection.p50 * share).toFixed(2)),
        p90: Number((player.weeklyProjection.p90 + achane.weeklyProjection.p90 * share).toFixed(2)),
      };
      player.rosProjection = {
        p10: Number((player.rosProjection.p10 + achane.rosProjection.p10 * share).toFixed(2)),
        p50: Number((player.rosProjection.p50 + achane.rosProjection.p50 * share).toFixed(2)),
        p90: Number((player.rosProjection.p90 + achane.rosProjection.p90 * share).toFixed(2)),
      };
      player.injuryOpportunity = {
        source: "Week 3 nflverse usage plus manager-provided Achane season-ending update",
        capturedAt: inSeasonRosterSnapshotMeta.capturedAt,
        confirmed: true,
        successorVerified: true,
      };
    }
  }

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
