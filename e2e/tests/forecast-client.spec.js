import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Phase 4 — le forecast est calculé côté client (AlfredForecast) à partir de forecastInputs ;
 * le serveur ne renvoie plus de soldes. On vérifie que le module pilote bien l'UI.
 */
test.describe('Forecast calculé côté client (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('le module AlfredForecast est chargé', async ({ page }) => {
    const ok = await page.evaluate(() => typeof window.AlfredForecast?.compute === 'function');
    expect(ok).toBe(true);
  });

  test('le budget courant affiché provient du calcul client (740)', async ({ page }) => {
    await expect.poll(() => page.locator('#budget-value').innerText()).toContain('740');
  });

  test('compute() est cohérent avec la fixture getAllData (budget courant = 740)', async ({ page }) => {
    const budget = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const fc = window.AlfredForecast.compute(fx.forecastInputs, fx.prevs);
      return fc.months.find(m => m.isCurrent).budget;
    });
    expect(budget).toBe(740);
  });
});
