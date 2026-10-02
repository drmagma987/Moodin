import type { TeamData } from './types';
export type { TeamData } from './types';

// ── CONMEBOL (6) ──
import { argentina } from './argentina';
import { brazil } from './brazil';
import { uruguay } from './uruguay';
import { colombia } from './colombia';
import { ecuador } from './ecuador';
import { paraguay } from './paraguay';

// ── UEFA (16) ──
import { france } from './france';
import { spain } from './spain';
import { england } from './england';
import { germany } from './germany';
import { portugal } from './portugal';
import { netherlands } from './netherlands';
import { croatia } from './croatia';
import { belgium } from './belgium';
import { switzerland } from './switzerland';
import { austria } from './austria';
import { turkey } from './turkey';
import { norway } from './norway';
import { sweden } from './sweden';
import { scotland } from './scotland';
import { czechia } from './czechia';
import { bosnia } from './bosnia';

// ── CONCACAF (6) ──
import { usa } from './usa';
import { mexico } from './mexico';
import { canada } from './canada';
import { panama } from './panama';
import { curacao } from './curacao';
import { haiti } from './haiti';

// ── AFC (9) ──
import { japan } from './japan';
import { southKorea } from './southkorea';
import { iran } from './iran';
import { australia } from './australia';
import { saudiArabia } from './saudiarabia';
import { qatar } from './qatar';
import { uzbekistan } from './uzbekistan';
import { iraq } from './iraq';
import { jordan } from './jordan';

// ── CAF (10) ──
import { morocco } from './morocco';
import { senegal } from './senegal';
import { egypt } from './egypt';
import { ghana } from './ghana';
import { algeria } from './algeria';
import { ivoryCoast } from './ivorycoast';
import { tunisia } from './tunisia';
import { southAfrica } from './southafrica';
import { capeVerde } from './capeverde';
import { drCongo } from './drcongo';

// ── OFC (1) ──
import { newZealand } from './newzealand';

// All 48 nations qualified for the 2026 FIFA World Cup, listed alphabetically
// by name for the team-selection screen.
export const TEAMS: TeamData[] = [
  argentina, brazil, uruguay, colombia, ecuador, paraguay,
  france, spain, england, germany, portugal, netherlands, croatia, belgium,
  switzerland, austria, turkey, norway, sweden, scotland, czechia, bosnia,
  usa, mexico, canada, panama, curacao, haiti,
  japan, southKorea, iran, australia, saudiArabia, qatar, uzbekistan, iraq, jordan,
  morocco, senegal, egypt, ghana, algeria, ivoryCoast, tunisia, southAfrica, capeVerde, drCongo,
  newZealand,
].sort((a, b) => a.name.localeCompare(b.name));
