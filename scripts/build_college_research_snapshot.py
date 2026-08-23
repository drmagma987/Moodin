#!/usr/bin/env python3
"""Aggregate keyless cfbfastR play-by-play into research-only rookie inputs.

Requires pandas and pyarrow. Inputs are local Parquet releases and the nflverse
players CSV; the script never scrapes player pages or calls an authenticated API.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

import pandas as pd


COLUMNS = [
    "pos_team",
    "rush",
    "rush_td",
    "pass_td",
    "target",
    "rush_player",
    "rush_yds",
    "reception_player",
    "reception_yds",
    "target_player",
    "touchdown_player",
    "EPA",
    "success",
    "firstD_by_yards",
    "rz_play",
    "scoring_opp",
]


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", value.lower())
    return re.sub(r"[^a-z0-9]", "", value)


def number(value: str | None) -> int | None:
    if value is None or not value.strip():
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def load_rookies(path: Path, rookie_season: int, draft_capital_path: Path | None = None) -> dict[str, dict]:
    draft_capital = {}
    if draft_capital_path:
        draft_capital = {
            normalize_name(row["playerName"]): row["pick"]
            for row in json.loads(draft_capital_path.read_text(encoding="utf-8"))["players"]
        }
    rookies: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            position = (row.get("position") or "").upper()
            draft_year = number(row.get("draft_year"))
            first_season = number(row.get("rookie_season"))
            if position not in {"RB", "WR", "TE"} or rookie_season not in {draft_year, first_season}:
                continue
            name = row.get("display_name") or ""
            canonical_key = normalize_name(name)
            rookie = {
                "playerName": name,
                "gsisId": row.get("gsis_id") or None,
                "position": position,
                "draftPick": draft_capital.get(normalize_name(name), number(row.get("draft_pick"))),
                "draftTeam": row.get("draft_team") or row.get("latest_team") or None,
                "rookieSeason": rookie_season,
                "birthDate": row.get("birth_date") or None,
                "college": row.get("college_name") or None,
                "canonicalKey": canonical_key,
            }
            aliases = {
                canonical_key,
                normalize_name(f"{row.get('first_name') or ''} {row.get('last_name') or ''}"),
                normalize_name(f"{row.get('common_first_name') or ''} {row.get('last_name') or ''}"),
                normalize_name(f"{row.get('football_name') or ''} {row.get('last_name') or ''}"),
            }
            for alias in aliases:
                if alias:
                    rookies[alias] = rookie
    return rookies


def add_grouped(target: defaultdict, frame: pd.DataFrame, name_col: str, value_col: str, stat: str) -> None:
    usable = frame.dropna(subset=[name_col, "pos_team"])
    if usable.empty:
        return
    for (name, team), value in usable.groupby([name_col, "pos_team"])[value_col].sum().items():
        target[(normalize_name(str(name)), str(team))][stat] += float(value)


def aggregate_season(path: Path) -> tuple[dict, dict]:
    frame = pd.read_parquet(path, columns=COLUMNS)
    for column in ["rush", "rush_td", "pass_td", "target", "rush_yds", "reception_yds", "EPA", "success", "firstD_by_yards", "rz_play", "scoring_opp"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)

    teams: defaultdict = defaultdict(lambda: defaultdict(float))
    players: defaultdict = defaultdict(lambda: defaultdict(float))

    rushes = frame[frame["rush"] == 1].copy()
    rushes["rushAttempt"] = 1
    rushes["rushExplosive"] = (rushes["rush_yds"] >= 10).astype(int)
    rushes["rushStuffAvoided"] = (rushes["rush_yds"] > 0).astype(int)
    receptions = frame[frame["reception_player"].notna()].copy()
    receptions["reception"] = 1
    receptions["receivingExplosive"] = (receptions["reception_yds"] >= 20).astype(int)
    targets = frame[frame["target"] == 1].copy()
    targets["resolved_target"] = targets["target_player"].fillna(targets["reception_player"])
    targets["targetEpa"] = targets["EPA"]
    targets["targetSuccess"] = targets["success"]
    targets["targetFirstDown"] = targets["firstD_by_yards"]
    targets["redZoneTarget"] = (targets["rz_play"] == 1).astype(int)
    targets["scoringOpportunityTarget"] = (targets["scoring_opp"] == 1).astype(int)
    touchdowns = frame[(frame["rush_td"] == 1) | (frame["pass_td"] == 1)]

    for team, value in rushes.groupby("pos_team")["rush_yds"].sum().items():
        teams[str(team)]["rushYards"] += float(value)
    for team, value in rushes.groupby("pos_team")["rushAttempt"].sum().items():
        teams[str(team)]["rushAttempts"] += float(value)
    for team, value in receptions.groupby("pos_team")["reception_yds"].sum().items():
        teams[str(team)]["receivingYards"] += float(value)
    for team, value in targets.groupby("pos_team")["target"].sum().items():
        teams[str(team)]["targets"] += float(value)
    for stat in ["targetEpa", "targetSuccess", "targetFirstDown", "redZoneTarget", "scoringOpportunityTarget"]:
        for team, value in targets.groupby("pos_team")[stat].sum().items():
            teams[str(team)][stat] += float(value)
    for team, value in receptions.groupby("pos_team")["reception"].sum().items():
        teams[str(team)]["receptions"] += float(value)
    for team, value in receptions.groupby("pos_team")["receivingExplosive"].sum().items():
        teams[str(team)]["receivingExplosives"] += float(value)
    for team, value in touchdowns.groupby("pos_team").size().items():
        teams[str(team)]["touchdowns"] += float(value)
    for team, value in touchdowns[touchdowns["pass_td"] == 1].groupby("pos_team").size().items():
        teams[str(team)]["receivingTouchdowns"] += float(value)

    add_grouped(players, rushes, "rush_player", "rush_yds", "rushYards")
    add_grouped(players, rushes, "rush_player", "rushAttempt", "rushAttempts")
    add_grouped(players, rushes, "rush_player", "rushExplosive", "rushExplosives")
    add_grouped(players, rushes, "rush_player", "rushStuffAvoided", "rushStuffAvoided")
    add_grouped(players, receptions, "reception_player", "reception_yds", "receivingYards")
    add_grouped(players, receptions, "reception_player", "reception", "receptions")
    add_grouped(players, receptions, "reception_player", "receivingExplosive", "receivingExplosives")
    add_grouped(players, targets, "resolved_target", "target", "targets")
    for stat in ["targetEpa", "targetSuccess", "targetFirstDown", "redZoneTarget", "scoringOpportunityTarget"]:
        add_grouped(players, targets, "resolved_target", stat, stat)

    for (name, team), value in touchdowns.dropna(subset=["touchdown_player", "pos_team"]).groupby(["touchdown_player", "pos_team"]).size().items():
        players[(normalize_name(str(name)), str(team))]["touchdowns"] += float(value)
    receiving_tds = touchdowns[(touchdowns["pass_td"] == 1) & touchdowns["touchdown_player"].notna()]
    for (name, team), value in receiving_tds.groupby(["touchdown_player", "pos_team"]).size().items():
        players[(normalize_name(str(name)), str(team))]["receivingTouchdowns"] += float(value)

    return dict(teams), dict(players)


def safe_ratio(numerator: float, denominator: float) -> float | None:
    return numerator / denominator if denominator > 0 else None


def other_rate(player_numerator: float, player_denominator: float, team_numerator: float, team_denominator: float) -> float | None:
    return safe_ratio(team_numerator - player_numerator, team_denominator - player_denominator)


def age_on_september_first(birth_date: str | None, season: int) -> float | None:
    if not birth_date:
        return None
    try:
        born = date.fromisoformat(birth_date)
    except ValueError:
        return None
    return (date(season, 9, 1) - born).days / 365.2425


def build_snapshot(rookies: dict[str, dict], season_paths: list[tuple[int, Path]]) -> list[dict]:
    evidence: defaultdict = defaultdict(list)
    for season, path in season_paths:
        teams, players = aggregate_season(path)
        for (name, team), stats in players.items():
            rookie = rookies.get(name)
            if rookie is None or team not in teams:
                continue
            team_stats = teams[team]
            evidence[rookie["canonicalKey"]].append({"season": season, "team": team, "player": stats, "teamStats": team_stats})

    output: list[dict] = []
    canonical_rookies = {rookie["canonicalKey"]: rookie for rookie in rookies.values()}
    for name, rookie in canonical_rookies.items():
        rows = evidence.get(name, [])
        if not rows:
            continue
        player_totals: defaultdict = defaultdict(float)
        team_totals: defaultdict = defaultdict(float)
        season_yard_shares: list[tuple[int, float]] = []
        breakout_age = None
        for row in rows:
            for key, value in row["player"].items():
                player_totals[key] += value
            for key, value in row["teamStats"].items():
                team_totals[key] += value
            if rookie["position"] == "RB":
                player_yards = row["player"]["rushYards"] + row["player"]["receivingYards"]
                team_yards = row["teamStats"]["rushYards"] + row["teamStats"]["receivingYards"]
            else:
                player_yards = row["player"]["receivingYards"]
                team_yards = row["teamStats"]["receivingYards"]
            season_yard_share = safe_ratio(player_yards, team_yards)
            if season_yard_share is not None:
                season_yard_shares.append((row["season"], season_yard_share))
            receiving_share = safe_ratio(row["player"]["receivingYards"], row["teamStats"]["receivingYards"])
            receiving_td_share = safe_ratio(row["player"]["receivingTouchdowns"], row["teamStats"]["receivingTouchdowns"])
            if receiving_share is not None and receiving_td_share is not None:
                season_dominator = (receiving_share + receiving_td_share) / 2
                # A receiver can demonstrate an age-adjusted breakout through a
                # substantial yardage share even when volatile TD attribution
                # holds the traditional dominator average below 20%.
                if season_dominator >= 0.20 or receiving_share >= 0.20:
                    age = age_on_september_first(rookie["birthDate"], row["season"])
                    breakout_age = age if breakout_age is None else min(breakout_age, age or breakout_age)

        target_share = safe_ratio(player_totals["targets"], team_totals["targets"])
        receiving_ypt = safe_ratio(player_totals["receivingYards"], player_totals["targets"])
        team_receiving_ypt = other_rate(
            player_totals["receivingYards"], player_totals["targets"],
            team_totals["receivingYards"], team_totals["targets"],
        )
        final_share = max(season_yard_shares, default=(0, 0), key=lambda item: item[0])[1]
        best_share = max((share for _, share in season_yard_shares), default=0)
        record = {
            "lane": "rookie",
            "playerName": rookie["playerName"],
            "gsisId": rookie["gsisId"],
            "position": rookie["position"],
            "draftTeam": rookie["draftTeam"],
            "rookieSeason": rookie["rookieSeason"],
            "draftPick": rookie["draftPick"],
            "collegeTargetShare": round(target_share, 4) if target_share is not None else None,
            "collegeBestSeasonYardsShare": round(best_share, 4),
            "collegeFinalSeasonYardsShare": round(final_share, 4),
            "collegeTargets": int(player_totals["targets"]),
            "collegeCatchRate": round(safe_ratio(player_totals["receptions"], player_totals["targets"]) or 0, 4),
            "collegeReceivingYardsPerTarget": round(receiving_ypt or 0, 3),
            "collegeReceivingExplosiveRate": round(safe_ratio(player_totals["receivingExplosives"], player_totals["targets"]) or 0, 4),
            "collegeReceivingTeamYptDelta": round((receiving_ypt or 0) - (team_receiving_ypt or 0), 3),
            "collegeTargetEpaPerTarget": round(safe_ratio(player_totals["targetEpa"], player_totals["targets"]) or 0, 4),
            "collegeTargetSuccessRate": round(safe_ratio(player_totals["targetSuccess"], player_totals["targets"]) or 0, 4),
            "collegeTargetFirstDownRate": round(safe_ratio(player_totals["targetFirstDown"], player_totals["targets"]) or 0, 4),
            "collegeRedZoneTargetShare": round(safe_ratio(player_totals["redZoneTarget"], team_totals["redZoneTarget"]) or 0, 4),
            "collegeScoringOpportunityTargetShare": round(safe_ratio(player_totals["scoringOpportunityTarget"], team_totals["scoringOpportunityTarget"]) or 0, 4),
            "collegeSeasons": sorted(row["season"] for row in rows),
            "sources": ["sportsdataverse-cfbfastr", "nflverse-players"] + (["nfl-draft-tracker"] if rookie["draftPick"] is not None else []),
        }
        if rookie["position"] == "RB":
            scrimmage = player_totals["rushYards"] + player_totals["receivingYards"]
            team_scrimmage = team_totals["rushYards"] + team_totals["receivingYards"]
            record["collegeScrimmageYardsShare"] = round(safe_ratio(scrimmage, team_scrimmage) or 0, 4)
            record["collegeTouchdownShare"] = round(safe_ratio(player_totals["touchdowns"], team_totals["touchdowns"]) or 0, 4)
            player_ypc = safe_ratio(player_totals["rushYards"], player_totals["rushAttempts"])
            other_ypc = other_rate(
                player_totals["rushYards"], player_totals["rushAttempts"],
                team_totals["rushYards"], team_totals["rushAttempts"],
            )
            record["collegeRushAttempts"] = int(player_totals["rushAttempts"])
            record["collegeRushingYardsPerCarry"] = round(player_ypc or 0, 3)
            record["collegeRushingExplosiveRate"] = round(safe_ratio(player_totals["rushExplosives"], player_totals["rushAttempts"]) or 0, 4)
            record["collegeRushingStuffAvoidanceRate"] = round(safe_ratio(player_totals["rushStuffAvoided"], player_totals["rushAttempts"]) or 0, 4)
            record["collegeRushingTeamYpcDelta"] = round((player_ypc or 0) - (other_ypc or 0), 3)
        else:
            yards_share = safe_ratio(player_totals["receivingYards"], team_totals["receivingYards"])
            td_share = safe_ratio(player_totals["receivingTouchdowns"], team_totals["receivingTouchdowns"])
            record["collegeDominator"] = round(((yards_share or 0) + (td_share or 0)) / 2, 4)
            record["breakoutQualified"] = breakout_age is not None
            record["breakoutAge"] = round(breakout_age, 2) if breakout_age is not None else None
        output.append({key: value for key, value in record.items() if value is not None})
    return sorted(output, key=lambda row: (row["position"], row["playerName"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--players", type=Path, required=True)
    parser.add_argument("--rookie-season", type=int, required=True)
    parser.add_argument("--draft-capital", type=Path)
    parser.add_argument("--season", action="append", nargs=2, metavar=("YEAR", "PARQUET"), required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    season_paths = [(int(year), Path(path)) for year, path in args.season]
    snapshot = build_snapshot(load_rookies(args.players, args.rookie_season, args.draft_capital), season_paths)
    rendered = json.dumps(snapshot, indent=2, sort_keys=True) + "\n"
    if args.output:
        if args.output.suffix == ".ts":
            rendered = (
                "// Generated by scripts/build_college_research_snapshot.py.\n"
                "// Research-only; do not hand-edit.\n"
                f"export const collegeResearch2026 = {rendered.rstrip()} as const;\n"
            )
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
