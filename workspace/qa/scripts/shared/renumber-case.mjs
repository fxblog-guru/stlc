#!/usr/bin/env node
/**
 * renumber-case.mjs — resolve a Case ID collision (CONTRACTS §1) by giving ONE case a new NNN.
 *
 *   node scripts/shared/renumber-case.mjs <case-file> [<new-id>] [--dry-run]
 *
 * Why it exists: TC NNN is "next free number in the module folder", so two branches that both add a
 * case to the same module mint the same id. Git merges both files without a conflict (their
 * short-desc differs); `qa:lint` then fails with "duplicate Case ID". The case to move is named by
 * its FILE, because the id alone is ambiguous at that moment.
 *
 * What it rewrites, and nothing else:
 *   - the case file (renamed; its H1 id rewritten)
 *   - its mirrored scripts under scripts/ (same basename, any extension; renamed; id occurrences
 *     inside rewritten — titles, caseMeta ids, `// Case:` markers)
 *   - the Case ID cell of traceability rows in plans/<feature>/*-test-plan.md, and of
 *     `re-verify:<feature>` rows in other features' plans; the id inside that plan's
 *     `## AC coverage` Case IDs lists
 *   - Case ID cells in scripts/unit/HANDOFF.md and scripts/mobile/HANDOFF.md for that staged path
 * It prints, never rewrites, the places that cannot be disambiguated mechanically (impact-map TC
 * cells, regression manifests, quarantine ledger, defect files): with two cases sharing an id, only
 * a person knows which one a row meant.
 *
 * <new-id> defaults to the next free NNN in the case's module folder. Run from the QA root (.stlc/ or qa/).
 * Exit 1 on bad input or when <new-id> is taken.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { STEM_ALT } from './lib/types.mjs';
import { trackRun } from './lib/runlog.mjs';

const CASE_FILE_RE = new RegExp(`^(TC-(${STEM_ALT})-([A-Z0-9-]+)-(\\d{3}))-([a-z0-9][a-z0-9-]*)\\.md$`);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const read = (p) => readFileSync(p, 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function nextFreeId(root, oldId) {
  const [, , stem, mod] = oldId.match(/^(TC-(\w+)-([A-Z0-9-]+))-\d{3}$/) ?? [];
  const prefix = `TC-${stem}-${mod}-`;
  let max = 0;
  for (const p of walk(join(root, 'cases'))) {
    const m = basename(p).match(CASE_FILE_RE);
    if (m && m[1].startsWith(prefix) && m[1].length === prefix.length + 3) max = Math.max(max, Number(m[4]));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Plan everything the renumber touches; `apply` writes it. Returns { oldId, newId, moves, edits, manual }. */
