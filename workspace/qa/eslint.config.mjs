// eslint.config.mjs — the mechanical half of the generating-* skills' script rules.
// `npm run heal:check` = tsc --noEmit + this config (0 warnings allowed). Rules here encode what
// the skills forbid in prose: no sleeps, no networkidle, no skip/only leftovers, no conditional
// logic inside a test, every test asserts, no force clicks, no element handles.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default tseslint.config(
  {
    ignores: [
      'node_modules', 'runs', 'allure-results', 'allure-report', '**/__screenshots__/**',
      'scripts/unit/**',        // staged unit tests are compiled by the app repo's own toolchain
      'scripts/mobile/**',      // staged WDIO specs are type-checked by the mobile framework repo
      'scripts/performance/**', // k6 scripts run in k6's runtime (validated by `k6 inspect`)
      '**/*.mjs', '**/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.ts', 'playwright.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  {
    // Spec files of the Playwright tiers (mirrors of cases). The shared layer is exempt from the
    // test-shape rules but keeps the TypeScript rules above.
    files: ['scripts/{api,integration,e2e,security,accessibility,ui}/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',      // "no fixed sleeps" — poll with expect.poll / pollUntil + TIMEOUTS.*
      'playwright/no-networkidle': 'error',           // generating-e2e-script rule 8
      'playwright/no-conditional-in-test': 'error',   // rows carry their own assert fn; no if/else inside test()
      'playwright/no-conditional-expect': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }], // test.skip(!process.env.X, 'reason') is the honest-gap idiom
      'playwright/no-focused-test': 'error',
      'playwright/expect-expect': ['error', { assertFunctionPatterns: ['^expect[A-Z]', '\\.expect[A-Z]', '^pollUntil$'] }], // every test asserts — shared helpers named expect* count (expectSchema, expectNoA11yViolations, expectTabOrder, page.expectLoaded, expectNoHorizontalScroll, expectVisual …)
      'playwright/no-force-option': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/max-nested-describe': ['error', { max: 2 }],
      'playwright/no-raw-locators': 'off',            // locator grounding is judged by healing-e2e-script's registry cross-check
      'playwright/prefer-hooks-on-top': 'off',        // templates keep teardown at the bottom next to what it cleans
      'playwright/consistent-spacing-between-blocks': 'off', // formatting is not a contract
      'playwright/valid-title': 'off',                // `test.step('Step N: …')` is the case↔step contract; the rule calls "Step" a duplicate prefix
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='setTimeout']", message: 'No sleeps in specs — use expect.poll or pollUntil with TIMEOUTS.*' },
        { selector: "MemberExpression[property.name='setTimeout'][object.name='test']", message: 'No per-test timeout overrides above the config — raise a named TIMEOUTS.* instead' },
      ],
    },
  },
  {
    // Playwright fixtures without page/context legitimately destructure {}.
    files: ['scripts/shared/fixtures/**', 'scripts/setup/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
);
