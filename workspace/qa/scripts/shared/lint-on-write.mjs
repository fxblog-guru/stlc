#!/usr/bin/env node
/**
 * PostToolUse hook: after a Write/Edit inside the QA root, run qa:lint and feed back the errors
 * that belong to the file just written.
 *
 * Claude Code passes the tool call as JSON on stdin (`tool_input.file_path`). Files outside the QA
 * root exit 0 silently — the hook has no opinion about application code. lint-qa.mjs resolves every
 * path relative to its working directory, so it runs with cwd = the QA root, exactly as
 * `npm run qa:lint` does. Errors exit 2 with the findings on stderr, which is how a hook reaches
 * the model; warnings never block.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot, rootPrefix } from './lib/root.mjs';

// The QA root by lib/root.mjs (CONTRACTS §2): QA_ROOT, PROJECT-PROFILE `QA root`, `.stlc/` or `qa/`.
const QA_ROOT = findRoot().root;
const LINT = join(dirname(fileURLToPath(import.meta.url)), 'lint-qa.mjs');

let payload = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  payload += chunk;
});
process.stdin.on('end', () => {
  let file;
  try {
    const input = JSON.parse(payload || '{}');
    file = input.tool_input?.file_path ?? input.tool_input?.path;
  } catch {
    process.exit(0);
  }
  if (!file) process.exit(0);

  const abs = resolve(process.cwd(), file);
  const rel = relative(QA_ROOT, abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || /^[A-Za-z]:/.test(rel) || !/\.(md|ts|js|cs|py|java|kt|json)$/.test(abs)) process.exit(0);
  if (!existsSync(abs) || !existsSync(LINT)) process.exit(0);

  const run = spawnSync(process.execPath, [LINT], { cwd: QA_ROOT, encoding: 'utf8' });
  // lint-qa prints `  ERROR <path relative to the QA root>: <message>`.
  const mine = (run.stdout ?? '')
    .split('\n')
    .filter((l) => l.startsWith(`  ERROR ${rel}:`) || l.startsWith(`  ERROR ./${rel}:`));
  if (mine.length === 0) process.exit(0);

  console.error(
    `qa:lint — ${mine.length} contract error(s) in ${rootPrefix(QA_ROOT)}/${rel}; fix before moving on:\n${mine.join('\n')}\n` +
      'These are shape errors (headings, ids, columns, vocabulary), not judgements about content. See .claude/CONTRACTS.md.',
  );
  process.exit(2);
});
