/**
 * Checked snapshot of the two finalized 2026 Week 1 prime-time box scores.
 *
 * Tuple shape: [player name, carries, targets, Yahoo-custom fantasy points].
 * Snap, route, air-yard, and charting metrics are intentionally not inferred
 * from the public box scores and remain on their prior until those feeds publish.
 */
export type WeekOneClosingBoxScoreGroup = {
  team: string;
  teamTargets: number;
  players: Array<readonly [name: string, carries: number, targets: number, fantasyPoints: number]>;
};

export const weekOneClosingBoxScoreGroups: WeekOneClosingBoxScoreGroup[] = [
  {
    team: "DAL",
    teamTargets: 30,
    players: [
      ["Dak Prescott", 2, 0, 19.4],
      ["Javonte Williams", 12, 5, 24.2],
      ["Emari Demercado", 2, 0, 0.7],
      ["Hunter Luepke", 1, 0, 0.7],
      ["CeeDee Lamb", 1, 8, 15.4],
      ["George Pickens", 0, 6, 5.8],
      ["Ryan Flournoy", 0, 4, 4.2],
      ["Brevyn Spann-Ford", 0, 2, 3.4],
      ["Luke Schoonmaker", 0, 1, 2.2],
      ["Jonathan Mingo", 0, 1, 2],
      ["KaVontae Turpin", 0, 1, 1.8],
      ["Jake Ferguson", 0, 2, 2.6],
    ],
  },
  {
    team: "NYG",
    teamTargets: 29,
    players: [
      ["Jaxson Dart", 11, 0, 32.6],
      ["Cam Skattebo", 18, 0, 14.1],
      ["Devin Singletary", 6, 4, 13.8],
      ["Tyrone Tracy Jr.", 2, 0, -0.6],
      ["Isaiah Likely", 0, 8, 27.8],
      ["Malik Nabers", 0, 9, 12.9],
      ["Darnell Mooney", 0, 2, 4.7],
      ["Malachi Fields", 0, 4, 4.5],
      ["Theo Johnson", 0, 1, 1.9],
      ["Patrick Ricard", 0, 1, 0],
    ],
  },
  {
    team: "DEN",
    teamTargets: 27,
    players: [
      ["Bo Nix", 3, 0, 8.4],
      ["J.K. Dobbins", 8, 0, 3.6],
      ["RJ Harvey", 3, 4, 8.1],
      ["Troy Franklin", 1, 1, 0.5],
      ["Evan Engram", 0, 5, 14.3],
      ["Pat Bryant", 0, 6, 8.2],
      ["Courtland Sutton", 0, 5, 3.1],
      ["Adam Trautman", 0, 3, 3],
      ["Jaylen Waddle", 0, 3, 1.2],
    ],
  },
  {
    team: "KC",
    teamTargets: 25,
    players: [
      ["Patrick Mahomes", 7, 0, 26.7],
      ["Kenneth Walker III", 23, 6, 36.1],
      ["Emmett Johnson", 8, 2, 8.8],
      ["Travis Kelce", 0, 5, 10.1],
      ["Rashee Rice", 0, 2, 9.9],
      ["Xavier Worthy", 0, 6, 4.8],
      ["Jake Briningstool", 0, 1, 1.9],
      ["Noah Gray", 0, 1, 1.5],
      ["Tyquan Thornton", 0, 1, 0],
      ["Cyrus Allen", 0, 1, 0],
    ],
  },
];
