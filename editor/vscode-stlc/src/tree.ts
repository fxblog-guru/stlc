/**
 * Three tree views, all projections of the view model: Features (feature → pipeline step → the
 * artifact behind it), Open defects across features, and Run plans.
 *
 * One icon per step state, one colour per severity, and a word beside each. A row that points at a
 * file opens it; nothing here writes or runs anything.
 */

import * as vscode from 'vscode';
import { BoardVM, FeatureVM, RunPlanVM, StepState, StepVM } from './viewmodel';

interface StateIcon {
  icon: string;
  color?: string;
}

/** One place that maps a step state to how it looks, so the tree and the board agree. */
export const STEP_ICONS: Record<StepState, StateIcon> = {
  pass: { icon: 'pass-filled', color: 'testing.iconPassed' },
  stale: { icon: 'history', color: 'testing.iconQueued' },
  changes: { icon: 'request-changes', color: 'testing.iconQueued' },
  blocked: { icon: 'error', color: 'testing.iconFailed' },
  failed: { icon: 'close', color: 'testing.iconFailed' },
  running: { icon: 'sync', color: 'charts.blue' },
  partial: { icon: 'circle-large-filled', color: 'charts.blue' },
  idle: { icon: 'circle-large-outline', color: 'descriptionForeground' },
};

function icon(spec: StateIcon): vscode.ThemeIcon {
  return spec.color ? new vscode.ThemeIcon(spec.icon, new vscode.ThemeColor(spec.color)) : new vscode.ThemeIcon(spec.icon);
}

const SEV_COLOR: Record<string, string> = { Critical: 'testing.iconFailed', High: 'testing.iconFailed', Medium: 'testing.iconQueued', Low: 'descriptionForeground' };

export type Node = vscode.TreeItem & { children?: () => Node[] };

function message(text: string, detail?: string, severity: 'info' | 'warning' = 'info'): Node {
  const n: Node = new vscode.TreeItem(text, vscode.TreeItemCollapsibleState.None);
  n.description = detail;
  n.tooltip = detail;
  n.iconPath = new vscode.ThemeIcon(severity === 'warning' ? 'warning' : 'info');
  return n;
}

function opener(n: vscode.TreeItem, root: vscode.Uri | undefined, rel: string | null): void {
  if (!rel || !root) return;
  n.resourceUri = vscode.Uri.joinPath(root, ...rel.split('/'));
  n.command = { command: 'vscode.open', title: 'Open', arguments: [n.resourceUri] };
}

abstract class Provider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    protected readonly vm: () => BoardVM,
    protected readonly root: () => vscode.Uri | undefined,
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    if (element) return element.children?.() ?? [];
    const vm = this.vm();
    if (!vm.ok) return [message(vm.reason, vm.detail ?? undefined, 'warning')];
    return this.top(vm);
  }

  protected abstract top(vm: Extract<BoardVM, { ok: true }>): Node[];
}

export class FeaturesTreeProvider extends Provider {
  protected top(vm: Extract<BoardVM, { ok: true }>): Node[] {
    if (!vm.features.length) return [message('No features yet', 'Start one with /qa-analyze <slug> <docs…>')];
    return vm.features.map((f) => this.feature(f));
  }

  private feature(f: FeatureVM): Node {
    const n: Node = new vscode.TreeItem(f.slug, vscode.TreeItemCollapsibleState.Expanded);
    const cur = f.steps.find((s) => s.key === f.current);
    n.description = `${f.phase}${cur ? ` · ${cur.label} ${cur.word}` : ''}${f.defects.open ? ` · ${f.defects.open} defect${f.defects.open === 1 ? '' : 's'}` : ''}`;
    n.iconPath = f.steps.some((s) => s.state === 'failed' || s.state === 'blocked')
      ? new vscode.ThemeIcon('beaker', new vscode.ThemeColor('testing.iconFailed'))
      : new vscode.ThemeIcon('beaker');
    n.tooltip = new vscode.MarkdownString(
      [
        `**${f.title}**`,
        '',
        `- phase: ${f.phase}`,
        `- cases: ${f.cases.designed} designed · ${f.cases.scripted} scripted · ${f.cases.passed} passed`,
        `- last run pass rate: ${f.lastRun.rate === null ? '—' : `${f.lastRun.rate}%`}`,
        `- open defects: ${f.defects.open} · quarantined: ${f.quarantine.active}`,
      ].join('\n'),
    );
    n.contextValue = 'stlc.feature';
    n.children = () => f.steps.map((s) => this.step(s));
    return n;
  }

