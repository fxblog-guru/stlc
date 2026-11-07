/**
 * lesson-scan.mjs — is this text safe to put in an agent's prompt? (CONTRACTS §23, lesson safety)
 *
 * A lesson is recalled into the prompt of every skill whose type, module or name it applies to, so a
 * poisoned lesson is a standing prompt injection. Four categories are refused, each a list of rules:
 *
 *   injection     text that tries to steer the reader: "ignore previous instructions", "you are now…",
 *                 "reveal the system prompt", "new instructions:", "act as if you…", chat-role markers
 *   exfiltration  text that tells the reader to move a secret out: curl/wget/fetch with a key or token
 *                 variable, send/post/upload credentials to a URL, read .env / .netrc / ~/.ssh / .aws
 *   secret        a credential itself: cloud, git-host, chat and model-API key shapes, private keys,
 *                 JWTs, `password=<value>` assignments
 *   unicode       invisible and bidi characters (zero-width, bidi embeddings and isolates, BOM, tag
 *                 characters): text that reads one way to a human and another to a model
 *
 * Pure: no I/O. A finding never carries the matched text — only the rule, the line and, for a secret,
 * a redacted shape — so reporting a poisoned lesson never re-injects it.
 */

const SECRET_NOUN = String.raw`(?:api[\s_-]?keys?|access[\s_-]?keys?|secret[\s_-]?keys?|private[\s_-]?keys?|access[\s_-]?tokens?|auth[\s_-]?tokens?|bearer[\s_-]?tokens?|refresh[\s_-]?tokens?|passwords?|passwd|secrets?|credentials?|env(?:ironment)?\s+var(?:iable)?s|\.env\b|process\.env|\$env:|\$\{?[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIALS?)\b)`;
const URL = String.raw`(?:https?|ftp|wss?):\/\/\S+`;

