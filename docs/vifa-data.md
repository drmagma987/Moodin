# VIFA World Cup data and ratings

VIFA's generated historical database is intentionally narrow: men's World Cup
teams and squads from 1982 through 2022, plus the 48 current teams already
authored for VIFA's 2026 mode. It does not copy unrelated women's tournaments,
club rosters, match events, managers, referees, wages, values, or media URLs.

## Outputs

- `lib/vifa/data/world-cup-database.generated.json` contains the filtered team
  list, squad identity, shirt number, position, six VIFA ratings, source IDs,
  match confidence, and rating provenance. This transformed database is
  distributed under CC BY-SA 4.0 to satisfy the World Cup source's share-alike
  term. Each team also has a role-complete `playable` gate and, when eligible,
  an 11-player VIFA lineup.
- `lib/vifa/data/world-cup-database.report.json` records coverage by tournament
  and checks the formulas against the published 2022 and 2026 face ratings.
- `lib/vifa/data/world-cup-database.ts` provides small runtime query helpers.

Pre-2005 World Cup squads remain useful team/player records but intentionally
have `ratings: null`: none of the requested rating sources covers those players.
The 2006 pack remains archive-only because its attribute schema is substantially
sparser. VIFA must not silently turn the generic engine fallback into purported
historical ratings.

The initial playable historical window is 2010-2022. A team is selectable only
when rated players can fill VIFA's current 1 GK / 4 DF / 4 MF / 2 FW engine
roles. This is a team-level gate, so a well-covered tournament can retain its
ready teams without pretending its incomplete teams are ready. Current 2026
teams retain their existing VIFA-authored cards when an FC 26 identity cannot be
matched; those cards are labeled `vifa-manual` rather than presented as FC data.

For twelve otherwise incomplete team-editions, the generator fills only the
missing starting-role slots with `vifa-tournament-estimate` cards. It selects a
real squad member by starts, appearances, goals, and shirt number; no fictional
identity is needed. Each six-category estimate blends 65% of that team's rated
same-role average with 35% of the tournament's rated same-role average, then
applies a small, capped adjustment for tournament usage and goals. The stored
`estimationEvidence` makes the recipe and underlying counts inspectable. These
42 estimates make Honduras, Japan, Nigeria, and North Korea 2010; Iran 2014;
Iran, Nigeria, Panama, and Tunisia 2018; and Costa Rica, Qatar, and Tunisia 2022
playable. This completes every 2010, 2014, 2018, 2022, and 2026 team without
inventing player identities or estimating cards beyond the starting-role need.

## Rating calculations

For outfield players, granular attributes are combined in the same six face-card
families used by VIFA:

- PAC: 45% acceleration, 55% sprint speed
- SHO: 5% positioning, 45% finishing, 20% shot power, 20% long shots,
  5% volleys, 5% penalties
- PAS: 20% vision, 20% crossing, 5% free-kick accuracy, 35% short passing,
  15% long passing, 5% curve
- DRI: 10% agility, 5% balance, 5% reactions, 30% ball control,
  45% dribbling, 5% composure
- DEF: 20% interceptions, 10% heading accuracy, 30% marking/awareness,
  30% standing tackle, 10% sliding tackle
- PHY: 5% jumping, 25% stamina, 50% strength, 20% aggression

The 2018, 2022, and 2026 sources already publish these six values, so VIFA
preserves their published values. The calculation is run beside them as a
verification. For 2006, 2010, and 2014, the `fifa_model` granular values are
used to derive the six categories. Exact-edition data is preferred. When it is
incomplete or absent, a stable player ID and birth-date match may fill an
attribute from the nearest edition within two years or interpolate between the
surrounding editions. Provenance distinguishes `derived`, `interpolated`, and
`nearest-derived` cards. A category is still rejected if it lacks enough real
evidence.

Identity resolution follows this order: country plus exact birth date, birth
date plus name when duplicated, then conservative normalized-name matching.
Country aliases cover historical labels such as Korea DPR/North Korea and
Serbia and Montenegro/Serbia. Ambiguous identities remain unmatched.

EA goalkeeper cards use DIV/HAN/KIC/REF/SPD/POS rather than the outfield six.
The generator preserves that source tuple and creates a clearly labeled VIFA
adapter tuple for the current engine. The adapter emphasizes speed for PAC,
kicking for SHO/PAS, handling/reflexes for DRI, diving/reflexes/positioning for
DEF, and handling/strength/jumping for PHY.

## Rebuild

Download the requested sources outside the repository, then run:

```bash
npm run vifa:data -- \
  --worldcup-dir /path/to/worldcup/data-csv \
  --fifa-model-csv /path/to/fifa_model/player_stats.csv \
  --fifa18-csv /path/to/players_18.csv \
  --fifa22-csv /path/to/players_22.csv \
  --fc26-csv /path/to/FC26_20250921.csv
```

The importer uses conservative country, birth-date, and name matching. Ambiguous
matches are left unrated and reported rather than guessed.

## Sources and licensing

- [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup),
  © 2023 Joshua C. Fjelstul, Ph.D., CC BY-SA 4.0. VIFA filters the source to
  men's tournaments from 1982 onward and joins squad rows to rating records.
- [FIFA Video Game Data + Modeling 2005–2020](https://github.com/lbenz730/fifa_model).
  The repository does not declare a license; VIFA stores only targeted derived
  values and source IDs, not its raw table.
- [FIFA 22 complete player dataset](https://www.kaggle.com/datasets/stefanoleone992/fifa-22-complete-player-dataset),
  CC0 according to the Kaggle API metadata.
- [FC 26 (FIFA 26) Player Data](https://www.kaggle.com/datasets/rovnez/fc-26-fifa-26-player-data),
  CC BY 4.0 according to the Kaggle API metadata.
