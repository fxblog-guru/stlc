/**
 * types.mjs — the test-type registry (CONTRACTS §1 stems, §7 sections, PROJECT-PROFILE §Test types).
 * Every script that needs the list of types, a type's id stem, its designing agent or its
 * type-specific case sections imports it from here. The places that cannot import (markdown,
 * the publishing skill's own script) are held to this file by `tests/bundle.test.mjs`
 * ("type registry: every copy agrees"), which names the copy that drifted.
 *
 * Adding a type: one entry below, then the checklist in docs/adding-a-test-type.md.
 */

/** @typedef {{ stem: string, agent: string, sections: string[], quarantinable: boolean, functional: boolean }} TypeSpec */

/** @type {Record<string, TypeSpec>} Order = the order types are listed everywhere a list is printed. */
export const TYPE_REGISTRY = {
  unit: { stem: 'UNIT', agent: 'unit-test-engineer', sections: ['## Subject', '## Test matrix', '## Doubles'], quarantinable: false, functional: true },
  api: { stem: 'API', agent: 'case-designer', sections: [], quarantinable: true, functional: true },
  integration: { stem: 'INT', agent: 'case-designer', sections: [], quarantinable: true, functional: true },
  e2e: { stem: 'E2E', agent: 'case-designer', sections: [], quarantinable: true, functional: true },
  security: { stem: 'SEC', agent: 'nonfunctional-engineer', sections: ['## OWASP ref', '## Authorization'], quarantinable: true, functional: true },
  performance: { stem: 'PERF', agent: 'nonfunctional-engineer', sections: ['## Workload', '## SLOs'], quarantinable: false, functional: false },
  accessibility: { stem: 'A11Y', agent: 'case-designer', sections: ['## WCAG ref', '## Scope'], quarantinable: true, functional: false },
  ui: { stem: 'UI', agent: 'case-designer', sections: ['## Screen states', '## Viewports', '## Visual baseline', '## Layout rules'], quarantinable: true, functional: false },
  mobile: { stem: 'MOB', agent: 'mobile-test-engineer', sections: ['## Platforms', '## Device profile'], quarantinable: true, functional: true },
  // A data pipeline is deterministic on a fixed fixture: a flaky data test is a defect, never quarantined.
  data: { stem: 'DATA', agent: 'data-test-engineer', sections: ['## Hop', '## Oracle', '## Tolerance'], quarantinable: false, functional: true },
};

export const TYPES = Object.keys(TYPE_REGISTRY);
export const TYPE_STEM = Object.fromEntries(TYPES.map((t) => [t, TYPE_REGISTRY[t].stem]));
export const STEM_TYPE = Object.fromEntries(TYPES.map((t) => [TYPE_REGISTRY[t].stem, t]));
export const AGENT_OF = Object.fromEntries(TYPES.map((t) => [t, TYPE_REGISTRY[t].agent]));
export const TYPE_SECTIONS = Object.fromEntries(TYPES.filter((t) => TYPE_REGISTRY[t].sections.length).map((t) => [t, TYPE_REGISTRY[t].sections]));
export const NEVER_QUARANTINED = new Set(TYPES.filter((t) => !TYPE_REGISTRY[t].quarantinable).map((t) => TYPE_REGISTRY[t].stem));
/** Types whose P0/P1 REQs must carry a `negative` case (CONTRACTS §7 coverage score). */
export const FUNCTIONAL = new Set(TYPES.filter((t) => TYPE_REGISTRY[t].functional));

/** `API|INT|…` for building id regexes. */
export const STEM_ALT = TYPES.map((t) => TYPE_REGISTRY[t].stem).join('|');
export const CASE_ID_RE = new RegExp(`^TC-(${STEM_ALT})-[A-Z0-9-]+-\\d{3}$`);
export const CASE_FILE_RE = new RegExp(`^(TC-(${STEM_ALT})-[A-Z0-9-]+-\\d{3})-[a-z0-9][a-z0-9-]*\\.md$`);
/** Matches the case-id prefix of a file or test name: group 1 = the id. */
export const CASE_PREFIX_RE = new RegExp(`^(TC-(?:${STEM_ALT})-[A-Z0-9-]+-\\d{3})-`);
export const TYPE_TAG_RE = new RegExp(`^@(${TYPES.join('|')})$`);
