/**
 * Activation, wiring, the watchers and the confirmed terminal commands. Nothing else belongs here.
 *
 * The extension is a viewer: it reads qa/state.json and the QA files the index is built from,
 * renders them, and reopens the files it points at. It never writes to the workspace. The only
 * things it starts are VS Code terminals, and each one only after the reader picked "Run" on a
 * quick pick that shows the exact command it will type: a run plan (`npm run qa:plan:run`), a
 * Playwright trace viewer, or the installer's update (`afx update` or `npx agentic-fx@latest update`).
 */

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentsFeed } from './agentsView';
import { BoardPanel, BoardSource, OverviewViewProvider } from './board';
import { Debouncer, LiveKind, LiveReader, LiveSnapshot, Throttle, classify, findGitDir, relativeTime } from './live';
import { LoadResult, ProjectRef, findProjectRoots, loadState, resolveInProject, resolveStatePath } from './model';
import { DefectsTreeProvider, FeaturesTreeProvider, RunPlansTreeProvider } from './tree';
import { BoardVM, activeFeature, buildViewModel } from './viewmodel';

const SELECTED_KEY = 'stlc.selectedProject';
const DISMISSED_KEY = 'stlc.dismissedUpdate';

export function activate(context: vscode.ExtensionContext): void {
  const addonVersion = String(context.extension.packageJSON.version ?? '');
  const folders = vscode.workspace.workspaceFolders ?? [];
  const folder = folders[0];
  if (!folder) return;

  const root = folder.uri;
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('stlc');
  // Empty setting = follow the bundle's root resolver: .stlc/state.json, else qa/state.json (CONTRACTS §2).
  const relPath = (): string => resolveStatePath(root.fsPath, config().get<string>('statePath'));
  const qaRoot = (): string => path.posix.dirname(relPath().replace(/\\/g, '/')) || '.stlc';

  let cached: LoadResult | undefined;
  let liveCache: LiveSnapshot | undefined;
  let vmCache: BoardVM | undefined;
  let reader = new LiveReader(qaRoot());
  let projects: ProjectRef[] | undefined;

  const listProjects = (): ProjectRef[] => {
    if (!projects) {
      const seen = new Set<string>();
      projects = folders
        .flatMap((f) => findProjectRoots(f.uri.fsPath, relPath(), { runPlansDir: `${qaRoot()}/run-plans` }))
        .filter((p) => !seen.has(p.root) && !!seen.add(p.root))
        .sort((a, b) => b.mtime - a.mtime);
    }
    return projects;
  };
  const selected = (): string | undefined => {
    const pinned = context.workspaceState.get<string>(SELECTED_KEY);
    const all = listProjects();
    if (pinned && all.some((p) => p.root === pinned)) return pinned;
    // Auto-follow: the newest index; a project with run plans but no index only when nothing has one.
    return (all.find((p) => p.indexed) ?? all[0])?.root;
  };
  const projectLabel = (projectRoot: string): string => {
    const owner = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRoot));
    if (!owner) return path.basename(projectRoot);
    const rel = path.relative(owner.uri.fsPath, projectRoot).split(path.sep).join('/');
    return folders.length > 1 ? (rel ? `${owner.name}/${rel}` : owner.name) : rel || owner.name;
  };

  const getState = (): LoadResult => {
    if (!cached) cached = loadState(root.fsPath, relPath(), selected());
    return cached;
  };
  /** The selected project, even when its index is missing or broken: every path resolves against it. */
  const projectRoot = (): string => getState().projectRoot;
  const currentLabel = (): string | undefined => {
    const current = selected();
    return current && listProjects().length > 1 ? projectLabel(current) : undefined;
  };
  const getLive = (): LiveSnapshot | undefined => {
    const result = getState();
    if (!result.ok) return undefined;
    if (!liveCache) {
      try {
        liveCache = reader.snapshot(result.projectRoot, result.state);
      } catch {
        liveCache = undefined;
      }
    }
    return liveCache;
  };
  const getVM = (): BoardVM => {
    if (!vmCache) {
      vmCache = buildViewModel(getState(), {
        live: getLive(),
        watching: true,
        addonVersion,
        dismissedUpdate: context.workspaceState.get<string>(DISMISSED_KEY) ?? null,
      });
    }
    return vmCache;
  };
  // Who is working on the project: Claude Code chats and the agents they spawned, read from their
  // transcripts (agents.ts) and drawn in the board's Agents tab.
  const agents = new AgentsFeed({ projectRoot });
  context.subscriptions.push(agents);
  const source: BoardSource = { agents, viewModel: getVM, accent: () => config().get<string>('accent') ?? 'teal', projectRoot, projectLabel: currentLabel };

  const rootUri = (): vscode.Uri => vscode.Uri.file(projectRoot());
  const features = new FeaturesTreeProvider(getVM, rootUri);
  const defects = new DefectsTreeProvider(getVM, rootUri);
  const runPlans = new RunPlansTreeProvider(getVM, rootUri);
  const overview = new OverviewViewProvider(context.extensionUri, source);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(OverviewViewProvider.viewType, overview));
  const featuresView = vscode.window.createTreeView('stlc.features', { treeDataProvider: features, showCollapseAll: true });
  const defectsView = vscode.window.createTreeView('stlc.defects', { treeDataProvider: defects });
  const plansView = vscode.window.createTreeView('stlc.runPlans', { treeDataProvider: runPlans });
  context.subscriptions.push(featuresView, defectsView, plansView);

  const labelViews = (): void => {
    const many = listProjects().length > 1;
    const label = currentLabel();
    featuresView.description = label;
    defectsView.description = label;
    plansView.description = label;
    overview.setDescription(label);
    void vscode.commands.executeCommand('setContext', 'stlc.multiProject', many);
  };

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  status.command = 'stlc.openBoard';
  context.subscriptions.push(status);

  const refresh = (stateChanged = true): void => {
    if (stateChanged) cached = undefined;
    liveCache = undefined;
    vmCache = undefined;
    labelViews();
    features.refresh();
    defects.refresh();
    runPlans.refresh();
    BoardPanel.refreshIfOpen();
    overview.refresh();
    if (stateChanged) agents.refresh();
    // Activated by onStartupFinished in a workspace with no QA project: no warning in the status bar.
    if (!listProjects().length) {
      status.hide();
      return;
    }
    updateStatusBar(status, getVM(), getLive(), source.accent(), currentLabel());
  };

  // ---- watching ----------------------------------------------------------------------------------
  // One glob over the QA sources the board reads, one over git's HEAD and reflog, one over the
  // installer's files in .claude/, and the discovery watcher for a state.json appearing. A burst
  // of writes (a Playwright run) becomes one redraw ~300 ms after the last of them. No polling.
  // ---- the optional background rebuild (as in vscode-sdlc) ----------------------------------------
  // Off by default, because it is the one path that writes to the workspace (the builder rewrites
  // state.json, as the bundle's Stop hook does). It covers a Claude session opened outside the
  // project, where the project's own Stop hook never runs. Throttled, and never two at once.
  const rebuild = new Throttle(
    () =>
      new Promise<void>((resolve) => {
        const cwd = projectRoot();
        const script = path.join(cwd, qaRoot(), 'scripts', 'shared', 'build-state.mjs');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        cp.execFile('node', [script, '--quiet'], { cwd, env, timeout: 120_000, windowsHide: true }, () => resolve());
      }),
    Math.max(15, config().get<number>('backgroundRebuildSeconds') ?? 120) * 1000,
  );
  context.subscriptions.push({ dispose: () => rebuild.dispose() });

  const debouncer = new Debouncer<LiveKind>((kinds) => {
    refresh(kinds.has('state'));
    const sourcesChanged = [...kinds].some((k) => k !== 'state' && k !== 'git' && k !== 'bundle');
    if (sourcesChanged && config().get<boolean>('backgroundRebuild')) rebuild.request();
  }, 300);
  context.subscriptions.push({ dispose: () => debouncer.dispose() });

  let watchers: vscode.Disposable[] = [];
  let watchedRoot: string | undefined;
  const watch = (base: vscode.Uri, glob: string, toRel: (uri: vscode.Uri) => string): void => {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, glob));
    const on = (uri: vscode.Uri): void => {
      const kind = classify(toRel(uri), qaRoot());
      if (kind) debouncer.push(kind);
    };
    w.onDidChange(on);
    w.onDidCreate(on);
    w.onDidDelete(on);
    watchers.push(w);
  };
  const rewatch = (): void => {
    for (const w of watchers) w.dispose();
    watchers = [];
    const pr = projectRoot();
    watchedRoot = pr;
    const q = qaRoot();
    const toRel = (uri: vscode.Uri): string => path.relative(pr, uri.fsPath);
    watch(
      vscode.Uri.file(pr),
      `{${q}/state.json,${q}/runs/**/summary.md,${q}/runs/**/failures.md,${q}/runs/**/readiness.md,${q}/reports/**,${q}/defects/**,${q}/run-plans/*.md,${q}/regression/quarantine.md,${q}/plans/**/*.md,${q}/reviews/**/*.md,${q}/cases/**/*.md,${q}/logs/activity.jsonl,${q}/analysis/**/*-clarifications.md,.claude/.agentic-fx.json,.claude/.agentic-fx-updates.json,VERSION}`,
      toRel,
    );
    const gitDir = findGitDir(pr);
    if (gitDir) watch(vscode.Uri.file(gitDir), '{HEAD,logs/HEAD,refs/heads/**}', (uri) => `.git/${path.relative(gitDir, uri.fsPath).split(path.sep).join('/')}`);
    const onIndex = (uri: vscode.Uri): void => {
      // A dot folder other than the QA root itself (`.stlc`, CONTRACTS §2) holds copies — `.claude/worktrees`.
      if (vscode.workspace.asRelativePath(uri, false).split(/[\\/]/).some((part) => part.startsWith('.') && part !== q)) return;
      cached = undefined;
      projects = undefined;
      if (projectRoot() !== watchedRoot) rewatch();
      debouncer.push('state');
    };
    // A project that appears, or another one rebuilt later: an index, or run plans with no index yet.
    for (const f of folders) {
      const glob = `{${relPath()},**/${relPath()},${q}/run-plans/*.md,**/${q}/run-plans/*.md}`;
      const discovery = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(f, glob));
      discovery.onDidChange(onIndex);
      discovery.onDidCreate(onIndex);
      discovery.onDidDelete(onIndex);
      watchers.push(discovery);
    }
  };
  rewatch();
  context.subscriptions.push({ dispose: () => watchers.forEach((w) => w.dispose()) });

  // ---- confirmed terminal commands -------------------------------------------------------------
  /** Shows the exact command, and types it into a new terminal only on "Run". Writes nothing itself. */
  const confirmAndRun = async (title: string, cwd: string, commandLine: string, detail: string): Promise<void> => {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(terminal) Run in a terminal', description: commandLine, detail: `in ${cwd}`, run: true },
        { label: '$(copy) Copy the command', description: commandLine, run: false },
      ],
      { title, placeHolder: detail },
    );
    if (!choice) return;
    if (!choice.run) {
      await vscode.env.clipboard.writeText(commandLine);
      vscode.window.setStatusBarMessage(`Copied: ${commandLine}`, 2500);
      return;
    }
    const env: Record<string, string | null> = { ELECTRON_RUN_AS_NODE: null };
    const term = vscode.window.createTerminal({ name: title, cwd, env });
    term.show();
    term.sendText(commandLine, true);
  };

  const qaDir = (): string => resolveInProject(projectRoot(), qaRoot()) ?? projectRoot();
  const planName = (arg: unknown): string | undefined => {
    const n = typeof arg === 'string' ? arg : (arg as { planName?: string } | undefined)?.planName;
    return n && /^[a-z0-9][a-z0-9-]*$/.test(n) ? n : undefined;
  };
  const runPlan = async (arg: unknown, dryRun: boolean): Promise<void> => {
    let name = planName(arg);
    const vm = getVM();
    if (!name && vm.ok) {
      const pick = await vscode.window.showQuickPick(
        vm.runPlans.map((p) => ({ label: p.name, description: `${p.caseCount} cases`, detail: p.description })),
        { title: dryRun ? 'STLC: Dry-run a run plan' : 'STLC: Run a run plan' },
      );
      name = pick?.label;
    }
    const dir = qaDir();
    if (!name || !dir) return;
    const cmd = `npm run qa:plan:run -- ${name}${dryRun ? ' --dry-run' : ''}`;
    await confirmAndRun(
      dryRun ? `Dry-run ${name}` : `Run ${name}`,
      dir,
      cmd,
      dryRun ? 'Prints what would run; starts nothing.' : 'Runs the plan against its env and writes a run folder and the traceability write-back (§19).',
    );
  };

  const openTrace = async (arg: unknown): Promise<void> => {
    let rel = typeof arg === 'string' ? arg : undefined;
    const vm = getVM();
    if (!rel && vm.ok) {
      const traces = vm.runs.flatMap((r) => r.traces.map((t) => ({ label: path.basename(path.dirname(t)), description: r.runId, detail: t })));
      if (!traces.length) {
        void vscode.window.showInformationMessage('No Playwright trace in the latest runs. Traces are kept on failure (trace: retain-on-failure).');
        return;
      }
      rel = (await vscode.window.showQuickPick(traces, { title: 'STLC: Open a Playwright trace' }))?.detail;
    }
    const pr = projectRoot();
    const dir = qaDir();
    const abs = rel && rel.endsWith('.zip') ? resolveInProject(pr, rel) : undefined;
    if (!abs) return;
    const fromQa = path.relative(dir, abs).split(path.sep).join('/');
    await confirmAndRun('Playwright trace', dir, `npx playwright show-trace "${fromQa}"`, 'Opens the trace viewer; reads the zip, writes nothing.');
  };

  const bundleUpdate = async (): Promise<void> => {
    const vm = getVM();
    const u = vm.version.update;
    if (!u) {
      void vscode.window.showInformationMessage(`agentic-fx-qa ${vm.version.bundle ?? ''} — no update notice. The installer writes one when it checks (npx agentic-fx@latest outdated, or afx outdated).`);
      return;
    }
    type Pick = vscode.QuickPickItem & { action: 'changelog' | 'update' | 'dismiss' };
    const items: Pick[] = [
      ...(u.changelogUrl ? [{ label: '$(book) Open CHANGELOG', description: u.changelogUrl, action: 'changelog' as const }] : []),
      { label: '$(terminal) Update in a terminal…', description: u.command, detail: 'You confirm the command on the next step. The board writes nothing.', action: 'update' },
      { label: '$(eye-closed) Dismiss for this version', description: u.latest, action: 'dismiss' },
    ];
    const choice = await vscode.window.showQuickPick(items, {
      title: `agentic-fx-qa ${u.installed ?? '?'} → ${u.latest}${u.kind === 'major' ? ' (MAJOR)' : ''}`,
      placeHolder: u.kind === 'major' ? 'A major update can change contracts — read the CHANGELOG first.' : `A ${u.kind} update is available.`,
    });
    if (!choice) return;
    if (choice.action === 'changelog' && u.changelogUrl) void vscode.env.openExternal(vscode.Uri.parse(u.changelogUrl));
    if (choice.action === 'dismiss') {
      await context.workspaceState.update(DISMISSED_KEY, u.latest);
      refresh(false);
    }
    if (choice.action === 'update') await confirmAndRun('agentic-fx update', projectRoot(), u.command, 'Runs the installer in this project. It rewrites the bundle-owned files it installed.');
  };

  const selectProject = async (): Promise<void> => {
    projects = undefined;
    const all = listProjects();
    if (!all.length) {
      void vscode.window.showInformationMessage(`No ${relPath()} found in this workspace.`);
      return;
    }
    const pinned = context.workspaceState.get<string>(SELECTED_KEY);
    type Pick = vscode.QuickPickItem & { root?: string };
    const items: Pick[] = [
      { label: `${pinned ? '$(history)' : '$(pass-filled)'} Most recently updated`, description: projectLabel(all[0].root), detail: 'Follow whichever project a command last ran in.' },
      ...all.map((p) => ({
        label: `${p.root === pinned ? '$(pass-filled)' : p.indexed ? '$(folder)' : '$(warning)'} ${projectLabel(p.root)}`,
        description: p.indexed ? `updated ${relativeTime(p.mtime)}` : 'no index yet — run node qa/scripts/shared/build-state.mjs',
        detail: p.indexed ? undefined : `Run plans only (newest ${relativeTime(p.mtime)}); the board stays empty until the index is built.`,
        root: p.root,
      })),
    ];
    const choice = await vscode.window.showQuickPick(items, {
      title: 'STLC: Select Project',
      placeHolder: `${all.length} QA project(s) in this workspace`,
      matchOnDescription: true,
    });
    if (!choice) return;
    await context.workspaceState.update(SELECTED_KEY, choice.root);
    cached = undefined;
    rewatch();
    refresh();
  };

  const tick = setInterval(() => listProjects().length && updateStatusBar(status, getVM(), getLive(), source.accent(), currentLabel()), 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(tick) });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('stlc')) return;
      if (e.affectsConfiguration('stlc.statePath')) {
        reader = new LiveReader(qaRoot());
        cached = undefined;
        projects = undefined;
        rewatch();
      }
      refresh();
    }),
    vscode.commands.registerCommand('stlc.refresh', () => {
      reader = new LiveReader(qaRoot());
      projects = undefined;
      refresh();
    }),
    vscode.commands.registerCommand('stlc.selectProject', selectProject),
    vscode.commands.registerCommand('stlc.openBoard', () => BoardPanel.show(context, source)),
    vscode.commands.registerCommand('stlc.openAgents', () => {
      BoardPanel.show(context, source);
      BoardPanel.showTab('agents');
    }),
    vscode.commands.registerCommand('stlc.runPlan', (arg?: unknown) => runPlan(arg, false)),
    vscode.commands.registerCommand('stlc.dryRunPlan', (arg?: unknown) => runPlan(arg, true)),
    vscode.commands.registerCommand('stlc.openTrace', openTrace),
    vscode.commands.registerCommand('stlc.bundleUpdate', bundleUpdate),
    vscode.commands.registerCommand('stlc.openArtifact', (relative: string) => {
      const abs = typeof relative === 'string' ? resolveInProject(projectRoot(), relative) : undefined;
      if (abs) void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(abs));
    }),
  );

  refresh();
}

