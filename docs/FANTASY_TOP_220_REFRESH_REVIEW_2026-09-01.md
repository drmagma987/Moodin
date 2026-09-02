# 2026 PPR Top-220 Refresh Review

Status: **review only — no production ranking artifact has been changed**

Review timestamp: September 1, 2026 (ET)

## Executive read

The current model can be refreshed without turning the board into a news feed or copying consensus rankings.

- A live source pull produced a healthy 473-player candidate pool.
- The proposed news layer contains 26 player annotations.
- Fourteen of those annotations receive bounded projection adjustments; 12 are annotation-only because the fresh projection already reflects the news or the evidence is too weak to justify a numerical move.
- Yahoo XRank is treated as a draft-room visibility and availability input, not as player value.
- Aggregate Rank and individual source ranks are comparison evidence, not replacements for the model.
- Rank Spread lowers confidence when expert inputs disagree; it does not automatically move a player.
- Every workbook target/promotion/personal-order field is ignored. None is interpreted as manager preference.

## Proposed numerical changes

Positive rank delta means the player rises. These are movements from the fresh live model board after applying only the residual news layer.

| Player | Fresh model | Proposed | Rank delta | Median-point delta | Review rationale |
|---|---:|---:|---:|---:|---|
| James Conner | 213 | 225 | -12 | -4.34 | Confirmed IR was not reflected in the fresh median. This moves him out of the top 220. |
| Jordyn Tyson | 155 | 162 | -7 | -4.71 | Confirmed IR and an expected multi-week absence were only lightly reflected. |
| TreVeyon Henderson | 71 | 76 | -5 | -1.81 | Not cleared for full activity; conflicting recent reports keep the adjustment modest. |
| Zach Charbonnet | 156 | 159 | -3 | -3.97 | PUP guarantees at least four missed games. |
| Carnell Tate | 77 | 79 | -2 | -0.51 | Tiny drag for unexplained stiffness; no guessed timetable. |
| Jeremiyah Love | 35 | 36 | -1 | -3.92 | High-ankle concern and uncertain Week 1 status, but not treated as a season-long injury. |
| Mike Evans | 55 | 56 | -1 | -2.02 | Multiple current injuries create near-term availability risk. |
| Khalil Shakir | 103 | 104 | -1 | -1.01 | Still sidelined, but the absence lacks a clear diagnosis or timetable. |
| Emmett Johnson | 182 | 181 | +1 | +1.28 | Updated depth chart supports a modest contingent RB2 role. |
| Kyle Monangai | 116 | 116 | 0 | -1.55 | Week-to-week knee issue; fresh projections already moved down. |
| Jonathon Brooks | 95 | 95 | 0 | -1.53 | Soreness and a projected complementary role temper a fresh projection that had risen. |
| Javonte Williams | 37 | 37 | 0 | +1.28 | Clearer lead-back status restores only a small portion of a larger fresh-source decline. |
| D'Andre Swift | 43 | 43 | 0 | +0.95 | Small role bump while Monangai is week-to-week; coach optimism is not treated as a new projection. |
| Brian Robinson Jr. | 184 | 184 | 0 | +0.69 | Small goal-line opportunity bump with overall workload still uncertain. |

The only top-220 membership change created by this news overlay is **Kaelon Black entering at 216 and James Conner falling to 225**.

## Annotation-only changes

These reports should be visible in the assistant but should not add another numerical adjustment.

| Player | Fresh model | Annotation | Why no added points |
|---|---:|---|---|
| Josh Jacobs | 107 | Commissioner's Exempt List; cannot practice or play while listed | Fresh projections already removed 140.8 median points and moved him down 77 model slots. |
| MarShawn Lloyd | 117 | Likely Green Bay backfield leader during Jacobs' absence | Fresh projections already added 54.0 median points and moved him up 59 model slots. |
| Isiah Pacheco | 183 | Placed on IR with a back injury | Fresh projections already removed 11.6 median points and moved him down 16 slots. |
| Jadarian Price | 79 | Expected early Seattle lead-back role | Fresh projections already added 3.1 median points and improved his model position. |
| Kyren Williams | 36 | Expected backfield timeshare with Blake Corum | Fresh projections already removed 13.3 median points. |
| Malik Nabers | 27 | Practiced, but Week 1 readiness remains unresolved | Fresh projections already added 8.5 median points; the remaining signal is mixed. |
| Christian McCaffrey | 5 | Participated in practice drills | Reassuring, but not enough to raise an elite baseline. |
| Luther Burden III | 59 | Returned to practice | Fresh projections already added 4.0 median points. |
| Tee Higgins | 42 | Heel contusion described as not a major concern | Visibility is useful; a downgrade is not supported. |
| Ja'Marr Chase | 2 | Expected to be limited with a knee issue | Coach is positive; no season-long ranking move is supported. |
| Tyrone Tracy Jr. | 148 | Practicing in a non-contact jersey | Fresh projection already declined; the latest direction is positive but incomplete. |
| De'Zhaun Stribling | 139 | Expanded opportunity after San Francisco receiver injuries | Fresh projections already added 5.5 median points and eight model slots. |

## Yahoo XRank should change assistant behavior, not model value

The clearest use is estimating which players other managers are likely to notice and whether a tier can survive to the next pick.

