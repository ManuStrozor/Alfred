import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** globalTeardown : agrège la coverage V8 brute et génère le rapport (client uniquement). */
export default async function () {
  if (!process.env.E2E_COVERAGE) return;
  const RAW_DIR = resolve('.coverage-raw');
  if (!existsSync(RAW_DIR)) return;

  const { CoverageReport } = await import('monocart-coverage-reports');
  const report = new CoverageReport({
    name: 'Alfred — coverage e2e (client)',
    outputDir: './coverage-e2e',
    reports: ['v8', 'console-summary'],
    // Ne garde que le JS client (script.js) — exclut le mock GAS inline et les libs
    sourceFilter: (sourcePath) => sourcePath.includes('script.js'),
  });

  for (const f of readdirSync(RAW_DIR)) {
    if (f.endsWith('.json')) await report.add(JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8')));
  }
  await report.generate();
  rmSync(RAW_DIR, { recursive: true, force: true });
}
