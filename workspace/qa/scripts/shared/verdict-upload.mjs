#!/usr/bin/env node
/**
 * Send a run's evidence to the `verdict` report hub.
 *
 *   node scripts/shared/verdict-upload.mjs --type api --slug checkout-discount --env uat
 *   node scripts/shared/verdict-upload.mjs --run runs/api/checkout-discount/2026-09-16-1420   (from the QA root)
 *
 * Every run already writes `junit.xml` and `results.json` into its own evidence folder
 * (playwright.config.ts § reporter), and verdict reads both natively — so nothing is converted
 * here. What this script adds is the right project, type, env and tags, plus the evidence
 * directory so screenshots, traces and videos travel with the results.
 *
 * Two paths, in order of preference:
 *   1. the `verdict` CLI when it is on PATH — it uploads evidence through presigned URLs
 *   2. direct HTTP with the built-in fetch, which sends results only, and says so
 *
 * An upload failure is reported with the retry command, never swallowed: the run is valid and
 * its local evidence is complete, which is exactly what the message says.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { workspaceRoot } from "./lib/root.mjs";
import { trackRun } from './lib/runlog.mjs';

trackRun(import.meta.url);

const RUN_ID = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

function parseArgs(argv) {
  const out = { tag: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1]?.startsWith("--") ? true : argv[++i];
    if (key === "tag") out.tag.push(val);
    else out[key] = val;
  }
  return out;
}

function latestRun(type, slug) {
  // The QA root this runs from (CONTRACTS §2) — CI and npm both run it there.
  const dir = join(workspaceRoot(), "runs", type, slug);
  if (!existsSync(dir)) return null;
  const runs = readdirSync(dir).filter((d) => RUN_ID.test(d)).sort();
  return runs.length ? join(dir, runs[runs.length - 1]) : null;
}

function reportFile(runDir) {
  // Playwright JSON first: it carries richer per-test detail than the JUnit XML beside it.
  for (const name of ["results.json", "junit.xml"]) {
    const p = join(runDir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function haveCli() {
  try {
    execFileSync("verdict", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function retryCommand({ project, type, env, tags, report, runDir }) {
  const t = tags.map((x) => `--tag ${x}`).join(" ");
  return `verdict upload --project ${project} --type ${type} --env ${env} ${t} ${report} --evidence ${runDir}`.replace(/\s+/g, " ");
}

async function viaHttp({ server, apiKey, project, type, env, name, tags, report }) {
  const q = new URLSearchParams({ type, env });
  if (name) q.set("name", name);
  for (const t of tags) q.append("tag", t);

  const isXml = report.endsWith(".xml");
  const url = `${server.replace(/\/$/, "")}/api/v1/projects/${project}/reports?${q}`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let body;
  if (isXml) {
    // JUnit goes as multipart with an explicit format; only CTRF may be sent as raw JSON.
    const form = new FormData();
    form.set("format", "junit");
    form.append("files", new Blob([readFileSync(report)]), basename(report));
    body = form;
  } else {
    // Playwright JSON is also multipart: the JSON body path is CTRF-only.
    const form = new FormData();
    form.set("format", "playwright-json");
    form.append("files", new Blob([readFileSync(report)]), basename(report));
    body = form;
  }

  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch { /* an accepted upload with a non-JSON body is still accepted */ }
  return { runId: parsed.run_id ?? parsed.id ?? "", url: parsed.url ?? "", evidence: false };
}

function viaCli({ project, type, env, name, tags, report, runDir, idempotencyKey, out }) {
  const args = ["upload", "--project", project, "--type", type, "--env", env];
  if (name) args.push("--name", name);
  for (const t of tags) args.push("--tag", t);
  if (idempotencyKey) args.push("--idempotency-key", idempotencyKey);
  if (out) args.push("--out", out);
  args.push(report, "--evidence", runDir);

  const res = spawnSync("verdict", args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || "").trim().slice(0, 400));

  let runId = "";
  let url = "";
  for (const line of (res.stdout || "").split("\n")) {
    if (line.startsWith("VERDICT_RUN_ID=")) runId = line.split("=")[1].trim();
    if (line.startsWith("VERDICT_RUN_URL=")) url = line.split("=")[1].trim();
  }
  return { runId, url, evidence: true };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));

  const server = a.server ?? process.env.VERDICT_URL ?? process.env.VERDICT_SERVER;
  const apiKey = a["api-key"] ?? process.env.VERDICT_API_KEY;
  const project = a.project ?? process.env.VERDICT_PROJECT;
  const env = a.env ?? process.env.TEST_ENV ?? "uat";
  const type = a.type;

  if (!project) {
    console.error("no project key: pass --project or set VERDICT_PROJECT\n" +
                  "(PROJECT-PROFILE §Test management names the verdict project for this repo)");
    process.exit(2);
  }

  const runDir = a.run ?? (type && a.slug ? latestRun(type, a.slug) : null);
  if (!runDir || !existsSync(runDir)) {
    console.error("no run to upload: pass --run <dir>, or --type <t> --slug <s>\n" +
                  "every run lives at <qa-root>/runs/<type>/<slug>/<run-id>/ — no run without evidence");
    process.exit(2);
  }

  const report = reportFile(runDir);
  if (!report) {
    console.error(`no results.json or junit.xml in ${runDir}\n` +
                  "the run produced no machine-readable report — check the reporter config");
    process.exit(2);
  }

  const inferredType = type ?? runDir.split(/[\\/]/).at(-3);
  const slug = a.slug ?? runDir.split(/[\\/]/).at(-2);
  const runId = basename(runDir);
  const tags = [slug, ...a.tag];

  const ctx = { server, apiKey, project, type: inferredType, env, tags, report, runDir,
                name: `${slug} ${runId}`, idempotencyKey: `${slug}-${inferredType}-${runId}`,
                out: join(runDir, ".verdict-run.json") };

  if (!server) {
    console.log("upload:\n  " + retryCommand(ctx));
    console.log("  (skipped: VERDICT_URL is not set)");
    return;
  }

  try {
    const r = haveCli() ? viaCli(ctx) : await viaHttp(ctx);
    console.log(`verdict: ${r.url || r.runId || "accepted"}`);
    if (!r.evidence) {
      console.log("  note: results only — install the `verdict` CLI to send screenshots, " +
                  "traces and videos too");
    }
    writeFileSync(join(runDir, ".verdict-run.json"),
                  JSON.stringify({ run_id: r.runId, url: r.url }, null, 2));
  } catch (err) {
    console.error(`verdict upload FAILED: ${err.message}`);
    console.error("  the run itself is valid and its local evidence is complete.");
    console.error(`  retry: ${retryCommand(ctx)}`);
    process.exit(1);
  }
}

main();
