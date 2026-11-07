#!/usr/bin/env node
// coverage-summary.mjs — turn a coverage report into the byte-exact coverage-summary.md table
// (CONTRACTS §11): | Module | Files | Line % | Branch % | Target | Verdict |
// Read-only. No dependencies. Formats: cobertura (xml), lcov (info), jacoco (xml), istanbul-json.
// Usage: node scripts/unit/coverage-summary.mjs --report <file> --format <fmt> --out <md>
//        [--modules billing,orders] [--branch-min 80] [--line-min 90] [--depth 2]
// "Module" = the first <depth> path segments after the repo's src-like root (src/, app/, lib/,
// Sources/, or the first segment) — pass --modules to restrict/label rows; unmatched files roll
// up into "(other)". A file with 0 branches reports Branch % as "n/a" and is excluded from the
// branch aggregate. Missing report → writes a "not evaluable" table and exits 0 (honest gap).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
  return acc;
}, []));
const report = args.report, format = (args.format || "").toLowerCase(), out = args.out || "coverage-summary.md";
const modules = args.modules ? args.modules.split(",").map((s) => s.trim()).filter(Boolean) : null;
const branchMin = args["branch-min"] !== undefined ? Number(args["branch-min"]) : null;
const lineMin = args["line-min"] !== undefined ? Number(args["line-min"]) : null;
const depth = Number(args.depth || 1);

const HEADER = "| Module | Files | Line % | Branch % | Target | Verdict |\n|---|---|---|---|---|---|\n";
const target = `${lineMin !== null ? `line ≥ ${lineMin}%` : "line n/a"} · ${branchMin !== null ? `branch ≥ ${branchMin}%` : "branch n/a"}`;

function notEvaluable(reason) {
  const md = `# Coverage summary\n\n<!-- ${reason} -->\n\n${HEADER}| (all) | 0 | not evaluable | not evaluable | ${target} | not evaluable — ${reason} |\n`;
  writeFileSync(out, md); console.log(`coverage-summary: not evaluable — ${reason} → ${out}`); process.exit(0);
}
if (!report || !existsSync(report)) notEvaluable(`report not found: ${report}`);
if (!["cobertura", "lcov", "jacoco", "istanbul-json"].includes(format)) notEvaluable(`unknown format: ${format}`);

// ── parse → [{file, lf, lh, bf, bh}] ─────────────────────────────────────────
const text = readFileSync(report, "utf8");
const files = [];
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : undefined; };

if (format === "lcov") {
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) cur = { file: line.slice(3).trim(), lf: 0, lh: 0, bf: 0, bh: 0 };
    else if (!cur) continue;
    else if (line.startsWith("LF:")) cur.lf = +line.slice(3);
    else if (line.startsWith("LH:")) cur.lh = +line.slice(3);
    else if (line.startsWith("BRF:")) cur.bf = +line.slice(4);
    else if (line.startsWith("BRH:")) cur.bh = +line.slice(4);
    else if (line.startsWith("end_of_record")) { files.push(cur); cur = null; }
  }
} else if (format === "cobertura") {
  // <class name=".." filename=".." line-rate=".." branch-rate=".."> … <lines><line number branch condition-coverage="50% (1/2)">
  const classRe = /<class\b[^>]*>([\s\S]*?)<\/class>|<class\b[^>]*\/>/g;
  let m;
  while ((m = classRe.exec(text))) {
    const open = m[0].match(/<class\b[^>]*>/)[0];
    const file = attr(open, "filename"); if (!file) continue;
    const body = m[1] || "";
    let lf = 0, lh = 0, bf = 0, bh = 0;
    const lineRe = /<line\b[^>]*>/g; let l;
    while ((l = lineRe.exec(body))) {
      lf++; if (Number(attr(l[0], "hits") || 0) > 0) lh++;
      const cc = attr(l[0], "condition-coverage"); // "50% (1/2)"
      const frac = cc && cc.match(/\((\d+)\/(\d+)\)/);
      if (frac) { bh += +frac[1]; bf += +frac[2]; }
    }
    if (lf === 0) { // no <line> detail → fall back to rates (treat as 100-line normalized)
      const lr = Number(attr(open, "line-rate") ?? NaN), br = Number(attr(open, "branch-rate") ?? NaN);
      if (!Number.isNaN(lr)) { lf = 100; lh = Math.round(lr * 100); }
      if (!Number.isNaN(br)) { bf = 100; bh = Math.round(br * 100); }
    }
    const existing = files.find((f) => f.file === file);
    if (existing) { existing.lf += lf; existing.lh += lh; existing.bf += bf; existing.bh += bh; }
    else files.push({ file, lf, lh, bf, bh });
  }
} else if (format === "jacoco") {
  // <package name="com/acme/billing"><sourcefile name="PriceCalculator.java"><counter type="LINE" missed covered/><counter type="BRANCH" …/>
  const pkgRe = /<package\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g; let p;
  while ((p = pkgRe.exec(text))) {
    const sfRe = /<sourcefile\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g; let s;
    while ((s = sfRe.exec(p[2]))) {
      const rec = { file: `${p[1]}/${s[1]}`, lf: 0, lh: 0, bf: 0, bh: 0 };
      const cRe = /<counter\b[^>]*>/g; let c;
      while ((c = cRe.exec(s[2]))) {
        const type = attr(c[0], "type"), missed = +attr(c[0], "missed"), covered = +attr(c[0], "covered");
        if (type === "LINE") { rec.lf = missed + covered; rec.lh = covered; }
        if (type === "BRANCH") { rec.bf = missed + covered; rec.bh = covered; }
      }
      files.push(rec);
    }
  }
} else if (format === "istanbul-json") {
  // coverage-final.json: { "<abs path>": { s:{id:hits}, b:{id:[hits,...]}, ... } }  or coverage-summary.json
  const j = JSON.parse(text);
  for (const [file, d] of Object.entries(j)) {
    if (d && d.lines && typeof d.lines.total === "number") { // coverage-summary.json shape
      if (file === "total") continue;
      files.push({ file, lf: d.lines.total, lh: d.lines.covered, bf: d.branches?.total ?? 0, bh: d.branches?.covered ?? 0 });
    } else if (d && d.s) { // coverage-final.json shape
      const s = Object.values(d.s), b = Object.values(d.b || {}).flat();
      files.push({ file, lf: s.length, lh: s.filter((h) => h > 0).length, bf: b.length, bh: b.filter((h) => h > 0).length });
    }
  }
}
if (files.length === 0) notEvaluable("report parsed but contained no file records");

