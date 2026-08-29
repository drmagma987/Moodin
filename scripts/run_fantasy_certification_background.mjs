import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "lib/fantasy/data");
const SCRIPT = fileURLToPath(import.meta.url);
const PID_FILE = path.join(DATA, "certificationBackground.pid.json");
const STATUS_FILE = path.join(DATA, "certificationBackground.status.generated.json");
const LOG_FILE = path.join(DATA, "certificationBackground.generated.log");
const POLICY_VERSION = "2026-08-28-v5";
const TARGETS = [
  {
    label: "premature-kicker",
    stateId: "late-qb-1:89",
    output: "systematicDraftAudit.regression-v5-premature-kicker.generated.json",
  },
  {
    label: "bench-quarterback",
    stateId: "runs-1:72",
    output: "systematicDraftAudit.regression-v5-bench-quarterback.generated.json",
  },
  {
    label: "bench-tight-end",
    stateId: "rb-heavy-1:92",
    output: "systematicDraftAudit.regression-v5-bench-tight-end.generated.json",
  },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeStatus(status) {
  fs.writeFileSync(STATUS_FILE, `${JSON.stringify({ updatedAt: new Date().toISOString(), ...status }, null, 2)}\n`);
}

function pidIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Managed execution can deny signal inspection for a still-running detached
    // process. EPERM therefore means "present but not signalable," not exited.
    return error?.code === "EPERM";
  }
}

function artifactSummary(file) {
  const report = readJson(file);
  return report ? {
    policyCertificationVersion: report.policyCertificationVersion,
    stateCount: report.stateCount,
    expectedStateCount: report.expectedStateCount,
    complete: report.complete,
    suspiciousCount: report.suspiciousCount,
    allPassed: report.allPassed,
  } : null;
}

function printStatus() {
  const pidRecord = readJson(PID_FILE);
  const status = readJson(STATUS_FILE);
  console.log(JSON.stringify({
    running: pidIsRunning(pidRecord?.pid),
    pid: pidRecord?.pid ?? null,
    status,
    targetedRegressions: TARGETS.map((target) => ({
      label: target.label,
      ...artifactSummary(path.join(DATA, target.output)),
    })),
    shards: [0, 1, 2, 3].map((index) => ({
      index,
      ...artifactSummary(path.join(DATA, `systematicDraftAudit.shard-${index}.generated.json`)),
    })),
    logFile: LOG_FILE,
  }, null, 2));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${options.label ?? command} exited with ${signal ?? code}.`));
    });
  });
}

async function runStep(label, command, args, options) {
  writeStatus({ pid: process.pid, state: "running", step: label });
  console.log(`\n[certification] ${new Date().toISOString()} START ${label}`);
  await run(command, args, { ...options, label });
  console.log(`[certification] ${new Date().toISOString()} PASS ${label}`);
}

async function worker() {
  if (fs.existsSync("/usr/bin/caffeinate")) {
    const keepAwake = spawn("/usr/bin/caffeinate", ["-dimsu", "-w", String(process.pid)], {
      detached: true,
      stdio: "ignore",
    });
    keepAwake.unref();
  }

  for (const target of TARGETS) {
    const output = path.join(DATA, target.output);
    const existing = readJson(output);
    if (!(existing?.policyCertificationVersion === POLICY_VERSION && existing?.complete && existing?.allPassed)) {
      await runStep(`targeted 32-sample ${target.label} regression`, "npm", ["run", "fantasy:systematic-audit"], {
        env: {
          FANTASY_SYSTEMATIC_REPLAY_REPORT: "lib/fantasy/data/draftPolicyCertification.generated.json",
          FANTASY_SYSTEMATIC_REPLAY_STATE_ID: target.stateId,
          FANTASY_SYSTEMATIC_OUTPUT: `../lib/fantasy/data/${target.output}`,
        },
      });
    } else {
      console.log(`[certification] resume ${target.label} regression (already passed)`);
    }
    const verified = readJson(output);
    if (!(verified?.policyCertificationVersion === POLICY_VERSION && verified?.complete && verified?.allPassed)) {
      throw new Error(`Targeted ${target.label} regression did not pass under the current policy.`);
    }
  }

  writeStatus({ pid: process.pid, state: "running", step: "four systematic shards" });
  await Promise.all([0, 1, 2, 3].map((index) => run("npm", ["run", "fantasy:systematic-audit"], {
    label: `systematic shard ${index}`,
    env: {
      FANTASY_SYSTEMATIC_OFFSET: String(index * 8),
      FANTASY_SYSTEMATIC_LIMIT: "8",
      FANTASY_SYSTEMATIC_OUTPUT: `../lib/fantasy/data/systematicDraftAudit.shard-${index}.generated.json`,
    },
  })));

  await runStep("merge systematic shards", "npm", ["run", "fantasy:systematic-audit-merge"]);
  const gates = [
    ["league integrity", "node", ["lib/fantasy/validateLeagueIntegrity.mjs"]],
    ["fantasy tests", "npm", ["run", "fantasy:test"]],
    ["pressure test", "npm", ["run", "fantasy:pressure-test"]],
    ["counterfactual audit", "npm", ["run", "fantasy:counterfactual-audit"]],
    ["systematic audit", "npm", ["run", "fantasy:systematic-audit"]],
    ["26-draft policy certification", "npm", ["run", "fantasy:certify-policy"]],
    ["draft-day readiness", "npm", ["run", "fantasy:draft-day-readiness"]],
    ["TypeScript", "npx", ["tsc", "--noEmit"]],
    ["lint", "npm", ["run", "lint"]],
    ["production build", "npm", ["run", "build"]],
    ["diff whitespace", "git", ["diff", "--check"]],
  ];
  for (const [label, command, args] of gates) {
    await runStep(label, command, args);
  }
  writeStatus({ pid: process.pid, state: "complete", step: "all certification commands passed" });
}

function start() {
  const existing = readJson(PID_FILE);
  if (pidIsRunning(existing?.pid)) {
    console.log(`Certification worker is already running as PID ${existing.pid}.`);
    printStatus();
    return;
  }
  const log = fs.openSync(LOG_FILE, "a");
  fs.appendFileSync(LOG_FILE, `\n[certification] ${new Date().toISOString()} LAUNCH ${POLICY_VERSION}\n`);
  const child = spawn(process.execPath, [SCRIPT, "worker"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  fs.closeSync(log);
  fs.writeFileSync(PID_FILE, `${JSON.stringify({ pid: child.pid, launchedAt: new Date().toISOString() }, null, 2)}\n`);
  writeStatus({ pid: child.pid, state: "starting", step: "launch" });
  console.log(`Started detached fantasy certification worker PID ${child.pid}.`);
}

function stop() {
  const record = readJson(PID_FILE);
  if (!pidIsRunning(record?.pid)) {
    console.log("No certification worker is running.");
    return;
  }
  process.kill(-record.pid, "SIGTERM");
  writeStatus({ pid: record.pid, state: "paused", step: "stopped by operator; completed checkpoints remain resumable" });
  console.log(`Stopped certification worker process group ${record.pid}.`);
}

const action = process.argv[2] ?? "status";
if (action === "worker") {
  worker().catch((error) => {
    console.error(error);
    writeStatus({ pid: process.pid, state: "failed", step: "stopped at first failing gate", error: error.message });
    process.exitCode = 1;
  });
} else if (action === "start" || action === "resume") {
  start();
} else if (action === "stop") {
  stop();
} else if (action === "status") {
  printStatus();
} else {
  throw new Error(`Unknown action: ${action}`);
}