/** @type {Record<string, Array<{ id: string, re: RegExp }>>} */
export const RULES = {
  injection: [
    { id: 'ignore-previous', re: /\b(?:ignore|disregard|forget|skip|override)\s+(?:all\s+|any\s+|the\s+|your\s+|of\s+)*(?:previous|prior|above|earlier|preceding|former|original|existing)\s+(?:instructions?|prompts?|rules|directions|messages|context|guidance)\b/i },
    { id: 'disregard-rules', re: /\b(?:disregard|ignore|override|bypass)\s+(?:all\s+|any\s+|of\s+)?(?:your|the|these|those|its|my)\s+(?:instructions|rules|guidelines|guardrails|safety\s+rules|policies|system\s+prompt)\b/i },
    { id: 'role-hijack', re: /\byou\s+are\s+(?:now|no\s+longer)\s+(?:a|an|the|in|my|DAN|free|unrestricted|jailbroken|bound|required|allowed)\b/i },
    { id: 'system-prompt', re: /\b(?:reveal|print|show|repeat|leak|output|dump|override|ignore|bypass|change|replace|new|your|my|real|hidden)\s+(?:the\s+|this\s+)?system\s+(?:prompt|message)\b|\bsystem\s+prompt\s*(?:override|:)/i },
    { id: 'new-instructions', re: /\b(?:new|updated|real|actual|secret|hidden)\s+instructions?\s*[:!-]|\b(?:here\s+are|follow)\s+(?:your|these|the)\s+new\s+instructions\b/i },
    { id: 'act-as', re: /\b(?:act|behave|respond|answer)\s+as\s+(?:if|though)\s+you\b|\b(?:act|behave)\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|uncensored|evil)\b|\bpretend\s+(?:to\s+be|you\s+are|that\s+you)\b/i },
    { id: 'conceal', re: /\b(?:do\s+not|don't|never)\s+(?:tell|inform|mention\s+(?:this\s+)?to|show\s+(?:this\s+)?to)\s+the\s+(?:user|human|reviewer|operator)\b|\bwithout\s+(?:telling|informing)\s+the\s+(?:user|human|reviewer)\b/i },
    { id: 'role-marker', re: /<\|im_(?:start|end)\|>|\[\/?INST\]|<\/?(?:system|assistant|instructions?)>|^\s*#{0,3}\s*(?:system|assistant)\s*:\s/im },
  ],
  exfiltration: [
    { id: 'http-tool-with-secret', re: new RegExp(String.raw`\b(?:curl|wget|fetch|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|nc|ncat|scp)\b[^\n]{0,200}?${SECRET_NOUN}`, 'i') },
    { id: 'send-secret-to-url', re: new RegExp(String.raw`\b(?:send|post|upload|exfiltrate|forward|leak|transmit|email|mail|pipe|copy)\b[^\n]{0,120}?${SECRET_NOUN}[^\n]{0,120}?${URL}|\b(?:send|post|upload|exfiltrate|forward|leak|transmit|email|mail)\b[^\n]{0,40}?${URL}[^\n]{0,120}?${SECRET_NOUN}`, 'i') },
    // The secret file is the verb's argument (`cat .env`, `read the ~/.aws/credentials`), so prose that
    // merely names `.env.<env>` or copies `.env.example` is left alone.
    { id: 'read-secret-file', re: /\b(?:cat|type|read|open|print|dump|less|more|head|tail|Get-Content|gc|base64|source|upload|attach|paste)\s+(?:-\S+\s+)*(?:(?:the|your|its|their|all|every)\s+)?['"`]?[^\s'"`|]*?(?:(?<=^|[\s'"`/\\$~:])\.env(?:\.(?:local|prod|production|staging|uat|dev))?(?![\w.<-])|\.netrc\b|\.pgpass\b|\.git-credentials\b|credentials\.(?:json|ya?ml|txt|csv)\b|\.aws[\\/]credentials|\.ssh[\\/]|\bid_(?:rsa|ed25519|ecdsa)\b|authorized_keys\b|\/etc\/(?:passwd|shadow)\b)/i },
    { id: 'dump-environment', re: /\bprintenv\b|\b(?:print|log|echo|dump|output|reveal|send|post)\b[^\n]{0,30}?(?:process\.env\b(?![.[])|os\.environ\b(?![.[])|\$env:\*|all\s+(?:the\s+)?environment\s+variables)/i },
  ],
  secret: [
    { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
    { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
    { id: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
    { id: 'model-api-key', re: /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/ },
    { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
    { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
    { id: 'private-key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
    { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
    { id: 'bearer-value', re: /\bBearer\s+(?=[A-Za-z0-9._~+/-]*\d)(?=[A-Za-z0-9._~+/-]*[A-Za-z])[A-Za-z0-9._~+/-]{24,}=*/ },
    { id: 'secret-assignment', re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"]?(?=[^\s'"<>]*\d)(?=[^\s'"<>]*[A-Za-z])[^\s'"<>]{8,}/i },
  ],
  unicode: [
    { id: 'invisible-or-bidi', re: new RegExp(String.raw`[\u{200B}-\u{200F}\u{2060}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}\u{E0000}-\u{E007F}]`, 'u') },
  ],
};

export const CATEGORIES = Object.keys(RULES);

const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const codepoint = (s) => `U+${s.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Every rule a text trips, at most one finding per rule: { category, rule, line, shape? }.
 * `shape` is the safe description of what matched (a code point, a redacted secret); never the text.
 */
export function scanText(text, { categories = CATEGORIES } = {}) {
  const src = String(text ?? '');
  const out = [];
  for (const category of categories) {
    for (const { id, re } of RULES[category] ?? []) {
      const m = re.exec(src);
      if (!m) continue;
      const f = { category, rule: id, line: lineAt(src, m.index) };
      if (category === 'unicode') f.shape = codepoint([...m[0]][0]);
      if (category === 'secret') f.shape = `${m[0].slice(0, 4)}… (${m[0].length} chars)`;
      out.push(f);
    }
  }
  return out;
}

const flat = (v) => (Array.isArray(v) ? v.map(flat).join('\n') : v && typeof v === 'object' ? Object.values(v).map(flat).join('\n') : String(v ?? ''));

/**
 * A lesson's findings, each naming the field it came from: every front-matter key, then `body`.
 * Input is what learnings.mjs loads: { fm, body }. Returns [{ field, category, rule, line, shape? }].
 */
export function scanLesson({ fm = {}, body = '' } = {}, opts) {
  const out = [];
  for (const [k, v] of Object.entries(fm ?? {})) {
    for (const { line, ...f } of scanText(flat(v), opts)) out.push({ field: k, ...f });
  }
  for (const f of scanText(body, opts)) out.push({ field: 'body', ...f });
  return out;
}

/** One finding as a line a human or an agent can act on, without the payload: `body:4 — injection (ignore-previous)`. */
export const describe = (f) => `${f.field ?? 'text'}${f.line ? `:${f.line}` : ''} — ${f.category} (${f.rule}${f.shape ? `, ${f.shape}` : ''})`;
