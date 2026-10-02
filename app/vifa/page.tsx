import type { Metadata } from 'next';
import { VifaGame } from '@/components/vifa/vifa-game';
import { buildPlayableEraTeamOptions } from '@/lib/vifa/data/playable-era-teams';

export const metadata: Metadata = {
  title: 'VIFA | Moodin',
  description:
    'A browser football prototype built from the Open Soccer game engine.',
};

export default function VifaPage() {
  const eraTeams = buildPlayableEraTeamOptions();
  return (
    <main className="min-h-screen bg-night-950 text-white">
      <h1 className="sr-only">VIFA browser football</h1>
      <VifaGame eraTeams={eraTeams} />
    </main>
  );
}
