// index.ts — the ONE `test` every spec imports:
//   import { test, expect } from '../../shared/fixtures';
// It merges the platform fixtures with the project's domain fixtures (services, factories, page
// objects). generating-* skills ADD a domain fixture file per module and list it here; a spec
// never imports base/ui fixtures directly and never `new`s a service or page object.
//
//   import { projectsFixtures } from './projects.fixture';
//   export const test = mergeTests(ui, electron, projectsFixtures);
import { mergeTests } from '@playwright/test';
import { test as ui } from './ui.fixture';
import { test as electron } from './electron.fixture';

export const test = mergeTests(ui, electron);

export { expect } from './base.fixture';
export { caseMeta } from '../meta';
export { expectSchema, schemaErrors } from '../schemas/openapi.validator';
export { pollUntil } from '../http/poll';
export { expectVisual, expectVisualOf, VIEWPORTS } from '../ui/visual';
export { expectNoHorizontalScroll, expectNoOverflow, expectNoOverlap, expectTouchTargets, expectFocusVisible, expectTokens } from '../ui/layout';
export { TIMEOUTS } from '../constants/timeouts';
export type { ApiResponse } from '../http/api.client';
export type { Session } from '../auth/session';