export function deactivate(): void {
  // Everything is a disposable on the context. No temp files, no background process.
}

const LIVE_WINDOW_MS = 10 * 60_000;

/**
 * The feature furthest along that is still in flight: its current step, the last run's pass/fail
 * and its open defects, in the accent colour, with a filled dot while files are moving.
 */
function updateStatusBar(item: vscode.StatusBarItem, vm: BoardVM, live: LiveSnapshot | undefined, accent: string, project?: string): void {
  if (!(vscode.workspace.getConfiguration('stlc').get<boolean>('showStatusBar') ?? true)) {
    item.hide();
    return;
  }
  item.color = accent === 'theme' ? undefined : new vscode.ThemeColor('stlc.accentForeground');
  if (!vm.ok) {
    item.text = `$(warning) STLC${project ? ` · ${project}` : ''}`;
    item.color = undefined;
    item.tooltip = `${project ? `${project}: ` : ''}${vm.reason}${vm.detail ? `\n${vm.detail}` : ''}`;
    item.show();
    return;
  }
  const f = activeFeature(vm);
  if (!f) {
    item.text = `$(beaker) STLC${project ? ` · ${project}` : ''}: idle`;
    item.tooltip = 'No feature yet — /qa-analyze <slug> <docs…>';
    item.show();
    return;
  }
  const step = f.steps.find((s) => s.key === f.current);
  const last = live?.lastEventAt ?? null;
  const isLive = last !== null && Date.now() - last < LIVE_WINDOW_MS;
  const bad = f.steps.some((s) => s.state === 'failed' || s.state === 'blocked');
  const stale = f.steps.some((s) => s.state === 'stale');
  const icon = bad ? '$(error)' : stale ? '$(history)' : isLive ? '$(circle-filled)' : '$(circle-outline)';
  const run = f.lastRun.ran ? ` · ${f.cases.passed}✓ ${f.cases.failed}✗` : '';
  const upd = vm.version.update ? ' $(arrow-circle-up)' : '';
  item.text = `${icon} ${project ? `${project} › ` : ''}${f.slug} · ${step ? `${step.label} ${step.word}` : f.phase}${run}${f.defects.open ? ` · ${f.defects.open} defect${f.defects.open === 1 ? '' : 's'}` : ''}${upd}`;
  const lastEvent = live?.activity[0];
  item.tooltip = new vscode.MarkdownString(
    [
      `${project ? `${project} — ` : ''}**${f.title}** — phase ${f.phase}`,
      '',
      step ? `- step: ${step.label} — ${step.word}${step.live ? ' *(inferred from files)*' : ''}` : '',
      `- cases: ${f.cases.designed} designed · ${f.cases.scripted} scripted · ${f.cases.passed} passed · ${f.cases.failed} failed`,
      `- open defects: ${f.defects.open} · quarantined: ${f.quarantine.active}`,
      lastEvent ? `- last event: ${lastEvent.title} · ${relativeTime(lastEvent.at)}` : '',
      live?.branch ? `- branch: ${live.branch}${live.head ? ` @ ${live.head}` : ''}` : '',
      `- versions: board ${vm.version.board || '?'} · qa bundle ${vm.version.bundle ?? '?'} · builder ${vm.version.builder || '?'}`,
      vm.version.update ? `- **${vm.version.update.label}** available — \`${vm.version.update.command}\`` : '',
      vm.staleFiles.length ? `- index may be out of date (${vm.staleFiles.length} file(s) changed)` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  item.show();
}
