#!/usr/bin/env python3
"""Build the checked, fantasy-position-only weekly evidence snapshot."""

from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path


FANTASY_POSITIONS = {"QB", "RB", "FB", "HB", "WR", "TE", "K"}


def filtered_csv(path: Path, week: int, *, player_stats: bool) -> tuple[str, int]:
    with path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise ValueError(f"Missing CSV header: {path}")
        rows = [
            row
            for row in reader
            if row.get("season") == "2026"
            and row.get("week") == str(week)
            and (row.get("season_type") if player_stats else row.get("game_type")) == "REG"
            and row.get("position") in FANTASY_POSITIONS
        ]

    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue(), len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stats", required=True, type=Path)
    parser.add_argument("--snaps", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--week", required=True, type=int)
    parser.add_argument("--captured-at", required=True)
    args = parser.parse_args()

    stats_csv, stats_rows = filtered_csv(args.stats, args.week, player_stats=True)
    snaps_csv, snap_rows = filtered_csv(args.snaps, args.week, player_stats=False)
    if stats_rows < 250 or snap_rows < 250:
        raise ValueError(
            f"Incomplete Week {args.week} evidence: {stats_rows} stat rows, {snap_rows} snap rows"
        )

    payload = {
        "season": 2026,
        "week": args.week,
        "capturedAt": args.captured_at,
        "statsCsv": stats_csv,
        "snapsCsv": snaps_csv,
        "sources": [
            {
                "label": f"nflverse 2026 Week {args.week} player stats",
                "url": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
                "status": "loaded",
                "detail": f"Checked snapshot containing {stats_rows} fantasy-position rows from the completed Week {args.week} slate.",
            },
            {
                "label": f"nflverse/PFR 2026 Week {args.week} snaps",
                "url": "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv",
                "status": "loaded",
                "detail": f"Checked snapshot containing {snap_rows} fantasy-position snap rows from the completed Week {args.week} slate.",
            },
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "statsRows": stats_rows, "snapRows": snap_rows}))


if __name__ == "__main__":
    main()
