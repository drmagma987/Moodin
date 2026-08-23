# Local Hosting

Last updated: August 12, 2026

## Target host

Primary always-on host: the user's Mac mini.

## Expected responsibilities

- scheduled ingestion jobs
- local API
- cached provider data
- Yahoo browser provider
- Discord bot
- RSS or news polling
- logs and health checks

## Guardrails

- keep core analytics portable
- keep secrets in `.env`
- preserve crash-safe state
- restart on reboot
- log stale Yahoo sessions explicitly
- avoid tying business logic to macOS-only APIs

## Early recommendation

Use lightweight services first:

- Next.js app for the UI
- provider adapters as pure TypeScript modules
- SQLite or Postgres later when live ingestion needs persistence
- a small supervisor or launch-agent strategy once background jobs are introduced

## Current breaking-news runtime

The Chrome extension polls `/api/fantasy/breaking-news` once per minute and therefore depends on the local Next.js service being reachable at its configured loopback URL. During development, `npm run dev` is sufficient. For in-season always-on use, run the production build under a restart-on-reboot supervisor on the Mac mini; the extension records a visible error when that service is unavailable and tries again on the next alarm.

Alert deduplication currently lives in Chrome extension local storage and survives browser/service-worker restarts. The API's 60-second feed cache is process-local. Moving alert delivery to multiple browsers or a hosted push service will require durable event storage (SQLite/Postgres) and a server-side scheduler; neither is implied by this local single-manager implementation.
