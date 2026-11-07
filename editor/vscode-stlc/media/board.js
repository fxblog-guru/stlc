// @ts-check
/**
 * The page behind both webviews: the sidebar Overview (`data-layout="sidebar"`, narrow, tabbed
 * Summary · Activity · Decisions · Findings · Needs you · Runs · Defects · Coverage) and the Board
 * tab (`data-layout="page"`, wide, one scroll).
 *
 * It receives a view model from the extension (`viewmodel.ts`, `live.ts`) and draws it. It owns
 * nothing but the reader's place — feature, tab, matrix cell — kept across refreshes with the
 * webview state API. The only clock it keeps is the one that re-words "2 min ago".
 *
 * Every state is an icon, a colour and a word together; colour alone never carries one. Buttons
 * that run something (Run, Dry-run, a trace, the bundle update) only ask the host, which shows the
 * exact command and waits for the reader to confirm.
 */
(function () {
  const vscode = acquireVsCodeApi();
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  const layout = document.body.dataset.layout === 'sidebar' ? 'sidebar' : 'page';
  const T = /** @type {any} */ (window).StlcTime;

  /** @type {{slug?: string, tab: string, view: string, cell?: string}} */
  const ui = Object.assign({ tab: 'now', view: 'board' }, vscode.getState() || {});
  /** @type {any} */
  let vm = null;
  /** Whether the host feeds the Agents tab (agents.js), and how many agents are working now. */
  let agentsOn = false;
  let agentsRunning = /** @type {number | null} */ (null);
  const AV = /** @type {any} */ (window).AgentsView;
  if (AV)
    AV.init(vscode, (n) => {
      agentsRunning = n;
      for (const el of document.querySelectorAll('[data-ag-count]')) {
        el.textContent = n ? String(n) : '';
        el.classList.toggle('on', !!n);
      }
    });
  const agentsTab = () => agentsOn && !!AV;
  const agentsCount = () => `<span class="n ag-count ${agentsRunning ? 'on' : ''}" data-ag-count>${agentsRunning || ''}</span>`;
  /** Hand the Agents tab its element after a redraw, or tell it it is hidden. */
  const mountAgents = () => AV && AV.mount(document.getElementById('ag-mount'));
  /** Activity keys already drawn, so a new event can be marked as it arrives. */
  let seen = /** @type {Set<string> | null} */ (null);
  const save = () => vscode.setState(ui);

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const ago = (at) => (T ? T.relativeTime(at) : '');
  const when = (at, cls = '') =>
    `<time class="when ${cls}" data-at="${esc(at)}" title="${esc(typeof at === 'number' ? new Date(at).toLocaleString() : at)}">${esc(ago(at))}</time>`;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const LIVE_WINDOW_MS = 10 * 60 * 1000;

  /** Step state → [icon, class]. The word comes from the view model. */
  const STEP = {
    pass: ['✓', 'st-pass'],
    stale: ['↻', 'st-stale'],
    changes: ['!', 'st-changes'],
    blocked: ['⊘', 'st-blocked'],
    failed: ['✕', 'st-failed'],
    running: ['▶', 'st-running'],
    partial: ['◐', 'st-partial'],
    idle: ['○', 'st-idle'],
  };
  /** Matrix cell → [icon, word]. */
  const CELL = {
    pass: ['✓', 'pass'],
    fail: ['✕', 'fail'],
    blocked: ['⊘', 'blocked'],
    handoff: ['⇄', 'handoff'],
    partial: ['◐', 'partly run'],
    'not-run': ['○', 'not run'],
    none: ['', 'no case'],
    disabled: ['–', 'disabled'],
  };
  const ACTION = { next: ['➜', 'accent'], stale: ['↻', 'warn'], changes: ['!', 'warn'], blocked: ['⊘', 'bad'], failed: ['✕', 'bad'], defects: ['⛔', 'bad'], quarantine: ['⏳', 'warn'], continue: ['▶', 'accent'], done: ['✓', 'ok'] };
  const SEV = { Critical: ['⛔', 'sev-critical'], High: ['▲', 'sev-high'], Medium: ['●', 'sev-medium'], Low: ['▽', 'sev-low'], Unrated: ['?', 'sev-unrated'] };
  const ACT = { commit: ['●', 'k-commit'], run: ['▶', 'k-verify'], failures: ['✕', 'k-decision'], report: ['✓', 'k-gate'], defect: ['!', 'k-decision'], 'run-plan': ['≡', 'k-lane'], quarantine: ['⏳', 'k-decision'], state: ['↻', 'k-state'], finding: ['◇', 'k-decision'], heal: ['✚', 'k-task'], lesson: ['✎', 'k-gate'], stop: ['■', 'k-decision'], clarify: ['?', 'k-decision'] };
  const FIND = { defect: 'defect', flaky: 'flaky', failure: 'new failure', quarantine: 'quarantined' };
  /** Platform row labels: whole words on the board, short ones at sidebar width (full name in the tooltip). */
  const PLAT_SHORT = { android: 'andr', windows: 'win', macos: 'mac' };
  const platLabel = (id) => {
    const bare = id.replace(/^other:/, '');
    return layout === 'sidebar' ? PLAT_SHORT[bare] ?? bare.slice(0, 5) : bare;
  };
  const TYPE_SHORT = { api: 'api', integration: 'int', e2e: 'e2e', ui: 'ui', security: 'sec', performance: 'perf', accessibility: 'a11y', mobile: 'mob', unit: 'unit' };

  function cmd(text) {
    return `<span class="cmd"><code>${esc(text)}</code><button class="copy" data-copy="${esc(text)}" title="Copy command" aria-label="Copy ${esc(text)}">⧉</button></span>`;
  }
  function section(title, count, body, extra = '', id = '') {
    return `<section class="sec" ${id ? `id="${id}"` : ''}><header class="sec-head"><h2>${title}</h2>${count != null ? `<span class="count">${count}</span>` : ''}<span class="spacer"></span>${extra}</header>${body}</section>`;
  }
  function empty(icon, title, text, cls = '') {
    return `<div class="empty-state ${cls}"><span class="es-icon" aria-hidden="true">${icon}</span><div><strong>${title}</strong><p>${text}</p></div></div>`;
  }
  function link(label, path, cls = 'link') {
    return path ? `<button class="${cls}" data-path="${esc(path)}" title="${esc(path)}">${label}</button>` : '';
  }

  // ---- header ---------------------------------------------------------------------------------

  function isLive() {
    const last = vm.live && vm.live.last;
    return !!(vm.live && vm.live.watching && last && Date.now() - last.at < LIVE_WINDOW_MS);
  }

  function livePill() {
    if (!vm.live || !vm.live.watching) return '';
    const on = isLive();
    return `<span class="live ${on ? 'on' : 'idle'}" title="${on ? 'Files are changing — the board redraws as they are written.' : 'Watching for changes. Nothing has moved in the last 10 minutes.'}"><span class="pulse" aria-hidden="true"></span>${on ? 'Live' : 'Watching'}</span>`;
  }

  function versionPill() {
    const v = vm.version;
    if (!v) return '';
    const u = v.update;
    const bundle = v.bundle ? `qa v${esc(v.bundle)}` : v.builder ? `builder v${esc(v.builder)}` : '';
    const parts = [v.board ? `board v${esc(v.board)}` : '', bundle].filter(Boolean);
    const tip = `VS Code board ${v.board || '?'} · agentic-fx-qa bundle ${v.bundle ?? '?'}${v.bundleSource ? ` (from ${v.bundleSource === 'manifest' ? '.claude/.agentic-fx.json' : v.bundleSource})` : ''} · state builder ${v.builder || '?'}`;
    if (u) {
      return `<button class="version-pill update ${u.kind === 'major' ? 'major' : ''}" data-update title="${esc(`${tip}\n${u.label} available — click for the CHANGELOG, the update command or to dismiss`)}"><span class="up" aria-hidden="true">${u.kind === 'major' ? '⚠' : '↑'}</span>${esc(u.label)}</button>`;
    }
    return parts.length ? `<span class="version-pill" title="${esc(tip)}">${parts.join(' · ')}</span>` : '';
  }

  function lastEvent() {
    const last = vm.live && vm.live.last;
    if (!last) return '';
    return `<div class="last-event" title="${esc(last.detail ?? '')}"><span class="label">Last event</span><span class="what">${esc(last.title)}</span>${when(last.at)}</div>`;
  }

  function header() {
    const banner = vm.staleFiles.length
      ? `<div class="banner warn" role="status"><span class="b-icon" aria-hidden="true">↻</span><div>The index may be out of date — ${plural(vm.staleFiles.length, 'file')} changed after it was built. ${
          vm.live && vm.live.ahead ? 'Runs, reports and defects marked <span class="tag live-tag">inferred</span> are read from the files directly.' : ''
        } The Stop hook rebuilds it; or run <code>node qa/scripts/shared/build-state.mjs</code>.${layout === 'page' ? `<span class="files">${esc(vm.staleFiles.slice(0, 3).join(' · '))}${vm.staleFiles.length > 3 ? ' …' : ''}</span>` : ''}</div></div>`
      : vm.live && vm.live.ahead
        ? `<div class="banner info" role="status"><span class="b-icon" aria-hidden="true">◉</span><div>Showing files newer than the index. Anything marked <span class="tag live-tag">inferred</span> comes straight from the files; the next rebuild confirms it.</div></div>`
        : '';
    const branch = vm.live && vm.live.branch ? `<span class="branch" title="branch${vm.live.head ? ` @ ${esc(vm.live.head)}` : ''}"><span aria-hidden="true">⎇</span>${esc(vm.live.branch)}${vm.live.head && layout === 'page' ? ` <span class="sha">${esc(vm.live.head)}</span>` : ''}</span>` : '';
    return `<header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true">✓</span>
          <div class="brand-text"><div class="project">${esc(vm.project)}</div>
          <div class="meta">${branch}<span class="built" title="generated ${esc(vm.generatedAt)}">index ${when(vm.generatedAt)}</span>${layout === 'page' ? '' : versionPill()}</div></div>
        </div>
        <div class="top-right">${layout === 'page' ? versionPill() : ''}${livePill()}</div>
      </header>
      ${lastEvent()}
      ${banner}`;
  }

  function envStrip() {
    if (!vm.environments.length) return '';
    return `<div class="envs">${vm.environments
      .map((e) => {
        const vs = e.verdicts.map((v) => `<span class="v-${esc(v.verdict.replace(/\s+/g, '-'))}" title="${esc(v.type)}: ${esc(v.verdict)}">${v.verdict === 'READY' ? '✓' : '✕'} ${esc(TYPE_SHORT[v.type] ?? v.type)}</span>`).join(' ');
        const stale = e.stale ? ' <span class="tag" style="color:var(--warn)">stale</span>' : e.stale === null ? ' <span class="muted small" title="The check recorded no input hashes (§18)">unhashed</span>' : '';
        return `<button class="env" data-path="${esc(e.path)}" title="newest env check ${esc(e.runId)}"><span class="name">${esc(e.env)}</span>${vs}${stale}</button>`;
      })
      .join('')}</div>`;
  }

  function featureSwitch() {
    if (vm.features.length < 2) return '';
    if (layout === 'sidebar') {
      return `<select id="slug" class="select" aria-label="Feature">${vm.features.map((f) => `<option value="${esc(f.slug)}" ${f.slug === ui.slug ? 'selected' : ''}>${esc(f.slug)} — ${esc(f.phase)}</option>`).join('')}</select>`;
    }
    return `<div class="tabs" role="tablist">${vm.features
      .map((f) => {
        const cur = f.steps.find((s) => s.key === f.current);
        return `<button class="tab ${f.slug === ui.slug ? 'selected' : ''}" data-slug="${esc(f.slug)}" role="tab" aria-selected="${f.slug === ui.slug}">
          <strong>${esc(f.slug)}</strong><span class="muted small">${esc(f.phase)}${f.inFlight && cur ? ` · ${esc(cur.label)}` : ''}</span>${caseBar(f, 'tiny')}
        </button>`;
      })
      .join('')}</div>`;
  }

  // ---- hero, pipeline, KPIs ---------------------------------------------------------------------

  function caseBar(f, cls = '') {
    const c = f.cases;
    const total = c.designed || 1;
    const seg = (n, k, t) => (n ? `<span class="${k}" style="width:${(n / total) * 100}%" title="${t} ${n}"></span>` : '');
    return `<div class="bar ${cls}" role="img" aria-label="${c.passed} of ${c.designed} cases passed">${seg(c.passed, 's-done', 'passed')}${seg(Math.max(0, c.scripted - c.passed - c.failed - c.blocked), 's-in-progress', 'scripted, not passed')}${seg(c.failed, 's-blocked', 'failed')}</div>`;
  }

  function ring(n, d, size) {
    const p = pct(n, d);
    const r = 20;
    const c = 2 * Math.PI * r;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="${p}% of designed cases passed">
      <circle class="track" cx="24" cy="24" r="${r}" />
      <circle class="fill" cx="24" cy="24" r="${r}" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 24 24)" />
      <text x="24" y="24" dy="0.36em" text-anchor="middle">${p}<tspan class="pct">%</tspan></text>
    </svg>`;
  }

  function stepChip(s) {
    const [icon, cls] = STEP[s.state] ?? STEP.idle;
    const tag = s.live ? `<span class="tag live-tag" title="${esc(s.live.note)}">inferred</span>` : '';
    return `<span class="chip-state ${cls}"><span aria-hidden="true">${icon}</span>${esc(s.word)}</span>${tag}`;
  }

  function stepTip(s) {
    return [`${s.label} — ${s.word}`, s.detail, s.live ? `now: ${s.live.note}` : '', s.path ? 'click to open' : ''].filter(Boolean).join('\n');
  }

  function hero(f) {
    const c = f.cases;
    const s = f.steps.find((x) => x.key === f.current) ?? f.steps[0];
    const side = layout === 'sidebar';
    const n = f.steps.findIndex((x) => x.key === s.key) + 1;
    return `<section class="hero">
      <div class="hero-main">
        <div class="hero-text">
          <div class="eyebrow">${esc(f.phase)} phase · step ${n} of ${f.steps.length}</div>
          <h1>${esc(f.slug)}</h1>
          ${!side && f.title && f.title !== f.slug ? `<p class="subtitle">${esc(f.title)}</p>` : ''}
          <div class="hero-gate"><span class="gate-id">${esc(s.label)}</span>${stepChip(s)}</div>
          <div class="progress-line"><strong>${c.passed}</strong><span class="muted"> of ${c.designed} cases passed</span>${c.failed ? ` <span class="sep">·</span> <span class="s-c-blocked">${c.failed} failing</span>` : ''}${c.blocked ? ` <span class="sep">·</span> <span class="warn-t">${c.blocked} blocked</span>` : ''}${c.notRun ? ` <span class="sep">·</span> <span class="muted">${c.notRun} not run</span>` : ''}</div>
          ${caseBar(f)}
        </div>
        ${ring(c.passed, c.designed, side ? 64 : 104)}
      </div>
      ${side ? '' : pipeline(f)}
    </section>`;
  }

  function pipeline(f) {
    return `<ol class="pipeline" aria-label="Pipeline">${f.steps
      .map((s, i) => {
        const [icon, cls] = STEP[s.state] ?? STEP.idle;
        return `<li class="p-step ${cls} ${s.state === 'pass' ? 'done' : ''} ${s.key === f.current ? 'current' : ''}">
          <button class="p-body" ${s.path ? `data-path="${esc(s.path)}"` : 'disabled'} title="${esc(stepTip(s))}">
            <span class="node" aria-hidden="true">${icon}</span>
            <span class="p-gate">${i + 1}</span>
            <span class="p-stage">${esc(s.label)}</span>
            <span class="p-state">${esc(s.word)}${s.live ? ' <span class="tag live-tag">inferred</span>' : ''}</span>
          </button>
        </li>`;
      })
      .join('')}</ol>`;
  }

  function stepper(f) {
    const passed = f.steps.filter((s) => s.state === 'pass').length;
    return section(
      'Pipeline',
      `${passed}/${f.steps.length}`,
      `<ol class="stepper">${f.steps
        .map((s) => {
          const [icon, cls] = STEP[s.state] ?? STEP.idle;
          return `<li class="step ${cls} ${s.state === 'pass' ? 'done' : ''} ${s.key === f.current ? 'current' : ''}">
            <span class="node" aria-hidden="true">${icon}</span>
            <button class="step-body" ${s.path ? `data-path="${esc(s.path)}"` : 'disabled'} title="${esc(stepTip(s))}">
              <span class="g"><span class="stage">${esc(s.label)}</span></span>
              <span class="state">${esc(s.word)}${s.live ? ' <span class="tag live-tag">inferred</span>' : ''}</span>
            </button>
          </li>`;
        })
        .join('')}</ol>`,
    );
  }

  function sevChips(f) {
    const s = f.defects.bySeverity;
    const keys = ['Critical', 'High', 'Medium', 'Low', 'Unrated'].filter((k) => s[k]);
    return `<span class="sev-chips">${keys.map((k) => `<span class="sev ${SEV[k][1]}"><span aria-hidden="true">${SEV[k][0]}</span>${s[k]} ${k.toLowerCase()}</span>`).join('')}</span>`;
  }

  function kpis(f) {
    const c = f.cases;
    const tile = (label, value, sub, extra = '', attrs = '') =>
      `<${attrs ? 'button' : 'div'} class="kpi ${attrs ? 'clickable' : ''}" ${attrs}><span class="k-label">${label}</span><span class="k-value">${value}</span>${sub ? `<span class="k-sub">${sub}</span>` : ''}${extra}</${attrs ? 'button' : 'div'}>`;
    const cases = tile('Cases', `${c.passed}<small>/ ${c.designed}</small>`, layout === 'page' ? `${c.designed} designed · ${c.scripted} scripted · ${c.passed} passed` : `${c.scripted} scripted`, caseBar(f, 'thin'), layout === 'sidebar' ? 'data-tab="coverage"' : 'data-scroll="matrix"');
    const d = f.defects;
    const sev = d.bySeverity;
    const defects = tile('Open defects', `${d.open}`, d.open ? (sev.Critical + sev.High ? `<span class="s-c-blocked">${sev.Critical + sev.High} Critical/High</span>` : 'none Critical/High') : 'none open', d.open ? sevChips(f) : '', layout === 'sidebar' ? 'data-tab="defects"' : 'data-scroll="defects"');
    const q = f.quarantine;
    const quarantine = tile('Quarantined', `${q.active}`, q.active ? (q.expired ? `<span class="s-c-blocked">${q.expired} expired</span>` : `nearest expiry ${esc(q.nearest)}`) : 'nothing quarantined');
    const r = f.lastRun;
    const rate = tile('Last run pass rate', r.rate === null ? '—' : `${r.rate}<small>%</small>`, r.ran ? `${r.pass} of ${r.ran} run${r.runId && layout === 'page' ? ` · ${esc(r.runId)}` : ''}` : 'no case has run');
    const cov = f.coverage;
    const coverage = tile(
      'P0/P1 coverage gaps',
      cov.state === 'unknown' ? '—' : `${cov.gaps.length}`,
      cov.state === 'unknown' ? '' : cov.state === 'ok' ? '<span class="ok-t">✓ every axis covered</span>' : `<span class="s-c-blocked">${esc(cov.hint)}</span>`,
      cov.state === 'unknown' ? `<span class="k-hint" title="No saved qa:score output under reports/ (coverage-score*.md)">${esc(cov.hint)}</span>` : '',
      cov.path ? `data-path="${esc(cov.path)}"` : '',
    );
    const so = f.signoff;
    const release = tile('Sign-off', so ? esc(so.recommendation ?? '—') : '—', so ? `release ${esc(so.release)} · ${esc(so.date)}` : 'no sign-off names it', '', so ? `data-path="${esc(so.path)}"` : '');
    const tiles = layout === 'page' ? [cases, defects, quarantine, rate, coverage, release] : [cases, rate, defects, quarantine];
    return `<div class="kpis qa">${tiles.join('')}</div>`;
  }

  // ---- sections -------------------------------------------------------------------------------

  function actionCards(f) {
    const extra = vm.nextCommand && !f.actions.some((a) => a.command === vm.nextCommand) ? [{ kind: 'next', title: 'Next command', detail: 'Named by the state builder.', command: vm.nextCommand, path: null }] : [];
    const list = [...extra, ...f.actions];
    return section(
      'What next',
      null,
      `<div class="actions">${list
        .map((a) => {
          const [g, c] = ACTION[a.kind] ?? ['•', 'muted'];
          return `<div class="action ${c}">
            <span class="a-icon ${c}" aria-hidden="true">${g}</span>
            <div class="a-body">
              <div class="a-title">${esc(a.title)}</div>
              <div class="a-detail">${esc(a.detail)}</div>
              ${a.command || a.path ? `<div class="a-links">${a.command ? cmd(a.command) : ''}${link('Open', a.path)}</div>` : ''}
            </div>
          </div>`;
        })
        .join('')}</div>`,
    );
  }

  function activityFeed(limit) {
    const items = (vm.live && vm.live.activity) || [];
    if (!items.length) return section('Activity', null, empty('◌', 'No activity yet', 'Commits, runs, reports and defects appear here as they are written.'));
    const keys = items.map((a) => `${a.kind}|${a.title}|${a.at}`);
    const fresh = seen ? new Set(keys.filter((k) => !seen.has(k))) : new Set();
    seen = new Set(keys);
    return section(
      'Activity',
      null,
      `<ol class="feed">${items
        .slice(0, limit)
        .map((a, n) => {
          const [icon, cls] = ACT[a.kind] ?? ['•', 'k-state'];
          return `<li class="${cls} ${fresh.has(keys[n]) ? 'fresh' : ''} ${a.path ? 'row-btn' : ''}" ${a.path ? `data-path="${esc(a.path)}" tabindex="0"` : ''}>
            <span class="f-node" aria-hidden="true">${icon}</span>
            <span class="f-body"><span class="f-title" title="${esc(a.title)}">${esc(a.title)}</span>${a.detail ? `<span class="f-detail ${a.kind === 'commit' ? 'mono' : ''}">${esc(a.detail)}</span>` : ''}</span>
            ${when(a.at)}
          </li>`;
        })
        .join('')}</ol>`,
      layout === 'sidebar' ? '' : `<span class="muted small">newest first</span>`,
    );
  }

  function latestRun() {
    const r = vm.latestRun;
    const fl = vm.inFlight;
    const running = fl
      ? `<div class="banner info running"><span class="b-icon" aria-hidden="true">▶</span><div><strong class="run-id">${esc(fl.runId)}</strong> <span class="muted">· ${esc(fl.where)}</span> is running — started ${when(fl.at)}; no summary.md yet. <span class="tag live-tag">inferred</span></div></div>`
      : '';
    if (!r) return section('Latest run', null, running + empty('▶', 'No finished run yet', 'Runs land under <code>qa/runs/</code>. Start one with <code>/qa-run &lt;slug&gt;</code> or a run plan.'));
    const c = r.counts;
    const head = `<div class="run-head">
        <span class="rate ${r.passRate === 100 ? 'ok-t' : r.passRate !== null && r.passRate < 100 ? 'bad-t' : ''}">${r.passRate === null ? '—' : `${r.passRate}%`}</span>
        <div><div><span class="run-id">${esc(r.runId)}</span> <span class="muted">· ${esc(r.where)}</span></div>
        <div class="small">${c ? `<span class="ok-t">✓ ${c.pass} pass</span> · <span class="bad-t">✕ ${c.fail} fail</span> · <span class="warn-t">⊘ ${c.blocked} blocked</span>${c.manual ? ` · ${c.manual} manual` : ''}` : '<span class="muted">no summary.md yet — running?</span>'} · ${when(r.at)}</div></div>
      </div>`;
    const fails = r.failures.length
      ? `<div>${r.failures
          .map(
            (x) => `<div class="fail-row">
              <span class="tri tri-${esc(x.triage ?? 'none')}" title="${x.triage ? 'triage class (executing-tests Step 4)' : 'no class in failures.md yet'}">${esc(x.triage ?? 'not triaged')}</span>
              <div class="fail-main"><span class="id">${esc(x.caseId)}</span>${x.error ? `<span class="err" title="${esc(x.error)}">${esc(x.error)}</span>` : ''}${x.command ? `<span>${cmd(x.command)}</span>` : ''}</div>
            </div>`,
          )
          .join('')}</div>`
      : c && c.fail === 0
        ? `<div class="empty-state ok"><span class="es-icon" aria-hidden="true">✓</span><div><strong>No failures</strong><p>Every case that ran in this run passed or was declared blocked.</p></div></div>`
        : '';
    const links = `<div class="links">${link('summary.md', r.summaryPath)}${link('failures.md', r.failuresPath)}${link('HTML report', r.htmlReport)}${r.traces.length ? `<button class="link" data-trace="${esc(r.traces[0])}" title="npx playwright show-trace — you confirm first">Open trace${r.traces.length > 1 ? ` (${r.traces.length})` : ''}</button>` : ''}</div>`;
    return section('Latest run', r.failures.length ? `${r.failures.length} failing` : null, running + head + fails + links);
  }

  function matrix(f) {
    const m = f.matrix;
    const types = m.types.filter((t) => t.used || layout === 'page' || !t.enabled);
    const usedTypes = layout === 'sidebar' ? m.types.filter((t) => t.used) : types;
    const plats = m.platforms.filter((p) => p.used || (layout === 'page' && !p.id.startsWith('other:')));
    if (!m.cells.some((c) => c.counts.total)) return section('Platform × type', null, empty('▦', 'No cases yet', 'The matrix fills as cases are designed and run.'), '', 'matrix');
    const cellOf = (p, t) => m.cells.find((c) => c.platform === p && c.type === t);
    const rows = plats
      .map(
        (p) => `<tr><th class="row ${p.id.startsWith('other:') ? 'other' : ''}" scope="row" title="${esc(p.id)}">${esc(platLabel(p.id))}</th>${usedTypes
          .map((t) => {
            const c = cellOf(p.id, t.id);
            if (!c) return '<td class="cell c-none"></td>';
            const [g, word] = CELL[c.state] ?? CELL.none;
            const n = c.counts;
            const key = `${c.platform}|${c.type}`;
            const tip = `${p.id} × ${t.id}: ${word}${n.total ? ` — ${n.pass} pass · ${n.fail} fail · ${n.blocked} blocked · ${n.handoff} handoff · ${n.notRun} not run` : ''}${c.inferred ? '\nplatform inferred from the type (the case names none)' : ''}${c.live ? '\nincludes a run newer than the index' : ''}`;
            const nums = n.total ? `<span class="n">${n.pass}/${n.total}</span>` : '';
            return `<td class="cell c-${c.state} ${c.inferred ? 'inferred' : ''} ${c.live ? 'live' : ''} ${n.total ? 'clickable' : ''} ${ui.cell === key ? 'selected' : ''}" ${n.total ? `data-cell="${esc(key)}" tabindex="0"` : ''} title="${esc(tip)}"><span class="g" aria-hidden="true">${g}</span>${nums}<span class="sr">${esc(word)}</span></td>`;
          })
          .join('')}</tr>`,
      )
      .join('');
    const head = `<tr><th></th>${usedTypes.map((t) => `<th class="${t.enabled ? '' : 'off'}" title="${esc(t.id)}${t.enabled ? '' : ' — disabled in PROJECT-PROFILE'}">${esc(TYPE_SHORT[t.id] ?? t.id)}</th>`).join('')}</tr>`;
    const sw = (st) => `<span><span class="cell sw c-${st}"></span>${esc(CELL[st][1])}</span>`;
    const legend = `<div class="legend">${['pass', 'fail', 'blocked', 'handoff', 'partial', 'not-run'].map(sw).join('')}${layout === 'page' ? sw('disabled') : ''}${m.inferred ? `<span><span class="cell sw c-not-run inferred"></span>inferred platform</span>` : ''}</div>`;
    let detail = '';
    const sel = ui.cell && m.cells.find((c) => `${c.platform}|${c.type}` === ui.cell);
    if (sel && sel.counts.total) {
      detail = `<div class="cell-detail"><strong>${esc(sel.platform)} × ${esc(sel.type)}</strong> — ${esc(CELL[sel.state][1])}${sel.inferred ? ' <span class="tag live-tag">inferred</span>' : ''}
        <div class="ids">${sel.cases
          .filter((x) => !/#/.test(x.id))
          .map((x) => `<span class="mini" title="${esc(x.verdict)}">${(CELL[x.verdict === 'not-run' || x.verdict === 'manual' ? 'not-run' : x.verdict] ?? CELL['not-run'])[0]} ${esc(x.id)}</span>`)
          .join('')}</div></div>`;
    }
    const note = m.inferred ? `<span class="muted small" title="Cases with no **Platform:** header or @platform: tag are placed by type: api/integration/security/performance → api, e2e/ui/accessibility → web, mobile → android + ios.">some platforms inferred</span>` : '';
    return section('Platform × type', `${f.cases.designed}`, `<div class="matrix-wrap"><table class="matrix" role="grid" aria-label="Platform by test type">${head}${rows}</table></div>${legend}${detail}`, note, 'matrix');
  }

  function runPlans() {
    const plans = vm.runPlans;
    if (!plans.length) return section('Run plans', '0', empty('≡', 'No run plans', 'A run plan is a saved selection of cases you run by name (§19). Write one with <code>/qa-run-plan &lt;name&gt; "&lt;prompt&gt;"</code> or <code>--standard</code>.'), '', 'plans');
    const body = `<div class="plans">${plans
      .map((p) => {
        const lr = p.lastRun;
        const last = lr
          ? `<span class="${lr.ok === false ? 'bad-t' : lr.ok ? 'ok-t' : 'muted'}">${lr.ok === false ? '✕' : lr.ok ? '✓' : '○'} ${lr.pass} pass · ${lr.fail} fail${lr.blocked ? ` · ${lr.blocked} blocked` : ''}</span><span class="muted">· ${esc(lr.runId)} ·</span>${when(lr.at)}${link('summary', lr.summaryPath, 'link plain')}`
          : '<span class="muted">○ never run</span>';
        return `<div class="plan">
          <div class="plan-head"><span class="plan-name" title="${esc(p.name)}">${esc(p.name)}</span><span class="spacer"></span><span class="pill">${p.caseCount} case${p.caseCount === 1 ? '' : 's'}${p.manual ? ` · ${p.manual} manual` : ''}</span></div>
          ${p.description ? `<div class="plan-desc" title="${esc(p.description)}">${esc(p.description)}</div>` : ''}
          ${p.resolved ? `<div class="mini-chips"><span class="mini-label">types</span>${p.byType.map((t) => `<span class="mini">${esc(TYPE_SHORT[t.id] ?? t.id)}<b>${t.n}</b></span>`).join('')}</div>
          <div class="mini-chips"><span class="mini-label">on</span>${p.byPlatform.map((t) => `<span class="mini plat ${t.inferred ? 'inf' : ''}" title="${t.inferred ? 'platform inferred from the case type' : 'platform named by the cases'}">${esc(t.id.replace(/^other:/, ''))}<b>${t.n}</b></span>`).join('')}</div>` : '<div class="mini-chips"><span class="mini warn-t" title="run-plan.mjs resolve has not written ## Resolved cases yet">⚠ not resolved — npm run qa:plan:resolve</span></div>'}
          <div class="plan-last">${last}</div>
          <div class="plan-actions">
            <button class="pbtn primary" data-run="${esc(p.name)}" title="${esc(p.runCommand)} — you confirm in VS Code first">▶ Run</button>
            <button class="pbtn" data-dry="${esc(p.name)}" title="${esc(p.dryRunCommand)}">Dry-run</button>
            <button class="pbtn" data-path="${esc(p.path)}">Open</button>
          </div>
        </div>`;
      })
      .join('')}</div>`;
    return section('Run plans', `${plans.length}`, body, layout === 'page' ? '<span class="muted small">Run and Dry-run show the command and wait for you</span>' : '', 'plans');
  }

  function gatesRelease(f) {
    const so = f.signoff;
    const rec = so?.recommendation;
    const cls = rec === 'GO' ? 'go' : rec === 'NO-GO' ? 'nogo' : rec === 'CONDITIONAL GO' ? 'cond' : 'none';
    const sign = so
      ? `<button class="signoff ${cls}" data-path="${esc(so.path)}"><span class="big">${rec === 'GO' ? '✓ ' : rec === 'NO-GO' ? '✕ ' : rec ? '! ' : ''}${esc(rec ?? 'no verdict')}</span><span class="grow"><div>release <strong>${esc(so.release)}</strong></div><div class="small muted">${esc(so.date)}${so.conditions.length ? ` · ${plural(so.conditions.length, 'condition')}` : ''}</div></span></button>`
      : `<div class="signoff none"><span class="big muted">—</span><span class="muted small">No sign-off names this feature yet.</span></div>`;
    const rep = f.report;
    const repLine = rep
      ? `<div class="foot-note top">Report ${esc(rep.date ?? '')}: <strong class="${rep.overall === 'pass' ? 'ok-t' : rep.overall === 'fail' ? 'bad-t' : ''}">${esc(rep.overall ?? '—')}</strong>${rep.sha ? ` · shipped <code>${esc(rep.sha)}</code>` : ''}${rep.stale ? ` · <span class="warn-t">↻ stale — predates ${esc(rep.newerRuns.join(', '))}</span>` : ''} ${link('open', rep.path, 'link plain')}</div>`
      : '';
    const V = { pass: ['✓', 'ok-t'], fail: ['✕', 'bad-t'], 'not evaluable': ['○', 'muted'] };
    const rows = f.gates.length
      ? `<table class="gates">${f.gates
          .map((g) => {
            const [i, c] = V[g.verdict] ?? ['?', 'muted'];
            return `<tr><td class="g">${esc(g.gate)}${g.reverify ? ' <span class="tag live-tag">re-verify</span>' : ''}</td><td class="t"><div class="small">${esc(g.target)}</div><div class="actual">${esc(g.actual)}</div></td><td class="v ${c}">${i} ${esc(g.verdict)}</td></tr>`;
          })
          .join('')}</table>`
      : empty('○', 'No report gates', 'They are written by <code>/qa-report</code>.');
    return section('Gates & release', null, sign + repLine + rows, '', 'gates');
  }

  function defectsList(f) {
    const d = f.defects;
    if (!d.open) return section('Open defects', '0', empty('✓', 'No open defects', 'Every defect file is CLOSED, or none was raised.', 'ok'), '', 'defects');
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const items = [...d.items].sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4));
    return section(
      'Open defects',
      `${d.open}`,
      `<div>${items
        .map((x) => {
          const [icon, cls] = SEV[x.severity ?? 'Unrated'];
          return `<div class="d-row row-btn" data-path="${esc(x.path)}" tabindex="0"><span class="sev ${cls}"><span aria-hidden="true">${icon}</span>${esc((x.severity ?? 'unrated').toLowerCase())}</span><span class="grow"><span class="id">${esc(x.id)}</span> <span>${esc(x.title)}</span>${x.origin === 'ESCAPED' ? ' <span class="tag esc-tag">escaped</span>' : ''}</span></div>`;
        })
        .join('')}</div>`,
      layout === 'page' ? sevChips(f) : '',
      'defects',
    );
  }

  function quarantineList(f) {
    const q = f.quarantine;
    if (!q.active) return section('Quarantine', '0', empty('✓', 'Nothing quarantined', 'A flaky case is quarantined with a bounded expiry by <code>/qa-quarantine</code>.', 'ok'));
    return section(
      'Quarantine',
      `${q.active}`,
      `<div>${q.items
        .map((x) => `<div class="q-row" title="${esc(x.reason)}"><span class="id">${esc(x.caseId)}</span><span class="grow muted small ellipsis">${esc(x.reason)}</span>${x.ticket ? `<span class="pill">${esc(x.ticket)}</span>` : ''}<span class="until ${x.expired ? 'expired' : ''}">${x.expired ? '⚠ expired ' : '⏳ until '}${esc(x.until)}</span></div>`)
        .join('')}</div><div class="foot-note">${link('regression/quarantine.md', 'qa/regression/quarantine.md', 'link plain')}</div>`,
    );
  }

  /** Where the feature is, what the newest run said, how far along it is, and what comes next. */
  function summary(f) {
    const cur = f.steps.find((s) => s.key === f.current) ?? f.steps[0];
    const r = vm.latestRun;
    const c = r && r.counts;
    const run = r
      ? `<span class="run-id">${esc(r.runId)}</span> <span class="muted">· ${esc(r.where)}</span>${c ? `<br><span class="ok-t">✓ ${c.pass}</span> · <span class="bad-t">✕ ${c.fail}</span> · <span class="warn-t">⊘ ${c.blocked}</span>${r.passRate !== null ? ` <span class="muted">· ${r.passRate}% pass</span>` : ''}` : ''}`
      : '<span class="muted">no finished run yet</span>';
    const next = f.actions[0];
    const passed = f.steps.filter((s) => s.key !== 'knowledge' && s.state === 'pass').length;
    return section(
      'Summary',
      null,
      `<dl class="summary">
        <dt>Now</dt><dd><span class="gate-id">${esc(cur.label)}</span> ${stepChip(cur)}</dd>
        <dt>Run</dt><dd>${run}</dd>
        <dt>Cases</dt><dd><span class="ok-t">${f.cases.passed} pass</span> · <span class="bad-t">${f.cases.failed} fail</span> <span class="muted">of ${f.cases.designed}</span></dd>
        <dt>Done</dt><dd>${f.percentDone}% <span class="muted">· ${passed} of ${f.steps.length - 1} steps passed</span></dd>
        <dt>Next</dt><dd>${next ? `${esc(next.title)}${next.command ? `<br>${cmd(next.command)}` : ''}` : '—'}</dd>
      </dl>`,
    );
  }

  /** The newest clarification sheet as a decision list: open, then assumed (confirm in one pass), then answered. */
  function decisionsList(f) {
    const list = f.decisions.list;
    if (!list.length) return section('Decisions', '0', empty('✓', 'No open questions', 'Questions for the product owner appear here when <code>/qa-clarify</code> writes them.', 'ok'));
    const groups = [
      ['open', 'Open', 'Answer these; blocking ones stop P0/P1 design.'],
      ['assumed', 'Assumed', 'Design goes on with the assumption shown. Confirm them in one pass.'],
      ['answered', 'Answered', ''],
    ];
    const body = groups
      .map(([status, label, hint]) => {
        const rows = list.filter((d) => d.status === status);
        if (!rows.length) return '';
        return `<h3 class="dec-group">${label} <span class="count">${rows.length}</span></h3>${hint ? `<p class="muted small">${esc(hint)} ${status !== 'answered' ? cmd(`/qa-clarify ${f.slug}`) : ''}</p>` : ''}
          <ul class="list dec-list">${rows
            .map((d) => `<li class="dec-row ${f.decisions.path ? 'row-btn' : ''}" ${f.decisions.path ? `data-path="${esc(f.decisions.path)}" tabindex="0"` : ''}><span class="id">${esc(d.id)}</span><span class="dec-text"><span class="dec-q">${esc(d.question)}</span>${d.note ? `<span class="dec-a muted">→ ${esc(d.note)}</span>` : ''}</span>${d.blocking ? '<span class="tag bad">blocking</span>' : ''}</li>`)
            .join('')}</ul>`;
      })
      .join('');
    return section('Decisions', `${list.length}`, body);
  }

  /** Open defects by severity, then flaky cases and new failures from the log, then quarantine rows. */
  function findingsList(f) {
    const items = f.findings;
    if (!items.length) return section('Findings', '0', empty('✓', 'Nothing open', 'Open defects, flaky cases and failures new since the last run appear here.', 'ok'), '', 'findings');
    return section(
      'Findings',
      `${items.length}`,
      `<ul class="list findings">${items
        .map((x) => {
          const [icon, cls] = SEV[x.severity] ?? SEV.Unrated;
          const sev = x.kind === 'defect' ? `<span class="sev ${cls}"><span aria-hidden="true">${icon}</span>${esc(x.severity.toLowerCase())}</span>` : `<span class="tag find-${esc(x.kind)}">${esc(FIND[x.kind] ?? x.kind)}</span>`;
          return `<li ${x.path ? `class="row-btn" data-path="${esc(x.path)}" tabindex="0"` : ''}>${sev}<span class="grow">${x.kind === 'defect' ? `<span class="id">${esc(x.id)}</span> ` : ''}${esc(x.title)}</span>${x.at ? when(x.at) : ''}</li>`;
        })
        .join('')}</ul>`,
      '',
      'findings',
    );
  }

  /** Everything waiting on a person: questions to answer or confirm, a sign-off, a stopped run. */
  function needsYou(f) {
    const items = f.needsYou;
    if (!items.length) return section('Needs you', '0', empty('✓', 'Nothing waits on you', 'Open questions, sign-offs and stopped runs appear here.', 'ok'));
    return section(
      'Needs you',
      `${items.length}`,
      `<ul class="list needs">${items
        .map((n) => `<li class="need-row ${n.link ? 'row-btn' : ''}" ${n.link ? `data-path="${esc(n.link)}" tabindex="0"` : ''}><span class="tag need-${esc(n.need)}">${esc(n.label)}</span><span class="need-title">${esc(n.title)}</span>${n.command || n.at ? `<span class="need-meta">${n.command ? cmd(n.command) : ''}${n.at ? when(n.at) : ''}</span>` : ''}</li>`)
        .join('')}</ul>`,
    );
  }

  // ---- layouts --------------------------------------------------------------------------------

  function sidebarTabs(f) {
    const t = (key, label, n) => `<button class="vtab ${ui.tab === key ? 'selected' : ''}" data-tab="${key}" role="tab" aria-selected="${ui.tab === key}">${label}${n != null && n !== '' ? `<span class="n">${n}</span>` : ''}</button>`;
    return `<nav class="vtabs" role="tablist">${t('now', 'Summary', null)}${t('activity', 'Activity', null)}${t('decisions', 'Decisions', f.decisions.list.length || '')}${t('findings', 'Findings', f.findings.length || '')}${t('needs', 'Needs you', f.needsYou.length || '')}${t('runs', 'Runs', vm.runPlans.length || '')}${t('defects', 'Defects', f.defects.open)}${t('coverage', 'Coverage', null)}${agentsTab() ? `<button class="vtab ${ui.tab === 'agents' ? 'selected' : ''}" data-tab="agents" role="tab" aria-selected="${ui.tab === 'agents'}">Agents${agentsCount()}</button>` : ''}</nav>`;
  }

  function sidebar(f) {
    let body = '';
    if (ui.tab === 'runs') body = `${latestRun()}${runPlans()}`;
    else if (ui.tab === 'defects') body = `${defectsList(f)}${quarantineList(f)}`;
    else if (ui.tab === 'coverage') body = `${matrix(f)}${gatesRelease(f)}`;
    else if (ui.tab === 'activity') body = activityFeed(40);
    else if (ui.tab === 'decisions') body = decisionsList(f);
    else if (ui.tab === 'findings') body = findingsList(f);
    else if (ui.tab === 'needs') body = needsYou(f);
    else if (ui.tab === 'agents' && agentsTab()) body = '<div id="ag-mount"></div>';
    else body = `${hero(f)}${f.needsYou.length ? needsYou(f) : ''}${summary(f)}${actionCards(f)}${stepper(f)}${activityFeed(6)}`;
    return `${header()}${featureSwitch()}${sidebarTabs(f)}<div class="tabbody">${body}</div>
      <div class="footer"><button class="btn" data-open-board>Open the full board <span aria-hidden="true">→</span></button></div>`;
  }

  /** The full board has two views: the QA pipeline, and who is working on it right now. */
  function viewSwitch() {
    if (!agentsTab()) return '';
    const b = (key, label, extra = '') => `<button class="view-tab ${ui.view === key ? 'selected' : ''}" data-view="${key}" role="tab" aria-selected="${ui.view === key}">${label}${extra}</button>`;
    return `<nav class="view-tabs" role="tablist">${b('board', 'Board')}${b('agents', 'Agents', agentsCount())}</nav>`;
  }

  function page(f) {
    if (ui.view === 'agents' && agentsTab()) return `<div class="wrap">${header()}${viewSwitch()}<div id="ag-mount"></div></div>`;
    return `<div class="wrap">${header()}${viewSwitch()}${envStrip()}${featureSwitch()}${hero(f)}${kpis(f)}
      <div class="grid-2">
        <div class="col">${needsYou(f)}${summary(f)}${actionCards(f)}${latestRun()}</div>
        <div class="col">${activityFeed(12)}${findingsList(f)}${decisionsList(f)}</div>
      </div>
      ${matrix(f)}
      ${runPlans()}
      <div class="grid-3">
        <div class="col">${gatesRelease(f)}</div>
        <div class="col">${defectsList(f)}</div>
        <div class="col">${quarantineList(f)}</div>
      </div></div>`;
  }

  function render() {
    if (!vm) return;
    if (!vm.ok) {
      app.className = 'empty-page';
      app.innerHTML = `<div class="empty-state big"><span class="es-icon warn" aria-hidden="true">!</span><div><strong>${esc(vm.reason)}</strong>${vm.detail ? `<p>${esc(vm.detail)}</p>` : ''}</div></div>`;
      mountAgents();
      return;
    }
    app.className = '';
    if (!vm.features.length) {
      app.innerHTML = `<div class="wrap">${header()}${envStrip()}<div class="empty-state big"><span class="es-icon" aria-hidden="true">✓</span><div><strong>No features yet</strong><p>This index is real and current — there is simply nothing in flight. Start one with <code>/qa-analyze &lt;slug&gt; &lt;docs…&gt;</code>.</p></div></div>${layout === 'page' ? runPlans() : ''}</div>`;
      mountAgents();
      return;
    }
    const f = vm.features.find((x) => x.slug === ui.slug) ?? [...vm.features].sort((a, b) => Number(b.inFlight) - Number(a.inFlight) || b.phaseIndex - a.phaseIndex)[0];
    ui.slug = f.slug;
    save();
    app.innerHTML = layout === 'sidebar' ? sidebar(f) : page(f);
    mountAgents();
    const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('slug'));
    if (sel) {
      sel.addEventListener('change', () => {
        ui.slug = sel.value;
        ui.cell = undefined;
        save();
        render();
      });
    }
  }

  function tick() {
    for (const el of document.querySelectorAll('time[data-at]')) {
      const raw = el.getAttribute('data-at') ?? '';
      const at = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      const text = ago(at);
      if (el.textContent !== text) el.textContent = text;
    }
    if (vm && vm.ok) {
      const pill = document.querySelector('.live');
      if (pill && pill.classList.contains('on') !== isLive()) render();
    }
  }
  setInterval(tick, 15000);

  // ---- events ---------------------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    // The Agents tab handles its own clicks (agents.js).
    if (el.closest('.ag')) return;
    const view = el.closest('[data-view]');
    if (view) {
      ui.view = view.getAttribute('data-view') === 'agents' ? 'agents' : 'board';
      save();
      render();
      return;
    }
    const copy = el.closest('[data-copy]');
    if (copy) {
      vscode.postMessage({ command: 'copy', text: copy.getAttribute('data-copy') });
      copy.textContent = '✓';
      setTimeout(() => (copy.textContent = '⧉'), 1200);
      return;
    }
    if (el.closest('[data-open-board]')) return vscode.postMessage({ command: 'openBoard' });
    if (el.closest('[data-update]')) return vscode.postMessage({ command: 'update' });
    const run = el.closest('[data-run]');
    if (run) return vscode.postMessage({ command: 'runPlan', name: run.getAttribute('data-run') });
    const dry = el.closest('[data-dry]');
    if (dry) return vscode.postMessage({ command: 'runPlan', name: dry.getAttribute('data-dry'), dryRun: true });
    const trace = el.closest('[data-trace]');
    if (trace) return vscode.postMessage({ command: 'openTrace', path: trace.getAttribute('data-trace') });
    const cell = el.closest('[data-cell]');
    if (cell) {
      const k = cell.getAttribute('data-cell') ?? undefined;
      ui.cell = ui.cell === k ? undefined : k;
      save();
      render();
      return;
    }
    const pathEl = el.closest('[data-path]');
    if (pathEl) return vscode.postMessage({ command: 'open', path: pathEl.getAttribute('data-path') });
    const tab = el.closest('[data-slug]');
    if (tab) {
      ui.slug = tab.getAttribute('data-slug') ?? undefined;
      ui.cell = undefined;
      save();
      render();
      return;
    }
    const scroll = el.closest('[data-scroll]');
    if (scroll && layout === 'page') {
      document.getElementById(scroll.getAttribute('data-scroll') ?? '')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const vtab = el.closest('[data-tab]');
    if (vtab) {
      ui.tab = vtab.getAttribute('data-tab') ?? 'now';
      save();
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if ((e.key === 'Enter' || e.key === ' ') && el.matches('[data-path], [data-cell]')) {
      e.preventDefault();
      el.click();
    }
    if (e.key === 'Escape' && ui.cell) {
      ui.cell = undefined;
      save();
      render();
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.command === 'state') {
      vm = e.data.vm;
      if (e.data.accent) document.body.dataset.accent = e.data.accent;
      agentsOn = !!e.data.agents;
      render();
    }
    if (e.data && e.data.command === 'tab' && e.data.tab === 'agents') {
      if (layout === 'sidebar') ui.tab = 'agents';
      else ui.view = 'agents';
      save();
      render();
    }
  });

  vscode.postMessage({ command: 'ready' });
})();
