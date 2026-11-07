/**
 * Shared document primitives for QA linter, state builder, and reviewers.
 *
 * Provides front matter parsing, body-only hashing, markdown table reading,
 * and artifact hashing adhering to CONTRACTS.md.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Normalisation before hashing.
 * CRLF folded to LF, trailing whitespace per line trimmed, trailing newlines normalized.
 */
export function normalise(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n');
}

export function sha256(text) {
  return createHash('sha256').update(normalise(text), 'utf8').digest('hex');
}

/**
 * Split a document into front matter and body.
 * Front matter is the opening `---` block. Body is everything after it.
 */
export function parseDoc(text) {
  const src = normalise(text);
  if (!src.startsWith('---\n')) {
    return { frontMatter: {}, hasFrontMatter: false, body: src, bodyHash: sha256(src) };
  }
  const end = src.indexOf('\n---', 4);
  if (end === -1) {
    return { frontMatter: {}, hasFrontMatter: false, body: src, bodyHash: sha256(src) };
  }
  const raw = src.slice(4, end);
  const body = src.slice(src.indexOf('\n', end + 1) + 1);
  return {
    frontMatter: parseFrontMatter(raw),
    hasFrontMatter: true,
    rawFrontMatter: raw,
    body,
    bodyHash: sha256(body),
  };
}

export function readDoc(path) {
  return parseDoc(readFileSync(path, 'utf8'));
}

/**
 * A small YAML subset: scalars, inline maps/sequences, and lists of maps.
 */
export function parseFrontMatter(raw) {
  const out = {};
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }

    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) {
      out.__unparsed__ = (out.__unparsed__ ?? []).concat(line);
      i += 1;
      continue;
    }

    const [, key, rest] = match;

    if (rest.trim() === '') {
      const items = [];
      i += 1;
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const item = {};
        const first = /^\s*-\s*(.*)$/.exec(lines[i])[1];
        applyPair(item, first);
        i += 1;
        while (i < lines.length && /^\s{4,}\S/.test(lines[i]) && !/^\s*-\s/.test(lines[i])) {
          applyPair(item, lines[i].trim());
          i += 1;
        }
        items.push(item);
      }
      out[key] = items.length ? items : null;
      continue;
    }

    out[key] = parseScalar(rest.trim());
    i += 1;
  }

  return out;
}

function applyPair(target, text) {
  const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(text);
  if (m) target[m[1]] = parseScalar(m[2].trim());
}

function parseScalar(value) {
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;

  if (value.startsWith('{') && value.endsWith('}')) {
    const obj = {};
    for (const part of splitTop(value.slice(1, -1))) {
      const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(part);
      if (m) obj[m[1]] = parseScalar(m[2].trim());
    }
    return obj;
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitTop(inner).map((v) => parseScalar(v.trim())) : [];
  }

  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  if (/^-?\d{1,15}$/.test(value)) return Number(value);

  return value;
}

function splitTop(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Read a GitHub-flavoured markdown table under a given `## heading` into row objects keyed by
 * column name.
 */
export function readTable(body, heading) {
  const lines = body.split('\n');
  const target = heading.trim().toLowerCase();
  let start = lines.findIndex((l) => l.trim().replace(/^#{1,6}\s+/, '').toLowerCase() === target);
  if (start === -1) {
    return [];
  }

  const rows = [];
  let headers = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) {
      headers = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (cells.every((c) => c === '')) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

/** Strip markdown emphasis and backticks from a cell so ids compare cleanly. */
export function plain(cell) {
  return String(cell ?? '')
    .replace(/[`*_]/g, '')
    .trim();
}

/**
 * Hash an artifact: markdown uses bodyHash (excluding front matter), non-markdown hashes whole file.
 */
export function hashArtifact(path) {
  const text = readFileSync(path, 'utf8');
  return path.toLowerCase().endsWith('.md') ? parseDoc(text).bodyHash : sha256(normalise(text));
}
