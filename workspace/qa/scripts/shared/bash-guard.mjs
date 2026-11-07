#!/usr/bin/env node
/**
 * bash-guard.mjs — PreToolUse hook on Bash: refuse what must never run unattended (CONTRACTS §25).
 *
 * A command that trips a rule exits 2 with the reason on stderr: Claude Code refuses the call and the
 * model reads why. Nothing an agent says lifts it; a human who means it runs it themselves.
 *
 * settings.json `permissions.deny` holds the same rules as globs, but a glob cannot see `git push -f`
 * written as `git push origin main --force`, or `rm -rf ~` written as `rm -r -f ~`. This parses the
 * command line, so the settings list is the first fence and this the second.
 *
 * Never throws: a hook that crashes must not block work. Exit 0 = allow, 2 = block.
 */

/** Each rule with the failure it prevents. Quoted text is checked too: `bash -c "rm -rf /"` is still rm. */
export const DENY = [
  { id: 'force-push', re: /\bgit\s+push\b(?=[^|;&]*\s(?:-f\b|--force\b|--force-with-lease\b|\+\S))/, why: 'a force push rewrites shared history' },
  { id: 'rm-root', re: /\brm\b(?=[^|;&]*\s-[a-z]*r)(?=[^|;&]*\s-[a-z]*f)[^|;&]*\s(?:\/|~|~\/|\.|\.\/|\*|\$HOME|"\/"|'\/'|"~"|"\$HOME")(?=\s|$|;|&|\||["'])/i, why: 'a recursive forced delete of /, ~, . or * removes the project or the machine' },
  { id: 'drop-database', re: /\bDROP\s+(?:DATABASE|SCHEMA)\b/i, why: 'dropping a database or schema is irreversible; test data is created and cleaned per case (§9)' },
  // SQL only: inside a client call or a quoted statement, so `grep TRUNCATE file` is not one.
  { id: 'truncate', re: /(?:\b(?:psql|mysql|sqlite3|sqlcmd|clickhouse-client)\b[^|;&]*|["'`]\s*)TRUNCATE\s+(?:TABLE\s+)?[`"']?\w/i, why: 'TRUNCATE deletes every row with no undo; a case cleans only what it created' },
  { id: 'reset-hard-remote', re: /\bgit\s+reset\s+--hard\s+(?:origin|upstream)\//, why: 'resetting to a remote discards local commits' },
  { id: 'no-verify', re: /\bgit\s+(?:commit|push)\b[^|;&]*\s--no-verify\b/, why: 'skipping hooks skips the commit and secret checks' },
  // A redirect, tee or sed -i into `.env` or `.env.<env>`; never `.env.example`, never `config.env.ts`.
  // `cp .env.example .env.<env>` stays allowed: preparing-test-tooling makes the empty file that way.
  { id: 'env-write', re: /(?:>>?|\btee\b(?:\s+-a)?|\bsed\s+-i\S*[^|;&]*)\s*["']?(?:[^\s|;&"']*\/)?\.env(?!\.(?:example|sample|template)\b)(?:\.[\w-]+)?["']?(?=\s|$|;|&|\|)/, why: 'credentials live in .env.<env>; an agent copies .env.example, never writes a value (preparing-test-tooling)' },
];

/** The first rule a command trips, or null. */
export const denied = (cmd) => DENY.find(({ re }) => re.test(String(cmd))) ?? null;

/** { exit, message? } for one hook payload. */
export function handle(input) {
  const cmd = input?.tool_input?.command;
  if (input?.tool_name !== 'Bash' || typeof cmd !== 'string') return { exit: 0 };
  const rule = denied(cmd);
  if (!rule) return { exit: 0 };
  return { exit: 2, message: `blocked by the stlc bash guard (${rule.id}): ${rule.why}. If a human really means it, they run it themselves. (CONTRACTS §25)` };
}

function main() {
  let payload = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { payload += c; });
  process.stdin.on('end', () => {
    let out = { exit: 0 };
    try { out = handle(JSON.parse(payload || '{}')); } catch { /* never block on a parse error */ }
    if (out.message) process.stderr.write(`${out.message}\n`);
    process.exit(out.exit);
  });
}

if (process.argv[1] && /(^|[\\/])bash-guard\.mjs$/.test(process.argv[1])) main();
