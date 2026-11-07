#!/usr/bin/env node
/**
 * update-notice.mjs — the one SessionStart line that says a newer agentic-fx-qa exists.
 *
 * The installer (`afx`, or the public `npx agentic-fx`) writes `<project>/.claude/.agentic-fx-updates.json`
 * (`{checked_at, bundles: {qa: {installed, latest, kind, command, changelog_url}}}`); this only
 * reads it and never touches the network. Any doubt (no file, bad JSON, a kind of "none" or
 * "unknown", AFX_NO_UPDATE_CHECK=1) means silence, and nothing here can throw: a session must
 * always start. The file's text lands in the session context, so only a version-shaped value and
 * an https URL are ever printed, and the command is one of two fixed strings: `npx agentic-fx@latest
 * update --bundle qa` when the notice's `source` starts `npm:` (the public package), `afx update
 * --bundle qa` otherwise.
 *
 * Usage (status.mjs --brief calls it; run alone it prints the line or nothing):
 *   node <qa-root>/scripts/shared/update-notice.mjs [--project <dir>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,40})?$/;
const HTTPS = /^https:\/\/[^\s<>"'`]{1,300}$/;
const KINDS = ['patch', 'minor', 'major'];

export function updateCommand(source) {
  return typeof source === 'string' && source.startsWith('npm:') ? 'npx agentic-fx@latest update --bundle qa' : 'afx update --bundle qa';
}

/** The update line for the qa bundle, or '' when there is nothing certain to say. */
export function updateLine(projectRoot = process.cwd(), env = process.env) {
  try {
    if (env.AFX_NO_UPDATE_CHECK === '1') return '';
    const file = join(projectRoot, '.claude', '.agentic-fx-updates.json');
    if (!existsSync(file)) return '';
    const qa = JSON.parse(readFileSync(file, 'utf8'))?.bundles?.qa;
    if (!qa || typeof qa !== 'object') return '';
    if (!KINDS.includes(qa.kind)) return '';
    if (typeof qa.latest !== 'string' || typeof qa.installed !== 'string') return '';
    if (!SEMVER.test(qa.latest) || !SEMVER.test(qa.installed)) return '';
    let line = `agentic-fx-qa ${qa.latest} available (installed ${qa.installed}, ${qa.kind}) — ${updateCommand(qa.source)}`;
    if (typeof qa.changelog_url === 'string' && HTTPS.test(qa.changelog_url)) line += ` · ${qa.changelog_url}`;
    if (qa.kind === 'major') line += ' — MAJOR: read UPGRADE.md first';
    return line;
  } catch {
    return '';
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const i = args.indexOf('--project');
    const line = updateLine(i !== -1 && args[i + 1] ? args[i + 1] : process.cwd());
    if (line) process.stdout.write(`${line}\n`);
  } catch {
    // never fail the hook
  }
  process.exit(0);
}
