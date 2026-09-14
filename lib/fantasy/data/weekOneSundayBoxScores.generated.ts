/**
 * Checked snapshot of the 12 finalized 2026 Week 1 Sunday daytime box scores.
 *
 * Tuple shape: [player name, carries, targets, Yahoo-custom fantasy points].
 * Snap, route, air-yard, and charting metrics are intentionally not inferred
 * from the ESPN box score and remain on their prior until those feeds publish.
 */
export type WeekOneSundayBoxScoreGroup = {
  team: string;
  teamTargets: number;
  players: Array<readonly [name: string, carries: number, targets: number, fantasyPoints: number]>;
};

export const weekOneSundayBoxScoreGroups: WeekOneSundayBoxScoreGroup[] = [
  { team: "TB", teamTargets: 27, players: [["Baker Mayfield",5,0,11.6],["Bucky Irving",8,7,20.3],["Kenny Gainwell",5,1,2.8],["Chris Godwin Jr.",1,4,8.3],["Tez Johnson",1,1,-0.4],["Emeka Egbuka",0,6,11.3],["Ted Hurst III",0,3,6.6],["Cade Otton",0,5,5.6]] },
  { team: "CIN", teamTargets: 31, players: [["Joe Burrow",5,0,17.2],["Chase Brown",16,6,18.8],["Samaje Perine",5,3,8],["Dohnte Meyers",1,1,3.8],["Mike Gesicki",0,7,18.8],["Tee Higgins",0,6,8.9],["Ja'Marr Chase",0,4,3.2],["Andrei Iosivas",0,3,3.2],["Tanner Hudson",0,1,1.4]] },
  { team: "NO", teamTargets: 50, players: [["Tyler Shough",4,0,34.2],["Travis Etienne Jr.",9,9,14.8],["Kendre Miller",9,0,9],["Barion Brown",1,0,0.3],["Chris Olave",0,13,30.2],["Devaughn Vele",0,9,19.9],["Juwan Johnson",0,7,14.4],["Bryce Lance",0,4,7.2],["Noah Fant",0,8,13.3]] },
  { team: "DET", teamTargets: 38, players: [["Jared Goff",2,0,20.4],["Jahmyr Gibbs",29,5,35.6],["Sione Vaki",2,1,2.8],["Amon-Ra St. Brown",0,14,28.7],["Sam LaPorta",0,8,9.8],["Jameson Williams",0,9,8.5],["Isaac TeSlaa",0,1,0]] },
  { team: "NYJ", teamTargets: 21, players: [["Geno Smith",6,0,9.3],["Breece Hall",22,2,21.8],["Braelon Allen",10,1,4],["Kenyon Sadiq",1,3,11.4],["Garrett Wilson",0,7,13.9],["Adonai Mitchell",0,3,9],["Omar Cooper Jr.",0,1,4],["Isaiah Williams",0,1,1.7],["Mason Taylor",0,3,1.8]] },
  { team: "TEN", teamTargets: 28, players: [["Cam Ward",4,0,13.7],["Tony Pollard",7,2,4.4],["Tyjae Spears",3,4,4.4],["Carnell Tate",0,6,7.8],["Wan'Dale Robinson",0,6,8.8],["Gunnar Helm",0,5,6.8],["Elic Ayomanor",0,3,8.1],["Daniel Bellinger",0,1,1.7],["Chimere Dike",0,1,-0.3]] },
  { team: "BAL", teamTargets: 18, players: [["Lamar Jackson",7,0,30],["Derrick Henry",24,1,37.3],["Justice Hill",6,1,3.8],["Zay Flowers",0,6,28],["Mark Andrews",0,6,8.9],["Ja'Kobi Lane",0,3,2.1],["Rashod Bateman",0,1,0]] },
  { team: "IND", teamTargets: 27, players: [["Daniel Jones",1,0,12],["Jonathan Taylor",19,4,25.1],["Alec Pierce",0,6,10.1],["Josh Downs",0,4,5.7],["Keenan Allen",0,6,9.2],["Tyler Warren",0,5,10.3],["Ashton Dulin",0,1,0],["Seth McGowan",0,1,1]] },
  { team: "ATL", teamTargets: 19, players: [["Bijan Robinson",21,10,31.3],["Brian Robinson Jr.",9,0,3.1],["Drake London",1,4,5.5],["Jahan Dotson",0,3,2.9],["Olamide Zaccheaus",0,1,1.5],["Kyle Pitts Sr.",0,1,0]] },
  { team: "PIT", teamTargets: 37, players: [["Aaron Rodgers",3,0,14.5],["Jaylen Warren",10,6,10.3],["Rico Dowdle",8,5,4.1],["Michael Pittman Jr.",0,3,8.8],["Pat Freiermuth",0,5,15.6],["DK Metcalf",0,10,8],["Roman Wilson",0,6,5.6],["Darnell Washington",0,2,3.8]] },
  { team: "CHI", teamTargets: 26, players: [["Caleb Williams",10,0,41.3],["D'Andre Swift",18,1,34.4],["Kyle Monangai",10,2,22.4],["Luther Burden III",1,5,9.5],["Kalif Raymond",0,9,16.4],["Rome Odunze",0,3,7.2],["Cole Kmet",0,3,11.5],["Jahdae Walker",0,1,7.1],["Colston Loveland",0,2,0]] },
  { team: "CAR", teamTargets: 34, players: [["Bryce Young",2,0,41.4],["Chuba Hubbard",10,3,23.7],["AJ Dillon",5,0,2.8],["Jonathon Brooks",4,2,7.2],["Jalen Coker",0,9,35.8],["Tetairoa McMillan",0,8,10.5],["Darren Waller",0,2,4.8],["Tommy Tremble",0,5,5.5],["Mitchell Evans",0,2,1.9],["Xavier Legette",0,2,0],["Jimmy Horn Jr.",0,1,-2]] },
  { team: "CLE", teamTargets: 21, players: [["Deshaun Watson",6,0,17],["Quinshon Judkins",12,2,7],["KC Concepcion",3,5,7.8],["Raheim Sanders",1,3,5.6],["Denzel Boston",0,4,13.9],["Jerry Jeudy",0,4,4.6],["Harold Fannin Jr.",0,3,4.1]] },
  { team: "JAX", teamTargets: 20, players: [["Trevor Lawrence",2,0,34.1],["Bhayshul Tuten",15,1,9.8],["Ameer Abdullah",4,1,4.2],["Chris Rodriguez Jr.",6,0,2.3],["Travis Hunter",1,1,2.1],["Jakobi Meyers",1,2,12.2],["Parker Washington",0,6,19.3],["Brian Thomas Jr.",0,3,7],["Brenton Strange",0,3,10.3],["Josh Cameron",0,2,10],["Nate Boerkircher",0,1,1.9]] },
  { team: "BUF", teamTargets: 28, players: [["Josh Allen",6,0,42.7],["James Cook III",13,4,9.9],["Ray Davis",1,0,0.3],["Dalton Kincaid",0,6,20],["DJ Moore",0,8,23],["Khalil Shakir",0,6,9],["Joshua Palmer",0,2,10.4],["Dawson Knox",0,1,1.7],["Keon Coleman",0,1,1.1]] },
  { team: "HOU", teamTargets: 34, players: [["C.J. Stroud",2,0,20.5],["David Montgomery",20,3,28.9],["Woody Marks",9,1,5],["Nico Collins",1,10,21.2],["Jaylin Noel",0,2,7.3],["Dalton Schultz",0,8,7.5],["Xavier Hutchinson",0,6,6.2],["Kayshon Boutte",0,2,3.1],["Marlin Klein",0,1,2.6],["Cade Stover",0,1,0.8]] },
  { team: "MIA", teamTargets: 27, players: [["Malik Willis",6,0,17.7],["De'Von Achane",11,5,10.6],["Jaylen Wright",1,0,-0.1],["Caleb Douglas",0,7,14.4],["Malik Washington",0,8,6.3],["Chris Bell",0,2,3.5],["Greg Dulcich",0,2,3.8],["Kevin Coleman Jr.",0,2,0],["Will Kacmarek",0,1,0]] },
  { team: "LV", teamTargets: 28, players: [["Kirk Cousins",5,0,21.8],["Ashton Jeanty",23,6,34.7],["Mike Washington Jr.",7,0,4.1],["Malik Benson",1,2,0.8],["Michael Mayer",0,7,9.2],["Tre Tucker",0,4,4.7],["Jalen Nailor",0,5,5.7],["Jack Bech",0,4,11.3]] },
  { team: "GB", teamTargets: 38, players: [["Jordan Love",1,0,27.5],["MarShawn Lloyd",13,1,3.7],["Chris Brooks",7,1,2.9],["Christian Watson",0,8,34.7],["Matthew Golden",0,12,15.5],["Tucker Kraft",0,6,9.5],["Jonnu Smith",0,3,7],["Jayden Reed",0,7,5]] },
  { team: "MIN", teamTargets: 22, players: [["Kyler Murray",2,0,0.6],["Jordan Mason",15,0,11.9],["Aaron Jones Sr.",12,1,10],["Justin Jefferson",0,9,29.2],["T.J. Hockenson",0,5,13.6],["Josh Oliver",0,4,4.2],["Jauan Jennings",0,1,0],["Jordan Addison",0,2,0]] },
  { team: "WSH", teamTargets: 29, players: [["Jayden Daniels",5,0,21.7],["Jacory Croskey-Merritt",16,1,12.6],["Rachaad White",7,2,4.7],["Kaytron Allen",4,0,1.6],["Antonio Williams",0,4,16.4],["Stefon Diggs",0,9,15.5],["Chig Okonkwo",0,3,3.6],["Terry McLaurin",0,4,3.4],["John Bates",0,3,3.3],["Jaylin Lane",0,1,1.4],["Dyami Brown",0,2,0]] },
  { team: "PHI", teamTargets: 22, players: [["Jalen Hurts",7,0,30.7],["Saquon Barkley",15,2,9],["Will Shipley",2,1,2.2],["Tank Bigsby",1,0,0.3],["Dallas Goedert",0,5,23.7],["Dontayvion Wicks",0,4,15.3],["DeVonta Smith",0,6,8.3],["Makai Lemon",0,4,2.5]] },
  { team: "ARI", teamTargets: 37, players: [["Jacoby Brissett",6,0,18.5],["Tyler Allgeier",17,2,9],["Jeremiyah Love",11,4,13],["Trey McBride",0,13,24.5],["Kendrick Bourne",0,8,15.5],["Michael Wilson",0,7,10.6],["Marvin Harrison Jr.",0,3,4.3]] },
  { team: "LAC", teamTargets: 26, players: [["Justin Herbert",5,0,16.3],["Omarion Hampton",12,0,8.3],["Keaton Mitchell",4,0,0.9],["Ladd McConkey",0,7,19.2],["David Njoku",0,5,10.8],["Oronde Gadsden II",0,2,5.2],["Tre' Harris",0,6,5],["Quentin Johnston",0,6,3.7]] },
];
