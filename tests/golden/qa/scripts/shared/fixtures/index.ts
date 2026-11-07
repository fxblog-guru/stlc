// index.ts — the ONE `test` every spec imports:
//   import { test, expect } from '../../shared/fixtures';
// Platform fixtures merged with each module's domain fixtures. generating-* skills add one
// `<module>.fixture.ts` per module and list it here.
import { mergeTests } from '@playwright/test';
import { test as ui } from './ui.fixture';
import { test as electron } from './electron.fixture';
import { projectsFixtures } from './projects.fixture';

export const test = mergeTests(ui, electron, projectsFixtures);

export { expect } from './base.fixture';
export { caseMeta } from '../meta';
export { expectSchema, schemaErrors } from '../schemas/openapi.validator';
export { pollUntil } from '../http/poll';
export { expectVisual, expectVisualOf, VIEWPORTS } from '../ui/visual';
export { expectNoHorizontalScroll, expectNoOverflow, expectNoOverlap, expectTouchTargets, expectFocusVisible, expectTokens } from '../ui/layout';
export { TIMEOUTS } from '../constants/timeouts';
export type { ApiResponse } from '../http/api.client';
export type { Session } from '../auth/session';