  private step(s: StepVM): Node {
    const n: Node = new vscode.TreeItem(s.label, vscode.TreeItemCollapsibleState.None);
    n.description = `${s.word}${s.live ? ' · inferred' : ''}`;
    n.iconPath = icon(STEP_ICONS[s.state]);
    n.tooltip = new vscode.MarkdownString(`**${s.label}** — ${s.word}\n\n${s.detail}${s.live ? `\n\n> ${s.live.note}` : ''}${s.path ? `\n\n\`${s.path}\`` : ''}`);
    opener(n, this.root(), s.path);
    n.contextValue = 'stlc.step';
    return n;
  }
}

export class DefectsTreeProvider extends Provider {
  protected top(vm: Extract<BoardVM, { ok: true }>): Node[] {
    const rows: Node[] = [];
    const rank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const all = vm.features.flatMap((f) => f.defects.items.map((d) => ({ ...d, slug: f.slug })));
    all.sort((a, b) => (rank[a.severity ?? ''] ?? 4) - (rank[b.severity ?? ''] ?? 4) || a.id.localeCompare(b.id));
    for (const d of all) {
      const n: Node = new vscode.TreeItem(`${d.id}  ${d.title}`, vscode.TreeItemCollapsibleState.None);
      n.description = `${d.severity ?? 'unrated'}${d.origin === 'ESCAPED' ? ' · escaped' : ''}`;
      n.iconPath = new vscode.ThemeIcon(d.origin === 'ESCAPED' ? 'flame' : 'bug', new vscode.ThemeColor(SEV_COLOR[d.severity ?? ''] ?? 'descriptionForeground'));
      n.tooltip = `${d.id} — ${d.title}\n${d.severity ?? 'severity not stated'} · ${d.origin ?? 'origin not stated'} · ${d.slug}`;
      opener(n, this.root(), d.path);
      rows.push(n);
    }
    const q = vm.features.flatMap((f) => f.quarantine.items);
    if (q.length) {
      const g: Node = new vscode.TreeItem(`Quarantine (${q.length})`, vscode.TreeItemCollapsibleState.Collapsed);
      g.iconPath = new vscode.ThemeIcon('lock');
      g.children = () =>
        q.map((x) => {
          const n: Node = new vscode.TreeItem(x.caseId, vscode.TreeItemCollapsibleState.None);
          n.description = `${x.expired ? 'EXPIRED ' : 'until '}${x.until}${x.ticket ? ` · ${x.ticket}` : ''}`;
          n.tooltip = x.reason;
          n.iconPath = new vscode.ThemeIcon(x.expired ? 'warning' : 'clock', x.expired ? new vscode.ThemeColor('testing.iconQueued') : undefined);
          return n;
        });
      rows.push(g);
    }
    return rows.length ? rows : [message('No open defects', 'Every defect file is CLOSED, or none was raised.')];
  }
}

export class RunPlansTreeProvider extends Provider {
  protected top(vm: Extract<BoardVM, { ok: true }>): Node[] {
    if (!vm.runPlans.length) return [message('No run plans', 'Write one with /qa-run-plan <name> "<prompt>" or --standard')];
    return vm.runPlans.map((p) => this.plan(p));
  }

  private plan(p: RunPlanVM): Node {
    const n: Node = new vscode.TreeItem(p.name, vscode.TreeItemCollapsibleState.None);
    const last = p.lastRun;
    n.description = `${p.caseCount} case${p.caseCount === 1 ? '' : 's'}${last ? ` · ${last.ok === false ? `${last.fail} fail` : last.ok ? 'pass' : 'ran'} ${last.runId}` : ' · never run'}`;
    n.iconPath = last
      ? last.ok
        ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
        : new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'))
      : new vscode.ThemeIcon('list-ordered');
    n.tooltip = new vscode.MarkdownString(
      [`**${p.name}**`, '', p.description, '', `- ${p.byType.map((t) => `${t.id} ${t.n}`).join(' · ') || 'no resolved cases'}`, `- env: ${p.env ?? 'default'}`, '', `\`${p.runCommand}\``].join('\n'),
    );
    opener(n, this.root(), p.path);
    n.contextValue = 'stlc.runPlan';
    (n as Node & { planName?: string }).planName = p.name;
    return n;
  }
}
