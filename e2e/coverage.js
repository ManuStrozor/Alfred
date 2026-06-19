import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW_DIR = resolve('.coverage-raw');

/**
 * Fixture auto : quand E2E_COVERAGE est défini, collecte la coverage V8 du JS
 * exécuté pendant le test (Chromium/Edge uniquement) et l'écrit en brut.
 * Le teardown (coverage-report.mjs) agrège et génère le rapport.
 */
export const test = base.extend({
  _coverage: [async ({ page }, use, testInfo) => {
    const on = !!process.env.E2E_COVERAGE && page.coverage;
    if (on) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use();
    if (on) {
      const cov = await page.coverage.stopJSCoverage();
      mkdirSync(RAW_DIR, { recursive: true });
      writeFileSync(resolve(RAW_DIR, testInfo.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(cov));
    }
  }, { auto: true }],
});

export { expect };
