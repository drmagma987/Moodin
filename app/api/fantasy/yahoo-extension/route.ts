import { NextResponse } from "next/server";
import {
  buildYahooExtensionPreview,
  isYahooExtensionEnvelope,
} from "@/lib/fantasy/yahooBridge";
import type { YahooExtensionEnvelope } from "@/lib/fantasy/yahooBridge";

type YahooBridgeDebugState = {
  latestEnvelope: YahooExtensionEnvelope | null;
  latestReceivedAt: string | null;
  latestInventory: YahooExtensionEnvelope | null;
  latestInventoryReceivedAt: string | null;
};

const yahooBridgeGlobal = globalThis as typeof globalThis & {
  __moodinYahooBridgeDebug?: YahooBridgeDebugState;
};

function getYahooBridgeDebugState() {
  yahooBridgeGlobal.__moodinYahooBridgeDebug ??= {
    latestEnvelope: null,
    latestReceivedAt: null,
    latestInventory: null,
    latestInventoryReceivedAt: null,
  };
  return yahooBridgeGlobal.__moodinYahooBridgeDebug;
}

export async function GET() {
  const debugState = getYahooBridgeDebugState();
  const latestEnvelope = debugState.latestEnvelope;
  return NextResponse.json({
    ok: true,
    route: "/api/fantasy/yahoo-extension",
    mode: "scaffold",
    acceptedProviders: ["yahoo-browser-extension"],
    acceptedPayloadKinds: ["state-snapshot", "league-inventory", "draft-sync", "page-probe"],
    note: "This endpoint strictly validates and previews read-only Yahoo browser-extension envelopes. It does not mutate Yahoo or draft state.",
    latest:
      latestEnvelope?.payload.kind === "state-snapshot"
        ? {
            receivedAt: debugState.latestReceivedAt,
            pageType: latestEnvelope.payload.snapshot.pageType,
            leagueId: latestEnvelope.payload.snapshot.leagueId,
            draftRoomId: latestEnvelope.payload.snapshot.draft?.roomId ?? null,
            draftSlot: latestEnvelope.payload.snapshot.draft?.userSlot ?? null,
            playerCount: latestEnvelope.payload.snapshot.players.length,
            pickCount: latestEnvelope.payload.snapshot.draft?.picks.length ?? 0,
            deterministicSignals: latestEnvelope.payload.diagnostics.deterministicSignals,
            provisionalSignals: latestEnvelope.payload.diagnostics.provisionalSignals,
          }
        : null,
    inventory:
      latestEnvelope?.payload.kind === "league-inventory"
        ? {
            receivedAt: debugState.latestReceivedAt,
            leagueId: latestEnvelope.payload.inventory.leagueId,
            myTeamId: latestEnvelope.payload.inventory.myTeamId,
            playerCount: latestEnvelope.payload.inventory.players.length,
            availableCount: latestEnvelope.payload.inventory.players.filter((player) => player.availability === "available").length,
            rosteredCount: latestEnvelope.payload.inventory.players.filter((player) => player.availability === "rostered").length,
            coverage: latestEnvelope.payload.inventory.coverage,
          }
        : debugState.latestInventory?.payload.kind === "league-inventory"
          ? {
              receivedAt: debugState.latestInventoryReceivedAt,
              leagueId: debugState.latestInventory.payload.inventory.leagueId,
              myTeamId: debugState.latestInventory.payload.inventory.myTeamId,
              playerCount: debugState.latestInventory.payload.inventory.players.length,
              availableCount: debugState.latestInventory.payload.inventory.players.filter((player) => player.availability === "available").length,
              rosteredCount: debugState.latestInventory.payload.inventory.players.filter((player) => player.availability === "rostered").length,
              coverage: debugState.latestInventory.payload.inventory.coverage,
            }
          : null,
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!isYahooExtensionEnvelope(body)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Body does not match the Yahoo extension envelope contract.",
      },
      { status: 400 },
    );
  }
  const preview = buildYahooExtensionPreview(body);
  const debugState = getYahooBridgeDebugState();
  debugState.latestEnvelope = body;
  if (body.payload.kind === "league-inventory") {
    debugState.latestInventory = body;
    debugState.latestInventoryReceivedAt = new Date().toISOString();
  }
  debugState.latestReceivedAt = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    receivedAt: new Date().toISOString(),
    page: preview.inspection,
    payload: {
      kind: preview.payloadKind,
      recentPickCount: preview.recentPickCount,
      currentPickText: preview.currentPickText,
      roundText: preview.roundText,
      teamOnClockText: preview.teamOnClockText,
      recentPickTexts: preview.recentPickTexts,
      snapshot:
        body.payload.kind === "state-snapshot"
          ? {
              leagueId: body.payload.snapshot.leagueId,
              teamId: body.payload.snapshot.teamId,
              pageType: body.payload.snapshot.pageType,
              playerCount: body.payload.snapshot.players.length,
              availablePlayerCount: body.payload.snapshot.players.filter(
                (player) => player.availability === "available",
              ).length,
              draftPickCount: body.payload.snapshot.draft?.picks.length ?? 0,
            }
          : null,
      inventory:
        body.payload.kind === "league-inventory"
          ? {
              leagueId: body.payload.inventory.leagueId,
              myTeamId: body.payload.inventory.myTeamId,
              playerCount: body.payload.inventory.players.length,
              availableCount: body.payload.inventory.players.filter((player) => player.availability === "available").length,
              rosteredCount: body.payload.inventory.players.filter((player) => player.availability === "rostered").length,
              coverage: body.payload.inventory.coverage,
            }
          : null,
    },
    nextStep: preview.nextStep,
  });
}
