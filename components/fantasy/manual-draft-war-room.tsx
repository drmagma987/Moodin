"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildWrapSimulationSnapshot,
  buildBoardOutlierSnapshots,
  buildConditionalDraftPathBoard,
  buildDraftDecisionSnapshot,
  buildPickWindowSnapshot,
  buildPositionRunSnapshots,
  buildReachToleranceSnapshot,
  buildRedraftBoard,
  buildTierWipeScenarioSnapshots,
  buildTierPivotSnapshots,
  buildPositionMarketSnapshots,
  buildUndervaluedPlaySnapshots,
  rankDraftCandidates,
} from "@/lib/fantasy/draft";
import { buildDraftPlanSnapshot } from "@/lib/fantasy/draftPlan";
import {
  applyDraftPick,
  getSnakePickInfo,
  undoLastDraftPick,
} from "@/lib/fantasy/draftState";
import type { DraftCandidate, DraftState } from "@/lib/fantasy/types";
import {
  createPersonalTargetTag,
  parsePersonalTargetTags,
  resolvePersonalTargetTags,
  serializePersonalTargetTags,
  type PersonalTargetTag,
} from "@/lib/fantasy/personalTargets";
import { scoreProjectionSnapshot } from "@/lib/fantasy/scoring";
import {
  applyYahooDraftEvents,
  parseYahooDraftEvents,
  type YahooDraftImportResult,
  yahooDraftFixtureEvents,
} from "@/lib/fantasy/yahooDraft";
import {
  buildYahooExtensionPreview,
  compareYahooExtensionEnvelopes,
  extractYahooDraftEventsFromEnvelope,
  isYahooExtensionEnvelope,
  yahooExtensionFixtureEnvelope,
} from "@/lib/fantasy/yahooBridge";

type ManualDraftWarRoomProps = {
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
};

type YahooBridgeHistoryEntry = {
  id: string;
  savedAt: string;
  envelope: NonNullable<ReturnType<typeof parseEnvelopeForStorage>>;
  preview: ReturnType<typeof buildYahooExtensionPreview>;
  extractedEventCount: number;
  comparisonToPrevious: ReturnType<typeof compareYahooExtensionEnvelopes> | null;
};

const YAHOO_BRIDGE_HISTORY_STORAGE_KEY = "fantasy-yahoo-bridge-history-v1";
const YAHOO_BRIDGE_TEXT_STORAGE_KEY = "fantasy-yahoo-bridge-text-v1";
const PERSONAL_TARGET_STORAGE_PREFIX = "fantasy-personal-targets-v1";

function buildYahooBridgeHistoryId(envelope: NonNullable<ReturnType<typeof parseEnvelopeForStorage>>) {
  return [
    envelope.page.url,
    envelope.emittedAt,
    envelope.payload.kind,
    extractYahooDraftEventsFromEnvelope(envelope).length,
  ].join("|");
}

function parseEnvelopeForStorage(value: unknown) {
  return isYahooExtensionEnvelope(value) ? value : null;
}

function readStoredYahooBridgeText() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(YAHOO_BRIDGE_TEXT_STORAGE_KEY) ?? "";
}

function readStoredYahooBridgeHistory(): YahooBridgeHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedHistory = window.localStorage.getItem(YAHOO_BRIDGE_HISTORY_STORAGE_KEY);
    if (!savedHistory) {
      return [];
    }

    const parsed = JSON.parse(savedHistory) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const envelope = parseEnvelopeForStorage(record.envelope);
        if (!envelope) {
          return null;
        }

        const preview = buildYahooExtensionPreview(envelope);
        const extractedEventCount = extractYahooDraftEventsFromEnvelope(envelope).length;
        const comparisonSource = parseEnvelopeForStorage(record.comparisonSourceEnvelope);

        return {
          id:
            typeof record.id === "string"
              ? record.id
              : buildYahooBridgeHistoryId(envelope),
          savedAt:
            typeof record.savedAt === "string"
              ? record.savedAt
              : envelope.emittedAt,
          envelope,
          preview,
          extractedEventCount,
          comparisonToPrevious: comparisonSource
            ? compareYahooExtensionEnvelopes(comparisonSource, envelope)
            : null,
        } satisfies YahooBridgeHistoryEntry;
      })
      .filter((entry): entry is YahooBridgeHistoryEntry => entry !== null);
  } catch {
    return [];
  }
}