export function planRenumber(root, caseFile, wantedId) {
  const rel = caseFile.replace(/\\/g, '/').replace(/^\.\//, '');
  const abs = (existsSync(join(root, rel)) ? join(root, rel) : rel).replace(/\\/g, '/');
  const m = basename(rel).match(CASE_FILE_RE);
  if (!m || !existsSync(abs)) throw new Error(`not a case file: ${caseFile}`);
  const [, oldId, stem, mod, , desc] = m;
  const newId = wantedId ?? nextFreeId(root, oldId);
  if (!new RegExp(`^TC-${stem}-${esc(mod)}-\\d{3}$`).test(newId)) throw new Error(`${newId} must keep the type and module: TC-${stem}-${mod}-NNN`);
  if (newId === oldId) throw new Error('new id equals the old id');
  for (const p of walk(join(root, 'cases'))) if (basename(p).startsWith(`${newId}-`)) throw new Error(`${newId} is already taken by ${p}`);

  const text = read(abs);
  const feature = (text.match(/^\*\*Feature:\*\*\s*([a-z0-9][a-z0-9-]*)/m) || [])[1];
  const idRe = new RegExp(`\\b${esc(oldId)}\\b`, 'g');
  const moves = [];
  const edits = [];
  const manual = [];

  const caseRelDir = dirname(abs).replace(/\\/g, '/');
  moves.push({ from: abs, to: join(caseRelDir, `${newId}-${desc}.md`).replace(/\\/g, '/'), text: text.replace(new RegExp(`^(#\\s+)${esc(oldId)}\\b`, 'm'), `$1${newId}`) });

  // Mirrored scripts: same <type>/[<surface>/]<module>/ path under scripts/, same basename stem.
  const scriptDir = caseRelDir.replace(/(^|\/)cases\//, '$1scripts/');
  const oldBase = `${oldId}-${desc}.`;
  const stagedPaths = [];
  if (existsSync(scriptDir)) for (const name of readdirSync(scriptDir)) {
    if (!name.startsWith(oldBase)) continue;
    const from = join(scriptDir, name).replace(/\\/g, '/');
    moves.push({ from, to: join(scriptDir, name.replace(oldId, newId)).replace(/\\/g, '/'), text: read(from).replace(idRe, newId) });
    stagedPaths.push(from.slice(from.indexOf('scripts/')));
  }

  // Traceability: the case's own feature, plus re-verify rows that point at that feature.
  for (const p of walk(join(root, 'plans'))) {
    if (!/-test-plan\.md$/.test(p)) continue;
    const slug = p.replace(/\\/g, '/').split('/').at(-2);
    const t = read(p);
    let changed = 0;
    const out = t.split('\n').map((line) => {
      const cells = line.split('|').map((c) => c.trim());
      // `## AC coverage` rows (| AC | REQ | Case IDs | Status |) in the case's own plan: the id is
      // one of a comma list, and that plan's ids all belong to its feature.
      if (slug === feature && /^AC-\d{3,}$/.test(cells[1] ?? '') && (cells[3] ?? '').split(',').map((s) => s.trim()).includes(oldId)) {
        changed += 1;
        return line.replace(idRe, newId);
      }
      if (cells.length < 4 || cells[2] !== oldId) return line;
      const req = cells[1];
      const mine = slug === feature ? !req.startsWith('re-verify:') : req === `re-verify:${feature}`;
      if (!mine) return line;
      changed += 1;
      return line.replace(idRe, newId);
    }).join('\n');
    if (changed) edits.push({ path: p, text: out, note: `${changed} traceability / AC coverage row(s)` });
  }

  // Staged handoffs: the row whose staged script is the one we move.
  for (const hp of ['scripts/unit/HANDOFF.md', 'scripts/mobile/HANDOFF.md'].map((h) => join(root, h))) {
    if (!existsSync(hp)) continue;
    const t = read(hp);
    let changed = 0;
    const out = t.split('\n').map((line) => {
      if (!line.includes(oldId) || !stagedPaths.some((s) => line.includes(s))) return line;
      changed += 1;
      return line.replace(idRe, newId);
    }).join('\n');
    if (changed) edits.push({ path: hp, text: out, note: `${changed} handoff row(s)` });
  }

  // Ambiguous references: listed for a person.
  const ambiguous = [join(root, 'docs/impact-map.md'), join(root, 'regression/quarantine.md')];
  for (const p of walk(join(root, 'regression'))) if (/regression-suite/.test(p)) ambiguous.push(p);
  for (const p of walk(join(root, 'defects'))) if (p.endsWith('.md')) ambiguous.push(p);
  for (const p of ambiguous) {
    if (!existsSync(p)) continue;
    const lines = read(p).split('\n');
    lines.forEach((l, i) => { if (idRe.test(l)) manual.push(`${p.replace(/\\/g, '/')}:${i + 1}`); idRe.lastIndex = 0; });
  }
  return { oldId, newId, feature, moves, edits, manual };
}

export function applyRenumber(plan) {
  for (const mv of plan.moves) { writeFileSync(mv.from, mv.text); renameSync(mv.from, mv.to); }
  for (const e of plan.edits) writeFileSync(e.path, e.text);
}

const isMain = process.argv[1] && basename(process.argv[1]) === 'renumber-case.mjs';
if (isMain) trackRun(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const [file, wanted] = args.filter((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node scripts/shared/renumber-case.mjs <case-file> [<new-id>] [--dry-run]'); process.exit(1); }
  try {
    const plan = planRenumber('.', file, wanted);
    console.log(`${plan.oldId} → ${plan.newId} (feature ${plan.feature ?? '?'})${dry ? ' — dry run' : ''}`);
    for (const mv of plan.moves) console.log(`  rename  ${mv.from} → ${mv.to}`);
    for (const e of plan.edits) console.log(`  rewrite ${e.path} (${e.note})`);
    for (const m of plan.manual) console.log(`  CHECK   ${m} — names ${plan.oldId}; decide by hand which case it meant`);
    if (!dry) applyRenumber(plan);
    console.log(dry ? 'Nothing written.' : 'Done. Run npm run qa:lint.');
  } catch (e) {
    console.error(`renumber-case: ${e.message}`);
    process.exit(1);
  }
}
