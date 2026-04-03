export function RoomSyncNotice({
  roomId,
  phaseLabel,
}: {
  roomId: string;
  phaseLabel: string;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <span className="font-semibold">Room {roomId}</span> is live in {phaseLabel}. If you accidentally back out,
      reopening the room will bring you back to the current phase.
    </div>
  );
}