// ── group into modules ───────────────────────────────────────────────────────
const ROOTS = ["src", "app", "lib", "Sources", "source", "main/java", "main/kotlin"];
function moduleOf(file) {
  const norm = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (modules) { const hit = modules.find((m) => norm.toLowerCase().includes(m.toLowerCase())); return hit || "(other)"; }
  const parts = norm.split("/").filter(Boolean);
  let start = 0;
  for (const r of ROOTS) { const rp = r.split("/"); const idx = parts.findIndex((_, i) => rp.every((seg, k) => parts[i + k] === seg)); if (idx >= 0) { start = idx + rp.length; break; } }
  const segs = parts.slice(start, start + depth);
  return segs.length ? segs.join("/") : parts[0] || "(root)";
}
const groups = new Map();
for (const f of files) {
  const key = moduleOf(f.file);
  const g = groups.get(key) || { files: 0, lf: 0, lh: 0, bf: 0, bh: 0 };
  g.files++; g.lf += f.lf; g.lh += f.lh; g.bf += f.bf; g.bh += f.bh; groups.set(key, g);
}
const pct = (h, f) => (f === 0 ? null : Math.round((h / f) * 1000) / 10);
const fmt = (v) => (v === null ? "n/a" : `${v.toFixed(1)}`);
function verdict(lp, bp) {
  const checks = [];
  if (lineMin !== null) checks.push(lp === null ? "line not evaluable" : lp >= lineMin ? "line ✅" : `line ❌ (${fmt(lp)} < ${lineMin})`);
  if (branchMin !== null) checks.push(bp === null ? "branch n/a" : bp >= branchMin ? "branch ✅" : `branch ❌ (${fmt(bp)} < ${branchMin})`);
  if (checks.length === 0) return "not evaluable (no thresholds)";
  return checks.join(" · ");
}
let rows = "", tot = { files: 0, lf: 0, lh: 0, bf: 0, bh: 0 };
for (const [key, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const lp = pct(g.lh, g.lf), bp = pct(g.bh, g.bf);
  rows += `| ${key} | ${g.files} | ${fmt(lp)} | ${fmt(bp)} | ${target} | ${verdict(lp, bp)} |\n`;
  tot.files += g.files; tot.lf += g.lf; tot.lh += g.lh; tot.bf += g.bf; tot.bh += g.bh;
}
const tlp = pct(tot.lh, tot.lf), tbp = pct(tot.bh, tot.bf);
rows += `| (all) | ${tot.files} | ${fmt(tlp)} | ${fmt(tbp)} | ${target} | ${verdict(tlp, tbp)} |\n`;
const md = `# Coverage summary\n\n<!-- source: ${report} (${format}); modules: ${modules ? modules.join(", ") : `auto (depth ${depth})`}; generated by coverage-summary.mjs -->\n\n${HEADER}${rows}`;
writeFileSync(out, md);
console.log(`coverage-summary: ${groups.size} module(s), ${tot.files} file(s) → line ${fmt(tlp)}% · branch ${fmt(tbp)}% → ${out}`);
