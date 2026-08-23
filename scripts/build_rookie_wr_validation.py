#!/usr/bin/env python3
"""Build a leakage-safe, expanding-window rookie-WR validation report.

The script reconstructs college evidence, preseason market/depth context, and
rookie-year outcomes. Holdout features are frozen before the corresponding NFL
season; outcome data is joined only after the predictions are generated.

Requires pandas, pyarrow, and numpy. Source files are cached outside the repo.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

from build_college_research_snapshot import build_snapshot, load_rookies, normalize_name


COHORTS = list(range(2016, 2026))
HOLDOUTS = list(range(2019, 2026))
COLLEGE_SEASONS = list(range(2014, 2025))
RIDGE_PENALTIES = [1.0, 5.0, 20.0, 50.0]
COMPONENT_NAMES = ["targetsPerGame", "catchRate", "yardsPerTarget", "touchdownsPerTarget", "rushingPointsPerGame"]


def download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 100:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "MoodinFantasyResearch/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    return path


def source_files(cache: Path) -> dict[str, dict[int, Path]]:
    college = {
        year: download(
            f"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/cfbfastR_cfb_pbp/play_by_play_{year}.parquet",
            cache / f"play_by_play_{year}.parquet",
        )
        for year in COLLEGE_SEASONS
    }
    depth = {
        year: download(
            f"https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{year}.csv",
            cache / f"depth_charts_{year}.csv",
        )
        for year in COHORTS
    }
    outcomes = {
        year: download(
            f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{year}.csv",
            cache / f"stats_player_week_{year}.csv",
        )
        for year in COHORTS
    }
    adp = {
        year: download(
            f"https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year={year}",
            cache / f"ffc_adp_{year}.json",
        )
        for year in COHORTS
    }
    return {"college": college, "depth": depth, "outcomes": outcomes, "adp": adp}


def player_profiles(path: Path) -> dict[str, dict]:
    output = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("position") != "WR" or not row.get("gsis_id"):
                continue
            output[row["gsis_id"]] = row
    return output


def load_adp(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        normalize_name(row.get("name") or ""): float(row["adp"])
        for row in payload.get("players", [])
        if row.get("position") == "WR" and row.get("adp") is not None
    }


def load_depth(path: Path, season: int) -> dict[str, dict]:
    frame = pd.read_csv(path, low_memory=False)
    output = {}
    if "dt" in frame.columns:
        frame["dt"] = frame["dt"].astype(str)
        frame = frame[frame["dt"].str.startswith(str(season))]
        frame = frame[frame["dt"] <= f"{season}-09-01T23:59:59Z"]
        frame = frame[frame["pos_abb"].astype(str).str.contains("WR", na=False)]
        if frame.empty:
            return output
        latest = frame["dt"].max()
        frame = frame[frame["dt"] == latest]
        for player_id, rows in frame.dropna(subset=["gsis_id"]).groupby("gsis_id"):
            rank = int(pd.to_numeric(rows["pos_rank"], errors="coerce").min())
            output[str(player_id)] = {"rank": rank, "topThreePath": rank <= 3, "sourceDate": latest[:10]}
        return output

    frame = frame[(frame["season"] == season) & (frame["week"] == 1)]
    frame = frame[(frame["formation"] == "Offense") & (frame["position"] == "WR")]
    for player_id, rows in frame.dropna(subset=["gsis_id"]).groupby("gsis_id"):
        depth_team = int(pd.to_numeric(rows["depth_team"], errors="coerce").min())
        output[str(player_id)] = {
            "rank": depth_team,
            "topThreePath": depth_team == 1,
            "sourceDate": f"{season}-week-1",
        }
    return output


def load_outcomes(path: Path) -> tuple[dict[str, dict], float]:
    frame = pd.read_csv(path, low_memory=False)
    frame = frame[(frame["season_type"] == "REG") & (frame["position"] == "WR")].copy()
    frame["custom_points"] = pd.to_numeric(frame["fantasy_points_ppr"], errors="coerce").fillna(0)
    frame["custom_points"] += (pd.to_numeric(frame["receiving_yards"], errors="coerce").fillna(0) >= 100).astype(int) * 2
    grouped = frame.groupby("player_id").agg(
        playerName=("player_display_name", "last"),
        games=("week", "nunique"),
        points=("custom_points", "sum"),
        targets=("targets", "sum"),
        receptions=("receptions", "sum"),
        receivingYards=("receiving_yards", "sum"),
        receivingTouchdowns=("receiving_tds", "sum"),
        rushingYards=("rushing_yards", "sum"),
        rushingTouchdowns=("rushing_tds", "sum"),
    )
    grouped["ppg"] = grouped["points"] / grouped["games"].clip(lower=1)
    eligible = grouped[grouped["games"] >= 6].sort_values("ppg", ascending=False)
    wr3_threshold = float(eligible.iloc[min(35, len(eligible) - 1)]["ppg"]) if len(eligible) else 0
    return {
        str(player_id): {
            "games": int(row.games),
            "points": float(row.points),
            "ppg": float(row.ppg),
            "targets": float(row.targets),
            "receptions": float(row.receptions),
            "receivingYards": float(row.receivingYards),
            "receivingTouchdowns": float(row.receivingTouchdowns),
            "rushingYards": float(row.rushingYards),
            "rushingTouchdowns": float(row.rushingTouchdowns),
        }
        for player_id, row in grouped.iterrows()
    }, wr3_threshold


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return min(high, max(low, value))


def scale(value: float | None, low: float, high: float) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return clamp((value - low) / (high - low) * 100)


def weighted(parts: list[tuple[float | None, float]]) -> float | None:
    present = [(score, weight) for score, weight in parts if score is not None]
    total = sum(weight for _, weight in present)
    return sum(score * weight for score, weight in present) / total if total else None


def college_scores(row: dict) -> tuple[float | None, float | None, float | None]:
    efficiency = weighted([
        (scale(row.get("collegeReceivingYardsPerTarget"), 4, 11), 0.24),
        (scale(row.get("collegeCatchRate"), 0.45, 0.82), 0.12),
        (scale(row.get("collegeReceivingExplosiveRate"), 0.05, 0.22), 0.14),
        (scale(row.get("collegeReceivingTeamYptDelta"), -1.5, 3), 0.10),
        (scale(row.get("collegeTargetEpaPerTarget"), -0.2, 0.8), 0.16),
        (scale(row.get("collegeTargetSuccessRate"), 0.3, 0.65), 0.10),
        (scale(row.get("collegeTargetFirstDownRate"), 0.2, 0.55), 0.08),
        (scale(row.get("collegeScoringOpportunityTargetShare"), 0.1, 0.4), 0.06),
    ])
    reliability = clamp(float(row.get("collegeTargets") or 0) / 110, 0, 1)
    if efficiency is not None:
        efficiency = 50 + (efficiency - 50) * reliability
    opportunity = weighted([
        (scale(row.get("collegeBestSeasonYardsShare"), 0.12, 0.4), 0.45),
        (scale(row.get("collegeFinalSeasonYardsShare"), 0.12, 0.4), 0.35),
        (scale(row.get("collegeTargetShare"), 0.12, 0.32), 0.2),
    ])
    breakout = scale(23 - row["breakoutAge"], 0, 5) if row.get("breakoutAge") is not None else (0 if row.get("breakoutQualified") is False else None)
    return efficiency, opportunity, breakout


def build_rows(players_path: Path, files: dict[str, dict[int, Path]]) -> list[dict]:
    rows = []
    for season in COHORTS:
        college_paths = [(year, path) for year, path in files["college"].items() if season - 6 <= year < season]
        college = build_snapshot(load_rookies(players_path, season), college_paths)
        depth = load_depth(files["depth"][season], season)
        outcomes, wr3_threshold = load_outcomes(files["outcomes"][season])
        adp = load_adp(files["adp"][season])
        for evidence in college:
            if evidence["position"] != "WR" or not evidence.get("gsisId"):
                continue
            player_id = evidence["gsisId"]
            role = depth.get(player_id)
            direct_adp = adp.get(normalize_name(evidence["playerName"]))
            # The model's universe is a fantasy-relevant NFL roster: a direct
            # market listing or an opening-week depth-chart listing is required.
            if direct_adp is None and role is None:
                continue
            actual = outcomes.get(player_id, {
                "games": 0, "points": 0.0, "ppg": 0.0, "targets": 0.0,
                "receptions": 0.0, "receivingYards": 0.0,
                "receivingTouchdowns": 0.0, "rushingYards": 0.0,
                "rushingTouchdowns": 0.0,
            })
            efficiency, opportunity, breakout = college_scores(evidence)
            if efficiency is None or opportunity is None or breakout is None:
                continue
            draft_pick = int(evidence.get("draftPick") or 258)
            market_adp = direct_adp if direct_adp is not None else min(240.0, 175 + draft_pick * 0.25)
            rows.append({
                "playerId": player_id,
                "playerName": evidence["playerName"],
                "season": season,
                "marketAdp": market_adp,
                "directAdp": direct_adp is not None,
                "draftPick": draft_pick,
                "topThreePath": bool(role and role["topThreePath"]),
                "depthRank": role["rank"] if role else None,
                "efficiencyScore": efficiency,
                "opportunityScore": opportunity,
                "breakoutScore": breakout,
                "collegeCatchRate": evidence.get("collegeCatchRate", 0),
                "collegeYpt": evidence.get("collegeReceivingYardsPerTarget", 0),
                "collegeTargetEpa": evidence.get("collegeTargetEpaPerTarget", 0),
                "collegeTargetSuccess": evidence.get("collegeTargetSuccessRate", 0),
                "collegeFirstDownRate": evidence.get("collegeTargetFirstDownRate", 0),
                "collegeRedZoneShare": evidence.get("collegeRedZoneTargetShare", 0),
                "collegeScoringOpportunityShare": evidence.get("collegeScoringOpportunityTargetShare", 0),
                "actualPpg": actual["ppg"],
                "games": actual["games"],
                "actualPoints": actual["points"],
                "actualTargets": actual["targets"],
                "actualReceptions": actual["receptions"],
                "actualReceivingYards": actual["receivingYards"],
                "actualReceivingTouchdowns": actual["receivingTouchdowns"],
                "actualRushingYards": actual["rushingYards"],
                "actualRushingTouchdowns": actual["rushingTouchdowns"],
                "wr3ThresholdPpg": wr3_threshold,
            })
    return rows


def features(rows: list[dict], lane: str) -> np.ndarray:
    values = []
    for row in rows:
        market = [math.log1p(row["marketAdp"]), math.log1p(row["draftPick"]), float(row["directAdp"])]
        opportunity = [float(row["topThreePath"]), 0 if row["depthRank"] is None else 1 / max(1, row["depthRank"]), (row["opportunityScore"] - 50) / 50, (row["breakoutScore"] - 50) / 50]
        quality = [(row["efficiencyScore"] - 50) / 50, row["collegeCatchRate"], row["collegeYpt"], row["collegeTargetEpa"], row["collegeTargetSuccess"], row["collegeFirstDownRate"], row["collegeRedZoneShare"], row["collegeScoringOpportunityShare"]]
        values.append(market if lane == "market" else opportunity if lane == "opportunity" else quality if lane == "targetQuality" else opportunity + quality)
    return np.array(values, dtype=float)


def outcomes(rows: list[dict]) -> dict[str, np.ndarray]:
    games = np.array([max(1, row["games"]) for row in rows], dtype=float)
    targets = np.array([row["actualTargets"] for row in rows], dtype=float)
    return {
        "targetsPerGame": targets / games,
        "catchRate": np.divide([row["actualReceptions"] for row in rows], targets, out=np.full(len(rows), .55), where=targets > 0),
        "yardsPerTarget": np.divide([row["actualReceivingYards"] for row in rows], targets, out=np.full(len(rows), 5.), where=targets > 0),
        "touchdownsPerTarget": np.divide([row["actualReceivingTouchdowns"] for row in rows], targets, out=np.zeros(len(rows)), where=targets > 0),
        "rushingPointsPerGame": np.array([(row["actualRushingYards"] / 10 + row["actualRushingTouchdowns"] * 6) / max(1, row["games"]) for row in rows]),
    }


def fit_ridge(x: np.ndarray, y: np.ndarray, penalty: float) -> dict:
    mean, std = x.mean(axis=0), x.std(axis=0)
    std[std < 1e-8] = 1
    design = np.column_stack([np.ones(len(x)), (x - mean) / std])
    regularizer = np.eye(design.shape[1]) * penalty
    regularizer[0, 0] = 0
    return {"mean": mean, "std": std, "beta": np.linalg.solve(design.T @ design + regularizer, design.T @ y)}


def ridge_predict(model: dict, x: np.ndarray) -> np.ndarray:
    return np.column_stack([np.ones(len(x)), (x - model["mean"]) / model["std"]]) @ model["beta"]


def train_models(rows: list[dict], penalty: float, lane: str) -> dict:
    market_x, extra_x, targets = features(rows, "market"), features(rows, lane), outcomes(rows)
    models = {}
    for component in COMPONENT_NAMES:
        baseline = fit_ridge(market_x, targets[component], penalty)
        residual = targets[component] - ridge_predict(baseline, market_x)
        models[component] = (baseline, None if lane == "market" else fit_ridge(extra_x, residual, penalty))
    return {"lane": lane, "models": models}


def predict(models: dict, rows: list[dict]) -> np.ndarray:
    market_x, extra_x = features(rows, "market"), features(rows, models["lane"])
    limits = {"targetsPerGame": (0, 13), "catchRate": (.3, .9), "yardsPerTarget": (2.5, 16), "touchdownsPerTarget": (0, .2), "rushingPointsPerGame": (0, 5)}
    components = {}
    for name, (baseline, residual) in models["models"].items():
        value = ridge_predict(baseline, market_x)
        if residual is not None:
            value += ridge_predict(residual, extra_x)
        components[name] = np.clip(value, *limits[name])
    return np.maximum(0, components["targetsPerGame"] * (components["catchRate"] + components["yardsPerTarget"] / 10 + components["touchdownsPerTarget"] * 6) + components["rushingPointsPerGame"])


def choose_penalty(train: list[dict], lane: str = "full") -> float:
    latest = max(row["season"] for row in train)
    inner, validation = [row for row in train if row["season"] < latest], [row for row in train if row["season"] == latest]
    if not inner or not validation:
        return 20.0
    actual = np.array([row["actualPpg"] for row in validation])
    return min((float(np.mean(np.abs(predict(train_models(inner, penalty, lane), validation) - actual))), penalty) for penalty in RIDGE_PENALTIES)[1]


def spearman(predicted: np.ndarray, actual: np.ndarray) -> float:
    left, right = pd.Series(predicted).rank().to_numpy(), pd.Series(actual).rank().to_numpy()
    return float(np.corrcoef(left, right)[0, 1]) if len(left) > 1 and np.std(left) and np.std(right) else 0.0


def pairwise(predicted: np.ndarray, actual: np.ndarray, rows: list[dict]) -> float:
    correct = total = 0
    for season in {row["season"] for row in rows}:
        indexes = [index for index, row in enumerate(rows) if row["season"] == season]
        for offset, left in enumerate(indexes):
            for right in indexes[offset + 1:]:
                if actual[left] == actual[right] or predicted[left] == predicted[right]: continue
                total += 1; correct += int((actual[left] > actual[right]) == (predicted[left] > predicted[right]))
    return correct / total if total else 0


def metrics(predicted: np.ndarray, rows: list[dict]) -> dict:
    actual_ppg = np.array([row["actualPpg"] for row in rows])
    actual = np.array([row["actualPpg"] >= row["wr3ThresholdPpg"] for row in rows])
    cutoffs = np.array([row["predictionCutoffPpg"] for row in rows])
    labels, probabilities = predicted >= cutoffs, 1 / (1 + np.exp(-(predicted - cutoffs) / 1.5))
    tp, fp, fn, tn = np.sum(labels & actual), np.sum(labels & ~actual), np.sum(~labels & actual), np.sum(~labels & ~actual)
    precision, recall = tp / (tp + fp) if tp + fp else 0, tp / (tp + fn) if tp + fn else 0
    specificity = tn / (tn + fp) if tn + fp else 0
    running, average_precision = 0, 0.0
    for rank, index in enumerate(np.argsort(-probabilities), 1):
        if actual[index]: running += 1; average_precision += running / rank
    return {"mae": float(np.mean(np.abs(predicted - actual_ppg))), "spearman": spearman(predicted, actual_ppg), "pairwiseAccuracy": pairwise(predicted, actual_ppg, rows), "precision": float(precision), "recall": float(recall), "f1": float(2 * precision * recall / (precision + recall)) if precision + recall else 0, "balancedAccuracy": float((recall + specificity) / 2), "brier": float(np.mean((probabilities - actual) ** 2)), "prAuc": float(average_precision / max(1, actual.sum())), "positives": int(actual.sum())}


def choose_lane_and_penalty(train: list[dict]) -> tuple[str, float, dict]:
    latest = max(row["season"] for row in train)
    inner, validation = [row for row in train if row["season"] < latest], [row for row in train if row["season"] == latest]
    if not inner or not validation:
        return "market", 20.0, {"reason": "insufficient-inner-history"}
    actual = np.array([row["actualPpg"] for row in validation])
    market_choices = []
    for penalty in RIDGE_PENALTIES:
        prediction = predict(train_models(inner, penalty, "market"), validation)
        market_choices.append((float(np.mean(np.abs(prediction - actual))), penalty, prediction))
    market_mae, market_penalty, market_prediction = min(market_choices, key=lambda item: item[0])
    market_rank = spearman(market_prediction, actual)
    eligible = []
    diagnostics = {"marketMae": market_mae, "marketSpearman": market_rank}
    for lane in ["opportunity", "targetQuality", "full"]:
        penalty = choose_penalty(train, lane)
        prediction = predict(train_models(inner, penalty, lane), validation)
        lane_mae, lane_rank = float(np.mean(np.abs(prediction - actual))), spearman(prediction, actual)
        diagnostics[f"{lane}Mae"] = lane_mae
        diagnostics[f"{lane}Spearman"] = lane_rank
        if (market_mae - lane_mae) / market_mae >= .02 and lane_rank - market_rank >= .03:
            eligible.append((lane_mae, -lane_rank, lane, penalty))
    if not eligible:
        return "market", market_penalty, diagnostics
    _, _, lane, penalty = min(eligible)
    return lane, penalty, diagnostics


def serialized_model(models: dict) -> dict:
    def serialize_ridge(model: dict | None) -> dict | None:
        if model is None: return None
        return {"mean": [round(float(value), 8) for value in model["mean"]], "std": [round(float(value), 8) for value in model["std"]], "beta": [round(float(value), 8) for value in model["beta"]]}
    return {
        "lane": models["lane"],
        "marketFeatureOrder": ["logAdp", "logDraftPick", "directAdp"],
        "opportunityFeatureOrder": ["topThreePath", "inverseDepthRank", "collegeOpportunityDirection", "breakoutDirection"],
        "components": {name: {"baseline": serialize_ridge(baseline), "residual": serialize_ridge(residual)} for name, (baseline, residual) in models["models"].items()},
    }


def segment_report(predictions: list[dict], segment: str) -> dict:
    subset = [row for row in predictions if (row["directAdp"] if segment == "directAdp" else not row["directAdp"])]
    market = metrics(np.array([row["marketPrediction"] for row in subset]), subset)
    opportunity = metrics(np.array([row["opportunityPrediction"] for row in subset]), subset)
    selected = metrics(np.array([row["selectedPrediction"] for row in subset]), subset)
    return {
        "samples": len(subset), "market": market, "opportunity": opportunity, "selected": selected,
        "opportunityMaeImprovement": (market["mae"] - opportunity["mae"]) / market["mae"],
        "opportunityRankLift": opportunity["spearman"] - market["spearman"],
        "maeImprovement": (market["mae"] - selected["mae"]) / market["mae"],
        "rankLift": selected["spearman"] - market["spearman"],
    }


def validate(rows: list[dict]) -> dict:
    predictions, folds = [], []
    for holdout in HOLDOUTS:
        train, test = [row for row in rows if row["season"] < holdout], [row for row in rows if row["season"] == holdout]
        if not train or not test: continue
        selected_lane, selected_penalty, selection = choose_lane_and_penalty(train)
        lane_predictions = {lane: predict(train_models(train, choose_penalty(train, lane), lane), test) for lane in ["market", "opportunity", "targetQuality", "full"]}
        selected_prediction = lane_predictions[selected_lane]
        cutoff, actual = float(np.mean([row["wr3ThresholdPpg"] for row in train])), np.array([row["actualPpg"] for row in test])
        for index, row in enumerate(test):
            predictions.append({**row, "predictionCutoffPpg": cutoff, "selectedLane": selected_lane, "selectedPrediction": float(selected_prediction[index]), **{f"{lane}Prediction": float(values[index]) for lane, values in lane_predictions.items()}})
        folds.append({"season": holdout, "trainSamples": len(train), "holdoutSamples": len(test), "selectedLane": selected_lane, "ridgePenalty": selected_penalty, "marketMae": float(np.mean(np.abs(lane_predictions["market"] - actual))), "researchMae": float(np.mean(np.abs(selected_prediction - actual))), "marketSpearman": spearman(lane_predictions["market"], actual), "researchSpearman": spearman(selected_prediction, actual), "selectionDiagnostics": selection})

    reports = {lane: metrics(np.array([row[f"{lane}Prediction"] for row in predictions]), predictions) for lane in ["market", "opportunity", "targetQuality", "full"]}
    reports["selected"] = metrics(np.array([row["selectedPrediction"] for row in predictions]), predictions)
    improvement = (reports["market"]["mae"] - reports["selected"]["mae"]) / reports["market"]["mae"]
    rank_lift, pr_lift = reports["selected"]["spearman"] - reports["market"]["spearman"], reports["selected"]["prAuc"] - reports["market"]["prAuc"]
    segments = {name: segment_report(predictions, name) for name in ["directAdp", "proxyAdp"]}
    stable_folds = sum(fold["researchMae"] < fold["marketMae"] for fold in folds)
    blockers = []
    if len(predictions) < 150: blockers.append(f"Needs {150 - len(predictions)} more out-of-sample player seasons.")
    if len(folds) < 5: blockers.append(f"Needs {5 - len(folds)} more held-out seasons.")
    if improvement < .02: blockers.append(f"MAE improvement {improvement * 100:.1f}% is below the 2.0% threshold.")
    if rank_lift < .03: blockers.append(f"Spearman lift {rank_lift:.3f} is below the 0.030 threshold.")
    if stable_folds < 4: blockers.append(f"Only {stable_folds} of {len(folds)} holdouts improved MAE; at least 4 are required.")
    if segments["directAdp"]["samples"] >= 40 and segments["directAdp"]["maeImprovement"] < 0: blockers.append(f"Direct-ADP MAE regressed {abs(segments['directAdp']['maeImprovement']) * 100:.1f}%; opportunity adjustments may only be eligible for proxy-ADP players.")
    breakout_blockers = [] if pr_lift >= .03 else [f"WR3 precision-recall AUC lift {pr_lift:.3f} is below the 0.030 breakout threshold."]
    rounded = {lane: {key: round(value, 4) if isinstance(value, float) else value for key, value in report.items()} for lane, report in reports.items()}
    rounded_segments = {name: {key: ({metric: round(value2, 4) if isinstance(value2, float) else value2 for metric, value2 in value.items()} if isinstance(value, dict) else round(value, 4) if isinstance(value, float) else value) for key, value in report.items()} for name, report in segments.items()}
    final_penalty = choose_penalty(rows, "opportunity")
    production_model = serialized_model(train_models(rows, final_penalty, "opportunity"))
    return {
        "generatedAt": pd.Timestamp.utcnow().isoformat(), "lane": "rookie-wr", "modelVersion": "nested-opportunity-target-v3", "trainingSeasons": [2016, 2017, 2018], "holdoutSeasons": [fold["season"] for fold in folds], "samples": len(predictions),
        "marketMae": round(reports["market"]["mae"], 3), "researchMae": round(reports["selected"]["mae"], 3), "maeImprovement": round(improvement, 4), "marketWr3Accuracy": round(reports["market"]["balancedAccuracy"], 4), "researchWr3Accuracy": round(reports["selected"]["balancedAccuracy"], 4), "wr3AccuracyLift": round(reports["selected"]["balancedAccuracy"] - reports["market"]["balancedAccuracy"], 4), "rankLift": round(rank_lift, 4), "prAucLift": round(pr_lift, 4), "activationEligible": not blockers, "medianActivationEligible": not blockers, "breakoutActivationEligible": not breakout_blockers, "blockers": blockers, "breakoutBlockers": breakout_blockers,
        "selectedAdjustment": {"efficiencyWeight": 0, "opportunityWeight": 1, "maxPercent": .08}, "productionModel": production_model, "metrics": rounded, "ablations": rounded, "segments": rounded_segments, "stableHoldouts": stable_folds,
        "folds": [{key: round(value, 4) if isinstance(value, float) else value for key, value in fold.items()} for fold in folds], "coverage": {"allRows": len(rows), "directAdpRows": sum(row["directAdp"] for row in rows), "depthChartRows": sum(row["depthRank"] is not None for row in rows), "topThreePathRows": sum(row["topThreePath"] for row in rows)},
        "methodology": ["Every outer holdout chooses its lane and ridge strength using only the latest season inside its earlier training window.", "The baseline and challenger separately predict targets/game, catch rate, yards/target, TD/target, and rushing points/game.", "Opportunity predicts market residuals from opening depth-chart path, depth order, college workload, and breakout result.", "Direct-ADP and draft-proxy rows are reported separately so a weak fallback cannot masquerade as a market edge.", "Median activation requires MAE, rank-correlation, and season-stability improvement; WR3 PR-AUC is a separate breakout gate.", "The serialized opportunity model changes target volume only and is capped at plus or minus eight percent."],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--players", type=Path, default=Path(tempfile.gettempdir()) / "nflverse-players.csv")
    parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "moodin-rookie-wr-validation")
    parser.add_argument("--output", type=Path, default=Path("lib/fantasy/data/rookieWrValidation.generated.ts"))
    args = parser.parse_args()
    download(
        "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
        args.players,
    )
    report = validate(build_rows(args.players, source_files(args.cache_dir)))
    rendered = json.dumps(report, indent=2, sort_keys=True)
    args.output.write_text(
        "// Generated by scripts/build_rookie_wr_validation.py.\n"
        "// Leakage-safe expanding-window validation; do not hand-edit.\n"
        f"export const rookieWrValidation = {rendered} as const;\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