### Players Yahoo displays materially later than consensus

| Player | Model | Aggregate | Yahoo XRank | XRank minus aggregate | Interpretation |
|---|---:|---:|---:|---:|---|
| T.J. Hockenson | 170 | 127.5 | 212 | +84.5 | Yahoo may bury him; availability model should give him a much higher chance to return. |
| Jake Ferguson | 100 | 108.3 | 146 | +37.7 | Meaningful chance the room overlooks him relative to consensus. |
| Jakobi Meyers | 85 | 90.0 | 126 | +36.0 | Later Yahoo visibility creates patience leverage. |
| Michael Pittman Jr. | 75 | 69.7 | 104 | +34.3 | Yahoo presentation is meaningfully later than consensus. |
| Courtland Sutton | 66 | 66.7 | 100 | +33.3 | Strong room-visibility discount, though expert spread is also wide. |
| Wan'Dale Robinson | 68 | 79.0 | 112 | +33.0 | Yahoo may let him survive longer than a consensus-only model expects. |
| Patrick Mahomes II | 108 | 87.7 | 120 | +32.3 | Useful for QB timing; do not confuse later visibility with better player value. |
| Travis Kelce | 83 | 92.0 | 121 | +29.0 | Useful for TE tier survival and opponent-need modeling. |
| Khalil Shakir | 103 | 111.7 | 140 | +28.3 | Visibility discount exists, but current injury uncertainty must stay attached. |

### Players Yahoo displays materially earlier than consensus

| Player | Model | Aggregate | Yahoo XRank | XRank minus aggregate | Interpretation |
|---|---:|---:|---:|---:|---|
| Emmett Johnson | 182 | 220.5 | 167 | -53.5 | Yahoo may surface him much earlier; do not assume a late-round return despite the low consensus rank. |
| Keaton Mitchell | 175 | 174.7 | 127 | -47.7 | Yahoo visibility increases room-selection risk; expert spread is very wide. |
| Makai Lemon | 114 | 137.5 | 105 | -32.5 | Likely to be noticed earlier than consensus ordering suggests. |
| Parker Washington | 57 | 82.3 | 55 | -27.3 | Yahoo and the model both surface him well ahead of consensus. |
| J.K. Dobbins | 105 | 111.3 | 85 | -26.3 | Earlier display should reduce make-it-back estimates. |
| De'Zhaun Stribling | 139 | 120.0 | 94 | -26.0 | The room may chase the role news before the model price. |
| Mike Evans | 55 | 81.3 | 60 | -21.3 | Yahoo visibility is early even while the health note is negative. |
| Jordyn Tyson | 155 | 150.5 | 129 | -21.5 | Yahoo still displays him early relative to consensus despite IR; the assistant must not mistake visibility for value. |

## Confidence rules from Rank Spread

Large spreads should produce a visible uncertainty warning and wider decision bands. They should not produce a directional move by themselves.

- Josh Jacobs: spread 101. The exempt-list annotation and fresh projection change matter more than the consensus mean.
- Jalen McMillan: spread 164. Yahoo displays him 61 spots earlier than the two-source aggregate, so both the price and the consensus are unstable.
- Terrance Ferguson: spread 140. Avoid confident tier-survival claims.
- Keaton Mitchell: spread 92. Yahoo visibility is early, but the underlying expert view is highly divided.
- Jordan Love: spread 87. QB timing should be expressed as a range, not a precise return probability.
- Calvin Ridley and Tank Dell: spread 170. These should be explicit disagreement cases, not ordinary ranked players.

## Recommended application rules

If this review is approved:

1. Refresh the projection/ECR/ADP source layer from the live snapshot.
2. Apply the 14 bounded residual adjustments above.
3. Store all 26 news annotations, including the 12 zero-delta notes.
4. Import workbook Yahoo XRank and Yahoo ADP as separate market fields.
5. Use Yahoo XRank heavily in make-it-back, opponent selection, tier-survival, and room-run estimates.
6. Keep Aggregate Rank and individual source ranks as comparison evidence.
7. Convert Rank Spread into a confidence warning and wider probability bands.
8. Do not import workbook target flags, manual promotions, or ordering as manager preference.

## Items that deserve explicit approval

- **James Conner:** accept the only proposed exit from the top 220 (213 to 225).
- **TreVeyon Henderson:** accept a five-slot drop despite conflicting recent recovery reports.
- **Jeremiyah Love:** accept a small rank move but a larger projection-floor drag for the high-ankle concern.
- **Josh Jacobs / MarShawn Lloyd:** accept the large fresh-source moves, but do not stack a second news adjustment on them.
- **Yahoo layer:** confirm that XRank changes availability estimates only, never the underlying player-value score.

## Evidence reviewed

- NFL.com: Josh Jacobs placed on the Commissioner's Exempt List.
- RotoWire: September 1 injury, practice, and role updates.
- FantasyPros: current RB injury and IR updates.
- Fantasy Life: Mike Evans and San Francisco receiver availability.
- PFF: updated team depth charts.
- Yahoo Sports: current market movement and Yahoo-specific room context.
- Attached workbook: Yahoo XRank, Yahoo ADP, aggregate/source ranks, and Rank Spread; personal-target content explicitly excluded.