export function ManualDraftWarRoom({
  candidates,
  initialDraftState,
}: ManualDraftWarRoomProps) {
  const [draftState, setDraftState] = useState(initialDraftState);
  const [query, setQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [yahooImportText, setYahooImportText] = useState("");
  const [yahooImportMessages, setYahooImportMessages] = useState<string[]>([]);
  const [yahooImportReceipt, setYahooImportReceipt] = useState<YahooDraftImportResult | null>(null);
  const [yahooBridgeText, setYahooBridgeText] = useState(readStoredYahooBridgeText);
  const [yahooBridgeMessages, setYahooBridgeMessages] = useState<string[]>([]);
  const [yahooBridgePreview, setYahooBridgePreview] = useState<ReturnType<
    typeof buildYahooExtensionPreview
  > | null>(null);
  const [yahooBridgeHistory, setYahooBridgeHistory] = useState<YahooBridgeHistoryEntry[]>(
    readStoredYahooBridgeHistory,
  );
  const seededPersonalTargets = useMemo(
    () =>
      candidates
        .filter((candidate) =>
          ["approved", "both"].includes(candidate.signals?.preferredTarget?.source ?? ""),
        )
        .map((candidate) => createPersonalTargetTag(candidate, new Date(0).toISOString())),
    [candidates],
  );
  const personalTargetStorageKey = `${PERSONAL_TARGET_STORAGE_PREFIX}:${initialDraftState.league.id}`;
  const [personalTargets, setPersonalTargets] = useState<PersonalTargetTag[]>(() => {
    if (typeof window === "undefined") return seededPersonalTargets;
    const saved = window.localStorage.getItem(personalTargetStorageKey);
    if (!saved) return seededPersonalTargets;
    const parsed = parsePersonalTargetTags(saved);
    return resolvePersonalTargetTags(parsed.targets, candidates).matched;
  });
  const [targetQuery, setTargetQuery] = useState("");
  const [targetBackupText, setTargetBackupText] = useState("");
  const [targetMessages, setTargetMessages] = useState<string[]>([]);

  useEffect(() => {
    window.localStorage.setItem(
      personalTargetStorageKey,
      serializePersonalTargetTags(personalTargets, draftState.league.id),
    );
  }, [draftState.league.id, personalTargetStorageKey, personalTargets]);

  useEffect(() => {
    window.localStorage.setItem(YAHOO_BRIDGE_TEXT_STORAGE_KEY, yahooBridgeText);
  }, [yahooBridgeText]);

  useEffect(() => {
    const serialized = yahooBridgeHistory.map((entry, index) => ({
      id: entry.id,
      savedAt: entry.savedAt,
      envelope: entry.envelope,
      comparisonSourceEnvelope: yahooBridgeHistory[index + 1]?.envelope ?? null,
    }));

    window.localStorage.setItem(
      YAHOO_BRIDGE_HISTORY_STORAGE_KEY,
      JSON.stringify(serialized),
    );
  }, [yahooBridgeHistory]);

  const pickInfo = getSnakePickInfo(draftState.currentPick, draftState.league.teams);
  const teamOnClock = selectedTeamId || pickInfo.teamId;
  const baseBoard = useMemo(
    () => buildRedraftBoard(candidates, draftState.league),
    [candidates, draftState.league],
  );

  const wrapSimulation = useMemo(
    () => buildWrapSimulationSnapshot(draftState, candidates),
    [draftState, candidates],
  );
  const conditionalPaths = useMemo(
    () => buildConditionalDraftPathBoard(draftState, candidates, wrapSimulation, {
      simulations: 60,
      candidateLimit: 6,
      horizonPicks: 3,
    }),
    [draftState, candidates, wrapSimulation],
  );
  const recommendations = rankDraftCandidates(draftState, candidates, wrapSimulation, {
    baseBoard,
  }).slice(0, 3);
  const undervaluedPlays = buildUndervaluedPlaySnapshots(draftState, candidates, wrapSimulation);
  const decisionSnapshot = buildDraftDecisionSnapshot(draftState, candidates, wrapSimulation);
  const draftPlan = buildDraftPlanSnapshot(draftState, candidates, wrapSimulation);
  const boardOutliers = buildBoardOutlierSnapshots(draftState, candidates);
  const positionSnapshots = buildPositionMarketSnapshots(draftState, candidates, wrapSimulation).slice(0, 5);
  const positionRunSnapshots = buildPositionRunSnapshots(draftState, candidates, wrapSimulation).slice(0, 4);
  const tierWipeScenarios = buildTierWipeScenarioSnapshots(draftState, candidates, wrapSimulation);
  const pivotPlans = buildTierPivotSnapshots(draftState, candidates, wrapSimulation);
  const structuralWindow = buildPickWindowSnapshot(
    decisionSnapshot.structuralBest,
    draftState,
    candidates,
    wrapSimulation,
  );
  const valueWindow = buildPickWindowSnapshot(
    decisionSnapshot.valueBest,
    draftState,
    candidates,
    wrapSimulation,
  );
  const structuralReach = buildReachToleranceSnapshot(
    decisionSnapshot.structuralBest,
    draftState,
    candidates,
  );
  const valueReach = buildReachToleranceSnapshot(
    decisionSnapshot.valueBest,
    draftState,
    candidates,
  );
  const structuralBestCandidate = candidates.find(
    (candidate) => candidate.player.id === decisionSnapshot.structuralBest?.playerId,
  );
  const valueBestCandidate = candidates.find(
    (candidate) => candidate.player.id === decisionSnapshot.valueBest?.playerId,
  );
  const outlierCards = boardOutliers
    .map((outlier) => ({
      outlier,
      candidate: candidates.find((candidate) => candidate.player.id === outlier.playerId) ?? null,
    }))
    .filter(
      (
        item,
      ): item is {
        outlier: (typeof boardOutliers)[number];
        candidate: DraftCandidate;
      } => item.candidate !== null,
    );
  const pivotCards = pivotPlans.map((plan) => ({
    plan,
    trigger: candidates.find((candidate) => candidate.player.id === plan.triggerPlayerId) ?? null,
    fallbacks: plan.fallbackPlayerIds
      .map((playerId) => candidates.find((candidate) => candidate.player.id === playerId) ?? null)
      .filter((candidate): candidate is DraftCandidate => candidate !== null),
    alternative:
      candidates.find((candidate) => candidate.player.id === plan.alternativePlayerId) ?? null,
  }));
  const recommendationCards = recommendations
    .map((recommendation) => {
      const candidate = candidates.find((item) => item.player.id === recommendation.playerId);
      if (!candidate) {
        return null;
      }

      return {
        recommendation,
        candidate,
        scored: scoreProjectionSnapshot(candidate.projection, draftState.league.scoring),
      };
    })
    .filter((item) => item !== null);

  const filteredCandidates = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return candidates
      .filter((candidate) => draftState.availablePlayerIds.includes(candidate.player.id))
      .filter((candidate) => {
        if (!lowered) {
          return true;
        }
        return (
          candidate.player.fullName.toLowerCase().includes(lowered) ||
          candidate.player.team.toLowerCase().includes(lowered) ||
          candidate.player.positions.join("/").toLowerCase().includes(lowered)
        );
      })
      .sort((a, b) => a.market.ecr - b.market.ecr)
      .slice(0, 12);
  }, [candidates, draftState.availablePlayerIds, query]);

  const recentPicks = draftState.drafted.slice(0, 8).map((pick) => {
    const candidate = candidates.find((item) => item.player.id === pick.playerId);
    return {
      ...pick,
      label: candidate
        ? `${candidate.player.fullName} · ${candidate.player.positions.join("/")} · ${candidate.player.team}`
        : pick.playerId,
    };
  });
  const latestYahooBridgeComparison = yahooBridgeHistory[0]?.comparisonToPrevious ?? null;
  const personalTargetIds = new Set(personalTargets.map((target) => target.playerId));
  const personalTargetCards = personalTargets
    .map((target) => ({
      target,
      candidate: candidates.find((candidate) => candidate.player.id === target.playerId) ?? null,
    }))
    .sort((a, b) => (a.candidate?.market.ecr ?? 999) - (b.candidate?.market.ecr ?? 999));
  const targetSearchResults = candidates
    .filter((candidate) => draftState.availablePlayerIds.includes(candidate.player.id))
    .filter((candidate) => !personalTargetIds.has(candidate.player.id))
    .filter((candidate) => {
      const lowered = targetQuery.trim().toLowerCase();
      return lowered.length >= 2 && [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered));
    })
    .sort((a, b) => a.market.ecr - b.market.ecr)
    .slice(0, 6);

  function togglePersonalTarget(candidate: DraftCandidate) {
    setPersonalTargets((current) =>
      current.some((target) => target.playerId === candidate.player.id)
        ? current.filter((target) => target.playerId !== candidate.player.id)
        : [...current, createPersonalTargetTag(candidate)],
    );
    setTargetMessages([
      personalTargetIds.has(candidate.player.id)
        ? `${candidate.player.fullName} removed from your personal targets.`
        : `${candidate.player.fullName} saved as a personal target.`,
    ]);
  }

  async function handleCopyTargetBackup() {
    const backup = serializePersonalTargetTags(personalTargets, draftState.league.id);
    setTargetBackupText(backup);
    try {
      await navigator.clipboard.writeText(backup);
      setTargetMessages(["Target backup copied to the clipboard."]);
    } catch {
      setTargetMessages(["Backup JSON is ready below; copy it manually from this browser."]);
    }
  }

  function handleRestoreTargetBackup() {
    const parsed = parsePersonalTargetTags(targetBackupText);
    const resolved = resolvePersonalTargetTags(parsed.targets, candidates);
    if (resolved.matched.length === 0 && parsed.messages.length > 0) {
      setTargetMessages(parsed.messages);
      return;
    }
    setPersonalTargets(resolved.matched);
    setTargetMessages([
      `Restored ${resolved.matched.length} personal target${resolved.matched.length === 1 ? "" : "s"}.`,
      ...parsed.messages,
      ...(resolved.unmatched.length > 0
        ? [`${resolved.unmatched.length} target${resolved.unmatched.length === 1 ? "" : "s"} did not match the current player pool.`]
        : []),
    ]);
  }

  function handleRecordPick() {
    const candidate = candidates.find((item) => item.player.id === selectedPlayerId);
    if (!candidate) {
      return;
    }

    setDraftState((current) => applyDraftPick(current, candidate, teamOnClock));
    setSelectedPlayerId("");
    setQuery("");
    setSelectedTeamId("");
  }

  function applyYahooEvents(events: Parameters<typeof applyYahooDraftEvents>[2], sourceLabel: string) {
    const result = applyYahooDraftEvents(draftState, candidates, events);
    setDraftState(result.draftState);
    setYahooImportReceipt(result);
    setYahooImportMessages(
      result.messages.length > 0
        ? [sourceLabel, ...result.messages]
        : [sourceLabel, "No Yahoo events were applied."],
    );
    return result;
  }

  function handleYahooImport() {
    try {
      const events = parseYahooDraftEvents(yahooImportText);
      const result = applyYahooEvents(events, "Applied events from the manual Yahoo JSON importer.");
      if (result.appliedCount > 0) {
        setYahooImportText("");
      }
    } catch (error) {
      setYahooImportMessages([
        error instanceof Error
          ? `Could not parse Yahoo event JSON: ${error.message}`
          : "Could not parse Yahoo event JSON.",
      ]);
    }
  }

  function parseYahooBridgeEnvelope() {
    const parsed = JSON.parse(yahooBridgeText) as unknown;
    if (!isYahooExtensionEnvelope(parsed)) {
      throw new Error("JSON does not match the Yahoo extension envelope contract.");
    }

    return parsed;
  }

  function getYahooBridgeComparisonBaseline(
    envelope: NonNullable<ReturnType<typeof parseEnvelopeForStorage>>,
  ) {
    const nextId = buildYahooBridgeHistoryId(envelope);
    const [latest, secondLatest] = yahooBridgeHistory;

    if (!latest) {
      return null;
    }

    if (latest.id === nextId) {
      return secondLatest?.envelope ?? null;
    }

    return latest.envelope;
  }

  function getYahooBridgeIncrementalEvents(
    envelope: NonNullable<ReturnType<typeof parseEnvelopeForStorage>>,
  ) {
    const baseline = getYahooBridgeComparisonBaseline(envelope);
    if (!baseline) {
      return {
        comparison: null,
        incrementalEvents: extractYahooDraftEventsFromEnvelope(envelope),
      };
    }

    const comparison = compareYahooExtensionEnvelopes(baseline, envelope);
    return {
      comparison,
      incrementalEvents: comparison.incrementalEvents,
    };
  }

  function rememberYahooBridgeSnapshot(
    envelope: NonNullable<ReturnType<typeof parseEnvelopeForStorage>>,
    preview: ReturnType<typeof buildYahooExtensionPreview>,
  ) {
    const extractedEventCount = extractYahooDraftEventsFromEnvelope(envelope).length;
    const nextId = buildYahooBridgeHistoryId(envelope);

    setYahooBridgeHistory((current) => {
      if (current.some((entry) => entry.id === nextId)) {
        return current;
      }

      const previous = current[0]?.envelope ?? null;
      const nextEntry: YahooBridgeHistoryEntry = {
        id: nextId,
        savedAt: new Date().toISOString(),
        envelope,
        preview,
        extractedEventCount,
        comparisonToPrevious: previous ? compareYahooExtensionEnvelopes(previous, envelope) : null,
      };

      return [nextEntry, ...current].slice(0, 8);
    });
  }

  function handleYahooBridgePreview() {
    try {
      const envelope = parseYahooBridgeEnvelope();
      const preview = buildYahooExtensionPreview(envelope);
      const extractedEvents = extractYahooDraftEventsFromEnvelope(envelope);
      setYahooBridgePreview(preview);
      rememberYahooBridgeSnapshot(envelope, preview);
      setYahooBridgeMessages([
        `Previewed ${preview.payloadKind} envelope from ${preview.inspection.pageKind}.`,
        extractedEvents.length > 0
          ? `Extracted ${extractedEvents.length} normalized draft event${extractedEvents.length === 1 ? "" : "s"}.`
          : "No normalized draft events are present in this envelope yet.",
      ]);
    } catch (error) {
      setYahooBridgePreview(null);
      setYahooBridgeMessages([
        error instanceof Error
          ? `Could not preview Yahoo envelope: ${error.message}`
          : "Could not preview Yahoo envelope.",
      ]);
    }
  }

  function handleYahooBridgeStageEvents() {
    try {
      const envelope = parseYahooBridgeEnvelope();
      const preview = buildYahooExtensionPreview(envelope);
      const events = extractYahooDraftEventsFromEnvelope(envelope);
      setYahooBridgePreview(preview);
      rememberYahooBridgeSnapshot(envelope, preview);

      if (events.length === 0) {
        setYahooBridgeMessages([
          "Envelope parsed, but it does not contain any draft-sync events to stage.",
        ]);
        return;
      }

      setYahooImportText(JSON.stringify(events, null, 2));
      setYahooBridgeMessages([
        `Staged ${events.length} draft event${events.length === 1 ? "" : "s"} into the Yahoo event importer.`,
      ]);
    } catch (error) {
      setYahooBridgeMessages([
        error instanceof Error
          ? `Could not stage Yahoo envelope events: ${error.message}`
          : "Could not stage Yahoo envelope events.",
      ]);
    }
  }

  function handleYahooBridgeStageIncrementalEvents() {
    try {
      const envelope = parseYahooBridgeEnvelope();
      const preview = buildYahooExtensionPreview(envelope);
      const { comparison, incrementalEvents } = getYahooBridgeIncrementalEvents(envelope);
      setYahooBridgePreview(preview);
      rememberYahooBridgeSnapshot(envelope, preview);

      if (comparison?.staleLikely) {
        setYahooBridgeMessages([
          "This envelope looks stale compared with the newest saved snapshot, so no incremental picks were staged.",
        ]);
        return;
      }

      if (incrementalEvents.length === 0) {
        setYahooBridgeMessages([
          comparison
            ? "No incremental draft events were detected beyond the newest saved snapshot."
            : "No prior snapshot exists yet, so use the full stage/apply action first if you want to seed the board.",
        ]);
        return;
      }

      setYahooImportText(JSON.stringify(incrementalEvents, null, 2));
      setYahooBridgeMessages([
        `Staged ${incrementalEvents.length} incremental draft event${incrementalEvents.length === 1 ? "" : "s"} from the current envelope.`,
      ]);
    } catch (error) {
      setYahooBridgeMessages([
        error instanceof Error
          ? `Could not stage incremental Yahoo events: ${error.message}`
          : "Could not stage incremental Yahoo events.",
      ]);
    }
  }

  function handleYahooBridgeApply() {
    try {
      const envelope = parseYahooBridgeEnvelope();
      const preview = buildYahooExtensionPreview(envelope);
      const events = extractYahooDraftEventsFromEnvelope(envelope);
      setYahooBridgePreview(preview);
      rememberYahooBridgeSnapshot(envelope, preview);

      if (events.length === 0) {
        setYahooBridgeMessages([
          "Envelope parsed, but there are no draft-sync events to apply into the War Room.",
        ]);
        return;
      }

      const result = applyYahooEvents(
        events,
        "Applied events extracted directly from the Yahoo bridge envelope.",
      );
      setYahooBridgeMessages([
        `Applied ${result.appliedCount} bridge event${result.appliedCount === 1 ? "" : "s"} and skipped ${result.skippedCount}.`,
      ]);
    } catch (error) {
      setYahooBridgeMessages([
        error instanceof Error
          ? `Could not apply Yahoo bridge envelope: ${error.message}`
          : "Could not apply Yahoo bridge envelope.",
      ]);
    }
  }

  function handleYahooBridgeApplyIncremental() {
    try {
      const envelope = parseYahooBridgeEnvelope();
      const preview = buildYahooExtensionPreview(envelope);
      const { comparison, incrementalEvents } = getYahooBridgeIncrementalEvents(envelope);
      setYahooBridgePreview(preview);
      rememberYahooBridgeSnapshot(envelope, preview);

      if (comparison?.staleLikely) {
        setYahooBridgeMessages([
          "This envelope looks stale compared with the newest saved snapshot, so no incremental picks were applied.",
        ]);
        return;
      }

      if (incrementalEvents.length === 0) {
        setYahooBridgeMessages([
          comparison
            ? "No incremental draft events were detected beyond the newest saved snapshot."
            : "No prior snapshot exists yet, so use the full apply action first if you want to seed the board.",
        ]);
        return;
      }

      const result = applyYahooEvents(
        incrementalEvents,
        "Applied only the incremental picks detected beyond the newest saved Yahoo snapshot.",
      );
      setYahooBridgeMessages([
        `Applied ${result.appliedCount} incremental bridge event${result.appliedCount === 1 ? "" : "s"} and skipped ${result.skippedCount}.`,
      ]);
    } catch (error) {
      setYahooBridgeMessages([
        error instanceof Error
          ? `Could not apply incremental Yahoo events: ${error.message}`
          : "Could not apply incremental Yahoo events.",
      ]);
    }
  }

  function handleClearYahooBridgeHistory() {
    setYahooBridgeHistory([]);
    window.localStorage.removeItem(YAHOO_BRIDGE_HISTORY_STORAGE_KEY);
  }

  function handleLoadYahooBridgeSnapshot(entry: YahooBridgeHistoryEntry) {
    setYahooBridgeText(JSON.stringify(entry.envelope, null, 2));
    setYahooBridgePreview(entry.preview);
    setYahooBridgeMessages([
      `Loaded saved ${entry.preview.payloadKind} snapshot from ${entry.preview.inspection.pageKind}.`,
    ]);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Manual Draft State
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Pick {draftState.currentPick} · {pickInfo.teamId} on the clock
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={draftState.drafted.length === 0}
              onClick={() => setDraftState((current) => undoLastDraftPick(current, candidates))}
            >
              Undo Last Pick
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#081321] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                Your Slot
              </p>
              <p className="mt-1 font-black">{draftState.myTeamId}</p>
            </div>
            <div className="rounded-2xl bg-[#081321] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                Round
              </p>
              <p className="mt-1 font-black">{pickInfo.round}</p>
            </div>
            <div className="rounded-2xl bg-[#081321] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                Picks Until You
              </p>
              <p className="mt-1 font-black">{draftState.picksUntilNextTurn}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player name, team, or position"
            />
            <Select
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
            >
              <option value="">Choose player for this pick</option>
              {filteredCandidates.map((candidate) => (
                <option key={candidate.player.id} value={candidate.player.id}>
                  {candidate.player.fullName} · {candidate.player.positions.join("/")} · {candidate.player.team} · ECR {candidate.market.ecr}
                </option>
              ))}
            </Select>
            <Select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
              <option value="">Use team currently on the clock ({pickInfo.teamId})</option>
              {draftState.teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.teamId}
                </option>
              ))}
            </Select>
            <Button
              className="w-full"
              size="lg"
              disabled={!selectedPlayerId}
              onClick={handleRecordPick}
            >
              Record Pick
            </Button>
          </div>

          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9db8e2]">
              Recent Picks
            </p>
            <div className="mt-3 space-y-2">
              {recentPicks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                  No picks recorded yet. Start with the team on the clock and the player search above.
                </p>
              ) : (
                recentPicks.map((pick) => (
                  <div key={`${pick.overallPick}-${pick.playerId}`} className="rounded-2xl bg-[#081321] p-3 text-sm text-[#dce4f1]">
                    Pick {pick.overallPick} · {pick.teamId} · {pick.label}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Yahoo Bridge Console
              </p>
              <h2 className="mt-2 text-2xl font-black">Preview full extension envelopes locally</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setYahooBridgeText(JSON.stringify(yahooExtensionFixtureEnvelope, null, 2));
                  setYahooBridgePreview(buildYahooExtensionPreview(yahooExtensionFixtureEnvelope));
                  setYahooBridgeMessages([
                    "Loaded a sample Yahoo browser-extension envelope for local bridge testing.",
                  ]);
                }}
              >
                Load Envelope Sample
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={yahooBridgeHistory.length === 0}
                onClick={handleClearYahooBridgeHistory}
              >
                Clear History
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Textarea
              value={yahooBridgeText}
              onChange={(event) => setYahooBridgeText(event.target.value)}
              placeholder='Paste a full Yahoo browser-extension envelope like {"version":1,"provider":"yahoo-browser-extension","page":{...},"payload":{...}}'
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                variant="outline"
                disabled={!yahooBridgeText.trim()}
                onClick={handleYahooBridgePreview}
              >
                Preview Envelope
              </Button>
              <Button
                variant="outline"
                disabled={!yahooBridgeText.trim()}
                onClick={handleYahooBridgeStageEvents}
              >
                Stage Draft Events
              </Button>
              <Button
                disabled={!yahooBridgeText.trim()}
                onClick={handleYahooBridgeApply}
              >
                Apply Draft Events
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                disabled={!yahooBridgeText.trim()}
                onClick={handleYahooBridgeStageIncrementalEvents}
              >
                Stage Incremental Picks
              </Button>
              <Button
                variant="outline"
                disabled={!yahooBridgeText.trim()}
                onClick={handleYahooBridgeApplyIncremental}
              >
                Apply Incremental Picks
              </Button>
            </div>
          </div>

          {yahooBridgePreview ? (
            <div className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-[#081321] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Page Kind
                  </p>
                  <p className="mt-1 font-black">{yahooBridgePreview.inspection.pageKind}</p>
                </div>
                <div className="rounded-2xl bg-[#081321] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Stability
                  </p>
                  <p className="mt-1 font-black">{yahooBridgePreview.inspection.stability}</p>
                </div>
                <div className="rounded-2xl bg-[#081321] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    League
                  </p>
                  <p className="mt-1 font-black">{yahooBridgePreview.inspection.leagueId ?? "--"}</p>
                </div>
                <div className="rounded-2xl bg-[#081321] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Team Page
                  </p>
                  <p className="mt-1 font-black">
                    {yahooBridgePreview.inspection.teamPageId ?? "--"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-[#081321] p-4 text-sm text-[#dce4f1]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Payload Summary
                  </p>
                  <p className="mt-2">
                    Kind: <span className="font-black">{yahooBridgePreview.payloadKind}</span>
                  </p>
                  <p className="mt-1">
                    Current pick:{" "}
                    <span className="font-black">
                      {yahooBridgePreview.currentPickText ?? "--"}
                    </span>
                  </p>
                  <p className="mt-1">
                    Round:{" "}
                    <span className="font-black">{yahooBridgePreview.roundText ?? "--"}</span>
                  </p>
                  <p className="mt-1">
                    Team on clock:{" "}
                    <span className="font-black">
                      {yahooBridgePreview.teamOnClockText ?? "--"}
                    </span>
                  </p>
                  <p className="mt-1">
                    Draft events:{" "}
                    <span className="font-black">{yahooBridgePreview.recentPickCount}</span>
                  </p>
                </div>

                <div className="rounded-2xl bg-[#081321] p-4 text-sm text-[#dce4f1]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Bridge Next Step
                  </p>
                  <p className="mt-2 leading-6">{yahooBridgePreview.nextStep}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {yahooBridgePreview.inspection.supportedActions.length > 0 ? (
                      yahooBridgePreview.inspection.supportedActions.map((action) => (
                        <span
                          key={action}
                          className="rounded-full border border-[#d9b56d]/30 bg-[#d9b56d]/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]"
                        >
                          {action}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#bfcadb]">
                        read-only
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-[#081321] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    URL Notes
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-[#dce4f1]">
                    {yahooBridgePreview.inspection.notes.map((note) => (
                      <p key={note} className="rounded-2xl bg-white/[0.04] px-3 py-3">
                        {note}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#081321] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Recent Pick Text
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-[#dce4f1]">
                    {yahooBridgePreview.recentPickTexts.length > 0 ? (
                      yahooBridgePreview.recentPickTexts.map((line) => (
                        <p key={line} className="rounded-2xl bg-white/[0.04] px-3 py-3">
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-[#cbd4e4]">
                        No recent pick text was present in this envelope.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {latestYahooBridgeComparison ? (
                <div className="rounded-2xl bg-[#081321] p-4 text-sm text-[#dce4f1]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Latest Snapshot Comparison
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Emitted At
                      </p>
                      <p className="mt-1 font-black">{latestYahooBridgeComparison.emittedAtOrder}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Snapshot Health
                      </p>
                      <p className="mt-1 font-black">
                        {latestYahooBridgeComparison.staleLikely ? "stale-likely" : "usable"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        New Picks
                      </p>
                      <p className="mt-1 font-black">
                        {latestYahooBridgeComparison.incrementalEvents.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Duplicate Picks
                      </p>
                      <p className="mt-1 font-black">
                        {latestYahooBridgeComparison.duplicateEventCount}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Incremental Draft Events
                      </p>
                      <div className="mt-2 space-y-2">
                        {latestYahooBridgeComparison.incrementalEvents.length > 0 ? (
                          latestYahooBridgeComparison.incrementalEvents.map((event, index) => (
                            <p
                              key={`${event.playerName}-${event.overallPick ?? index}`}
                              className="rounded-2xl bg-black/20 px-3 py-3"
                            >
                              Pick {event.overallPick ?? "?"} · {event.playerName}
                              {event.team ? ` · ${event.team}` : ""}
                              {event.position ? ` · ${event.position}` : ""}
                            </p>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-[#cbd4e4]">
                            No incremental draft events were detected against the previous saved snapshot.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Comparison Notes
                      </p>
                      <div className="mt-2 space-y-2">
                        {latestYahooBridgeComparison.notes.length > 0 ? (
                          latestYahooBridgeComparison.notes.map((note) => (
                            <p key={note} className="rounded-2xl bg-black/20 px-3 py-3">
                              {note}
                            </p>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-[#cbd4e4]">
                            No warnings surfaced in the latest snapshot comparison.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {yahooBridgeHistory.length > 0 ? (
                <div className="rounded-2xl bg-[#081321] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Saved Snapshot History
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#bfcadb]">
                      {yahooBridgeHistory.length} stored locally
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {yahooBridgeHistory.map((entry, index) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-white/8 bg-white/[0.04] p-3 text-sm text-[#dce4f1]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black">
                              {entry.preview.inspection.pageKind} · {entry.preview.payloadKind}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#bfcadb]">
                              emitted {entry.envelope.emittedAt}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoadYahooBridgeSnapshot(entry)}
                          >
                            Load
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.18em]">
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[#bfcadb]">
                            {entry.extractedEventCount} picks
                          </span>
                          {index === 0 ? (
                            <span className="rounded-full border border-[#d9b56d]/30 bg-[#d9b56d]/10 px-2 py-1 text-[#f8ddb3]">
                              latest
                            </span>
                          ) : null}
                          {entry.comparisonToPrevious ? (
                            <>
                              <span className="rounded-full border border-white/10 px-2 py-1 text-[#bfcadb]">
                                {entry.comparisonToPrevious.emittedAtOrder}
                              </span>
                              <span
                                className={`rounded-full px-2 py-1 ${
                                  entry.comparisonToPrevious.staleLikely
                                    ? "border border-[#d98b6d]/30 bg-[#d98b6d]/10 text-[#ffd8ca]"
                                    : "border border-[#8fd0b3]/30 bg-[#8fd0b3]/10 text-[#c8ffe2]"
                                }`}
                              >
                                {entry.comparisonToPrevious.staleLikely ? "stale-likely" : "usable"}
                              </span>
                              <span className="rounded-full border border-white/10 px-2 py-1 text-[#bfcadb]">
                                +{entry.comparisonToPrevious.incrementalEvents.length} new
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full border border-white/10 px-2 py-1 text-[#bfcadb]">
                              baseline snapshot
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {yahooBridgeMessages.map((message) => (
              <p
                key={message}
                className="rounded-2xl border border-white/8 bg-[#081321] px-3 py-3 text-sm text-[#dce4f1]"
              >
                {message}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Yahoo Event Import
              </p>
              <h2 className="mt-2 text-2xl font-black">Paste draft events from a browser extractor</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setYahooImportText(JSON.stringify(yahooDraftFixtureEvents, null, 2));
                setYahooImportMessages([
                  "Loaded sample Yahoo-style events so you can test the importer format.",
                ]);
              }}
            >
              Load Sample
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            <Textarea
              value={yahooImportText}
              onChange={(event) => setYahooImportText(event.target.value)}
              placeholder='Paste JSON like [{"overallPick":1,"teamId":"team-1","playerName":"Jahmyr Gibbs","yahooPlayerId":"40059"}]'
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!yahooImportText.trim()}
              onClick={handleYahooImport}
            >
              Apply Yahoo Events
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {yahooImportMessages.map((message) => (
              <p
                key={message}
                className="rounded-2xl border border-white/8 bg-[#081321] px-3 py-3 text-sm text-[#dce4f1]"
              >
                {message}
              </p>
            ))}
          </div>

          {yahooImportReceipt ? (
            <div className="mt-5 rounded-2xl bg-[#081321] p-4 text-sm text-[#dce4f1]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Latest Apply Receipt
                  </p>
                  <p className="mt-1 font-black">
                    {yahooImportReceipt.appliedCount} applied · {yahooImportReceipt.skippedCount} skipped
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#bfcadb]">
                  Pick {yahooImportReceipt.startingPick} to {yahooImportReceipt.endingPick}
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Accepted
                  </p>
                  <div className="mt-2 space-y-2">
                    {yahooImportReceipt.outcomes.filter((outcome) => outcome.status === "applied").length >
                    0 ? (
                      yahooImportReceipt.outcomes
                        .filter(
                          (
                            outcome,
                          ): outcome is Extract<
                            YahooDraftImportResult["outcomes"][number],
                            { status: "applied" }
                          > => outcome.status === "applied",
                        )
                        .map((outcome) => (
                          <p
                            key={`applied-${outcome.boardPickBefore}-${outcome.resolvedPlayerId}`}
                            className="rounded-2xl bg-black/20 px-3 py-3"
                          >
                            Pick {outcome.overallPick} · {outcome.teamId} · {outcome.resolvedPlayerLabel}
                          </p>
                        ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-[#cbd4e4]">
                        No picks were accepted in the latest apply.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                    Skipped
                  </p>
                  <div className="mt-2 space-y-2">
                    {yahooImportReceipt.outcomes.filter((outcome) => outcome.status === "skipped").length >
                    0 ? (
                      yahooImportReceipt.outcomes
                        .filter(
                          (
                            outcome,
                          ): outcome is Extract<
                            YahooDraftImportResult["outcomes"][number],
                            { status: "skipped" }
                          > => outcome.status === "skipped",
                        )
                        .map((outcome, index) => (
                          <p
                            key={`skipped-${outcome.playerName}-${outcome.boardPickBefore}-${index}`}
                            className="rounded-2xl bg-black/20 px-3 py-3"
                          >
                            Pick {outcome.overallPick ?? "?"} · {outcome.playerName} · {outcome.reason}
                          </p>
                        ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-[#cbd4e4]">
                        No picks were skipped in the latest apply.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-[26px] border border-[#d9b56d]/25 bg-[linear-gradient(145deg,rgba(37,29,14,0.82),rgba(8,19,33,0.96))] p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#d9b56d]">
                Target Board
              </p>
              <h2 className="mt-2 text-2xl font-black">Your guys, beside the model&apos;s values</h2>
            </div>
            <span className="rounded-full border border-[#8fd0b3]/35 bg-[#8fd0b3]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#c8ffe2]">
              Saved in this browser
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#dce4f1]">
            Personal targets are visible draft-day flags only. They do not change projections,
            rankings, or Monte Carlo outcomes. Model values update as the live board changes.
          </p>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#f4dcc0]/20 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#fff1d4]">
                    Personal Targets
                  </p>
                  <p className="mt-1 text-xs text-[#bfcadb]">Star anyone you intentionally want to leave with.</p>
                </div>
                <span className="text-xl font-black text-[#f8ddb3]">{personalTargets.length}</span>
              </div>

              <Input
                className="mt-3"
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder="Find a player to target"
              />
              {targetSearchResults.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {targetSearchResults.map((candidate) => (
                    <div
                      key={`target-search-${candidate.player.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-black">{candidate.player.fullName}</p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#88a4d3]">
                          {candidate.player.positions.join("/")} · {candidate.player.team} · ECR {candidate.market.ecr}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => togglePersonalTarget(candidate)}>
                        ☆ Target
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {personalTargetCards.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                    No personal targets yet. Search above or star a player elsewhere on the board.
                  </p>
                ) : (
                  personalTargetCards.map(({ target, candidate }) => (
                    <div
                      key={`personal-target-${target.playerId || target.playerName}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-3 py-3"
                    >
                      <div>
                        <p className="font-black text-[#fff1d4]">★ {candidate?.player.fullName ?? target.playerName}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#bfcadb]">
                          {candidate
                            ? `${candidate.player.positions.join("/")} · ${candidate.player.team} · ${draftState.availablePlayerIds.includes(candidate.player.id) ? "Available" : "Off board"}`
                            : "Not matched to current player pool"}
                        </p>
                      </div>
                      {candidate ? (
                        <Button size="sm" variant="outline" onClick={() => togglePersonalTarget(candidate)}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-[#8fd0b3]/20 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#8fd0b3]">
                    Best Model Values
                  </p>
                  <p className="mt-1 text-xs text-[#bfcadb]">Rank gaps with enough live roster value to matter.</p>
                </div>
                <span className="rounded-full bg-[#8fd0b3]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#c8ffe2]">
                  Live
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {undervaluedPlays.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                    No credible model discount is available at this point in the room.
                  </p>
                ) : (
                  undervaluedPlays.slice(0, 6).map((value) => {
                    const candidate = candidates.find((item) => item.player.id === value.playerId);
                    if (!candidate) return null;
                    const personallyTargeted = personalTargetIds.has(candidate.player.id);
                    return (
                      <div key={`model-value-${value.playerId}`} className="rounded-2xl bg-white/[0.05] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{candidate.player.fullName}</p>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#8fd0b3]">
                              {value.label} · +{value.boardEdge} slots
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => togglePersonalTarget(candidate)}>
                            {personallyTargeted ? "★ Saved" : "☆ Target"}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-[#dce4f1]">
                          Our board #{value.ourBoardRank} · Market #{value.marketRank}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.18em] text-[#bfcadb]">
              Backup or restore targets
            </summary>
            <p className="mt-3 text-xs leading-5 text-[#bfcadb]">
              Browser storage survives refreshes, but a JSON backup lets you move these tags to another port,
              browser profile, device, or deployed copy.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyTargetBackup}>
                Copy Backup JSON
              </Button>
              <Button size="sm" variant="outline" disabled={!targetBackupText.trim()} onClick={handleRestoreTargetBackup}>
                Restore JSON
              </Button>
            </div>
            <Textarea
              className="mt-3 min-h-32 font-mono text-xs"
              value={targetBackupText}
              onChange={(event) => setTargetBackupText(event.target.value)}
              placeholder="Paste a target backup here to restore it"
            />
          </details>

          {targetMessages.length > 0 ? (
            <div className="mt-3 space-y-1 text-xs text-[#cbd4e4]">
              {targetMessages.map((message, index) => (
                <p key={`target-message-${index}`}>{message}</p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Live Recommendations
              </p>
              <h2 className="mt-2 text-2xl font-black">Board updates after every pick</h2>
            </div>
            <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#f8ddb3]">
              {draftState.availablePlayerIds.length} players live
            </span>
          </div>

          <div className="mt-5 rounded-[22px] border border-[#8fd0b3]/20 bg-[#081321] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#8fd0b3]">
                  Draft Plan · Round {draftPlan.round}
                </p>
                <h2 className="mt-2 text-xl font-black">{draftPlan.headline}</h2>
              </div>
              <span className="rounded-full border border-[#8fd0b3]/35 bg-[#8fd0b3]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#c8ffe2]">
                {draftPlan.phase}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{draftPlan.objective}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#9db0ca]">
              {draftPlan.rosterRead}
            </p>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="space-y-2">
                {draftPlan.rules.map((rule) => (
                  <div key={rule.id} className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">{rule.label}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                          rule.status === "attack"
                            ? "bg-[#d9b56d]/15 text-[#f8ddb3]"
                            : rule.status === "satisfied"
                              ? "bg-[#8fd0b3]/12 text-[#c8ffe2]"
                              : "bg-white/[0.06] text-[#bfcadb]"
                        }`}
                      >
                        {rule.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[#cbd4e4]">{rule.summary}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Model-Backed Target Queue
                </p>
                <div className="mt-2 space-y-2">
                  {draftPlan.targets.map((target) => {
                    const candidate = candidates.find((item) => item.player.id === target.playerId);
                    return (
                      <div key={target.playerId} className="rounded-2xl bg-black/20 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{candidate?.player.fullName ?? target.playerId}</p>
                            <p className="mt-1 text-sm text-[#dce4f1]">{target.summary}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#f8ddb3]">
                            {target.timing}
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#88a4d3]">
                          {target.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#9db0ca]">{draftPlan.formatRead}</p>
          </div>

          {conditionalPaths.outcomes.length > 0 ? (
            <div className="mt-5 rounded-[22px] border border-[#d9b56d]/25 bg-[linear-gradient(145deg,rgba(37,29,14,0.9),rgba(8,19,33,0.96))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                    Conditional Multi-Pick Paths
                  </p>
                  <h2 className="mt-2 text-xl font-black">Which choice builds the best next turn</h2>
                </div>
                <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                  {conditionalPaths.evaluationMode === "exact-production" ? "Exact production" : "Quick preview"} · {conditionalPaths.simulations} paired rooms
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{conditionalPaths.summary}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#9db0ca]">
                Comparing picks {conditionalPaths.futurePicks.join(" → ")}
              </p>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {conditionalPaths.outcomes.slice(0, 6).map((outcome) => (
                  <article
                    key={`conditional-${outcome.initialPlayerId}`}
                    className={`rounded-2xl border p-3 ${
                      outcome.recommended
                        ? "border-[#d9b56d]/45 bg-[#d9b56d]/10"
                        : "border-white/8 bg-black/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#88a4d3]">
                          {outcome.initialPosition} · {outcome.recommended ? "Best path" : "Alternative"}
                        </p>
                        <p className="mt-1 text-lg font-black">{outcome.initialPlayerName}</p>
                      </div>
                      <p className="text-xl font-black text-[#f8ddb3]">
                        {Math.round(outcome.winRate * 100)}%
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-black/20 p-2">
                        <p className="uppercase tracking-[0.14em] text-[#9db0ca]">Floor</p>
                        <p className="mt-1 font-black">{outcome.floorLineupPoints}</p>
                      </div>
                      <div className="rounded-xl bg-black/20 p-2">
                        <p className="uppercase tracking-[0.14em] text-[#9db0ca]">Median</p>
                        <p className="mt-1 font-black">{outcome.medianLineupPoints}</p>
                      </div>
                      <div className="rounded-xl bg-black/20 p-2">
                        <p className="uppercase tracking-[0.14em] text-[#9db0ca]">Ceiling</p>
                        <p className="mt-1 font-black">{outcome.ceilingLineupPoints}</p>
                      </div>
                    </div>
                    {outcome.commonSequences[0] ? (
                      <p className="mt-3 text-sm leading-6 text-[#dce4f1]">
                        Common path ({Math.round(outcome.commonSequences[0].probability * 100)}%): {outcome.commonSequences[0].picks.map((pick) =>
                          `${pick.overallPick}: ${pick.playerName}`,
                        ).join(" → ")}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-[#bfcadb]">
                      Median edge versus the strongest alternative in the same rooms: {outcome.medianEdgeVsBestAlternative >= 0 ? "+" : ""}{outcome.medianEdgeVsBestAlternative}
                    </p>
                    <p className="mt-1 text-xs text-[#bfcadb]">
                      Median regret: {outcome.medianRegret} · downside regret: {outcome.downsideRegret}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-[22px] border border-white/8 bg-[#081321] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#9db8e2]">
                  Board Split
                </p>
                <h2 className="mt-2 text-xl font-black">{decisionSnapshot.headline}</h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${
                  decisionSnapshot.samePlayer
                    ? "border border-[#8fd0b3]/40 bg-[#8fd0b3]/10 text-[#c8ffe2]"
                    : "border border-[#d9b56d]/40 bg-[#d9b56d]/10 text-[#f8ddb3]"
                }`}
              >
                {decisionSnapshot.samePlayer ? "Aligned board" : "Tradeoff live"}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#dce4f1]">
              {decisionSnapshot.samePlayer && structuralBestCandidate
                ? `${structuralBestCandidate.player.fullName} is both the live pick recommendation and the best market-value target on the board right now.`
                : decisionSnapshot.samePlayer
                  ? decisionSnapshot.summary
                  : `${structuralBestCandidate?.player.fullName ?? "Your live pick"} is the best fit for the current board state, while ${valueBestCandidate?.player.fullName ?? "the best market-value target"} is the cheaper price-versus-our-board bet if you want to lean into discount.`}
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Live Pick Recommendation
                </p>
                <p className="mt-1 text-lg font-black">
                  {structuralBestCandidate?.player.fullName ?? "No player"}
                </p>
                <p className="mt-1 text-sm text-[#dce4f1]">
                  {decisionSnapshot.structuralBest?.explanation.structuralCase ??
                    "No structural recommendation yet."}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[#bfcadb]">
                  Live pick score{" "}
                  {decisionSnapshot.structuralBest?.explanation.structuralScore.toFixed(1) ?? "--"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#bfcadb]">
                  Our board #{decisionSnapshot.structuralBest?.explanation.ourBoardRank ?? "--"} · Market #
                  {decisionSnapshot.structuralBest?.explanation.marketRank ?? "--"}
                </p>
                {structuralWindow ? (
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Pick Window
                    </p>
                    <p className="mt-1 text-sm font-black text-[#f8ddb3]">
                      {structuralWindow.label} · {Math.round(structuralWindow.survivalProbability * 100)}% survive
                    </p>
                    <p className="mt-1 text-sm text-[#dce4f1]">{structuralWindow.summary}</p>
                  </div>
                ) : null}
                {structuralReach ? (
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Reach Guardrail
                    </p>
                    <p className="mt-1 text-sm font-black text-[#f8ddb3]">
                      {structuralReach.label} · {structuralReach.maxReachPicks} pick tolerance
                    </p>
                    <p className="mt-1 text-sm text-[#dce4f1]">{structuralReach.summary}</p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Best Market Value
                </p>
                <p className="mt-1 text-lg font-black">
                  {valueBestCandidate?.player.fullName ?? "No player"}
                </p>
                <p className="mt-1 text-sm text-[#dce4f1]">
                  {decisionSnapshot.valueBest?.explanation.valueCase ??
                    "No pure value recommendation yet."}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[#bfcadb]">
                  Market leverage{" "}
                  {decisionSnapshot.valueBest?.explanation.marketLeverageScore.toFixed(1) ?? "--"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#bfcadb]">
                  Our board #{decisionSnapshot.valueBest?.explanation.ourBoardRank ?? "--"} · Market #
                  {decisionSnapshot.valueBest?.explanation.marketRank ?? "--"} · Edge{" "}
                  {decisionSnapshot.valueBest
                    ? `${decisionSnapshot.valueBest.explanation.boardEdge >= 0 ? "+" : ""}${decisionSnapshot.valueBest.explanation.boardEdge}`
                    : "--"}
                </p>
                {valueWindow ? (
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Pick Window
                    </p>
                    <p className="mt-1 text-sm font-black text-[#f8ddb3]">
                      {valueWindow.label} · {Math.round(valueWindow.survivalProbability * 100)}% survive
                    </p>
                    <p className="mt-1 text-sm text-[#dce4f1]">{valueWindow.summary}</p>
                  </div>
                ) : null}
                {valueReach ? (
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Reach Guardrail
                    </p>
                    <p className="mt-1 text-sm font-black text-[#f8ddb3]">
                      {valueReach.label} · {valueReach.maxReachPicks} pick tolerance
                    </p>
                    <p className="mt-1 text-sm text-[#dce4f1]">{valueReach.summary}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {!decisionSnapshot.samePlayer && structuralWindow && valueWindow ? (
              <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm text-[#dce4f1]">
                <span className="font-black text-[#f8ddb3]">Window read:</span>{" "}
                {structuralWindow.urgency === "now" && valueWindow.urgency !== "now"
                  ? `${structuralBestCandidate?.player.fullName ?? "The structural play"} is the one most likely to disappear before your next turn, while the value side gives you more room to wait.`
                  : valueWindow.urgency === "now" && structuralWindow.urgency !== "now"
                    ? `${valueBestCandidate?.player.fullName ?? "The value play"} is the one most likely to vanish before your next turn, so this is where taking the surplus value may be worth the structural tradeoff.`
                    : "Both sides of the split are carrying similar timing pressure, so the choice should come down to how hard you want to protect roster shape versus chase board value."}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-[22px] border border-white/8 bg-[#081321] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#9db8e2]">
                  Opponent Simulation
                </p>
                <h2 className="mt-2 text-xl font-black">Deterministic wrap forecast</h2>
              </div>
              <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                {wrapSimulation.simulations} sims
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{wrapSimulation.summary}</p>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Likely Next Picks
                </p>
                <div className="mt-2 space-y-2 text-sm text-[#dce4f1]">
                  {wrapSimulation.pickPredictions.slice(0, 4).map((prediction) => {
                    const likelyPlayer = prediction.likelyPlayerId
                      ? candidates.find((candidate) => candidate.player.id === prediction.likelyPlayerId) ?? null
                      : null;

                    return (
                      <div
                        key={`${prediction.teamId}-${prediction.overallPick}`}
                        className="rounded-2xl bg-black/20 px-3 py-3"
                      >
                        <p className="font-black">
                          Pick {prediction.overallPick} · {prediction.teamId}
                        </p>
                        <p className="mt-1">
                          {likelyPlayer
                            ? `${likelyPlayer.player.fullName} or a ${prediction.likelyPosition} swing`
                            : `${prediction.likelyPosition} is the most common lane`}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#bfcadb]">
                          {Math.round(prediction.confidence * 100)}% top-position confidence
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Most Threatened Targets
                </p>
                <div className="mt-2 space-y-2 text-sm text-[#dce4f1]">
                  {wrapSimulation.threatenedPlayers.slice(0, 4).map((threat) => {
                    const candidate =
                      candidates.find((item) => item.player.id === threat.playerId) ?? null;

                    return (
                      <div
                        key={`threat-${threat.playerId}`}
                        className="rounded-2xl bg-black/20 px-3 py-3"
                      >
                        <p className="font-black">{candidate?.player.fullName ?? threat.playerId}</p>
                        <p className="mt-1">
                          {Math.round(threat.lossProbability * 100)}% gone before your next turn
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#bfcadb]">
                          {threat.expectedPick ? `Most often around pick ${threat.expectedPick}` : "No stable pick lane yet"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {recommendationCards.map(({ candidate, recommendation, scored }) => (
              <article
                key={candidate.player.id}
                className="rounded-[22px] border border-white/10 bg-[#081321] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                      {candidate.player.positions.join("/")} · {candidate.player.team}
                    </p>
                    <h3 className="mt-1 text-2xl font-black">{candidate.player.fullName}</h3>
                    {candidate.signals?.preferredTarget ? (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#f4dcc0]/40 bg-[#f4dcc0]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#fff1d4]">
                        {candidate.signals.preferredTarget.label}
                        <span className="text-[#cfd8e8]">
                          {candidate.signals.preferredTarget.source === "both"
                            ? "Model + Approved"
                            : candidate.signals.preferredTarget.source === "model"
                              ? "Model"
                              : "Approved"}
                        </span>
                      </div>
                    ) : null}
                    {personalTargetIds.has(candidate.player.id) ? (
                      <div className="mt-2 inline-flex items-center rounded-full border border-[#d9b56d]/45 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                        ★ Your Target
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Button size="sm" variant="outline" onClick={() => togglePersonalTarget(candidate)}>
                      {personalTargetIds.has(candidate.player.id) ? "★ Saved" : "☆ Target"}
                    </Button>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9db8e2]">
                      Draft Score
                    </p>
                    <p className="text-3xl font-black text-[#f8ddb3]">
                      {recommendation.score.toFixed(1)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-4">
              <div className="rounded-2xl bg-white/[0.04] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                  Our Board / Market
                </p>
                    <p className="mt-1 text-xl font-black">
                      #{recommendation.explanation.ourBoardRank} / #{recommendation.explanation.marketRank}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Exact / P50
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {scored.exact} / {scored.p50}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Make It Back
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {Math.round(recommendation.explanation.makeItBackProbability * 100)}%
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      VONA
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {recommendation.explanation.vona.toFixed(1)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Replacement / Edge
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {recommendation.explanation.replacementBaseline} /{" "}
                      {recommendation.explanation.boardEdge >= 0 ? "+" : ""}
                      {recommendation.explanation.boardEdge}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      VOR Weight
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {recommendation.explanation.positionUtilityMultiplier.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Direct Pos Penalty
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {recommendation.explanation.onesiePenalty === 0
                        ? "None"
                        : `-${recommendation.explanation.onesiePenalty.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      P90
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {scored.p90}
                    </p>
                  </div>
                </div>

                {candidate.signals ? (
                  <div className="mt-3 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Projection Evidence
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.evidenceConfidence.projection.level} · {candidate.signals.evidenceConfidence.projection.score}
                      </p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9db0ca]">
                        Situation {candidate.signals.situation.certainty}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Sources
                      </p>
                      <p className="mt-1 text-lg font-black">{candidate.signals.sourceCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Role Prior
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.opportunityLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Market Trend
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.sleeperTrend}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Regression
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.regression.direction}
                        {candidate.signals.regression.direction === "positive" ||
                        candidate.signals.regression.direction === "negative"
                          ? ` · ${candidate.signals.regression.adjustedMedianDelta >= 0 ? "+" : ""}${candidate.signals.regression.adjustedMedianDelta.toFixed(1)}`
                          : ""}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        xOpp
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.expectedOpportunity.label}
                        {candidate.signals.expectedOpportunity.adjustedMedianDelta !== 0
                          ? ` · ${candidate.signals.expectedOpportunity.adjustedMedianDelta >= 0 ? "+" : ""}${candidate.signals.expectedOpportunity.adjustedMedianDelta.toFixed(1)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9db0ca]">
                        {candidate.signals.expectedOpportunity.evidenceSource === "ffopportunity"
                          ? `Play-level ${candidate.signals.expectedOpportunity.evidenceSeasons.join("/")} · ${Math.round(candidate.signals.expectedOpportunity.currentSeasonWeight * 100)}% current · consistency ${candidate.signals.expectedOpportunity.weeklyConsistencyScore ?? "--"}`
                          : candidate.signals.expectedOpportunity.evidenceSource === "nflverse-heuristic"
                            ? "Volume heuristic"
                            : "No prior"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Role Security
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.roleSecurity.label}
                        {candidate.signals.roleSecurity.adjustedMedianDelta !== 0
                          ? ` · ${candidate.signals.roleSecurity.adjustedMedianDelta >= 0 ? "+" : ""}${candidate.signals.roleSecurity.adjustedMedianDelta.toFixed(1)}`
                          : ""}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Scoring Mix
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {candidate.signals.scoringProfile.label}
                        {candidate.signals.scoringProfile.adjustedMedianDelta !== 0
                          ? ` · ${candidate.signals.scoringProfile.adjustedMedianDelta >= 0 ? "+" : ""}${candidate.signals.scoringProfile.adjustedMedianDelta.toFixed(1)}`
                          : ""}
                      </p>
                    </div>
                    {candidate.signals.vegas ? (
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Vegas Props
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {candidate.signals.vegas.projectionDelta >= 0 ? "+" : ""}
                          {candidate.signals.vegas.projectionDelta.toFixed(1)} pts
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9db0ca]">
                          {candidate.signals.vegas.marketCount} markets · {candidate.signals.vegas.bookmakerCount} books
                        </p>
                      </div>
                    ) : null}
                    {candidate.signals.seasonMarket ? (
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Season Market
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {candidate.signals.seasonMarket.projectionDelta >= 0 ? "+" : ""}
                          {candidate.signals.seasonMarket.projectionDelta.toFixed(1)} pts
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9db0ca]">
                          WWO #{candidate.signals.seasonMarket.sourceRank} · {candidate.signals.seasonMarket.adjustments.length} stats · {Math.round(candidate.signals.seasonMarket.blendWeight * 100)}% weight
                        </p>
                        {candidate.signals.seasonMarket.context === "expanded-role-or-health-rebound" ? (
                          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#c8ffe2]">
                            Role / health correction
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {candidate.signals ? (
                  <div className="mt-3 grid gap-3 text-sm text-[#dce4f1] lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3 lg:col-span-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Evidence Diagnostics
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {([
                          ["Projection", candidate.signals.evidenceConfidence.projection],
                          ["Role", candidate.signals.evidenceConfidence.role],
                          ["Robustness", candidate.signals.evidenceConfidence.robustness],
                          ["Price", candidate.signals.evidenceConfidence.price],
                        ] as const).map(([label, dimension]) => (
                          <div key={label} className="rounded-xl bg-white/[0.04] p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9db0ca]">{label}</p>
                            <p className="mt-1 text-lg font-black text-[#f8ddb3]">{dimension.level} · {dimension.score}</p>
                            <p className="mt-1 text-xs leading-5 text-[#cfd8e8]">{dimension.summary}</p>
                          </div>
                        ))}
                      </div>
                      {candidate.signals.evidenceConfidence.blockers.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-[#d9b56d]/20 bg-[#d9b56d]/5 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f8ddb3]">Confidence Blockers</p>
                          <ul className="mt-2 space-y-1 text-xs leading-5 text-[#dce4f1]">
                            {candidate.signals.evidenceConfidence.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3 lg:col-span-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Current Situation
                      </p>
                      <p className="mt-1 text-lg font-black text-[#f8ddb3]">
                        {candidate.signals.situation.certainty} certainty · {candidate.context?.source === "manager-reviewed" || candidate.context?.source === "manual-import" ? "reviewed" : candidate.context?.source === "qualitative-snapshot" ? "source-backed" : "unreviewed"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#dce4f1]">{candidate.signals.situation.summary}</p>
                      {candidate.context ? (
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9db0ca]">
                          Role {candidate.context.currentRole} · Health {candidate.context.healthStatus} · Track record {candidate.context.trackRecord} · Continuity {candidate.context.roleContinuity} · Environment {candidate.context.environment}
                        </p>
                      ) : null}
                      {candidate.signals.situation.questions.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs leading-5 text-[#dce4f1]">
                          {candidate.signals.situation.questions.map((question) => <li key={question}>{question}</li>)}
                        </ul>
                      ) : null}
                      {candidate.context?.qualitative ? (
                        <div className="mt-3 border-t border-white/8 pt-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#88a4d3]">
                            Qualitative snapshot · {candidate.context.qualitative.sourceCount} source{candidate.context.qualitative.sourceCount === 1 ? "" : "s"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {candidate.context.qualitative.evidence.map((evidence) => (
                              <a
                                key={`${evidence.source}:${evidence.sourceTextHash}`}
                                href={evidence.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-[#dce4f1] hover:border-[#d9b56d]/50"
                              >
                                {evidence.source}{evidence.rank ? ` #${evidence.rank}` : ""}
                              </a>
                            ))}
                          </div>
                          {candidate.context.qualitative.agreements.map((agreement) => (
                            <p key={agreement} className="mt-2 text-xs leading-5 text-[#b7d6b2]">Agreement: {agreement}</p>
                          ))}
                          {candidate.context.qualitative.conflicts.map((conflict) => (
                            <p key={conflict} className="mt-2 text-xs leading-5 text-[#f8ddb3]">Conflict: {conflict}</p>
                          ))}
                          <p className={`mt-2 text-xs font-bold leading-5 ${candidate.signals.qualitativeAdjustment.direction === "down" ? "text-[#ffd2d2]" : candidate.signals.qualitativeAdjustment.direction === "up" ? "text-[#c8ffe2]" : "text-[#9db0ca]"}`}>
                            Model impact: {candidate.signals.qualitativeAdjustment.summary}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Scenario Robustness
                      </p>
                      <p className="mt-1 text-lg font-black text-[#f8ddb3]">
                        {candidate.signals.robustness.fragility} · fragility {candidate.signals.robustness.fragilityScore}
                      </p>
                      <p className="mt-2 text-sm text-[#dce4f1]">
                        Downside {candidate.signals.robustness.downside.points.toFixed(1)} · Base{" "}
                        {candidate.signals.robustness.base.points.toFixed(1)} · Ceiling{" "}
                        {candidate.signals.robustness.ceiling.points.toFixed(1)}
                      </p>
                      <p className="mt-2 text-sm text-[#cfd8e8]">
                        {candidate.signals.robustness.base.summary}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Conviction Dossier
                      </p>
                      <p className="mt-1 text-lg font-black text-[#f8ddb3]">
                        {candidate.signals.dossier.stance.replace(/-/g, " ")} · {candidate.signals.dossier.convictionScore}
                      </p>
                      <p className="mt-2 text-sm text-[#dce4f1]">
                        {candidate.signals.dossier.summary}
                      </p>
                      <p className="mt-2 text-sm text-[#cfd8e8]">
                        {candidate.signals.dossier.usagePlan}
                      </p>
                    </div>
                  </div>
                ) : null}

                {candidate.signals?.preferredTarget ? (
                  <div className="mt-3 rounded-2xl border border-[#f4dcc0]/20 bg-[#f4dcc0]/[0.06] p-3 text-sm text-[#dce4f1]">
                    <span className="font-black text-[#fff1d4]">Preferred target:</span>{" "}
                    {candidate.signals.preferredTarget.summary}
                  </div>
                ) : null}

                <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm text-[#dce4f1]">
                  <span className="font-black text-[#f8ddb3]">Why it ranks here:</span>{" "}
                  our-board score {recommendation.explanation.ourBoardScore.toFixed(1)}, replacement edge{" "}
                  {recommendation.explanation.valueNow.toFixed(1)}, focus lift {recommendation.explanation.focusBonus.toFixed(2)}, run pressure{" "}
                  {recommendation.explanation.tierPressureBonus.toFixed(2)}, stability{" "}
                  {recommendation.explanation.stabilityBonus.toFixed(2)}, direct positional penalty{" "}
                  {recommendation.explanation.onesiePenalty.toFixed(2)}, make-it-back drag{" "}
                  {(recommendation.explanation.valueNow - recommendation.explanation.valueLater).toFixed(1)}.
                </div>

                {candidate.signals?.notes.length ? (
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[#cfd8e8]">
                    {candidate.signals.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}

                <ul className="mt-4 space-y-2 text-sm leading-6 text-[#cfd8e8]">
                  {recommendation.explanation.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Reach Guardrails
              </p>
              <h2 className="mt-2 text-2xl font-black">How early you can justify the click</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              Anti-panic check
            </span>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {[decisionSnapshot.structuralBest, decisionSnapshot.valueBest]
              .map((recommendation) => {
                const reach = buildReachToleranceSnapshot(recommendation, draftState, candidates);
                if (!recommendation || !reach) {
                  return null;
                }

                const candidate = candidates.find(
                  (item) => item.player.id === recommendation.playerId,
                );
                if (!candidate) {
                  return null;
                }

                return (
                  <article
                    key={`reach-${candidate.player.id}`}
                    className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                          {candidate.player.positions.join("/")} · {candidate.player.team}
                        </p>
                        <h3 className="mt-1 text-xl font-black">{candidate.player.fullName}</h3>
                      </div>
                      <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                        {reach.label}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-3">
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Reach Tolerance
                        </p>
                        <p className="mt-1 text-xl font-black">{reach.maxReachPicks}</p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Market Cost
                        </p>
                        <p className="mt-1 text-xl font-black">{reach.marketCost.toFixed(1)}</p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Run Risk
                        </p>
                        <p className="mt-1 text-xl font-black">{reach.runRisk}</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{reach.summary}</p>
                  </article>
                );
              })
              .filter((item) => item !== null)}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Wipeout Plans
              </p>
              <h2 className="mt-2 text-2xl font-black">If a tier gets wiped before your next turn</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              Wrap planning
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {tierWipeScenarios.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                No severe tier-wipe scenario is live right now.
              </p>
            ) : (
              tierWipeScenarios.map((scenario) => {
                const threatened = scenario.threatenedPlayerIds
                  .map((playerId) => candidates.find((candidate) => candidate.player.id === playerId))
                  .filter((candidate): candidate is DraftCandidate => candidate !== null);
                const pivot = scenario.pivotPlayerId
                  ? candidates.find((candidate) => candidate.player.id === scenario.pivotPlayerId) ?? null
                  : null;
                const fallbackNames = scenario.fallbackPlayerIds
                  .map((playerId) => candidates.find((candidate) => candidate.player.id === playerId)?.player.fullName)
                  .filter((name): name is string => Boolean(name));

                return (
                  <article
                    key={`wipe-${scenario.position}`}
                    className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                          {scenario.position} wipe scenario
                        </p>
                        <h3 className="mt-1 text-xl font-black">
                          Likely lose {scenario.likelyLostCount} names before the wrap
                        </h3>
                      </div>
                      <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                        Drop {scenario.dropoffAfterWipe.toFixed(1)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{scenario.summary}</p>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Threatened
                        </p>
                        <p className="mt-1 font-black">
                          {threatened.map((candidate) => candidate.player.fullName).join(" / ")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Same-Pos Fallbacks
                        </p>
                        <p className="mt-1 font-black">
                          {fallbackNames.length > 0 ? fallbackNames.join(" / ") : "None"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/[0.04] p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                          Cross-Board Pivot
                        </p>
                        <p className="mt-1 font-black">
                          {pivot?.player.fullName ?? "Stay disciplined on position"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Run Pressure
              </p>
              <h2 className="mt-2 text-2xl font-black">What could disappear before the wrap</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              Pick-window scarcity
            </span>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {positionRunSnapshots.map((snapshot) => (
              <article
                key={`run-${snapshot.position}`}
                className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                      {snapshot.position}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{snapshot.headline}</h3>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                      snapshot.runRisk === "high"
                        ? "border border-[#f2a3a3]/40 bg-[#f2a3a3]/10 text-[#ffd2d2]"
                        : snapshot.runRisk === "medium"
                          ? "border border-[#d9b56d]/40 bg-[#d9b56d]/10 text-[#f8ddb3]"
                          : "border border-[#8fd0b3]/40 bg-[#8fd0b3]/10 text-[#c8ffe2]"
                    }`}
                  >
                    {snapshot.runRisk}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Expected Picks
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {snapshot.expectedSelectionsBeforeNextTurn.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Tier Survival
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {Math.round(snapshot.tierSurvivalProbability * 100)}%
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Cliff Drop
                    </p>
                    <p className="mt-1 text-xl font-black">{snapshot.cliffDrop.toFixed(1)}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{snapshot.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Position Market
              </p>
              <h2 className="mt-2 text-2xl font-black">Where the board is getting thin</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              {draftState.league.teams} teams
            </span>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {positionSnapshots.map((snapshot) => (
              <article
                key={snapshot.position}
                className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                      {snapshot.position}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{snapshot.label}</h3>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${
                      snapshot.marketState === "drying-up"
                        ? "border border-[#f2a3a3]/40 bg-[#f2a3a3]/10 text-[#ffd2d2]"
                        : snapshot.marketState === "thinning"
                          ? "border border-[#d9b56d]/40 bg-[#d9b56d]/10 text-[#f8ddb3]"
                          : "border border-[#8fd0b3]/40 bg-[#8fd0b3]/10 text-[#c8ffe2]"
                    }`}
                  >
                    {snapshot.marketState.replace("-", " ")}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[#dce4f1] sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Top Option
                    </p>
                    <p className="mt-1 font-black">{snapshot.topAvailableName}</p>
                    <p className="mt-1 text-xs text-[#bfcadb]">P50 {snapshot.topAvailableMedian}</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Tier Drop
                    </p>
                    <p className="mt-1 text-xl font-black">{snapshot.tierDrop.toFixed(1)}</p>
                    <p className="mt-1 text-xs text-[#bfcadb]">Tier {snapshot.topTier} leader</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Available / Demand
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {snapshot.availableCount} / {snapshot.starterDemand}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                      Replacement
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {snapshot.replacementBaseline.toFixed(1)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm text-[#dce4f1]">
                  <span className="font-black text-[#f8ddb3]">Market read:</span>{" "}
                  {snapshot.summary} Scarcity index {snapshot.scarcityIndex.toFixed(2)}.
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Outliers
              </p>
              <h2 className="mt-2 text-2xl font-black">Names the board wants you to handle carefully</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              Signal conflict
            </span>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {outlierCards.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                No major projection-market-role conflicts are standing out on the live board right now.
              </p>
            ) : (
              outlierCards.map(({ outlier, candidate }) => (
                <article
                  key={candidate.player.id}
                  className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                        {candidate.player.positions.join("/")} · {candidate.player.team}
                      </p>
                      <h3 className="mt-1 text-xl font-black">{candidate.player.fullName}</h3>
                    </div>
                    <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                      {outlier.severity} · {outlier.score.toFixed(1)}
                    </span>
                  </div>

                  <p className="mt-3 font-black text-[#f8ddb3]">{outlier.headline}</p>
                  <p className="mt-2 text-sm leading-6 text-[#dce4f1]">{outlier.summary}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
                Pivot Plans
              </p>
              <h2 className="mt-2 text-2xl font-black">If a tier breaks before your wrap</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#dce4f1]">
              Contingency map
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {pivotCards.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#cbd4e4]">
                No urgent tier-break pivots are live yet. The board currently has enough time flexibility.
              </p>
            ) : (
              pivotCards.map(({ plan, trigger, fallbacks, alternative }) => (
                <article
                  key={`${plan.position}-${plan.triggerPlayerId}`}
                  className="rounded-[22px] border border-white/8 bg-[#081321] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-[#d9b56d]">
                        {plan.position} contingency
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        {trigger?.player.fullName ?? "Current hinge player"}
                      </h3>
                    </div>
                    <span className="rounded-full border border-[#d9b56d]/40 bg-[#d9b56d]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f8ddb3]">
                      {plan.urgency.replace("-", " ")}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[#dce4f1]">{plan.summary}</p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Trigger
                      </p>
                      <p className="mt-1 font-black">{trigger?.player.fullName ?? "Unknown"}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Fallbacks
                      </p>
                      <p className="mt-1 font-black">
                        {fallbacks.length > 0
                          ? fallbacks.map((candidate) => candidate.player.fullName).join(" / ")
                          : "No same-position fallbacks"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#88a4d3]">
                        Cross-Board Pivot
                      </p>
                      <p className="mt-1 font-black">
                        {alternative?.player.fullName ?? "Stay on position"}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#9db8e2]">
            Filtered Board
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {filteredCandidates.map((candidate) => (
              <div key={candidate.player.id} className="rounded-2xl border border-white/8 bg-[#081321] p-3 text-sm text-[#dce4f1]">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-black text-[#f7f2e8]">{candidate.player.fullName}</p>
                  <Button size="sm" variant="outline" onClick={() => togglePersonalTarget(candidate)}>
                    {personalTargetIds.has(candidate.player.id) ? "★" : "☆"}
                  </Button>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#88a4d3]">
                  {candidate.player.positions.join("/")} · {candidate.player.team}
                </p>
                <p className="mt-2">ECR {candidate.market.ecr} · ADP {candidate.market.adp}</p>
                {candidate.signals?.preferredTarget ? (
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-[#fff1d4]">
                    {candidate.signals.preferredTarget.label}
                  </p>
                ) : null}
                {candidate.signals ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#bfcadb]">
                    {candidate.signals.evidenceConfidence.projection.level} projection evidence · {candidate.signals.situation.certainty} situation · {candidate.signals.expectedOpportunity.label} xOpp · {candidate.signals.scoringProfile.label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
