// meta.ts — turns a case's identity into Playwright's own metadata, the same way in every spec:
//   tags         filters: @<type> @<module> @P0..@P3 @platform:<id>… [@smoke] [@regression] [@quarantined:<until>]
//                → `--grep @P0`, `--grep @smoke`, CI selection; `@platform:<id>` also routes the test to
//                its Playwright project (web-<target> · desktop-electron · api — CONTRACTS §20)
//   annotations  links: case id, requirement ids (slug-qualified), TMS id, defect id
//                → shown in the HTML report, read by executing-tests to fill the traceability table
// Tags are for selecting runs; links are annotations (Playwright's own split). Values are copied
// verbatim from the case file's **Tags:** line — a spec never invents one.
//
//   test('TC-API-PROJECTS-001 — create, read back, delete', caseMeta({
//     id: 'TC-API-PROJECTS-001', type: 'api', module: 'projects', priority: 'P0',
//     req: ['demo/REQ-001'], suites: ['smoke'], platform: ['api'] }), async ({ ... }) => { ... });
import type { TestDetails } from '@playwright/test';
import { defaultPlatforms } from './config/platforms';
import type { PlatformId } from './config/platforms';

export type CaseType = 'api' | 'integration' | 'e2e' | 'security' | 'performance' | 'accessibility' | 'ui';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface CaseMeta {
  id: string;
  type: CaseType;
  module: string;
  priority: Priority;
  /** the case's `**Platform:**` ids (web · android · ios · windows · macos · api · other:<id>);
   *  omitted → the type's default (CONTRACTS §20): api/integration/security → api, e2e/accessibility/ui → web */
  platform?: PlatformId[];
  /** requirement ids, `<slug>/REQ-NNN` (slug-qualified: REQ numbers restart per feature) */
  req: string[];
  /** acceptance criteria ids, `<slug>/AC-NNN`, when the case verifies specific ones */
  ac?: string[];
  suites?: ('smoke' | 'regression')[];
  /** YYYY-MM-DD — written only by /qa-quarantine */
  quarantinedUntil?: string;
  tms?: string;
  defect?: string;
  manual?: boolean;
  /** Playwright test locks: tests sharing a name never run at the same time (shared state the case cannot isolate) */
  lock?: string[];
}

export function caseMeta(m: CaseMeta): TestDetails {
  const platforms = m.platform?.length ? m.platform : defaultPlatforms(m.type);
  const tag = [`@${m.type}`, `@${m.module}`, `@${m.priority}`, ...platforms.map((p) => `@platform:${p}`), ...(m.suites ?? []).map((s) => `@${s}`)];
  if (m.manual) tag.push('@manual');
  if (m.quarantinedUntil) tag.push(`@quarantined:${m.quarantinedUntil}`);
  const annotation = [
    { type: 'case', description: m.id },
    ...m.req.map((r) => ({ type: 'req', description: r })),
    ...(m.ac ?? []).map((a) => ({ type: 'ac', description: a })),
  ];
  if (m.tms) annotation.push({ type: 'tms', description: m.tms });
  if (m.defect) annotation.push({ type: 'defect', description: m.defect });
  return m.lock?.length ? { tag, annotation, lock: m.lock } : { tag, annotation };
}
