// model-runner.ts — model-based (stateful property) testing against the real API, in ~150 lines.
//
// A MODEL is a tiny in-memory picture of what the product should hold (`init()`), a set of ACTIONS
// (each: a precondition on the model, argument generation, the API call + its postconditions, the
// model update) and INVARIANTS (claims that must hold after EVERY step, checked against the real
// API). The runner draws random action sequences from a seeded PRNG, runs them, and checks every
// invariant after every step. On the first failure it SHRINKS: it keeps the failing prefix, then
// drops actions one at a time while the failure still reproduces (on fresh data), and reports the
// shortest sequence it found — the bug's minimal recipe, plus the seed that replays the whole run.
//
// Scripted cases test the orders somebody thought of; a model tests the orders nobody wrote down
// (re-grant before revoke, rename after delete, two roles on one account…).
// How to write one: skills/designing-api-cases/references/model-based.md. Golden model:
// tests/golden/qa/scripts/shared/model/projects.model.ts, run by TC-API-PROJECTS-003.
import type { Prng } from '../data/prng';

/** One step of a sequence: an action name + plain-data args (replayable, printable). */
export interface Step {
  action: string;
  args: Record<string, string | number>;
}

export interface Action<M, C> {
  name: string;
  /** relative frequency (default 1) */
  weight?: number;
  /** may this action run in this model state? */
  pre: (m: M) => boolean;
  /** draw args from the model state (plain data only: indexes, role names, labels) */
  args: (m: M, prng: Prng) => Record<string, string | number>;
  /** at replay, are these args still valid in this model state? (default: true) */
  valid?: (m: M, args: Record<string, string | number>) => boolean;
  /** call the API, throw on a broken postcondition, update the model */
  run: (m: M, args: Record<string, string | number>, ctx: C) => Promise<void>;
}

export interface Invariant<M, C> {
  name: string;
  /** return the violations (empty = holds); compare the model with what the API says */
  check: (m: M, ctx: C) => Promise<string[]>;
}

export interface Model<M, C> {
  name: string;
  init: () => M;
  actions: Action<M, C>[];
  invariants: Invariant<M, C>[];
}

export interface RunOptions {
  seed: number;
  /** sequences to draw */
  runs: number;
  /** max steps per sequence */
  steps: number;
  /** max replays spent shrinking (each replays on fresh data) */
  shrinkBudget?: number;
  /** a label to print with the replay hint, e.g. the spec path */
  spec?: string;
  /** epoch ms after which shrinking stops and reports the shortest sequence found so far */
  deadline?: number;
  /** told about the first failure BEFORE shrinking starts (so a timeout never hides it) */
  onFailure?: (message: string) => void;
}

export interface RunReport {
  seed: number;
  sequences: number;
  steps: number;
  /** how often each action ran — a model whose actions never fire proves nothing */
  coverage: Record<string, number>;
}

const show = (s: Step) => `${s.action}(${Object.entries(s.args).map(([k, v]) => `${k}=${v}`).join(', ')})`;

function choose<M, C>(model: Model<M, C>, m: M, prng: Prng): Action<M, C> | undefined {
  const ready = model.actions.filter((a) => a.pre(m));
  const total = ready.reduce((n, a) => n + (a.weight ?? 1), 0);
  let r = prng.next() * total;
  for (const a of ready) if ((r -= a.weight ?? 1) < 0) return a;
  return ready.at(-1);
}

/** Run a fixed sequence on a fresh model; return where (and why) it failed, or undefined. */
async function replay<M, C>(model: Model<M, C>, seq: Step[], ctx: C): Promise<{ at: number; why: string } | undefined> {
  const m = model.init();
  for (let i = 0; i < seq.length; i++) {
    const action = model.actions.find((a) => a.name === seq[i].action);
    if (!action || !action.pre(m) || (action.valid && !action.valid(m, seq[i].args))) continue; // not applicable after shrinking
    const why = await stepAndCheck(model, m, action, seq[i].args, ctx);
    if (why) return { at: i, why };
  }
  return undefined;
}

async function stepAndCheck<M, C>(model: Model<M, C>, m: M, action: Action<M, C>, args: Step['args'], ctx: C): Promise<string | undefined> {
  try {
    await action.run(m, args, ctx);
  } catch (e) {
    return `postcondition of ${action.name}: ${(e as Error).message}`;
  }
  for (const inv of model.invariants) {
    const broken = await inv.check(m, ctx);
    if (broken.length) return `invariant "${inv.name}": ${broken.join('; ')}`;
  }
  return undefined;
}

/** Drop one step at a time while the sequence still fails (fresh data per replay). */
async function shrink<M, C>(model: Model<M, C>, seq: Step[], ctx: C, budget: number, deadline: number): Promise<{ seq: Step[]; why: string; tries: number }> {
  let best = seq;
  let why = (await replay(model, best, ctx))?.why ?? 'did not reproduce on replay — the failure depends on state outside the model (FLAKY or shared data)';
  let tries = 1;
  let shrunk = true;
  const more = () => tries < budget && Date.now() < deadline;
  while (shrunk && more()) {
    shrunk = false;
    for (let i = best.length - 1; i >= 0 && more(); i--) {
      const candidate = best.filter((_, j) => j !== i);
      tries += 1;
      const failed = await replay(model, candidate, ctx);
      if (failed) {
        best = candidate.slice(0, failed.at + 1);
        why = failed.why;
        shrunk = true;
        break;
      }
    }
  }
  return { seq: best, why, tries };
}

/** Draw `runs` random sequences; throw with the minimal failing sequence on the first failure. */
export async function runModel<M, C>(model: Model<M, C>, ctx: C, prng: Prng, opts: RunOptions): Promise<RunReport> {
  const coverage: Record<string, number> = Object.fromEntries(model.actions.map((a) => [a.name, 0]));
  let total = 0;
  for (let run = 0; run < opts.runs; run++) {
    const m = model.init();
    const seq: Step[] = [];
    for (let s = 0; s < opts.steps; s++) {
      const action = choose(model, m, prng);
      if (!action) break;
      const step: Step = { action: action.name, args: action.args(m, prng) };
      seq.push(step);
      coverage[action.name] += 1;
      total += 1;
      const why = await stepAndCheck(model, m, action, step.args, ctx);
      if (!why) continue;
      opts.onFailure?.(`run ${run + 1}, step ${s + 1}: ${why} — sequence: ${seq.map(show).join(" → ")}`);
      const min = await shrink(model, seq, ctx, opts.shrinkBudget ?? 40, opts.deadline ?? Number.POSITIVE_INFINITY);
      throw new Error([
        `model "${model.name}" failed — run ${run + 1}/${opts.runs}, step ${s + 1}: ${why}`,
        `minimal sequence (${min.seq.length} of ${seq.length} steps, ${min.tries} replays):`,
        ...min.seq.map((x, i) => `  ${i + 1}. ${show(x)}`),
        `  → ${min.why}`,
        `full failing sequence: ${seq.map(show).join(' → ')}`,
        `replay: QA_MODEL_SEED=${opts.seed} npx playwright test ${opts.spec ?? ''}`.trimEnd(),
      ].join('\n'));
    }
  }
  return { seed: opts.seed, sequences: opts.runs, steps: total, coverage };
}
