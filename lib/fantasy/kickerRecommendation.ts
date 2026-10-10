export const rosKickerRecommendation = {
  asOf: "2026-10-06T09:30:00-04:00",
  add: {
    name: "Matt Gay",
    team: "LV",
    rosterStatus: "free-agent",
    fantasyPoints: 46,
    fieldGoals: "10/10",
    extraPoints: "9/9",
    expertRosRank: 6,
    byeWeek: 13,
  },
  drop: {
    name: "Eddy Pineiro",
    team: "SF",
    fantasyPoints: 28,
    fieldGoals: "4/6",
    extraPoints: "14/16",
  },
  bid: "$0-$1",
  recommendation: "Add Matt Gay and drop Eddy Pineiro for rest of season.",
  rationale: "Gay has produced 18 more points under this league's kicker scoring through Week 4, has not missed a kick, and is K6 on Pat Fitzmaurice's updated FantasyPros ROS board. Las Vegas has scored at least 26 points in every game, creating a repeatable mix of field-goal and PAT chances.",
  caution: "Availability comes from the saved Yahoo roster inventory. Recheck the live Yahoo wire before submitting the claim.",
  sources: [
    {
      label: "nflverse 2026 weekly player stats",
      url: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    },
    {
      label: "FantasyPros Week 5 kicker waivers",
      url: "https://www.fantasypros.com/2026/10/top-5-fantasy-football-waiver-wire-pickups-kickers-week-5-2026/",
    },
    {
      label: "FantasyPros updated ROS rankings",
      url: "https://www.fantasypros.com/nfl/rankings/pat-fitzmaurice.php?scoring=PPR%2F1000&type=ros",
    },
  ],
} as const;
